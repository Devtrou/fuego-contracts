import { HardhatUserConfig } from "hardhat/config";
import { NetworkUserConfig } from "hardhat/types";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-tracer";

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

const base: NetworkUserConfig = {
  url: "https://mainnet.base.org",
  chainId: 8453,
  accounts: [process.env.KEY_BASE!],
};

const config: HardhatUserConfig = {
  networks: { hardhat: {}, ...(process.env.KEY_BASE && { base }) },
  solidity: { compilers: [{ version: "0.8.27", settings: { optimizer: { enabled: true, runs: 200 } } }] },
  etherscan: { apiKey: { base: process.env.BASE_SCAN_KEY || "" } },
};

export default config;
