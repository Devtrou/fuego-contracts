// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IEmberCore} from "./interfaces/IEmberCore.sol";

contract Collector {
    IEmberCore public immutable EMBER_CORE;

    constructor(address emberCore) {
        EMBER_CORE = IEmberCore(emberCore);
    }

    function collectFeesToDAO() external {
        EMBER_CORE.causeChaos();
        EMBER_CORE.claimFees();
    }
}
