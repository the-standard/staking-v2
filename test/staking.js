const { expect } = require("chai");
const { ethers } = require("hardhat");

const DAY = 24 * 60 * 60;

const fastForward = async time => {
  await ethers.provider.send("evm_increaseTime", [time]);
  await ethers.provider.send("evm_mine");
}

describe('Staking', async () => {
  let TST, EUROs, Staking,
    admin, user1, user2, user3, user4, user5;

  beforeEach(async () => {
    [ admin, user1, user2, user3, user4, user5 ] = await ethers.getSigners();

    TST = await (await ethers.getContractFactory('MockERC20')).deploy('The Standard Token', 'TST', 18);
    EUROs = await (await ethers.getContractFactory('MockERC20')).deploy('Standard Euro', 'EUROs', 18);
    Staking = await (await ethers.getContractFactory('Staking')).deploy(TST.address, EUROs.address);
  });

  describe('start', async () => {
    it('stores the earliest staking date as the staking start', async () => {
      expect(await Staking.start()).to.equal(0);

      const tstStake = ethers.utils.parseEther('100');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      let stake = await Staking.connect(user1).increaseStake(tstStake);
      const ts1 = (await ethers.provider.getBlock(stake.blockNumber)).timestamp;
      expect(await Staking.start()).to.equal(ts1);

      await fastForward(60);

      await TST.mint(user2.address, tstStake);
      await TST.connect(user2).approve(Staking.address, tstStake);
      stake = await Staking.connect(user2).increaseStake(tstStake);
      const ts2 = (await ethers.provider.getBlock(stake.blockNumber)).timestamp;
      expect(await Staking.start()).to.equal(ts1);

      await fastForward(60);

      await TST.mint(user3.address, tstStake);
      await TST.connect(user3).approve(Staking.address, tstStake);
      stake = await Staking.connect(user3).increaseStake(tstStake);
      expect(await Staking.start()).to.equal(ts1);

      await fastForward(60);

      await TST.mint(user4.address, tstStake);
      await TST.connect(user4).approve(Staking.address, tstStake);
      stake = await Staking.connect(user4).increaseStake(tstStake);
      const ts4 = (await ethers.provider.getBlock(stake.blockNumber)).timestamp;
      expect(await Staking.start()).to.equal(ts1);

      await Staking.connect(user1).decreaseStake(tstStake);
      expect(await Staking.start()).to.equal(ts2);

      await Staking.connect(user3).decreaseStake(tstStake);
      expect(await Staking.start()).to.equal(ts2);

      await Staking.connect(user2).decreaseStake(tstStake);
      expect(await Staking.start()).to.equal(ts4);

      await Staking.connect(user4).decreaseStake(tstStake);
      expect(await Staking.start()).to.equal(0);
    });
  });

  describe('dailyEuroPerTstRate', async () => {
    xit('constantly recalculates interest rate per TST per day in EUROs', async () => {
    });
  });

});