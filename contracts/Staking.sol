// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "contracts/interfaces/IRewardGateway.sol";
import "contracts/interfaces/IStaking.sol";

import "hardhat/console.sol";

contract Staking is Ownable, IStaking {
    using SafeERC20 for IERC20;

    address private immutable TST;
    address private immutable EUROs;

    uint256 public start;
    mapping(address => Position) public positions;
    address public rewardGateway;
    uint256 private eurosFees;
    uint256[] private starts;
    address[] private rewardTokens;

    struct Reward { address token; uint256 amount; }
    struct Position { uint256 start; uint256 TST; uint256 EUROs; }

    error InvalidRequest();

    constructor(address _tst, address _euros) Ownable(msg.sender) {
        TST = _tst;
        EUROs = _euros;
    }

    modifier onlyGateway {
        if (msg.sender != rewardGateway) revert InvalidRequest();
        _;
    }

    function calculateEUROs(Position memory _position) private view returns (uint256) {
        uint256 _totalDays = totalDays();
        uint256 _balance = IERC20(TST).balanceOf(address(this));
        if (_totalDays > 0 && _balance > 0) {
            return _position.TST * daysStaked(_position) * eurosFees
                / _balance / _totalDays;
        }
    }

    function dailyEuroPerTstRate() external view returns (uint256) {
        return calculateEUROs(Position(block.timestamp - 1 days, 1 ether, 0));
    }

    function addUniqueRewardToken(address _token) private {
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            if (rewardTokens[i] == _token) return;
        }

        rewardTokens.push(_token);
    }

    // TODO make this only gateway
    function dropFees(address _token, uint256 _amount) external payable onlyGateway {
        if (_token == EUROs) {
            eurosFees += _amount;
        } else {
            addUniqueRewardToken(_token);
        }
        
        if (_token != address(0)) {
            IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        }
    }

    function deleteIndexFromStarts(uint256 _index) private {
        for (uint256 i = _index; i < starts.length - 1; i++) {
            starts[i] = starts[i+1];
        }
        starts.pop();
    }

    function deleteStart(uint256 _ts) private {
        for (uint256 i = 0; i < starts.length; i++) {
            if (_ts == starts[i]) {
                deleteIndexFromStarts(i);
                return;
            }
        }
    }

    function earliestStart() private view returns (uint256 _start) {
        for (uint256 i = 0; i < starts.length; i++) {
            if (_start == 0 || starts[i] < _start) _start = starts[i];
        }
    }
    
    function empty(Position memory _position) private pure returns (bool) {
        return _position.TST == 0 && _position.EUROs == 0;
    }

    function savePosition(Position memory _position) private {
        uint256 _previousStart = _position.start;

        if (empty(_position)) {
            delete positions[msg.sender];
        } else {
            _position.start = block.timestamp;
            starts.push(block.timestamp);
            positions[msg.sender] = _position;
        }

        deleteStart(_previousStart);
        if (start == _previousStart || start == 0) start = earliestStart();
    }

    function increaseStake(uint256 _tst, uint256 _euros) external {
        IRewardGateway(rewardGateway).dropFees();

        if (_tst == 0 && _euros == 0) revert InvalidRequest();
        Position memory _position = positions[msg.sender];
        if (_position.start > 0) runClaim(_position, true);
        _position.TST += _tst;
        _position.EUROs += _euros;
        savePosition(_position);

        if (_tst > 0) IERC20(TST).safeTransferFrom(msg.sender, address(this), _tst);
        if (_euros > 0) IERC20(EUROs).safeTransferFrom(msg.sender, address(this), _euros);
    }

    function decreaseStake(uint256 _tst, uint256 _euros) external {
        IRewardGateway(rewardGateway).dropFees();
        Position memory _position = positions[msg.sender];
        runClaim(_position, false);

        if (_tst > _position.TST || _euros > _position.EUROs) revert InvalidRequest();
        _position.TST -= _tst;
        _position.EUROs -= _euros;

        savePosition(_position);

        if (_tst > 0) IERC20(TST).safeTransfer(msg.sender, _tst);
        if (_euros > 0) IERC20(EUROs).safeTransfer(msg.sender, _euros);
    }

    function daysStaked(Position memory _position) private view returns (uint256) {
        return (block.timestamp - _position.start) / 1 days;
    }

    function claimRewards(address _holder) private {
        (, Reward[] memory _rewards) = projectedEarnings(_holder);
        for (uint256 i = 0; i < _rewards.length; i++) {
            Reward memory _reward = _rewards[i];
            if (_reward.token == address(0)) {
                _holder.call{value: _reward.amount}("");
            } else {
                IERC20(_reward.token).safeTransfer(_holder, _reward.amount);
            }
        }
    }

    function runClaim(Position memory _position, bool _compound) private {
        uint256 _euros = calculateEUROs(_position);
        if (_compound) {
            _position.EUROs += _euros;
        } else {
            IERC20(EUROs).safeTransfer(msg.sender, _euros);
        }
        claimRewards(msg.sender);
        eurosFees -= _euros;
        savePosition(_position);
    }

    function claim(bool _compound) external {
        IRewardGateway(rewardGateway).dropFees();
        Position memory _position = positions[msg.sender];
        if (daysStaked(_position) == 0) revert InvalidRequest();
        runClaim(_position, _compound);
    }

    function totalDays() private view returns (uint256) {
        return (block.timestamp - start) / 1 days;
    }

    function projectedEarnings(address _holder) public view returns (uint256 _EUROs, Reward[] memory _rewards) {
        Position memory _position = positions[_holder];
        _EUROs = calculateEUROs(_position);
        
        _rewards = new Reward[](rewardTokens.length);
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            address _rewardToken = rewardTokens[i];
            uint256 _balance = _rewardToken == address(0) ?
                address(this).balance :
                IERC20(_rewardToken).balanceOf(address(this));

            _rewards[i].token = _rewardToken;
            uint256 _totalEUROs = IERC20(EUROs).balanceOf(address(this));
            uint256 _totalDays = totalDays();
            if (_totalEUROs > 0 && _totalDays > 0)
            _rewards[i].amount = (_position.EUROs + _EUROs) * daysStaked(_position) * _balance
                / _totalEUROs / _totalDays;
        }
    }

    // TODO only owner
    function setRewardGateway(address _rewardGateway) external onlyOwner {
        rewardGateway = _rewardGateway;
    }
}
