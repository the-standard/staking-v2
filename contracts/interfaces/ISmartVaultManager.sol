// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.20;

import "contracts/interfaces/ISmartVault.sol";

interface ISmartVaultManager {
    struct SmartVaultData { 
        uint256 tokenId; uint256 collateralRate; uint256 mintFeeRate;
        uint256 burnFeeRate; ISmartVault.Status status;
    }

    function vaultData(uint256 _tokenID) external view returns (SmartVaultData memory);
    function liquidateVault(uint256 _tokenId) external;
}