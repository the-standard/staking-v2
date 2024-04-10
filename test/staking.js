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

      await Staking.connect(user1).decreaseStake(tstStake, 0);
      expect(await Staking.start()).to.equal(ts2);

      await Staking.connect(user3).decreaseStake(tstStake, 0);
      expect(await Staking.start()).to.equal(ts2);

      await Staking.connect(user2).decreaseStake(tstStake, 0);
      expect(await Staking.start()).to.equal(ts4);

      await Staking.connect(user4).decreaseStake(tstStake, 0);
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

      await Staking.connect(user3).decreaseStake(tstStake, 0);
      // 4 days, 400 TST, 40 EUROs
      // .025 EUROs per TST
      expect(await Staking.dailyEuroPerTstRate()).to.equal(ethers.utils.parseEther('.025'));
    });
  });

  describe('increaseStake', async () => {
    it('increases the stake of TST and EUROs', async () => {
      let position = await Staking.positions(user1.address);
      expect(position.TST).to.equal(0);
      expect(position.EUROs).to.equal(0);

      const tstStake = ethers.utils.parseEther('10000');
      const eurosStake = ethers.utils.parseEther('100');
      await TST.mint(user1.address, tstStake);
      await EUROs.mint(user1.address, eurosStake);

      let increase = Staking.connect(user1).increaseStake(0, 0);
      await expect(increase).to.be.revertedWithCustomError(Staking, 'InvalidStake');

      increase = Staking.connect(user1).increaseStake(tstStake, eurosStake);
      await expect(increase).to.be.revertedWithCustomError(TST, 'ERC20InsufficientAllowance');

      await TST.connect(user1).approve(Staking.address, tstStake);
      increase = Staking.connect(user1).increaseStake(tstStake, eurosStake);
      await expect(increase).to.be.revertedWithCustomError(EUROs, 'ERC20InsufficientAllowance');
      
      await EUROs.connect(user1).approve(Staking.address, eurosStake);
      increase = Staking.connect(user1).increaseStake(tstStake, eurosStake);
      await expect(increase).not.to.be.reverted;

      position = await Staking.positions(user1.address);
      expect(position.TST).to.equal(tstStake);
      expect(position.EUROs).to.equal(eurosStake);


      expect(await TST.balanceOf(Staking.address)).to.equal(tstStake);
      expect(await EUROs.balanceOf(Staking.address)).to.equal(eurosStake);
      expect(await TST.balanceOf(user1.address)).to.equal(0);
      expect(await EUROs.balanceOf(user1.address)).to.equal(0);
    });

    it('resets the staking start every time the stake is increased', async () => {
      let position = await Staking.positions(user1.address);
      expect(position.start).to.equal(0);

      const tstStake = ethers.utils.parseEther('10000');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      let increase = await Staking.connect(user1).increaseStake(tstStake, 0);

      position = await Staking.positions(user1.address);
      expect(position.start).to.equal((await ethers.provider.getBlock(increase.blockNumber)).timestamp);

      const eurosStake = ethers.utils.parseEther('100');
      await EUROs.mint(user1.address, eurosStake);
      await EUROs.connect(user1).approve(Staking.address, eurosStake);
      increase = await Staking.connect(user1).increaseStake(0, eurosStake);

      position = await Staking.positions(user1.address);
      expect(position.start).to.equal((await ethers.provider.getBlock(increase.blockNumber)).timestamp);
    });
  });

  describe('decreaseStake', async() => {
    it('allows users to remove part or all of their stake', async () => {
      const tstStake = ethers.utils.parseEther('10000');
      const eurosStake = ethers.utils.parseEther('100');
      await TST.mint(user1.address, tstStake);
      await EUROs.mint(user1.address, eurosStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      await EUROs.connect(user1).approve(Staking.address, eurosStake);
      await Staking.connect(user1).increaseStake(tstStake, eurosStake);

      let position = await Staking.positions(user1.address);
      expect(position.TST).to.equal(tstStake);
      expect(position.EUROs).to.equal(eurosStake);

      await expect(Staking.connect(user1).decreaseStake(tstStake.add(1), 0)).to.be.revertedWithCustomError(Staking, 'InvalidUnstake');
      await expect(Staking.connect(user1).decreaseStake(0, eurosStake.add(1))).to.be.revertedWithCustomError(Staking, 'InvalidUnstake');

      await expect(Staking.connect(user1).decreaseStake(tstStake.div(2), 0)).not.to.be.reverted;

      position = await Staking.positions(user1.address);
      expect(position.TST).to.equal(tstStake.div(2));
      expect(position.EUROs).to.equal(eurosStake);

      expect(await TST.balanceOf(Staking.address)).to.equal(tstStake.div(2));
      expect(await TST.balanceOf(user1.address)).to.equal(tstStake.div(2));

      await expect(Staking.connect(user1).decreaseStake(tstStake.div(2), eurosStake)).not.to.be.reverted;
      
      position = await Staking.positions(user1.address);
      expect(position.TST).to.equal(0);
      expect(position.EUROs).to.equal(0);

      expect(await TST.balanceOf(Staking.address)).to.equal(0);
      expect(await EUROs.balanceOf(Staking.address)).to.equal(0);
      expect(await TST.balanceOf(user1.address)).to.equal(tstStake);
      expect(await EUROs.balanceOf(user1.address)).to.equal(eurosStake);
    });

    it('resets staking start when stake is decreased, removes when emptied', async () => {
      const tstStake = ethers.utils.parseEther('10000');
      const eurosStake = ethers.utils.parseEther('100');
      await TST.mint(user1.address, tstStake);
      await EUROs.mint(user1.address, eurosStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      await EUROs.connect(user1).approve(Staking.address, eurosStake);
      await Staking.connect(user1).increaseStake(tstStake, eurosStake);

      let decrease = await Staking.connect(user1).decreaseStake(tstStake.div(2), 0)

      position = await Staking.positions(user1.address);
      expect(position.start).to.equal((await ethers.provider.getBlock(decrease.blockNumber)).timestamp);

      decrease = await Staking.connect(user1).decreaseStake(tstStake.div(2), eurosStake)

      position = await Staking.positions(user1.address);
      expect(position.start).to.equal(0);
    });
  });

  // describe('claimRewards', async () => {
  //   it('grants user the accummulated EUROs fees', async () => {
  //     expect(await Staking.start()).to.equal(0);

  //     const tstStake = ethers.utils.parseEther('100');
  //     await TST.mint(user1.address, tstStake);
  //     await TST.connect(user1).approve(Staking.address, tstStake);
  //     let stake = await Staking.connect(user1).increaseStake(tstStake, 0);
  //     const ts1 = (await ethers.provider.getBlock(stake.blockNumber)).timestamp;
  //     expect(await Staking.start()).to.equal(ts1);

  //     await fastForward(60);

  //     await TST.mint(user2.address, tstStake);
  //     await TST.connect(user2).approve(Staking.address, tstStake);
  //     stake = await Staking.connect(user2).increaseStake(tstStake, 0);
  //     const ts2 = (await ethers.provider.getBlock(stake.blockNumber)).timestamp;
  //     expect(await Staking.start()).to.equal(ts1);
  //   });
  // });
});