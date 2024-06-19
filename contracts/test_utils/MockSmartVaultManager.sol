// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "contracts/interfaces/ISmartVaultManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockSmartVaultManager is ISmartVaultManager {
    using SafeERC20 for IERC20;

    uint256 private mockLiquidatableVault;
    uint256 private mockBorrowed;
    Collateral[] private collateral;

    struct Collateral {
        address token; uint256 amount;
    }

    constructor(uint256 _mockLiquidatableVault, uint256 _mockBorrowed) {
        mockLiquidatableVault = _mockLiquidatableVault;
        mockBorrowed = _mockBorrowed;
    }

    function addCollateral(address _token, uint256 _amount) external payable {
        if (_token != address(0)) IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        collateral.push(Collateral(_token, _amount));
    }

    function vaultData(uint256 _tokenID) external view returns (SmartVaultData memory _data) {
        if (_tokenID == mockLiquidatableVault) _data.status.minted = mockBorrowed;
    }

    function liquidateVault(uint256 _tokenID) external {
        require(_tokenID == mockLiquidatableVault, 'vault-not-undercollateralised');
        for (uint256 i = 0; i < collateral.length; i++) {
            Collateral memory _collateral = collateral[i];
            if (_collateral.token == address(0)) {
                payable(msg.sender).call{value: _collateral.amount}("");
            } else {
                IERC20(_collateral.token).safeTransfer(msg.sender, _collateral.amount);
            }
        }
    }

    function totalSupply() external view returns (uint256) {
    }
}