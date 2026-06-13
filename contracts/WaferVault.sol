// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@hiero-ledger/hiero-contracts/token-service/HederaTokenService.sol";
import "@hiero-ledger/hiero-contracts/token-service/IHederaTokenService.sol";
import "@hiero-ledger/hiero-contracts/token-service/KeyHelper.sol";
import "@hiero-ledger/hiero-contracts/token-service/ExpiryHelper.sol";
import "@hiero-ledger/hiero-contracts/token-service/FeeHelper.sol";
import "@hiero-ledger/hiero-contracts/common/HederaResponseCodes.sol";

/**
 * @title WaferVault
 * @notice InfraFi liquidity vault for DePIN reward streams, denominated in native HBAR.
 *
 * Each pool issues:
 *   - an HTS fungible "pool-share" token (KYC + freeze keys = this contract, decimals = 8),
 *   - an HTS "reward-claim" NFT collection, held by the vault.
 *
 * The vault is the TREASURY + SUPPLY + KYC + FREEZE key (KeyValueType.CONTRACT_ID) of every
 * token it creates, so it can mint/burn/grant-KYC with no off-chain signer.
 *
 * UNITS — read this before touching the money math (verified live on testnet, not assumed).
 *   The Hedera EVM is TINYBAR-internal: although a wallet/relay attaches value in weibar
 *   (1 HBAR = 1e18 weibar), by the time the contract runs, the relay has already converted to
 *   TINYBAR (1 HBAR = 1e8 tinybar). So INSIDE the contract:
 *     - `msg.value` is in TINYBAR,
 *     - `address(this).balance` (BALANCE/SELFBALANCE) is in TINYBAR,
 *     - `call{value: x}` sends `x` TINYBAR.
 *   We therefore account natively in TINYBAR with NO conversion factor, share decimals = 8 and
 *   ONE = 1e8 (so 1 share ~= 1 HBAR at genesis NAV). This was measured with a probe contract:
 *   sending 2 HBAR made `msg.value == 2e8` and `call{value: 1e8}` transferred exactly 1 HBAR,
 *   while `call{value: 1e18}` failed (1e18 tinybar >> balance). A wrong assumption here silently
 *   drains or inflates the vault — the unit tests pin the math down.
 */
contract WaferVault is HederaTokenService, KeyHelper, ExpiryHelper, FeeHelper {
    // --- units ---------------------------------------------------------------
    /// HBAR is divisible to 8 dp (tinybar). Shares mirror that. ONE share at genesis NAV ~= 1 HBAR.
    /// Inside the Hedera EVM, value/balance are TINYBAR (see the units note above) — no conversion.
    uint64 internal constant ONE = 1e8; // 1.0 in tinybar / share micro-units (8 dp)
    int32 internal constant SHARE_DECIMALS = 8;

    // HTS create costs are paid from msg.value (tinybar); excess is refunded to the contract.
    uint256 internal constant SUCCESS = uint256(int256(HederaResponseCodes.SUCCESS)); // 22

    // Token auto-renew: 90 days, vault is the auto-renew account.
    int64 internal constant AUTO_RENEW_PERIOD = 7776000; // 90 days in seconds

    // Optional protocol fee on share transfers: 0.10% = 10 / 10000.
    int64 internal constant FEE_NUMERATOR = 10;
    int64 internal constant FEE_DENOMINATOR = 10000;

    // --- types ---------------------------------------------------------------
    enum ClaimStatus {
        Active,
        Repaid,
        Defaulted
    }
    enum PoolStatus {
        Active,
        Paused
    }

    struct Pool {
        address shareToken;
        address claimNft;
        uint64 totalAssets; // tinybar held against this pool's shares
        uint64 totalShares; // share supply (8 dp)
        uint8 status; // PoolStatus
    }

    struct Claim {
        address operator;
        uint64 principalTinybar;
        int64 nftSerial;
        uint32 poolId;
        ClaimStatus status;
    }

    // --- storage -------------------------------------------------------------
    address public owner;

    mapping(uint32 => Pool) public pools;
    uint32 public poolCount;

    mapping(uint256 => Claim) public claims;
    uint256 public claimCount;

    // pool => account => share balance mirror (the canonical balance is on HTS; this is a
    // cheap view-cache the front can read without a Mirror Node round-trip).
    mapping(uint32 => mapping(address => uint64)) internal _shareBalance;
    // share token => has this account already been granted KYC by the vault?
    mapping(address => mapping(address => bool)) internal _kycGranted;

    // --- events --------------------------------------------------------------
    event PoolCreated(uint32 indexed poolId, address shareToken, address claimNft, string name, string symbol);
    event ClaimFinanced(uint256 indexed claimId, uint32 indexed poolId, address indexed operator, uint64 principalTinybar, int64 nftSerial);
    event Deposit(uint32 indexed poolId, address indexed investor, uint64 assetsTinybar, uint64 sharesMinted);
    event Redeem(uint32 indexed poolId, address indexed investor, uint64 sharesBurned, uint64 assetsTinybar);
    event RewardRouted(uint32 indexed poolId, uint256 indexed claimId, uint64 amountTinybar, uint64 navPerShare);
    event Default(uint256 indexed claimId, uint32 indexed poolId, uint64 writedownTinybar, uint64 navPerShare);

    // --- modifiers -----------------------------------------------------------
    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_OWNER");
        owner = newOwner;
    }

    // --- pool creation -------------------------------------------------------
    /**
     * @notice Create a new pool: an HTS fungible share token + an HTS claim-NFT collection.
     * @dev payable — attach ~60 HBAR (msg.value) for the two HTS creates; excess is refunded
     *      to the contract by the network. The vault is treasury + all keys for both tokens.
     */
    function createPool(string memory name, string memory symbol)
        external
        payable
        onlyOwner
        returns (uint32 poolId, address shareToken, address claimNft)
    {
        // Fund each HTS create with the full available balance: the 0x167 precompile takes only
        // what the create costs and refunds the rest to the contract, so create #2 sees the
        // refund from create #1. A fungible-with-fees create wants ~60 HBAR; the NFT ~30 HBAR —
        // splitting msg.value in two underfunds them, so we forward the whole balance each time.
        shareToken = _createShareToken(name, symbol, address(this).balance);
        claimNft = _createClaimNft(name, symbol, address(this).balance);

        // The vault holds its own shares before distribution; grant itself KYC so it can transfer.
        int64 rc = grantTokenKyc(shareToken, address(this));
        require(uint256(int256(rc)) == SUCCESS, "GRANT_KYC_SELF");
        _kycGranted[shareToken][address(this)] = true;

        poolId = poolCount++;
        pools[poolId] = Pool({
            shareToken: shareToken,
            claimNft: claimNft,
            totalAssets: 0,
            totalShares: 0,
            status: uint8(PoolStatus.Active)
        });

        emit PoolCreated(poolId, shareToken, claimNft, name, symbol);
    }

    /**
     * @dev We call the 0x167 precompile directly (not the inherited internal helpers) so we can
     *      forward a *chosen* `value` to each create. The inherited helpers hardcode
     *      `call{value: msg.value}`, which can't fund two creates in one payable transaction —
     *      the first create consumes part of msg.value (refunding the rest to the contract), so
     *      the second would try to forward the full msg.value the contract no longer holds.
     */
    function _createShareToken(string memory name, string memory symbol, uint256 value)
        internal
        returns (address shareToken)
    {
        IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](3);
        // SUPPLY key — vault mints/burns shares.
        keys[0] = getSingleKey(KeyType.SUPPLY, KeyValueType.CONTRACT_ID, address(this));
        // KYC key — vault grants investors KYC on deposit (frictionless).
        keys[1] = getSingleKey(KeyType.KYC, KeyValueType.CONTRACT_ID, address(this));
        // FREEZE key — vault can freeze on compliance action.
        keys[2] = getSingleKey(KeyType.FREEZE, KeyValueType.CONTRACT_ID, address(this));

        IHederaTokenService.HederaToken memory token;
        token.name = name;
        token.symbol = symbol;
        token.treasury = address(this);
        token.memo = "Wafer pool share";
        token.tokenSupplyType = false; // INFINITE supply
        token.maxSupply = 0;
        token.freezeDefault = false;
        token.tokenKeys = keys;
        token.expiry = createAutoRenewExpiry(address(this), AUTO_RENEW_PERIOD);

        // Optional small fractional protocol fee (0.10%), collected by the vault, net of transfers.
        IHederaTokenService.FixedFee[] memory fixedFees = new IHederaTokenService.FixedFee[](0);
        IHederaTokenService.FractionalFee[] memory fractionalFees = new IHederaTokenService.FractionalFee[](1);
        fractionalFees[0] = createFractionalFee(FEE_NUMERATOR, FEE_DENOMINATOR, true, address(this));

        (bool ok, bytes memory result) = precompileAddress.call{value: value}(
            abi.encodeWithSelector(
                IHederaTokenService.createFungibleTokenWithCustomFees.selector,
                token,
                int64(0),
                SHARE_DECIMALS,
                fixedFees,
                fractionalFees
            )
        );
        int256 rc;
        (rc, shareToken) = ok ? abi.decode(result, (int32, address)) : (int256(HederaResponseCodes.UNKNOWN), address(0));
        require(uint256(rc) == SUCCESS, "CREATE_SHARE_FAIL");
    }

    function _createClaimNft(string memory name, string memory symbol, uint256 value)
        internal
        returns (address claimNft)
    {
        IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](2);
        // SUPPLY key — vault mints/burns claim NFTs.
        keys[0] = getSingleKey(KeyType.SUPPLY, KeyValueType.CONTRACT_ID, address(this));
        // WIPE key — vault can wipe on default cleanup.
        keys[1] = getSingleKey(KeyType.WIPE, KeyValueType.CONTRACT_ID, address(this));

        IHederaTokenService.HederaToken memory token;
        token.name = string.concat(name, " Claim");
        token.symbol = string.concat(symbol, "CLAIM");
        token.treasury = address(this);
        token.memo = "Wafer reward claim";
        token.tokenSupplyType = false; // INFINITE
        token.maxSupply = 0;
        token.freezeDefault = false;
        token.tokenKeys = keys;
        token.expiry = createAutoRenewExpiry(address(this), AUTO_RENEW_PERIOD);

        (bool ok, bytes memory result) = precompileAddress.call{value: value}(
            abi.encodeWithSelector(IHederaTokenService.createNonFungibleToken.selector, token)
        );
        int256 rc;
        (rc, claimNft) = ok ? abi.decode(result, (int32, address)) : (int256(HederaResponseCodes.UNKNOWN), address(0));
        require(uint256(rc) == SUCCESS, "CREATE_NFT_FAIL");
    }

    // --- financing -----------------------------------------------------------
    /**
     * @notice Finance a reward claim: mint a claim NFT to the vault and advance HBAR to the operator.
     * @param poolId            target pool
     * @param operator          who receives the upfront HBAR
     * @param principalTinybar  upfront advance, in tinybar
     * @param meta              NFT metadata bytes (network / term / score / status, off-chain encoded)
     */
    function financeClaim(uint32 poolId, address operator, uint64 principalTinybar, bytes memory meta)
        external
        onlyOwner
        returns (uint256 claimId, int64 serial)
    {
        Pool storage p = pools[poolId];
        require(p.shareToken != address(0), "NO_POOL");
        require(operator != address(0), "ZERO_OPERATOR");

        // Everything is tinybar inside the EVM: balance, principal, and call{value:} all agree.
        require(address(this).balance >= principalTinybar, "INSUFFICIENT_VAULT_HBAR");

        // Mint the claim NFT (serial) to the vault treasury.
        bytes[] memory metadata = new bytes[](1);
        metadata[0] = meta;
        (int256 rc, , int64[] memory serials) = mintToken(p.claimNft, 0, metadata);
        require(uint256(rc) == SUCCESS, "MINT_CLAIM_FAIL");
        serial = serials[0];

        // Advance HBAR (tinybar) to the operator.
        (bool ok, ) = payable(operator).call{value: principalTinybar}("");
        require(ok, "HBAR_ADVANCE_FAIL");

        claimId = claimCount++;
        claims[claimId] = Claim({
            operator: operator,
            principalTinybar: principalTinybar,
            nftSerial: serial,
            poolId: poolId,
            status: ClaimStatus.Active
        });

        emit ClaimFinanced(claimId, poolId, operator, principalTinybar, serial);
    }

    // --- deposit / redeem ----------------------------------------------------
    /**
     * @notice Deposit native HBAR (msg.value) and receive pool shares minted at the current NAV.
     * @dev The vault auto-grants the investor KYC on the share token (frictionless), then transfers
     *      shares. The investor MUST have ASSOCIATED the share token first — a contract cannot
     *      associate a third party (front handles association via the IHRC719 facade).
     */
    function deposit(uint32 poolId) external payable returns (uint64 sharesMinted) {
        Pool storage p = pools[poolId];
        require(p.shareToken != address(0), "NO_POOL");
        require(p.status == uint8(PoolStatus.Active), "POOL_PAUSED");
        require(msg.value > 0, "ZERO_DEPOSIT");

        // msg.value is already TINYBAR inside the Hedera EVM — no conversion.
        uint64 assets = uint64(msg.value);

        // shares = assets / navPerShare = assets * totalShares / totalAssets (genesis: 1:1).
        sharesMinted = _previewShares(p, assets);
        require(sharesMinted > 0, "ZERO_SHARES");

        // Mint shares to the treasury (vault), then move them to the investor.
        (int256 rc, , ) = mintToken(p.shareToken, int64(sharesMinted), new bytes[](0));
        require(uint256(rc) == SUCCESS, "MINT_SHARE_FAIL");

        // Auto-grant the investor KYC (idempotent) so the KYC-gated transfer succeeds.
        _ensureKyc(p.shareToken, msg.sender);

        int256 trc = transferToken(p.shareToken, address(this), msg.sender, int64(sharesMinted));
        require(uint256(trc) == SUCCESS, "TRANSFER_SHARE_FAIL");

        p.totalAssets += assets;
        p.totalShares += sharesMinted;
        _shareBalance[poolId][msg.sender] += sharesMinted;

        emit Deposit(poolId, msg.sender, assets, sharesMinted);
    }

    /**
     * @notice Redeem `shares` for native HBAR at the current NAV.
     * @dev The investor must have approved/transfer-allowance for the vault on the share token,
     *      or the HTS transfer of shares from investor -> vault will fail. We pull the shares,
     *      burn them, and pay out `shares * NAV` HBAR via a low-level call.
     */
    function redeem(uint32 poolId, uint64 shares) external returns (uint64 assetsTinybar) {
        Pool storage p = pools[poolId];
        require(p.shareToken != address(0), "NO_POOL");
        require(shares > 0, "ZERO_SHARES");
        require(p.totalShares >= shares, "OVER_REDEEM");

        assetsTinybar = _previewAssets(p, shares);
        require(assetsTinybar > 0, "ZERO_ASSETS");
        require(p.totalAssets >= assetsTinybar, "INSUFFICIENT_POOL_ASSETS");

        // Pull shares from the investor into the vault (requires allowance/transfer auth).
        int256 trc = transferToken(p.shareToken, msg.sender, address(this), int64(shares));
        require(uint256(trc) == SUCCESS, "PULL_SHARE_FAIL");

        // Burn them from the treasury.
        (int256 brc, ) = burnToken(p.shareToken, int64(shares), new int64[](0));
        require(uint256(brc) == SUCCESS, "BURN_SHARE_FAIL");

        p.totalShares -= shares;
        p.totalAssets -= assetsTinybar;
        if (_shareBalance[poolId][msg.sender] >= shares) {
            _shareBalance[poolId][msg.sender] -= shares;
        }

        // Pay out HBAR (tinybar — call{value:} is tinybar inside the Hedera EVM).
        (bool ok, ) = payable(msg.sender).call{value: assetsTinybar}("");
        require(ok, "HBAR_PAYOUT_FAIL");

        emit Redeem(poolId, msg.sender, shares, assetsTinybar);
    }

    // --- settlement / default ------------------------------------------------
    /**
     * @notice Route reward HBAR (msg.value) into the pool: totalAssets rises -> NAV per share rises.
     */
    function settleRewards(uint32 poolId, uint256 claimId) external payable {
        Pool storage p = pools[poolId];
        require(p.shareToken != address(0), "NO_POOL");
        require(msg.value > 0, "ZERO_REWARD");
        Claim storage c = claims[claimId];
        require(c.poolId == poolId, "CLAIM_POOL_MISMATCH");

        // msg.value is already TINYBAR inside the Hedera EVM — no conversion.
        uint64 amount = uint64(msg.value);

        p.totalAssets += amount;

        emit RewardRouted(poolId, claimId, amount, navPerShare(poolId));
    }

    /**
     * @notice Mark a claim defaulted: write down the pool's assets by the unrecovered principal
     *         (NAV per share falls). Optionally burn the claim NFT.
     */
    function markDefault(uint256 claimId, bool burnNft) external onlyOwner {
        Claim storage c = claims[claimId];
        require(c.operator != address(0), "NO_CLAIM");
        require(c.status == ClaimStatus.Active, "CLAIM_NOT_ACTIVE");

        Pool storage p = pools[c.poolId];

        // Write down by the principal still at risk, clamped to available assets.
        uint64 writedown = c.principalTinybar;
        if (writedown > p.totalAssets) writedown = p.totalAssets;
        p.totalAssets -= writedown;
        c.status = ClaimStatus.Defaulted;

        if (burnNft && c.nftSerial > 0) {
            int64[] memory serials = new int64[](1);
            serials[0] = c.nftSerial;
            (int256 brc, ) = burnToken(p.claimNft, 0, serials);
            require(uint256(brc) == SUCCESS, "BURN_NFT_FAIL");
        }

        emit Default(claimId, c.poolId, writedown, navPerShare(c.poolId));
    }

    // --- views ---------------------------------------------------------------
    /// @notice NAV per share in tinybar (8 dp). Genesis (no shares) = ONE (1 share == 1 HBAR).
    function navPerShare(uint32 poolId) public view returns (uint64) {
        Pool storage p = pools[poolId];
        if (p.totalShares == 0) return ONE;
        return uint64((uint256(p.totalAssets) * ONE) / uint256(p.totalShares));
    }

    /// @notice Cached share balance for an account in a pool (canonical balance lives on HTS).
    function shareBalanceOf(uint32 poolId, address account) external view returns (uint64) {
        return _shareBalance[poolId][account];
    }

    /// @notice Preview shares minted for an HBAR (tinybar) deposit at the current NAV.
    function previewDeposit(uint32 poolId, uint64 assetsTinybar) external view returns (uint64) {
        return _previewShares(pools[poolId], assetsTinybar);
    }

    /// @notice Preview HBAR (tinybar) returned for redeeming `shares` at the current NAV.
    function previewRedeem(uint32 poolId, uint64 shares) external view returns (uint64) {
        return _previewAssets(pools[poolId], shares);
    }

    // --- internal math -------------------------------------------------------
    /// shares = assets * ONE / navPerShare. At genesis (totalShares==0) it's 1:1 (nav == ONE).
    function _previewShares(Pool storage p, uint64 assets) internal view returns (uint64) {
        if (p.totalShares == 0 || p.totalAssets == 0) {
            return assets; // genesis: NAV == ONE, 1 tinybar deposited -> 1 share micro-unit
        }
        return uint64((uint256(assets) * uint256(p.totalShares)) / uint256(p.totalAssets));
    }

    /// assets = shares * navPerShare / ONE = shares * totalAssets / totalShares.
    function _previewAssets(Pool storage p, uint64 shares) internal view returns (uint64) {
        if (p.totalShares == 0) return 0;
        return uint64((uint256(shares) * uint256(p.totalAssets)) / uint256(p.totalShares));
    }

    /// Grant the account KYC on the share token once (idempotent cache).
    function _ensureKyc(address shareToken, address account) internal {
        if (_kycGranted[shareToken][account]) return;
        int64 rc = grantTokenKyc(shareToken, account);
        require(uint256(int256(rc)) == SUCCESS, "GRANT_KYC_FAIL");
        _kycGranted[shareToken][account] = true;
    }

    // Receive refunds (HTS create excess) + any HBAR sent to the vault.
    receive() external payable {}
}
