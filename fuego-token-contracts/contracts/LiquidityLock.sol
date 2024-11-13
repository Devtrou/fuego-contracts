// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Owned} from "solmate/src/auth/Owned.sol";
import {INonfungiblePositionManager} from "./interfaces/INonfungiblePositionManager.sol";

contract LiquidityLock is Owned {
    INonfungiblePositionManager public immutable POSITION_MANAGER;
    address public immutable DEPLOYER;
    uint256 public nftId;

    constructor(address _deployer, address _positionManager) Owned(msg.sender) {
        POSITION_MANAGER = INonfungiblePositionManager(_positionManager);
        DEPLOYER = _deployer;
    }

    /// @dev Once locked, an NFT can never be unlocked
    function lockNFT(uint256 _nftId) external {
        require(msg.sender == DEPLOYER, "!deployer");
        require(nftId == 0, "nft is already locked");
        nftId = _nftId;
        POSITION_MANAGER.transferFrom(DEPLOYER, address(this), _nftId);
    }

    function claimFees() external {
        POSITION_MANAGER.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: nftId,
                recipient: owner,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
    }

    function claimBurn() external onlyOwner {
        (, , , , , , , uint128 liquidity, , , , ) = POSITION_MANAGER.positions(nftId);
        uint128 liquidityToBurn = uint128(liquidity / 100);
        POSITION_MANAGER.decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: nftId,
                liquidity: liquidityToBurn,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            })
        );
    }
}
