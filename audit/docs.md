# Staking audit

In scope contract:

https://github.com/the-standard/staking-v2/blob/d14e528e00a272a05c54c9ad7c9540336ed1e91f/contracts/Staking.sol

In scope commit:

`d14e528e00a272a05c54c9ad7c9540336ed1e91f`

You will find some tests of the contract [here](/test/staking.js), which may help you understand some of the functionality

Fundamentals:

- Users stake TST and EUROs
- They earn more EUROs based on the amount of TST they have staked, the total amount which is in the pool, the number of days they have been staking, and the number of days the staking pool has been running:
    - staked TST * days staked * EUROs reward available / total TST / total length of contract in days
- They earn other assets based on the amount of EUROs they have staked, the total EUROs staked in the pool, the number of days they have staked, and the total length of the staking contract again:
    - staked EUROs * days staked * asset reward available / total EUROs staked / total length of contract in days
- The start of the staking pool should always be set to the timestamp of the start of the earliest active stake
- Assets are added as rewards via the `dropFees` function, only called by the RewardGateway contract
- Every time a user called `increaseStake`, `decreaseStake` or `claim`, their stake should restart
- Users can choose to compound the EUROs part of their reward when they `claim` (reinvested in the EUROs part of their stake)
- Rewards should automatically be claimed when users increase or decrease their stake (it compounds when increase, but does not compound when decreasing)
- projectedEarnings should show the amount of EUROs, and all the other reward assets, that have potentially be earned (if a user was to claim at that moment)
- dailyYield should show the daily EUROs yield for 1 TST, and the daily yield for all other reward assets for 1 EUROs

Deployment details:

- Contract will be deployed to Arbitrum One
- [TST](https://arbiscan.io/token/0xf5a27e55c748bcddbfea5477cb9ae924f0f7fd2e)
- [EUROs](https://arbiscan.io/token/0x643b34980e635719c15a2d4ce69571a258f940e9)
- Reward tokens will definitely include:
    - ETH
    - [WBTC](https://arbiscan.io/token/0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f)
    - [ARB](https://arbiscan.io/token/0x912ce59144191c1204e64559fe8253a0e49e6548)
    - [LINK](https://arbiscan.io/token/0xf97f4df75117a78c1a5a0dbb814af92458539fb4)
    - [PAXG](https://arbiscan.io/token/0xfeb4dfc8c4cf7ed305bb08065d08ec6ee6728429)
    - [GMX](https://arbiscan.io/token/0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a)
    - [RDNT](https://arbiscan.io/token/0x3082cc23568ea640225c2467653db90e9250aaa0)
    - [SUSHI](https://arbiscan.io/token/0xd4d42f0b6def4ce0383636770ef773390d85c61a)
- Via the `airdropToken` function in RewardGateway, admins can also drop other reward tokens on stakers, so there may be other reward tokens too

Issues / questions:

- Not really an "issue" but the daily yield and projected earnings are both variable, based on the total amount staked etc
    - The projected earnings of a user could therefore decrease, or the yield could be less than a user sees when initially staking
- Can a user benefit from repeatedly: staking, claiming and unstaking after 24 hours, restaking ?