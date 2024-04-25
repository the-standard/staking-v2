const { ethers } = require("hardhat");

async function main() {
  const tstAddress = '0xcD2204188db24d8db2b15151357e43365443B113'
  const eurosAddress = '0x5D1684E5b989Eb232ac84D6b73D783FE44114C2b'
  const tokenmanageraddress = '0x18f413879A00Db35A4Ea22300977924E613F3D88'
  const staking = await (await ethers.getContractFactory('Staking')).deploy(tstAddress, eurosAddress);
  await staking.deployed();

  const gateway = await (await ethers.getContractFactory('RewardGateway')).deploy(staking.address, eurosAddress, tokenmanageraddress)
  await gateway.deployed();

  const set = await staking.setRewardGateway(gateway.address);
  await set.wait();

  await run(`verify:verify`, {
    address: staking.address,
    constructorArguments: [
      tstAddress, eurosAddress
    ],
  });

  await run(`verify:verify`, {
    address: gateway.address,
    constructorArguments: [
      staking.address, eurosAddress, tokenmanageraddress
    ],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
