// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import "contracts/interfaces/ITokenManager.sol";

interface ISmartVault {
    struct Asset { ITokenManager.Token token; uint256 amount; uint256 collateralValue; }
    struct Status { 
        address vaultAddress; uint256 minted; uint256 maxMintable; uint256 totalCollateralValue;
        Asset[] collateral; bool liquidated; uint8 version; bytes32 vaultType;
    }
}