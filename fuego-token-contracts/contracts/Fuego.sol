// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {Owned} from "solmate/src/auth/Owned.sol";

contract Fuego is ERC20, Owned {
    address public immutable EMBER_CORE;

    constructor(address deployer, uint256 supply) ERC20("Fuego", "FUEGO", 18) Owned(msg.sender) {
        EMBER_CORE = msg.sender;
        _mint(deployer, supply);
    }

    function renounceOwnership() external onlyOwner {
        transferOwnership(address(0));
    }
}
