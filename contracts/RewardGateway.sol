// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "contracts/interfaces/IEUROs.sol";
import "contracts/interfaces/IRewardGateway.sol";
import "contracts/interfaces/ISmartVaultManager.sol";
import "contracts/interfaces/IStaking.sol";
import "contracts/interfaces/ITokenManager.sol";

contract RewardGateway is IRewardGateway, AccessControl {
    using SafeERC20 for IERC20;

    address immutable private staking;
    address immutable private euros;
    address immutable private tokenManager;
    address immutable private smartVaultManager;
    
    constructor(address _staking, address _euros, address _tokenManager, address _smartVaultManager) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        staking = _staking;
        euros = _euros;
        tokenManager = _tokenManager;
        smartVaultManager = _smartVaultManager;
    }

    receive() external payable {}

    function dropFees() public {
        uint256 _balance = IERC20(euros).balanceOf(address(this));
        if (_balance > 0) {
            IERC20(euros).forceApprove(staking, _balance);
            IStaking(staking).dropFees(euros, _balance);
        }

        ITokenManager.Token[] memory _tokens = ITokenManager(tokenManager).getAcceptedTokens();
        for (uint256 i = 0; i < _tokens.length; i++) {
            ITokenManager.Token memory _token = _tokens[i];
            if (_token.addr == address(0)) {
                _balance = address(this).balance;
                if (_balance > 0) IStaking(staking).dropFees{ value: _balance }(address(0), _balance);
            } else {
                _balance = IERC20(_token.addr).balanceOf(address(this));
                if (_balance > 0) {
                    IERC20(_token.addr).forceApprove(staking, _balance);
                    IStaking(staking).dropFees(_token.addr, _balance);
                }
            }
        }
    }

    function airdropToken(address _token, uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_amount > 0) {
            IERC20(_token).transferFrom(msg.sender, address(this), _amount);
            IERC20(_token).forceApprove(staking, _amount);
            IStaking(staking).dropFees(_token, _amount);
        }
    }

    function liquidateVault(uint256 _tokenID) external {
        dropFees();
        uint256 _minted = ISmartVaultManager(smartVaultManager).vaultData(_tokenID).status.minted;
        IEUROs(euros).burn(msg.sender, _minted);
        ISmartVaultManager(smartVaultManager).liquidateVault(_tokenID);
        ITokenManager.Token[] memory _tokens = ITokenManager(tokenManager).getAcceptedTokens();
        for (uint256 i = 0; i < _tokens.length; i++) {
            ITokenManager.Token memory _token = _tokens[i];
            if (_token.addr == address(0)) {
                uint256 _balance = address(this).balance;
                if (_balance > 0) {
                    (bool _sent,) = payable(msg.sender).call{ value: _balance }("");
                    require(_sent);
                }
            } else {
                uint256 _balance = IERC20(_token.addr).balanceOf(address(this));
                if (_balance > 0) {
                    IERC20(_token.addr).safeTransfer(msg.sender, _balance);
                }
            }
        }
    }
}