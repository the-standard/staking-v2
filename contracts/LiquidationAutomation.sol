// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "contracts/interfaces/IRewardGateway.sol";
import "contracts/interfaces/ISmartVaultIndex.sol";
import "contracts/interfaces/ISmartVaultManager.sol";
import "contracts/interfaces/ISmartVault.sol";

contract LiquidationAutomation is AutomationCompatibleInterface, Ownable {
    using SafeERC20 for IERC20;

    address private immutable rewardGateway;
    address private immutable smartVaultManager;
    address private immutable vaultIndex;

    constructor(address _rewardGateway, address _smartVaultManager, address _vaultIndex) Ownable(msg.sender) {
        rewardGateway = _rewardGateway;
        smartVaultManager = _smartVaultManager;
        vaultIndex = _vaultIndex;
    }

    receive() external payable {}

    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory performData) {
        uint256 _id = (block.number % ISmartVaultManager(smartVaultManager).totalSupply()) + 1;
        try ISmartVault(ISmartVaultIndex(vaultIndex).getVaultAddress(_id)).undercollateralised() returns (bool _undercollateralised) {
            if (_undercollateralised) {
                upkeepNeeded = true;
                performData = abi.encodePacked(uint(_id));
            }
        } catch {}
    }

    function performUpkeep(bytes calldata performData) external override {
        uint256 _id = uint256(bytes32(performData));
        IRewardGateway(rewardGateway).liquidateVault(_id);
    }

    function withdrawETH(address payable _to) external onlyOwner() {
        uint256 _balance = address(this).balance;
        require(_balance > 0);
        (bool _sent,) = _to.call{value: _balance}("");
        require(_sent);
    }

    function withdraw(address _tokenAddress, address _to) external onlyOwner() {
        IERC20 _token = IERC20(_tokenAddress);
        uint256 _balance = _token.balanceOf(address(this));
        require(_balance > 0);
        _token.safeTransfer(_to, _balance);
    }
}