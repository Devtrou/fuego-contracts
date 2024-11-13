import { ethers } from "hardhat";

const weth = "0x4200000000000000000000000000000000000006";
let owner = "";

async function main() {
  const deployer = (await ethers.getSigners())[0];
  console.log(`deployer: ${deployer.address}`);
  const emberCore = await ethers.deployContract("EmberCore");
  const collector = await ethers.deployContract("Collector", [emberCore.target]);
  console.log(`emberCore: ${emberCore.target}`);
  console.log(`collector: ${collector.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
