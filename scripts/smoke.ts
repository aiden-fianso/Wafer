/**
 * Live lifecycle smoke test on Hedera testnet (chain 296).
 *
 *   pnpm smoke   (== hardhat run scripts/smoke.ts --network testnet)
 *
 * Reads deployments/testnet.json (run `pnpm deploy` first), then runs the full flow LIVE with
 * the operator standing in as both operator and investor:
 *
 *   createPool (if none) -> financeClaim -> deposit (send HBAR) -> settleRewards (send HBAR)
 *   -> assert navPerShare rose -> redeem (pull shares, get HBAR back).
 *
 * Prints HashScan links for every tx. HTS-touching calls pin a high gasLimit and we read the
 * on-chain navPerShare to prove the NAV rose. If a step fails with an HTS/precompile error or
 * INSUFFICIENT_PAYER_BALANCE, it surfaces — we never fake a result.
 */
import hre from "hardhat";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const { ethers } = hre as any;

// Hardhat runs scripts from the project root (process.cwd()).
const DEPLOYMENTS_PATH = resolve(process.cwd(), "deployments", "testnet.json");

const HBAR = 10n ** 18n; // weibar
const TINYBAR = 10n ** 8n;
const HASHSCAN = "https://hashscan.io/testnet";
const HTS_GAS = 1_200_000n; // pin gas on HTS-touching calls

// IHRC719 facade: an account associates a token by calling associate() on the token's own address.
const IHRC719_ABI = ["function associate() external returns (int64)"];
// ERC-20 facade (HIP-218/376) for approving the vault to pull the investor's shares on redeem.
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

function link(hash: string) {
  return `${HASHSCAN}/transaction/${hash}`;
}

async function main() {
  if (!existsSync(DEPLOYMENTS_PATH)) throw new Error("deployments/testnet.json missing — run `pnpm deploy` first");
  const d = JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8"));

  const [signer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  console.log(`\n=== Wafer smoke · chain ${net.chainId} ===`);
  console.log(`signer (operator + investor): ${signer.address}`);
  console.log(`vault: ${d.vaultAddress}\n`);

  const vault = await ethers.getContractAt("WaferVault", d.vaultAddress, signer);

  // Resolve the pool to use (the one persisted at deploy, default 0).
  const poolId: number = d.pool?.id ?? 0;
  const shareTokenEvm: string = d.pool?.shareTokenEvm;
  if (!shareTokenEvm) throw new Error("share token address missing from deployments — re-run deploy");
  const links: string[] = [];

  const navGenesis: bigint = await vault.navPerShare(poolId);
  console.log(`navPerShare (start): ${navGenesis} (tinybar, 8dp)`);

  // 1. financeClaim — advance 5 HBAR to the operator against a claim.
  const principalTinybar = 5n * TINYBAR; // 5 HBAR in tinybar
  const meta = ethers.toUtf8Bytes(JSON.stringify({ network: "GPU-A", expected: "10", term: 90 }));
  console.log(`\n[1] financeClaim — advance 5 HBAR...`);
  const fTx = await vault.financeClaim(poolId, signer.address, principalTinybar, meta, { gasLimit: HTS_GAS });
  await fTx.wait();
  links.push(`financeClaim : ${link(fTx.hash)}`);
  const claimId = Number(await vault.claimCount()) - 1;
  console.log(`    claimId=${claimId}  tx=${link(fTx.hash)}`);

  // 2. Associate the share token with the investor (operator stands in) via IHRC719.
  console.log(`\n[2] associate share token (IHRC719)...`);
  const ihrc = new ethers.Contract(shareTokenEvm, IHRC719_ABI, signer);
  try {
    const aTx = await ihrc.associate({ gasLimit: 800_000n });
    await aTx.wait();
    links.push(`associate    : ${link(aTx.hash)}`);
    console.log(`    tx=${link(aTx.hash)}`);
  } catch (e: any) {
    // Already associated -> the deposit will still work. Surface other errors.
    console.log(`    associate skipped/failed (likely already associated): ${e.shortMessage ?? e.message}`);
  }

  // 3. deposit — send 10 HBAR, receive shares at NAV.
  console.log(`\n[3] deposit 10 HBAR...`);
  const dTx = await vault.deposit(poolId, { value: 10n * HBAR, gasLimit: HTS_GAS });
  await dTx.wait();
  links.push(`deposit      : ${link(dTx.hash)}`);
  const sharesAfter: bigint = await vault.shareBalanceOf(poolId, signer.address);
  console.log(`    shares minted (cache): ${sharesAfter}  tx=${link(dTx.hash)}`);

  const navAfterDeposit: bigint = await vault.navPerShare(poolId);
  console.log(`    navPerShare (post-deposit): ${navAfterDeposit}`);

  // 4. settleRewards — route 5 HBAR of rewards in -> NAV must rise.
  console.log(`\n[4] settleRewards 5 HBAR...`);
  const sTx = await vault.settleRewards(poolId, claimId, { value: 5n * HBAR, gasLimit: HTS_GAS });
  await sTx.wait();
  links.push(`settleRewards: ${link(sTx.hash)}`);
  const navAfterSettle: bigint = await vault.navPerShare(poolId);
  console.log(`    navPerShare (post-settle): ${navAfterSettle}  tx=${link(sTx.hash)}`);

  if (!(navAfterSettle > navAfterDeposit)) {
    throw new Error(`NAV did not rise after settle (${navAfterDeposit} -> ${navAfterSettle})`);
  }
  console.log(`    ✓ NAV rose: ${navAfterDeposit} -> ${navAfterSettle}`);

  // 5. redeem — approve the vault to pull shares, then redeem all shares for HBAR.
  console.log(`\n[5] approve + redeem all shares...`);
  const erc20 = new ethers.Contract(shareTokenEvm, ERC20_ABI, signer);
  const shareBal: bigint = await erc20.balanceOf(signer.address);
  console.log(`    HTS share balance: ${shareBal}`);
  const apTx = await erc20.approve(d.vaultAddress, shareBal, { gasLimit: 800_000n });
  await apTx.wait();
  links.push(`approve      : ${link(apTx.hash)}`);

  const balBefore: bigint = await ethers.provider.getBalance(signer.address);
  const rTx = await vault.redeem(poolId, shareBal, { gasLimit: HTS_GAS });
  await rTx.wait();
  links.push(`redeem       : ${link(rTx.hash)}`);
  const balAfter: bigint = await ethers.provider.getBalance(signer.address);
  console.log(`    redeemed.  tx=${link(rTx.hash)}`);
  console.log(`    HBAR balance delta (net of gas): ${ethers.formatEther(balAfter - balBefore)}`);

  const sharesEnd: bigint = await vault.shareBalanceOf(poolId, signer.address);
  console.log(`    share balance (cache) after redeem: ${sharesEnd}`);

  console.log(`\n=== Lifecycle complete ===`);
  console.log(`NAV: ${navGenesis} -> ${navAfterDeposit} -> ${navAfterSettle} (rose on settle ✓)`);
  console.log(`\nHashScan links:`);
  for (const l of links) console.log(`  ${l}`);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
