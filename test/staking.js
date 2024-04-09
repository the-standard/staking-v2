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
      let stake = await Staking.connect(user1).increaseStake(tstStake, 0);
      const ts1 = (await ethers.provider.getBlock(stake.blockNumber)).timestamp;
      expect(await Staking.start()).to.equal(ts1);

      await fastForward(60);

      await TST.mint(user2.address, tstStake);
      await TST.connect(user2).approve(Staking.address, tstStake);
      stake = await Staking.connect(user2).increaseStake(tstStake, 0);
      const ts2 = (await ethers.provider.getBlock(stake.blockNumber)).timestamp;
      expect(await Staking.start()).to.equal(ts1);

      await fastForward(60);

      await TST.mint(user3.address, tstStake);
      await TST.connect(user3).approve(Staking.address, tstStake);
      stake = await Staking.connect(user3).increaseStake(tstStake, 0);
      expect(await Staking.start()).to.equal(ts1);

      await fastForward(60);

      await TST.mint(user4.address, tstStake);
      await TST.connect(user4).approve(Staking.address, tstStake);
      stake = await Staking.connect(user4).increaseStake(tstStake, 0);
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
    it('constantly recalculates interest rate per TST per day in EUROs, based on moving start', async () => {
      expect(await Staking.dailyEuroPerTstRate()).to.equal(0);

      const tstStake = ethers.utils.parseEther('100');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      await Staking.connect(user1).increaseStake(tstStake, 0);
      // 0 day, 100 TST, 0 EUROs
      expect(await Staking.dailyEuroPerTstRate()).to.equal(0);

      const fees = ethers.utils.parseEther('10')
      await EUROs.mint(admin.address, fees)
      await EUROs.connect(admin).approve(Staking.address, fees);
      await Staking.connect(admin).dropFees(fees);

      // 0 day, 100 TST, 100 EUROs
      expect(await Staking.dailyEuroPerTstRate()).to.equal(0);
      await fastForward(DAY);
      // 1 day, 100 TST, 10 EUROs
      // .1 EUROs per TST
      expect(await Staking.dailyEuroPerTstRate()).to.equal(ethers.utils.parseEther('.1'));

      await TST.mint(user2.address, tstStake);
      await TST.connect(user2).approve(Staking.address, tstStake);
      await Staking.connect(user2).increaseStake(tstStake, 0);
      // 1 day, 200 TST, 10 EUROs
      // .05 EUROs per TST
      expect(await Staking.dailyEuroPerTstRate()).to.equal(ethers.utils.parseEther('0.05'));

      await EUROs.mint(admin.address, fees)
      await EUROs.connect(admin).approve(Staking.address, fees);
      await Staking.connect(admin).dropFees(fees);
      // 1 day, 200 TST, 20 EUROs
      // .1 EUROs per TST
      expect(await Staking.dailyEuroPerTstRate()).to.equal(ethers.utils.parseEther('.1'));

      await fastForward(DAY);
      // 2 days, 200 TST, 20 EUROs
      // .05 EUROs per TST
      expect(await Staking.dailyEuroPerTstRate()).to.equal(ethers.utils.parseEther('0.05'));

      // user 3 stakes double stake amount
      await TST.mint(user3.address, tstStake.mul(2));
      await TST.connect(user3).approve(Staking.address, tstStake.mul(2));
      await Staking.connect(user3).increaseStake(tstStake.mul(2), 0);
      // 2 days, 400 TST, 20 EUROs
      // .05 EUROs per TST
      expect(await Staking.dailyEuroPerTstRate()).to.equal(ethers.utils.parseEther('.025'));

      await EUROs.mint(admin.address, fees)
      await EUROs.connect(admin).approve(Staking.address, fees);
      await Staking.connect(admin).dropFees(fees);
      // 2 days, 400 TST, 30 EUROs
      // .0375 EUROs per TST
      expect(await Staking.dailyEuroPerTstRate()).to.equal(ethers.utils.parseEther('.0375'));

      await fastForward(DAY);
      // 3 days, 400 TST, 30 EUROs
      // .025 EUROs per TST
      expect(await Staking.dailyEuroPerTstRate()).to.equal(ethers.utils.parseEther('0.025'));

      await TST.mint(user4.address, tstStake);
      await TST.connect(user4).approve(Staking.address, tstStake);
      stake = await Staking.connect(user4).increaseStake(tstStake, 0);
      // 3 days, 500 TST, 30 EUROs
      // .02 EUROs per TST
      expect(await Staking.dailyEuroPerTstRate()).to.equal(ethers.utils.parseEther('0.02'));

      await fastForward(DAY);
      // 4 days, 500 TST, 30 EUROs
      // .015 EUROs per TST
      expect(await Staking.dailyEuroPerTstRate()).to.equal(ethers.utils.parseEther('0.015'));

      await EUROs.mint(admin.address, fees)
      await EUROs.connect(admin).approve(Staking.address, fees);
      await Staking.connect(admin).dropFees(fees);
      // 4 days, 500 TST, 40 EUROs
      // .02 EUROs per TST
      expect(await Staking.dailyEuroPerTstRate()).to.equal(ethers.utils.parseEther('.02'));

      await Staking.connect(user3).decreaseStake(tstStake);
      // 4 days, 400 TST, 40 EUROs
      // .025 EUROs per TST
      expect(await Staking.dailyEuroPerTstRate()).to.equal(ethers.utils.parseEther('.025'));
    });
  });

  // describe('position', async () => {
  //   it('shows detailed about amount staked and start of stake', async () => {
  //     let position = await Staking.positions(user1.address);
  //     expect(position.start).to.equal(0);
  //     expect(position.TST).to.equal(0);
  //     expect(position.EUROs).to.equal(0);

  //     const tstStake = ethers.utils.parseEther('10000');
  //     const eurosStake = ethers.utils.parseEther('100');
  //     await TST.mint(user1.address, tstStake);
  //     await TST.connect(user1).approve(Staking.address, tstStake);
  //     await EUROs.mint(user1.address, eurosStake);
  //     await EUROs.connect(user1).approve(Staking.address, eurosStake);
  //     const increase = await Staking.connect(user1).increaseStake(tstStake, eurosStake);
  //     let stakeStart = (await ethers.provider.getBlock(increase.blockNumber)).timestamp;
  //     console.log(stakeStart)

  //     position = await Staking.positions(user1.address);
  //     expect(position.start).to.equal(stakeStart);
  //     expect(position.TST).to.equal(tstStake);
  //     expect(position.EUROs).to.equal(eurosStake);

  //     const decrease = await Staking.decreaseStake(tstStake.div(2), eurosStake);
  //     stakeStart = (await ethers.provider.getBlock(decrease.blockNumber)).timestamp;
  //     console.log(stakeStart)
  //     position = await Staking.positions(user1.address);
  //     expect(position.start).to.equal(stakeStart);
  //     expect(position.TST).to.equal(tstStake.div(2));
  //     expect(position.EUROs).to.equal(0);
  //   })
  // });
});