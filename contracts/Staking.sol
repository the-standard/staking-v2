// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

contract Staking is Ownable {
    using SafeERC20 for IERC20;

    address private immutable TST;
    address private immutable EUROs;

    uint256 public start;
    uint256[] private starts;
    mapping(address => Position) positions;

    struct Position { uint256 start; }

    constructor(address _tst, address _euros) Ownable(msg.sender) {
        TST = _tst;
        EUROs = _euros;
    }

    function increaseStake(uint256 _tstAmount) external {
        if (start == 0) start = block.timestamp;
        starts.push(block.timestamp);
        positions[msg.sender].start = block.timestamp;
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

    function decreaseStake(uint256 _tstAmount) external {
        deleteStart(positions[msg.sender].start);
        start = earliestStart();
    }
}
