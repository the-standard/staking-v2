const { expect } = require("chai");
const { ethers } = require("hardhat");

const BORROWED_FROM_VAULT = ethers.utils.parseEther('3000');
const LIQUIDATABLE = 643;
const collateralETH = ethers.utils.parseEther('1');
const collateral18Dec = ethers.utils.parseEther('500');
const collateral6Dec = 500_000_000;

describe('RewardGateway', async () => {
  let TST, EUROs, Staking, RewardToken18Dec, RewardToken6Dec,
    admin, user1;

  const mockSmartVaultManager = async _ => {
    const MockSmartVaultManager = await (await ethers.getContractFactory('MockSmartVaultManager')).deploy(
      LIQUIDATABLE, BORROWED_FROM_VAULT
    );
    await MockSmartVaultManager.addCollateral(ethers.constants.AddressZero, collateralETH, {value: collateralETH});
    await RewardToken18Dec.mint(admin.address, collateral18Dec);
    await RewardToken18Dec.approve(MockSmartVaultManager.address, collateral18Dec);
    await MockSmartVaultManager.addCollateral(RewardToken18Dec.address, collateral18Dec, {value: collateral18Dec});
    await RewardToken6Dec.mint(admin.address, collateral6Dec);
    await RewardToken6Dec.approve(MockSmartVaultManager.address, collateral6Dec);
    await MockSmartVaultManager.addCollateral(RewardToken6Dec.address, collateral6Dec, {value: collateral6Dec});
    return MockSmartVaultManager.address;
  }

  beforeEach(async () => {
    [ admin, user1 ] = await ethers.getSigners();

    TST = await (await ethers.getContractFactory('MockERC20')).deploy('The Standard Token', 'TST', 18);
    EUROs = await (await ethers.getContractFactory('MockERC20')).deploy('Standard Euro', 'EUROs', 18);
    Staking = await (await ethers.getContractFactory('Staking')).deploy(TST.address, EUROs.address);
    RewardToken18Dec = await (await ethers.getContractFactory('MockERC20')).deploy('Reward Token 18', 'RT18', 18)
    RewardToken6Dec = await (await ethers.getContractFactory('MockERC20')).deploy('Reward Token 6', 'RT6', 6)
    const MockTokenManager = await (await ethers.getContractFactory('MockTokenManager')).deploy(
      [RewardToken18Dec.address, RewardToken6Dec.address]
    );
    RewardGateway = await (await ethers.getContractFactory('RewardGateway')).deploy(
      Staking.address, EUROs.address, MockTokenManager.address, await mockSmartVaultManager()
    );
    await Staking.setRewardGateway(RewardGateway.address);
  });

  it('allows user to perform liquidation if they have required EUROs to burn', async () => {
    await expect(RewardGateway.connect(user1).liquidateVault(LIQUIDATABLE - 1)).to.be.revertedWith('vault-not-undercollateralised');

    await expect(RewardGateway.connect(user1).liquidateVault(LIQUIDATABLE)).to.be.revertedWithCustomError(EUROs, 'ERC20InsufficientBalance');

    await EUROs.mint(user1.address, BORROWED_FROM_VAULT);
    await expect(RewardGateway.connect(user1).liquidateVault(LIQUIDATABLE)).not.to.be.reverted;

    expect(await EUROs.balanceOf(user1.address)).to.equal(0);
    expect(await EUROs.totalSupply()).to.equal(0);
    expect(await RewardToken18Dec.balanceOf(user1.address)).to.equal(collateral18Dec);
    expect(await RewardToken6Dec.balanceOf(user1.address)).to.equal(collateral6Dec);
    expect(await ethers.provider.getBalance(user1.address)).to.be.greaterThan(ethers.utils.parseEther('10000'));
  });
});