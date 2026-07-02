import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import * as dotenv from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";
import "solidity-coverage";

dotenv.config();

const MNEMONIC: string = "test test test test test test test test test test test junk";
const PRIVATE_KEY: string = process.env.PRIVATE_KEY ?? "";
// Deploy/verify are backend-only (the key is never shipped to the browser), so
// prefer the dedicated Alchemy endpoint for reliability; fall back to a public RPC.
const SEPOLIA_RPC_URL: string = process.env.ALCHEMY_RPC_URL || process.env.SEPOLIA_RPC_URL || "";

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: 0,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY ?? "",
  },
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
  },
  networks: {
    hardhat: {
      accounts: { mnemonic: MNEMONIC },
      chainId: 31337,
    },
    sepolia: {
      accounts: PRIVATE_KEY ? [PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`] : [],
      chainId: 11155111,
      url: SEPOLIA_RPC_URL,
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.28",
    settings: {
      metadata: { bytecodeHash: "none" },
      optimizer: { enabled: true, runs: 800 },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
};

export default config;
