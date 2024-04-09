// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

contract Staking is Ownable {
    using SafeERC20 for IERC20;

    uint256 private constant RATE_ACCURACY = 1 ether;

    address private immutable TST;
    address private immutable EUROs;

    uint256 public start;
    uint256 private fees;
    uint256[] private starts;
    mapping(address => Position) public positions;

    struct Position { uint256 start; uint256 TST; uint256 EUROs; }

    constructor(address _tst, address _euros) Ownable(msg.sender) {
        TST = _tst;
        EUROs = _euros;
    }

    function dailyEuroPerTstRate() external view returns(uint256) {
        uint256 stakingDays = (block.timestamp - start) / 1 days;
        return fees > 0 && stakingDays > 0 ? RATE_ACCURACY * fees / IERC20(TST).balanceOf(address(this)) / stakingDays : 0;
    }

    function dropFees(uint256 _fees) external {
        fees += _fees;
    }

    function increaseStake(uint256 _tst, uint256 _euros) external {
        if (start == 0) start = block.timestamp;
        starts.push(block.timestamp);
        positions[msg.sender].start = block.timestamp;
        positions[msg.sender].TST += _tst;
        positions[msg.sender].EUROs += _euros;
        IERC20(TST).safeTransferFrom(msg.sender, address(this), _tst);
        IERC20(EUROs).safeTransferFrom(msg.sender, address(this), _euros);
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
    
    function empty(Position memory _position) private returns (bool) {
        return _position.TST == 0 && _position.EUROs == 0;
    }

    function decreaseStake(uint256 _tstAmount, uint256 _eurosAmount) external {
        deleteStart(positions[msg.sender].start);
        start = earliestStart();
        positions[msg.sender].TST -= _tstAmount;
        positions[msg.sender].EUROs -= _eurosAmount;
        if (empty(positions[msg.sender])) {
            delete positions[msg.sender];
        } else {
            positions[msg.sender].start = block.timestamp;
            starts.push(block.timestamp);
        }
        IERC20(TST).safeTransfer(msg.sender, _tstAmount);
    }
}
