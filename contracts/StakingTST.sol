// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "contracts/interfaces/IRewardGateway.sol";
import "contracts/interfaces/IStaking.sol";

import "hardhat/console.sol";

contract StakingTST is Ownable, IStaking, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address private immutable TST;

    uint256 public start;
    mapping(address => Position) public positions;
    address public rewardGateway;
    uint256 private eurosFees;
    uint256[] private starts;
    address[] private rewardTokens;

    struct Reward { address token; uint256 amount; }
    struct Position { uint256 start; uint256 TST; }

    event StakeIncreased(address indexed holder, uint256 TST);
    event StakeDecreased (address indexed holder, uint256 TST);
    event RewardsClaimed (address indexed holder);

    error InvalidRequest();

    constructor(address _tst) Ownable(msg.sender) {
        TST = _tst;
    }

    modifier onlyGateway {
        if (msg.sender != rewardGateway) revert InvalidRequest();
        _;
    }

    function _totalDays() private view returns (uint256) {
        if (start == 0) return 0;
        return (block.timestamp - start) / 1 days;
    }

    function _calculateReward(address _token, uint256 _tst, uint256 _days, uint256 _totalTST, uint256 _totalDays) private view returns (uint256) {
        uint256 _balance = _token == address(0) ?
            address(this).balance :
            IERC20(_token).balanceOf(address(this));
        if (_totalTST > 0 && _totalDays > 0)
            return _tst * _days * _balance / _totalTST / _totalDays;
    }

    function dailyYield() external view returns (Reward[] memory _rewards) {
        _rewards = new Reward[](rewardTokens.length);
        uint256 _totalDays = _totalDays();
        uint256 _tstBalance = IERC20(TST).balanceOf(address(this));
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            address _token = rewardTokens[i];
            _rewards[i].token = _token;
            _rewards[i].amount = _calculateReward(_token, 1 ether, 1, _tstBalance, _totalDays);
        }
    }

    function _addUniqueRewardToken(address _token) private {
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            if (rewardTokens[i] == _token) return;
        }

        rewardTokens.push(_token);
    }

    function dropFees(address _token, uint256 _amount) external payable onlyGateway {
        _addUniqueRewardToken(_token);
        
        if (_token != address(0)) {
            IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        }
    }

    function _deleteIndexFromStarts(uint256 _index) private {
        starts[_index] = starts[starts.length - 1];
        starts.pop();
    }

    function _deleteStart(uint256 _ts) private {
        for (uint256 i = 0; i < starts.length; i++) {
            if (_ts == starts[i]) {
                _deleteIndexFromStarts(i);
                return;
            }
        }
    }

    function _earliestStart() private view returns (uint256 _start) {
        for (uint256 i = 0; i < starts.length; i++) {
            if (_start == 0 || starts[i] < _start) _start = starts[i];
        }
    }

    function _savePosition(Position memory _position) private {
        uint256 _previousStart = _position.start;

        if (_position.TST == 0) {
            delete positions[msg.sender];
        } else {
            _position.start = block.timestamp;
            starts.push(block.timestamp);
            positions[msg.sender] = _position;
        }

        _deleteStart(_previousStart);
        if (start == _previousStart || start == 0) start = _earliestStart();
    }

    function increaseStake(uint256 _tst) external nonReentrant() {
        IRewardGateway(rewardGateway).dropFees();

        if (_tst == 0) revert InvalidRequest();
        Position memory _position = positions[msg.sender];
        if (_position.start > 0) _runClaim(_position);
        _position.TST += _tst;
        _savePosition(_position);

        if (_tst > 0) IERC20(TST).safeTransferFrom(msg.sender, address(this), _tst);
        emit StakeIncreased(msg.sender, _tst);
    }

    function decreaseStake(uint256 _tst) external nonReentrant() {
        IRewardGateway(rewardGateway).dropFees();
        Position memory _position = positions[msg.sender];
        _runClaim(_position);

        if (_tst > _position.TST) revert InvalidRequest();
        _position.TST -= _tst;

        _savePosition(_position);

        if (_tst > 0) IERC20(TST).safeTransfer(msg.sender, _tst);
        emit StakeDecreased(msg.sender, _tst);
    }

    function _daysStaked(Position memory _position) private view returns (uint256) {
        return (block.timestamp - _position.start) / 1 days;
    }

    function _claimRewards(address _holder, Reward[] memory _rewards) private {
        for (uint256 i = 0; i < _rewards.length; i++) {
            Reward memory _reward = _rewards[i];
            if (_reward.token == address(0)) {
                (bool sent,) = _holder.call{value: _reward.amount}("");
                require(sent);
            } else {
                IERC20(_reward.token).safeTransfer(_holder, _reward.amount);
            }
        }
    }

    function _runClaim(Position memory _position) private {
        (Reward[] memory _rewards) = projectedEarnings(msg.sender);
        _savePosition(_position);
        _claimRewards(msg.sender, _rewards);
    }

    function claim() external nonReentrant() {
        IRewardGateway(rewardGateway).dropFees();
        Position memory _position = positions[msg.sender];
        if (_daysStaked(_position) == 0) revert InvalidRequest();
        _runClaim(_position);
        emit RewardsClaimed(msg.sender);
    }

    function projectedEarnings(address _holder) public view returns (Reward[] memory _rewards) {
        Position memory _position = positions[_holder];
        uint256 _totalTST = IERC20(TST).balanceOf(address(this));
        uint256 _totalDays = _totalDays();
        
        _rewards = new Reward[](rewardTokens.length);
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            address _rewardToken = rewardTokens[i];
            _rewards[i].token = _rewardToken;
            _rewards[i].amount = _calculateReward(
                _rewardToken, _position.TST,
                _daysStaked(_position), _totalTST, _totalDays
            );
        }
    }

    function setRewardGateway(address _rewardGateway) external onlyOwner {
        rewardGateway = _rewardGateway;
    }
}
