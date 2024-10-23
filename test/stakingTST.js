const { expect } = require("chai");
const { ethers } = require("hardhat");

// TODO mathematically is there any benefit to a user just claiming every 24 hours? is it damaging to other user stakes?

const DAY = 24 * 60 * 60;

const fastForward = async time => {
  await ethers.provider.send("evm_increaseTime", [time]);
  await ethers.provider.send("evm_mine");
}

describe('StakingTST', async () => {
  let TST, USDs, Staking, RewardToken18Dec, RewardToken6Dec, UnofficialRewardToken,
    admin, user1, user2, user3, user4, user5;

  beforeEach(async () => {
    [ admin, user1, user2, user3, user4, user5 ] = await ethers.getSigners();

    TST = await (await ethers.getContractFactory('MockERC20')).deploy('The Standard Token', 'TST', 18);
    USDs = await (await ethers.getContractFactory('MockERC20')).deploy('Standard USD', 'USDs', 18);
    Staking = await (await ethers.getContractFactory('StakingTST')).deploy(TST.address, USDs.address);
    RewardToken18Dec = await (await ethers.getContractFactory('MockERC20')).deploy('Reward Token 18', 'RT18', 18)
    RewardToken6Dec = await (await ethers.getContractFactory('MockERC20')).deploy('Reward Token 6', 'RT6', 6)
    UnofficialRewardToken = await (await ethers.getContractFactory('MockERC20')).deploy('Unofficial Reward Token 6', 'URT6', 18)
    const MockTokenManager = await (await ethers.getContractFactory('MockTokenManager')).deploy(
      [RewardToken18Dec.address, RewardToken6Dec.address]
    );
    RewardGateway = await (await ethers.getContractFactory('RewardGatewayTST')).deploy(
      Staking.address, USDs.address, MockTokenManager.address, ethers.constants.AddressZero
    );
    await Staking.setRewardGateway(RewardGateway.address);
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

  describe('dailyYield', async () => {
    it('constantly recalculates yields', async () => {
      expect(await Staking.dailyYield()).to.have.length(0);

      const tstStake = ethers.utils.parseEther('100');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      await Staking.connect(user1).increaseStake(tstStake);
      // 0 day, 100 TST, 0 USDs
      expect(await Staking.dailyYield()).to.have.length(0);

      const fees = ethers.utils.parseEther('10')
      await USDs.mint(RewardGateway.address, fees)
      await RewardGateway.dropFees();

      // 0 day, 100 TST, 10 USDs
      let dailyYield = await Staking.dailyYield()
      expect(dailyYield).to.have.length(1);
      expect(dailyYield[0].token).to.equal(USDs.address);
      expect(dailyYield[0].amount).to.equal(0);
      await fastForward(DAY);
      // 1 day, 100 TST, 10 USDs
      // .1 USDs per TST
      expect((await Staking.dailyYield())[0].amount).to.equal(ethers.utils.parseEther('.1'));

      await TST.mint(user2.address, tstStake);
      await TST.connect(user2).approve(Staking.address, tstStake);
      await Staking.connect(user2).increaseStake(tstStake);
      // 1 day, 200 TST, 10 USDs
      // .05 USDs per TST
      expect((await Staking.dailyYield())[0].amount).to.equal(ethers.utils.parseEther('0.05'));

      await USDs.mint(RewardGateway.address, fees)
      await RewardGateway.dropFees();
      // 1 day, 200 TST, 20 USDs
      // .1 USDs per TST
      expect((await Staking.dailyYield())[0].amount).to.equal(ethers.utils.parseEther('.1'));

      await fastForward(DAY);
      // 2 days, 200 TST, 20 USDs
      // .05 USDs per TST
      expect((await Staking.dailyYield())[0].amount).to.equal(ethers.utils.parseEther('0.05'));

      // user 3 stakes double stake amount
      await TST.mint(user3.address, tstStake.mul(2));
      await TST.connect(user3).approve(Staking.address, tstStake.mul(2));
      await Staking.connect(user3).increaseStake(tstStake.mul(2));
      // 2 days, 400 TST, 20 USDs
      // .05 USDs per TST
      expect((await Staking.dailyYield())[0].amount).to.equal(ethers.utils.parseEther('.025'));

      await USDs.mint(RewardGateway.address, fees)
      await RewardGateway.dropFees();
      // 2 days, 400 TST, 30 USDs
      // .0375 USDs per TST
      expect((await Staking.dailyYield())[0].amount).to.equal(ethers.utils.parseEther('.0375'));

      await fastForward(DAY);
      // 3 days, 400 TST, 30 USDs
      // .025 USDs per TST
      expect((await Staking.dailyYield())[0].amount).to.equal(ethers.utils.parseEther('0.025'));

      await TST.mint(user4.address, tstStake);
      await TST.connect(user4).approve(Staking.address, tstStake);
      stake = await Staking.connect(user4).increaseStake(tstStake);
      // 3 days, 500 TST, 30 USDs
      // .02 USDs per TST
      expect((await Staking.dailyYield())[0].amount).to.equal(ethers.utils.parseEther('0.02'));

      await fastForward(DAY);
      // 4 days, 500 TST, 30 USDs
      // .015 USDs per TST
      expect((await Staking.dailyYield())[0].amount).to.equal(ethers.utils.parseEther('0.015'));

      await USDs.mint(RewardGateway.address, fees)
      await RewardGateway.dropFees();
      // 4 days, 500 TST, 40 USDs
      // .02 USDs per TST
      expect((await Staking.dailyYield())[0].amount).to.equal(ethers.utils.parseEther('.02'));

      await Staking.connect(user3).decreaseStake(tstStake);
      // 4 days, 400 TST, 32 USDs (user 3 USDs claimed when decreasing stake)
      // .02 USDs per TST
      expect((await Staking.dailyYield())[0].amount).to.equal(ethers.utils.parseEther('.02'));

      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      await Staking.connect(user1).increaseStake(tstStake);

      let yield = await Staking.dailyYield();
      // no other rewards yet
      expect(yield).to.have.length(1);
      // user 1 has claimed 8 USDs while increasing
      // 3 days, 500 TST, 24 USDs
      expect(yield[0].amount).to.equal(ethers.utils.parseEther('.016'));

      const ethFees = ethers.utils.parseEther('0.01')
      await admin.sendTransaction({to: RewardGateway.address, value: ethFees});
      await RewardGateway.dropFees();

      await fastForward(DAY);

      yield = await Staking.dailyYield();
      expect(yield).to.have.length(2);
      // 4 days, 500 TST, 24 EUROs
      expect(yield[0].amount).to.equal(ethers.utils.parseEther('0.012'))
      // 4 days, 500 TST, 0.01 ETH
      expect(yield[1].token).to.equal(ethers.constants.AddressZero);
      expect(yield[1].amount).to.equal(ethers.utils.parseEther('0.000005'));

      const usdRewardFees = ethers.utils.parseUnits('2', 6);
      await USDs.mint(RewardGateway.address, fees.mul(3))
      await admin.sendTransaction({to: RewardGateway.address, value: ethFees});
      await RewardToken6Dec.mint(RewardGateway.address, usdRewardFees);
      await RewardGateway.dropFees();

      await fastForward(DAY);

      yield = await Staking.dailyYield();
      // 5 days, 500 TST, 54 USDs
      expect(yield).to.have.length(3);
      expect(yield[0].token).to.equal(USDs.address)
      expect(yield[0].amount).to.equal(ethers.utils.parseEther('0.0216'))
      // 5 days, 500 TST, 0.02 ETH
      expect(yield[1].token).to.equal(ethers.constants.AddressZero);
      expect(yield[1].amount).to.equal(ethers.utils.parseEther('0.000008'));
      // 5 days, 500 TST, 2 USD
      expect(yield[2].token).to.equal(RewardToken6Dec.address);
      expect(yield[2].amount).to.equal(ethers.utils.parseUnits('0.0008', 6));

      await USDs.mint(RewardGateway.address, fees.mul(2))
      await admin.sendTransaction({to: RewardGateway.address, value: ethFees.mul(2)});
      await RewardToken6Dec.mint(RewardGateway.address, usdRewardFees * 4);
      await RewardGateway.dropFees();
      
      const airdrop = ethers.utils.parseEther('20');
      await UnofficialRewardToken.mint(admin.address, airdrop);
      await UnofficialRewardToken.approve(RewardGateway.address, airdrop);
      await RewardGateway.airdropToken(UnofficialRewardToken.address, airdrop);

      await fastForward(5 * DAY);

      yield = await Staking.dailyYield();
      expect(yield).to.have.length(4);
      // 10 days, 500 TST, 74 EUROs
      expect(yield[0].token).to.equal(USDs.address)
      expect(yield[0].amount).to.equal(ethers.utils.parseEther('0.0148'))
      // 10 days, 500 euros, 0.04 ETH
      expect(yield[1].token).to.equal(ethers.constants.AddressZero);
      expect(yield[1].amount).to.equal(ethers.utils.parseEther('0.000008'));
      // 10 days, 500 euros, 10 USD
      expect(yield[2].token).to.equal(RewardToken6Dec.address);
      expect(yield[2].amount).to.equal(ethers.utils.parseUnits('0.002', 6));
      // 10 days, 500 euros, 20 airdrop reward tokens
      expect(yield[3].token).to.equal(UnofficialRewardToken.address);
      expect(yield[3].amount).to.equal(ethers.utils.parseEther('0.004'));
    });
  });

  describe('increaseStake', async () => {
    it('increases the stake of TST and EUROs', async () => {
      let position = await Staking.positions(user1.address);
      expect(position.TST).to.equal(0);

      const tstStake = ethers.utils.parseEther('10000');
      await TST.mint(user1.address, tstStake);

      let increase = Staking.connect(user1).increaseStake(0);
      await expect(increase).to.be.revertedWithCustomError(Staking, 'InvalidRequest');

      increase = Staking.connect(user1).increaseStake(tstStake);
      await expect(increase).to.be.revertedWithCustomError(TST, 'ERC20InsufficientAllowance');

      await TST.connect(user1).approve(Staking.address, tstStake);
      increase = Staking.connect(user1).increaseStake(tstStake);
      await expect(increase).not.to.be.reverted;

      position = await Staking.positions(user1.address);
      expect(position.TST).to.equal(tstStake);

      expect(await TST.balanceOf(Staking.address)).to.equal(tstStake);
      expect(await TST.balanceOf(user1.address)).to.equal(0);
    });

    it('resets the staking start every time the stake is increased', async () => {
      let position = await Staking.positions(user1.address);
      expect(position.start).to.equal(0);

      const tstStake = ethers.utils.parseEther('10000');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      let increase = await Staking.connect(user1).increaseStake(tstStake);

      position = await Staking.positions(user1.address);
      expect(position.start).to.equal((await ethers.provider.getBlock(increase.blockNumber)).timestamp);
      
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      increase = await Staking.connect(user1).increaseStake(tstStake);

      position = await Staking.positions(user1.address);
      expect(position.start).to.equal((await ethers.provider.getBlock(increase.blockNumber)).timestamp);
    });

    it('triggers dropping of fees', async () => {
      const tstStake = ethers.utils.parseEther('10000');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      await Staking.connect(user1).increaseStake(tstStake);

      await fastForward(DAY);

      const usdsFees = ethers.utils.parseEther('10');
      await USDs.mint(RewardGateway.address, usdsFees);
      
      await TST.mint(user2.address, tstStake);
      await TST.connect(user2).approve(Staking.address, tstStake);
      await Staking.connect(user2).increaseStake(tstStake);

      expect(await USDs.balanceOf(Staking.address)).to.equal(usdsFees);
      // 1 day staked by user, 1 day total, 50% of TST staked
      expect((await Staking.projectedEarnings(user1.address))[0].amount).to.equal(usdsFees.div(2));
      // 0 days staked by user, 0 fees earned yet
      expect((await Staking.projectedEarnings(user2.address))[0].amount).to.equal(0);
    });

    it('automatically claims when increasing, compounding', async () => {
      const tstStake = ethers.utils.parseEther('10000');
      await TST.mint(user1.address, tstStake.mul(2));
      await TST.connect(user1).approve(Staking.address, tstStake.mul(2));
      await Staking.connect(user1).increaseStake(tstStake);

      const usdFees = ethers.utils.parseUnits('1', 6)
      const usdsFees = ethers.utils.parseEther('15');
      await RewardToken6Dec.mint(RewardGateway.address, usdFees);
      await USDs.mint(RewardGateway.address, usdsFees);

      await fastForward(DAY);

      await Staking.connect(user1).increaseStake(tstStake);

      const position = await Staking.positions(user1.address);
      expect(position.TST).to.equal(tstStake.mul(2));
      const projected = await Staking.projectedEarnings(user1.address);
      expect(projected[0].amount).to.equal(0);
      expect(projected[1].amount).to.equal(0);
      expect(await USDs.balanceOf(user1.address)).to.equal(usdsFees);
      expect(await RewardToken6Dec.balanceOf(user1.address)).to.equal(usdFees);
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

      await expect(Staking.connect(user1).decreaseStake(tstStake.add(1), 0)).to.be.revertedWithCustomError(Staking, 'InvalidRequest');
      await expect(Staking.connect(user1).decreaseStake(0, eurosStake.add(1))).to.be.revertedWithCustomError(Staking, 'InvalidRequest');

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

      // fees dropped but half sent to user2 during decrease
      expect(await EUROs.balanceOf(Staking.address)).to.equal(eurosFees.div(2));
      // 1 day staked by user, 1 day total, 100% of TST staked
      expect((await Staking.projectedEarnings(user1.address))._EUROs).to.equal(eurosFees.div(2));
      // 0 days staked by user, 0 fees earned yet
      expect((await Staking.projectedEarnings(user2.address))._EUROs).to.equal(0);
    });

    it('automatically claims when decreasing, not compounding', async () => {
      const tstStake = ethers.utils.parseEther('10000');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      await Staking.connect(user1).increaseStake(tstStake, 0);

      const usdFees = 1000000;
      const eurosFees = ethers.utils.parseEther('15');
      await RewardToken6Dec.mint(RewardGateway.address, usdFees);
      await EUROs.mint(RewardGateway.address, eurosFees);

      await fastForward(DAY);

      await Staking.connect(user1).decreaseStake(tstStake.div(2), 0);

      const position = await Staking.positions(user1.address);
      expect(position.TST).to.equal(tstStake.div(2));
      expect(position.EUROs).to.equal(0);
      const projected = await Staking.projectedEarnings(user1.address);
      expect(projected._EUROs).to.equal(0);
      expect(projected._rewards[0].amount).to.equal(0);
      expect(await EUROs.balanceOf(user1.address)).to.equal(eurosFees);
      expect(await RewardToken6Dec.balanceOf(user1.address)).to.equal(usdFees);
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

      await expect(Staking.connect(user1).claim(false)).to.be.revertedWithCustomError(Staking, 'InvalidRequest')

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
      await Staking.connect(user1).claim(false);
      expect(await EUROs.balanceOf(user1.address)).to.equal(ethers.utils.parseEther('5'))

      await fastForward(DAY);

      // euros per tst per day rate = 15 euros / 400 tst / 2 days = 0.01875
      // user 2 has 200 TST staked for 2 days = 0.01875 * 200 * 2 = 7.5 EUROs reward
      await Staking.connect(user2).claim(false);
      expect(await EUROs.balanceOf(user2.address)).to.equal(ethers.utils.parseEther('7.5'));
    });

    it('claims the other reward tokens', async () => {
      const ethFees = ethers.utils.parseEther('0.0005');
      const dec18Fees = ethers.utils.parseEther('7');
      const dec6Fees = 8000000;
      const airdrop = ethers.utils.parseEther('10');

      await admin.sendTransaction({to: RewardGateway.address, value: ethFees});
      await RewardToken18Dec.mint(RewardGateway.address, dec18Fees);
      await RewardToken6Dec.mint(RewardGateway.address, dec6Fees);

      await UnofficialRewardToken.mint(admin.address, airdrop);
      await UnofficialRewardToken.approve(RewardGateway.address, airdrop);
      await RewardGateway.airdropToken(UnofficialRewardToken.address, airdrop);

      let eurosStake = ethers.utils.parseEther('100');
      await EUROs.mint(user1.address, eurosStake);
      await EUROs.connect(user1).approve(Staking.address, eurosStake);
      await Staking.connect(user1).increaseStake(0, eurosStake);

      await EUROs.mint(user2.address, eurosStake.mul(3));
      await EUROs.connect(user2).approve(Staking.address, eurosStake.mul(3));
      await Staking.connect(user2).increaseStake(0, eurosStake.mul(3));

      await fastForward(DAY);

      await Staking.connect(user1).claim(false);

      expect(await RewardToken18Dec.balanceOf(user1.address)).to.equal(dec18Fees.div(4));
      expect(await RewardToken6Dec.balanceOf(user1.address)).to.equal(dec6Fees / 4);
      expect(await UnofficialRewardToken.balanceOf(user1.address)).to.equal(airdrop.div(4));
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

      await Staking.connect(user1).claim(false);
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

      await Staking.connect(user2).claim(false);

      // 1 day staked by user, 1 day total, 50% of TST staked, 5 EUROs remaining
      expect((await Staking.projectedEarnings(user1.address))._EUROs).to.equal(eurosFees.div(4));
      // their 50% of euros fees is already claimed
      expect((await Staking.projectedEarnings(user2.address))._EUROs).to.equal(0);
      expect(await EUROs.balanceOf(user2.address)).to.equal(eurosFees.div(2));
    });

    it('has option to compound EUROs when claiming', async () => {
      const tstStake = ethers.utils.parseEther('20000');
      const eurosStake = ethers.utils.parseEther('300');
      await TST.mint(user1.address, tstStake);
      await TST.connect(user1).approve(Staking.address, tstStake);
      await EUROs.mint(user1.address, eurosStake);
      await EUROs.connect(user1).approve(Staking.address, eurosStake);
      await Staking.connect(user1).increaseStake(tstStake, eurosStake);

      await TST.mint(user2.address, tstStake);
      await TST.connect(user2).approve(Staking.address, tstStake);
      await Staking.connect(user2).increaseStake(tstStake, 0);

      const eurosFees = ethers.utils.parseEther('10');
      await EUROs.mint(RewardGateway.address, eurosFees);

      await fastForward(DAY);

      await Staking.connect(user1).claim(true);

      expect(await EUROs.balanceOf(user1.address)).to.equal(0);

      const position = await Staking.positions(user1.address);
      expect(position.EUROs).to.equal(eurosStake.add(eurosFees.div(2)));

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
    it('only allows gateway to call staking drop fees', async () => {
      await expect(Staking.dropFees(ethers.constants.AddressZero, ethers.utils.parseEther('1')))
        .to.revertedWithCustomError(Staking, 'InvalidRequest');
    });

    it('only allows admins to do gateway airdrops', async () => {
      await expect(RewardGateway.connect(user1).airdropToken(UnofficialRewardToken.address, ethers.utils.parseEther('1')))
        .to.revertedWithCustomError(RewardGateway, 'AccessControlUnauthorizedAccount');
    });
  });

  describe('setRewardGateway', async () => {
    it('only allows owner to set reward gateway address', async () => {
      const newGateway = await (await ethers.getContractFactory('RewardGateway')).deploy(
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero
      );
      await expect(Staking.connect(user1).setRewardGateway(newGateway.address))
        .to.be.revertedWithCustomError(Staking, 'OwnableUnauthorizedAccount');
    });
  });

  describe('events', async () => {
    xit('should emit events');
  });
});