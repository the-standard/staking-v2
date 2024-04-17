const { expect } = require("chai");
const { ethers } = require("hardhat");

// TODO mathematically is there any benefit to a user just claiming every 24 hours? is it damaging to other user stakes?

const DAY = 24 * 60 * 60;

const fastForward = async time => {
  await ethers.provider.send("evm_increaseTime", [time]);
  await ethers.provider.send("evm_mine");
}

describe('Staking', async () => {
  let TST, EUROs, Staking, RewardToken18Dec, RewardToken6Dec, UnofficialRewardToken,
    admin, user1, user2, user3, user4, user5;

  beforeEach(async () => {
    [ admin, user1, user2, user3, user4, user5 ] = await ethers.getSigners();

    TST = await (await ethers.getContractFactory('MockERC20')).deploy('The Standard Token', 'TST', 18);
    EUROs = await (await ethers.getContractFactory('MockERC20')).deploy('Standard Euro', 'EUROs', 18);
    Staking = await (await ethers.getContractFactory('Staking')).deploy(TST.address, EUROs.address);
    RewardToken18Dec = await (await ethers.getContractFactory('MockERC20')).deploy('Reward Token 18', 'RT18', 18)
    RewardToken6Dec = await (await ethers.getContractFactory('MockERC20')).deploy('Reward Token 6', 'RT6', 6)
    UnofficialRewardToken = await (await ethers.getContractFactory('MockERC20')).deploy('Unofficial Reward Token 6', 'URT6', 18)
    const MockTokenManager = await (await ethers.getContractFactory('MockTokenManager')).deploy(
      [RewardToken18Dec.address, RewardToken6Dec.address]
    );
    RewardGateway = await (await ethers.getContractFactory('RewardGateway')).deploy(Staking.address, EUROs.address, MockTokenManager.address);
    await Staking.setRewardGateway(RewardGateway.address);
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
      await EUROs.mint(RewardGateway.address, fees)
      await RewardGateway.dropFees();

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

      await EUROs.mint(RewardGateway.address, fees)
      await RewardGateway.dropFees();
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

      await EUROs.mint(RewardGateway.address, fees)
      await RewardGateway.dropFees();
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

      await EUROs.mint(RewardGateway.address, fees)
      await RewardGateway.dropFees();
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

    it('triggers dropping of fees', async () => {
      const tstStake = ethers.utils.parseEther('10000');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      await Staking.connect(user1).increaseStake(tstStake, 0);

      await fastForward(DAY);

      const eurosFees = ethers.utils.parseEther('10');
      await EUROs.mint(RewardGateway.address, eurosFees);
      
      await TST.mint(user2.address, tstStake);
      await TST.connect(user2).approve(Staking.address, tstStake);
      await Staking.connect(user2).increaseStake(tstStake, 0);

      expect(await EUROs.balanceOf(Staking.address)).to.equal(eurosFees);
      // 1 day staked by user, 1 day total, 50% of TST staked
      expect((await Staking.projectedEarnings(user1.address))._EUROs).to.equal(eurosFees.div(2));
      // 0 days staked by user, 0 fees earned yet
      expect((await Staking.projectedEarnings(user2.address))._EUROs).to.equal(0);
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

    it('triggers dropping of fees', async () => {
      const tstStake = ethers.utils.parseEther('10000');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      await Staking.connect(user1).increaseStake(tstStake, 0);
      
      await TST.mint(user2.address, tstStake);
      await TST.connect(user2).approve(Staking.address, tstStake);
      await Staking.connect(user2).increaseStake(tstStake, 0);

      await fastForward(DAY);

      const eurosFees = ethers.utils.parseEther('10');
      await EUROs.mint(RewardGateway.address, eurosFees);

      await Staking.connect(user2).decreaseStake(tstStake, 0);

      expect(await EUROs.balanceOf(Staking.address)).to.equal(eurosFees);
      // 1 day staked by user, 1 day total, 100% of TST staked
      expect((await Staking.projectedEarnings(user1.address))._EUROs).to.equal(eurosFees);
      // 0 days staked by user, 0 fees earned yet
      expect((await Staking.projectedEarnings(user2.address))._EUROs).to.equal(0);
    });
  });

  describe('projectedEarnings', async () => {
    it('shows the projected earnings for a user', async () => {
      let fees = ethers.utils.parseEther('20');
      await EUROs.mint(RewardGateway.address, fees)
      await RewardGateway.dropFees();

      let tstStake = ethers.utils.parseEther('100');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      await Staking.connect(user1).increaseStake(tstStake, 0);

      await fastForward(DAY);

      const eurosStake = ethers.utils.parseEther('20');
      await TST.mint(user2.address, tstStake.mul(2));
      await TST.connect(user2).approve(Staking.address, tstStake.mul(2));
      await EUROs.mint(user2.address, eurosStake);
      await EUROs.connect(user2).approve(Staking.address, eurosStake);
      await Staking.connect(user2).increaseStake(tstStake.mul(2), eurosStake);

      await fastForward(DAY);

      await TST.mint(user3.address, tstStake);
      await TST.connect(user3).approve(Staking.address, tstStake);
      await Staking.connect(user3).increaseStake(tstStake, 0);

      // euros per tst per day rate = 20 euros / 400 tst / 2 days = 0.025
      // user 1 has 100 TST staked for 2 days = 0.025 * 100 * 2 = 5 EUROs projected
      let projected = await Staking.projectedEarnings(user1.address);
      expect(projected._EUROs).to.equal(ethers.utils.parseEther('5'));
      expect(projected._rewards).to.be.empty;

      // euros per tst per day rate = 20 euros / 400 tst / 2 days = 0.025
      // user 2 has 200 TST staked for 1 days = 0.025 * 200 * 1 = 5 EUROs projected
      projected = await Staking.projectedEarnings(user2.address);
      expect(projected._EUROs).to.equal(ethers.utils.parseEther('5'));
      expect(projected._rewards).to.be.empty;

      await fastForward(DAY);

      fees = ethers.utils.parseEther('10');
      await EUROs.mint(RewardGateway.address, fees)
      await RewardGateway.dropFees();

      // euros per tst per day rate = 30 euros / 400 tst / 3 days = 0.025
      // user 2 has 200 TST staked for 2 days = 0.025 * 200 * 2 = 10 EUROs projected
      projected = await Staking.projectedEarnings(user2.address);
      expect(projected._EUROs).to.equal(ethers.utils.parseEther('10'));
      expect(projected._rewards).to.be.empty;

      // euros per tst per day rate = 30 euros / 400 tst / 3 days = 0.025
      // user 3 has 100 TST staked for 2 days = 0.025 * 100 * 1 = 2.5 EUROs projected
      projected = await Staking.projectedEarnings(user3.address);
      expect(projected._EUROs).to.equal(ethers.utils.parseEther('2.5'));
      expect(projected._rewards).to.be.empty;
    });
  });

  describe('claimRewards', async () => {
    it('grants user the accummulated EUROs fees', async () => {
      const fees = ethers.utils.parseEther('20');
      await EUROs.mint(RewardGateway.address, fees)
      await RewardGateway.dropFees();

      let tstStake = ethers.utils.parseEther('100');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      await Staking.connect(user1).increaseStake(tstStake, 0);

      await fastForward(DAY);

      const eurosStake = ethers.utils.parseEther('20');
      await TST.mint(user2.address, tstStake.mul(2));
      await TST.connect(user2).approve(Staking.address, tstStake.mul(2));
      await EUROs.mint(user2.address, eurosStake);
      await EUROs.connect(user2).approve(Staking.address, eurosStake);
      await Staking.connect(user2).increaseStake(tstStake.mul(2), eurosStake);

      await fastForward(DAY);

      await TST.mint(user3.address, tstStake);
      await TST.connect(user3).approve(Staking.address, tstStake);
      await Staking.connect(user3).increaseStake(tstStake, 0);

      // euros per tst per day rate = 20 euros / 400 tst / 2 days = 0.025
      // user 1 has 100 TST staked for 2 days = 0.025 * 100 * 2 = 5 EUROs reward
      await Staking.connect(user1).claim();
      expect(await EUROs.balanceOf(user1.address)).to.equal(ethers.utils.parseEther('5'))

      await fastForward(DAY);

      // euros per tst per day rate = 15 euros / 400 tst / 2 days = 0.01875
      // user 2 has 200 TST staked for 2 days = 0.01875 * 200 * 2 = 7.5 EUROs reward
      await Staking.connect(user2).claim();
      expect(await EUROs.balanceOf(user2.address)).to.equal(ethers.utils.parseEther('7.5'));
    });

    it('restarts the user stake', async () => {
      const fees = ethers.utils.parseEther('20');
      await EUROs.mint(RewardGateway.address, fees)
      await RewardGateway.dropFees();

      let tstStake = ethers.utils.parseEther('100');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      let stake = await Staking.connect(user1).increaseStake(tstStake, 0);
      const ts1 = (await ethers.provider.getBlock(stake.blockNumber)).timestamp;

      await fastForward(DAY);

      const eurosStake = ethers.utils.parseEther('20');
      await TST.mint(user2.address, tstStake.mul(2));
      await TST.connect(user2).approve(Staking.address, tstStake.mul(2));
      stake = await Staking.connect(user2).increaseStake(tstStake.mul(2), 0);
      const ts2 = (await ethers.provider.getBlock(stake.blockNumber)).timestamp;
      
      await fastForward(DAY);

      expect(await Staking.start()).to.equal(ts1);

      await Staking.connect(user1).claim();
      expect(await Staking.start()).to.equal(ts2);

      expect((await Staking.projectedEarnings(user1.address))._EUROs).to.equal(0);
    });

    it('triggers dropping of fees', async () => {
      const tstStake = ethers.utils.parseEther('10000');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      await Staking.connect(user1).increaseStake(tstStake, 0);
      
      await TST.mint(user2.address, tstStake);
      await TST.connect(user2).approve(Staking.address, tstStake);
      await Staking.connect(user2).increaseStake(tstStake, 0);

      await fastForward(DAY);

      const eurosFees = ethers.utils.parseEther('10');
      await EUROs.mint(RewardGateway.address, eurosFees);

      await Staking.connect(user2).claim();

      // 1 day staked by user, 1 day total, 50% of TST staked, 5 EUROs remaining
      expect((await Staking.projectedEarnings(user1.address))._EUROs).to.equal(eurosFees.div(4));
      // their 50% of euros fees is already claimed
      expect((await Staking.projectedEarnings(user2.address))._EUROs).to.equal(0);
      expect(await EUROs.balanceOf(user2.address)).to.equal(eurosFees.div(2));
    });
  });

  describe('dropFees', async () => {
    it('adds fees to the staking pool, using reward gateway', async () => {
      const tstStake = ethers.utils.parseEther('100000');
      const eurosStake = ethers.utils.parseEther('100');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      await EUROs.mint(user1.address, eurosStake);
      await EUROs.connect(user1).approve(Staking.address, eurosStake);
      await Staking.connect(user1).increaseStake(tstStake, eurosStake);

      await TST.mint(user2.address, tstStake);
      await TST.connect(user2).approve(Staking.address, tstStake);
      await EUROs.mint(user2.address, eurosStake.mul(3));
      await EUROs.connect(user2).approve(Staking.address, eurosStake.mul(3));
      await Staking.connect(user2).increaseStake(tstStake, eurosStake.mul(3));

      await fastForward(DAY);

      const eurosFees = ethers.utils.parseEther('3');
      const ethFees = ethers.utils.parseEther('0.0005');
      const dec18Fees = ethers.utils.parseEther('7');
      const dec6Fees = 8000000;

      await EUROs.mint(RewardGateway.address, eurosFees);
      await RewardGateway.dropFees();
      expect(await EUROs.balanceOf(Staking.address)).to.equal(eurosStake.mul(4).add(eurosFees));

      let projectedEarnings = await Staking.projectedEarnings(user1.address);
      expect(projectedEarnings._EUROs).to.equal(eurosFees.div(2));

      projectedEarnings = await Staking.projectedEarnings(user2.address);
      expect(projectedEarnings._EUROs).to.equal(eurosFees.div(2));

      // all other fees should be based on EUROs stake
      // -- eth fees --

      await admin.sendTransaction({to: RewardGateway.address, value: ethFees});
      await RewardGateway.dropFees();
      expect(await ethers.provider.getBalance(Staking.address)).to.equal(ethFees);

      const totalEurosInPool = eurosStake.mul(4).add(eurosFees);

      projectedEarnings = await Staking.projectedEarnings(user1.address);
      expect(projectedEarnings._rewards).to.have.length(1);
      expect(projectedEarnings._rewards[0].token).to.equal(ethers.constants.AddressZero);
      let eurosInPosition = eurosStake.add(eurosFees.div(2));
      let estimatedFees = eurosInPosition.mul(ethFees).div(totalEurosInPool);
      expect(projectedEarnings._rewards[0].amount).to.equal(estimatedFees);

      projectedEarnings = await Staking.projectedEarnings(user2.address);
      expect(projectedEarnings._rewards).to.have.length(1);
      expect(projectedEarnings._rewards[0].token).to.equal(ethers.constants.AddressZero);
      eurosInPosition = eurosStake.mul(3).add(eurosFees.div(2));
      estimatedFees = eurosInPosition.mul(ethFees).div(totalEurosInPool);
      expect(projectedEarnings._rewards[0].amount).to.equal(estimatedFees);

      // -- 18 dec erc20 fees --

      await RewardToken18Dec.mint(RewardGateway.address, dec18Fees);
      await RewardGateway.dropFees();
      expect(await RewardToken18Dec.balanceOf(Staking.address)).to.equal(dec18Fees);

      projectedEarnings = await Staking.projectedEarnings(user1.address);
      expect(projectedEarnings._rewards).to.have.length(2);
      expect(projectedEarnings._rewards[1].token).to.equal(RewardToken18Dec.address);
      eurosInPosition = eurosStake.add(eurosFees.div(2));
      estimatedFees = eurosInPosition.mul(dec18Fees).div(totalEurosInPool);
      expect(projectedEarnings._rewards[1].amount).to.equal(estimatedFees);

      projectedEarnings = await Staking.projectedEarnings(user2.address);
      expect(projectedEarnings._rewards).to.have.length(2);
      expect(projectedEarnings._rewards[1].token).to.equal(RewardToken18Dec.address);
      eurosInPosition = eurosStake.mul(3).add(eurosFees.div(2));
      estimatedFees = eurosInPosition.mul(dec18Fees).div(totalEurosInPool);
      expect(projectedEarnings._rewards[1].amount).to.equal(estimatedFees);

      // -- 6 dec erc20 fees --

      await RewardToken6Dec.mint(RewardGateway.address, dec6Fees);
      await RewardGateway.dropFees();
      expect(await RewardToken6Dec.balanceOf(Staking.address)).to.equal(dec6Fees);

      projectedEarnings = await Staking.projectedEarnings(user1.address);
      expect(projectedEarnings._rewards).to.have.length(3);
      expect(projectedEarnings._rewards[2].token).to.equal(RewardToken6Dec.address);
      eurosInPosition = eurosStake.add(eurosFees.div(2));
      estimatedFees = eurosInPosition.mul(dec6Fees).div(totalEurosInPool);
      expect(projectedEarnings._rewards[2].amount).to.equal(estimatedFees);

      projectedEarnings = await Staking.projectedEarnings(user2.address);
      expect(projectedEarnings._rewards).to.have.length(3);
      expect(projectedEarnings._rewards[2].token).to.equal(RewardToken6Dec.address);
      eurosInPosition = eurosStake.mul(3).add(eurosFees.div(2));
      estimatedFees = eurosInPosition.mul(dec6Fees).div(totalEurosInPool);
      expect(projectedEarnings._rewards[2].amount).to.equal(estimatedFees);

      // -- more eth --

      await admin.sendTransaction({to: RewardGateway.address, value: ethFees});
      await RewardGateway.dropFees();
      expect(await ethers.provider.getBalance(Staking.address)).to.equal(ethFees.mul(2));

      projectedEarnings = await Staking.projectedEarnings(user1.address);
      expect(projectedEarnings._rewards).to.have.length(3);
      expect(projectedEarnings._rewards[0].token).to.equal(ethers.constants.AddressZero);
      eurosInPosition = eurosStake.add(eurosFees.div(2));
      estimatedFees = eurosInPosition.mul(ethFees.mul(2)).div(totalEurosInPool);
      expect(projectedEarnings._rewards[0].amount).to.equal(estimatedFees);

      projectedEarnings = await Staking.projectedEarnings(user2.address);
      expect(projectedEarnings._rewards).to.have.length(3);
      expect(projectedEarnings._rewards[0].token).to.equal(ethers.constants.AddressZero);
      eurosInPosition = eurosStake.mul(3).add(eurosFees.div(2));
      estimatedFees = eurosInPosition.mul(ethFees.mul(2)).div(totalEurosInPool);
      expect(projectedEarnings._rewards[0].amount).to.equal(estimatedFees);
    });

    it('allows any token to be dropped on staking pool', async () => {
      const eurosStake = ethers.utils.parseEther('100');
      await EUROs.mint(user1.address, eurosStake);
      await EUROs.connect(user1).approve(Staking.address, eurosStake);
      await Staking.connect(user1).increaseStake(0, eurosStake);

      await EUROs.mint(user2.address, eurosStake.mul(2));
      await EUROs.connect(user2).approve(Staking.address, eurosStake.mul(2));
      await Staking.connect(user2).increaseStake(0, eurosStake.mul(2));

      await fastForward(DAY);

      const airdropAmount = ethers.utils.parseEther('100');
      await UnofficialRewardToken.mint(admin.address, airdropAmount);
      await UnofficialRewardToken.approve(RewardGateway.address, airdropAmount);
      await RewardGateway.airdropToken(UnofficialRewardToken.address, airdropAmount);
      expect(await UnofficialRewardToken.balanceOf(Staking.address)).to.equal(airdropAmount);

      let projectedEarnings = await Staking.projectedEarnings(user1.address);
      expect(projectedEarnings._rewards).to.have.length(1);
      expect(projectedEarnings._rewards[0].token).to.equal(UnofficialRewardToken.address);
      let estimatedFees = eurosStake.mul(airdropAmount).div(eurosStake.mul(3));
      expect(projectedEarnings._rewards[0].amount).to.equal(estimatedFees);

      projectedEarnings = await Staking.projectedEarnings(user2.address);
      expect(projectedEarnings._rewards).to.have.length(1);
      expect(projectedEarnings._rewards[0].token).to.equal(UnofficialRewardToken.address);
      estimatedFees = eurosStake.mul(2).mul(airdropAmount).div(eurosStake.mul(3));
      expect(projectedEarnings._rewards[0].amount).to.equal(estimatedFees);
    });
  });

  describe('dropFees', async () => {
    xit('is only callable by manager address');
  });
});