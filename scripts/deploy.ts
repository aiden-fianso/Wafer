/**
 * Deploy WaferVault live on Hedera testnet (chain 296) and create the first pool.
 *
 *   pnpm deploy   (== hardhat run scripts/deploy.ts --network testnet)
 *
 * Steps:
 *   1. deploy WaferVault (signed by the operator's ECDSA key from .env via hardhat.config).
 *   2. createPool("Wafer GPU-A", "wGPUA") funded with ~60 HBAR msg.value (HTS creates) + gas 10M.
 *   3. read the PoolCreated event -> share token + claim NFT EVM addresses -> Hedera 0.0.x ids.
 *   4. persist all public ids to deployments/testnet.json and VAULT_ADDRESS into .env.
 *
 * HTS-touching calls pin a high gasLimit (Hashio mis-estimates). Token creates are payable —
 * excess HBAR is refunded to the contract by the network.
 */
import hre from "hardhat";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const { ethers } = hre as any;

// Hardhat runs scripts from the project root (process.cwd()), so resolve repo paths from there.
const REPO_ROOT = process.cwd();
const DEPLOYMENTS_PATH = resolve(REPO_ROOT, "deployments", "testnet.json");
const ENV_PATH = resolve(REPO_ROOT, ".env");

const POOL_NAME = "Wafer GPU-A";
const POOL_SYMBOL = "wGPUA";
const HBAR = 10n ** 18n; // 1 HBAR in weibar
// Fungible-with-fees create ~60 HBAR + NFT create ~30 HBAR, and createPool forwards the full
// balance to each (precompile refunds the excess), so attach ~100 HBAR to fund both. Excess
// refunds to the contract and stays as working HBAR (used by financeClaim/redeem).
const POOL_FUNDING = 100n * HBAR;
const CREATE_GAS = 10_000_000n;

const HASHSCAN = "https://hashscan.io/testnet";

/** HTS tokens get a "long-zero" EVM address; the Hedera id is 0.0.<lower 64 bits>. */
function evmToHederaId(evm: string): string {
  const num = BigInt(evm);
  return `0.0.${num.toString()}`;
}

const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";

/** Resolve a deployed contract's Hedera 0.0.x id from its EVM address via the Mirror Node. */
async function resolveContractId(evm: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    try {
      const res = await fetch(`${MIRROR}/contracts/${evm}`, { headers: { "User-Agent": "curl/8" } });
      if (res.ok) {
        const data: any = await res.json();
        if (data.contract_id) return data.contract_id;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000)); // mirror lags a few seconds behind consensus
  }
  return ""; // best-effort; the EVM address is the canonical id anyway
}

/** Rewrite VAULT_ADDRESS in .env without touching secrets/comments. */
function updateEnv(updates: Record<string, string>): void {
  if (!existsSync(ENV_PATH)) return;
  const lines = readFileSync(ENV_PATH, "utf8").split("\n");
  const seen = new Set<string>();
  const out = lines.map((line) => {
    const m = line.match(/^(\s*)([A-Z0-9_]+)=/);
    if (m && updates[m[2]] !== undefined) {
      seen.add(m[2]);
      return `${m[1]}${m[2]}=${updates[m[2]]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(updates)) if (!seen.has(k)) out.push(`${k}=${v}`);
  writeFileSync(ENV_PATH, out.join("\n"));
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`\n=== Deploy WaferVault · chain ${net.chainId} ===`);
  console.log(`deployer : ${deployer.address}`);
  console.log(`balance  : ${ethers.formatEther(bal)} HBAR (weibar-denominated)\n`);

  // 1. Deploy the vault.
  const Vault = await ethers.getContractFactory("WaferVault");
  const vault = await Vault.deploy({ gasLimit: 4_000_000n });
  await vault.waitForDeployment();
  const vaultAddr: string = await vault.getAddress();
  const deployTx = vault.deploymentTransaction();
  console.log(`vault deployed: ${vaultAddr}`);
  console.log(`  tx: ${HASHSCAN}/transaction/${deployTx?.hash}`);

  // 2. Create the first pool (funded HTS creates).
  console.log(`\ncreating pool "${POOL_NAME}" (${POOL_SYMBOL}) — funding ${POOL_FUNDING / HBAR} HBAR...`);
  const tx = await vault.createPool(POOL_NAME, POOL_SYMBOL, {
    value: POOL_FUNDING,
    gasLimit: CREATE_GAS,
  });
  const receipt = await tx.wait();
  console.log(`  createPool tx: ${HASHSCAN}/transaction/${tx.hash}`);

  // 3. Parse the PoolCreated event for the token addresses.
  let poolId = 0;
  let shareTokenEvm = "";
  let claimNftEvm = "";
  for (const log of receipt!.logs) {
    try {
      const parsed = vault.interface.parseLog(log);
      if (parsed?.name === "PoolCreated") {
        poolId = Number(parsed.args.poolId);
        shareTokenEvm = parsed.args.shareToken;
        claimNftEvm = parsed.args.claimNft;
      }
    } catch {
      /* not our event */
    }
  }
  if (!shareTokenEvm) throw new Error("PoolCreated event not found — pool creation may have failed");

  const shareTokenId = evmToHederaId(shareTokenEvm);
  const claimNftId = evmToHederaId(claimNftEvm);
  const vaultHederaId = await resolveContractId(vaultAddr); // real contract id via Mirror Node

  console.log(`\n  poolId       : ${poolId}`);
  console.log(`  share token  : ${shareTokenEvm}  (${shareTokenId})`);
  console.log(`  claim NFT    : ${claimNftEvm}  (${claimNftId})`);

  // Sanity: NAV at genesis should be ONE (1e8).
  const nav = await vault.navPerShare(poolId);
  console.log(`  navPerShare  : ${nav.toString()} (genesis, tinybar 8dp)`);

  // 4. Persist.
  const now = new Date().toISOString();
  const prior = existsSync(DEPLOYMENTS_PATH)
    ? JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8"))
    : {};
  const deployment = {
    network: "testnet",
    chainId: Number(net.chainId),
    createdAt: prior.createdAt ?? now,
    updatedAt: now,
    settlementAsset: "HBAR",
    operator: deployer.address,
    vaultAddress: vaultAddr,
    vaultId: vaultHederaId,
    pool: {
      id: poolId,
      name: POOL_NAME,
      symbol: POOL_SYMBOL,
      shareTokenEvm,
      shareTokenId,
      claimNftEvm,
      claimNftId,
    },
    hashscan: {
      vault: `${HASHSCAN}/contract/${vaultAddr}`,
      shareToken: `${HASHSCAN}/token/${shareTokenId}`,
      claimNft: `${HASHSCAN}/token/${claimNftId}`,
      deployTx: `${HASHSCAN}/transaction/${deployTx?.hash}`,
      createPoolTx: `${HASHSCAN}/transaction/${tx.hash}`,
    },
    sourcify: `https://repo.sourcify.dev/contracts/full_match/296/${vaultAddr}/`,
  };
  mkdirSync(dirname(DEPLOYMENTS_PATH), { recursive: true });
  writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployment, null, 2) + "\n");
  updateEnv({ VAULT_ADDRESS: vaultAddr, SHARE_TOKEN_ID: shareTokenId, CLAIM_NFT_TOKEN_ID: claimNftId });

  console.log(`\n✓ wrote ${DEPLOYMENTS_PATH}`);
  console.log(`✓ wrote VAULT_ADDRESS to .env`);
  console.log(`\nHashScan:`);
  for (const [k, v] of Object.entries(deployment.hashscan)) console.log(`  ${k.padEnd(13)}: ${v}`);
  console.log(`\nNext: pnpm verify ${vaultAddr}   then   pnpm smoke\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
