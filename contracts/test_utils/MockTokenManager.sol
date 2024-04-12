// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "contracts/interfaces/ITokenManager.sol";

contract MockTokenManager is ITokenManager {

    Token[] private tokens;
    
    constructor(address[] memory _tokens) {
        tokens.push(Token(bytes32("ETH"), address(0), 18, address(0), 0));

        for (uint256 i = 0; i < _tokens.length; i++) {
            ERC20 _token = ERC20(_tokens[i]);
            tokens.push(
                Token(bytes32(bytes(_token.symbol())), _tokens[i], _token.decimals(), address(0), 0)
            );
        }
    }

    function getAcceptedTokens() external view returns (Token[] memory) {
        return tokens;
    }
}