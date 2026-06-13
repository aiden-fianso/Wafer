import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import type { HardhatUserConfig } from "hardhat/config";

/**
 * Hardhat config for the WaferVault contract on the Hedera EVM (HSCS).
 *
 *  - Solidity 0.8.24 with the optimizer + viaIR (the HTS helper structs push the
 *    "stack too deep" limit; viaIR keeps the create paths compilable).
 *  - network `testnet` = Hashio JSON-RPC relay (chain 296), signed by the operator's
 *    raw-hex ECDSA key from .env (never committed). HTS-touching calls need a pinned,
 *    high gasLimit — the deploy/smoke scripts set it per-tx.
 *  - HashScan/Sourcify verification via @nomicfoundation/hardhat-verify's `sourcify`
 *    block pointed at server-verify.hashscan.io.
 */

const OPERATOR_KEY = (process.env.OPERATOR_KEY ?? "").trim();

// viem/ethers want a 0x-prefixed hex private key. The operator key is raw-hex ECDSA.
function evmPrivateKey(raw: string): string[] {
  if (!raw) return [];
  const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
  // A valid secp256k1 private key is 32 bytes = 66 chars incl. 0x.
  return hex.length === 66 ? [hex] : [];
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 1337,
    },
    testnet: {
      url: process.env.HASHIO_RPC_URL ?? "https://testnet.hashio.io/api",
      chainId: 296,
      accounts: evmPrivateKey(OPERATOR_KEY),
      // Hashio mis-estimates gas; scripts pin gasLimit per-tx. This is a sane ceiling.
      gas: 10_000_000,
    },
  },
  // HashScan reads verification from Sourcify; we submit to the Sourcify server (chain 296 is
  // indexed there) and HashScan picks the verified contract up. The HashScan-hosted Sourcify
  // mirror (server-verify.hashscan.io) is a v2 server incompatible with hardhat-verify@2's v1
  // API, so we target sourcify.dev/server directly.
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify.dev/server",
    browserUrl: "https://repo.sourcify.dev",
  },
  // We don't use Etherscan-style verification on Hedera; disable to avoid a missing-key error.
  etherscan: {
    enabled: false,
  },
};

export default config;
