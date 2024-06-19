// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.20;

interface IRewardGateway {
    function dropFees() external;
    function liquidateVault(uint256 _tokenID) external;
}