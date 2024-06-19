const { ethers } = require("hardhat");

async function main() {
  const tstAddress = '0xf5A27E55C748bCDdBfeA5477CB9Ae924f0f7fd2e'
  const eurosAddress = '0x643b34980E635719C15a2D4ce69571a258F940E9'
  const tokenmanageraddress = '0x33c5A816382760b6E5fb50d8854a61b3383a32a0'
  const vaultmanager = '0xba169cceCCF7aC51dA223e04654Cf16ef41A68CC'
  const vaultIndex = '0x56c7506410e5e242261c5E0db6941956c686E5A1'
  const staking = await (await ethers.getContractFactory('Staking')).deploy(tstAddress, eurosAddress);
  await staking.deployed();

  const gateway = await (await ethers.getContractFactory('RewardGateway')).deploy(staking.address, eurosAddress, tokenmanageraddress, vaultmanager)
  await gateway.deployed();

  const set = await staking.setRewardGateway(gateway.address);
  await set.wait();

  const automation = await (await ethers.getContractFactory('LiquidationAutomation')).deploy(
    gateway.address,
    vaultmanager,
    vaultIndex
  )

  await new Promise(resolve => setTimeout(resolve, 60000));

  await run(`verify:verify`, {
    address: staking.address,
    constructorArguments: [
      tstAddress, eurosAddress
    ],
  });

  await run(`verify:verify`, {
    address: gateway.address,
    constructorArguments: [
      staking.address, eurosAddress, tokenmanageraddress, vaultmanager
    ],
  });

  await run(`verify:verify`, {
    address: automation.address,
    constructorArguments: [
      gateway.address,
      vaultmanager,
      vaultIndex
    ],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
