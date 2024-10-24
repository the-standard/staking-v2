// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "contracts/interfaces/IRewardGatewayTST.sol";
import "contracts/interfaces/IStaking.sol";
import "contracts/interfaces/ITokenManager.sol";

contract RewardGatewayTST is IRewardGatewayTST, AccessControl {
    using SafeERC20 for IERC20;

    address immutable private staking;
    address immutable private USDs;
    address immutable private tokenManager;
    
    constructor(address _staking, address _USDs, address _tokenManager) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        staking = _staking;
        USDs = _USDs;
        tokenManager = _tokenManager;
    }

    receive() external payable {}

    function dropFees() public {
        uint256 _balance = IERC20(USDs).balanceOf(address(this));
        if (_balance > 0) {
            IERC20(USDs).forceApprove(staking, _balance);
            IStaking(staking).dropFees(USDs, _balance);
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
}