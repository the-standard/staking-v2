// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.20;

interface IStaking {
    function dropFees(address _token, uint256 _fees) external payable;
}