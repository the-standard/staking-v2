// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "contracts/interfaces/IStaking.sol";
import "contracts/interfaces/IRewardGateway.sol";
import "contracts/interfaces/ITokenManager.sol";

import "hardhat/console.sol";

contract RewardGateway is IRewardGateway {
    using SafeERC20 for IERC20;

    address immutable private staking;
    address immutable private euros;
    address immutable private tokenManager;
    
    constructor(address _staking, address _euros, address _tokenManager) {
        staking = _staking;
        euros = _euros;
        tokenManager = _tokenManager;
    }

    receive() external payable {}

    // call this every time a user increases / decreases / claims
    function dropFees() external {
        uint256 _balance = IERC20(euros).balanceOf(address(this));
        IERC20(euros).approve(staking, _balance);
        IStaking(staking).dropFees(euros, _balance);

        ITokenManager.Token[] memory _tokens = ITokenManager(tokenManager).getAcceptedTokens();
        for (uint256 i = 0; i < _tokens.length; i++) {
            ITokenManager.Token memory _token = _tokens[i];
            if (_token.addr == address(0)) {
                _balance = address(this).balance;
                if (_balance > 0) IStaking(staking).dropFees{ value: _balance }(address(0), _balance);
            } else {
                _balance = IERC20(_token.addr).balanceOf(address(this));
                if (_balance > 0) {
                    IERC20(_token.addr).approve(staking, _balance);
                    IStaking(staking).dropFees(_token.addr, _balance);
                }
            }
        }
    }

    function airdropToken(address _token, uint256 _amount) external {
        if (_amount > 0) {
            IERC20(_token).transferFrom(msg.sender, address(this), _amount);
            IERC20(_token).approve(staking, _amount);
            IStaking(staking).dropFees(_token, _amount);
        }
    }
}
