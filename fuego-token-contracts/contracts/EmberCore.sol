// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Owned} from "solmate/src/auth/Owned.sol";
import {Fuego} from "./Fuego.sol";
import {LiquidityLock} from "./LiquidityLock.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWETH} from "./interfaces/IWETH.sol";
import {IUniswapV3Factory} from "./interfaces/IUniswapV3Factory.sol";
import {IUniswapV3Pool} from "./interfaces/IUniswapV3Pool.sol";

contract EmberCore is Owned {
    /// @dev base network
    IWETH public constant WETH = IWETH(0x4200000000000000000000000000000000000006);
    address public constant POSITION_MANAGER = 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1;
    IUniswapV3Factory public constant FACTORY = IUniswapV3Factory(0x33128a8fC17869897dcE68Ed026d694621f6FDfD);

    /// @dev create when deploying this contract
    Fuego public immutable FUEGO;
    LiquidityLock public immutable LOCK;

    IUniswapV3Pool public pool;
    uint256 public nextBurnTime;
    uint256 public chaosCap = 0.1 ether;
    uint256 public chaosTimes = 3;

    /// @dev token info
    uint256 private constant TOKEN_SUPPLY = 100_000_000e18;
    uint256 private constant BENCHMARK_SUPPLY = TOKEN_SUPPLY / 100;

    /// @dev fee of the pool which nft locked in LiquidityLock contract is created
    uint24 private constant POOL_FEE = 10_000;

    /// @dev uniswap v3 constants
    uint160 private constant MIN_SQRT_RATIO = 4295128739;
    uint160 private constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    address private immutable DEPLOYER;

    /// @dev token0 in liquidity pool
    address private token0;

    constructor() Owned(msg.sender) {
        DEPLOYER = msg.sender;
        FUEGO = new Fuego(msg.sender, TOKEN_SUPPLY);
        LOCK = new LiquidityLock(msg.sender, POSITION_MANAGER);
        FUEGO.renounceOwnership();
    }

    receive() external payable {
        WETH.deposit{value: msg.value}();
    }

    function claimFees() external {
        uint256 wethGain = WETH.balanceOf(address(this));
        LOCK.claimFees();

        wethGain = WETH.balanceOf(address(this)) - wethGain;
        if (wethGain > 0) WETH.transfer(owner, wethGain);

        uint256 fuegoBalance = FUEGO.balanceOf(address(this));
        if (fuegoBalance > 0) FUEGO.transfer(address(owner), fuegoBalance);
    }

    function burnFUEGO() external {
        uint256 burnedSupply = FUEGO.balanceOf(address(0));
        uint256 emberRate = burnedSupply / BENCHMARK_SUPPLY;
        uint256 interval = 12 hours;
        if (emberRate >= 5) interval += 6 hours;
        if (emberRate >= 10) interval += 6 hours;
        if (emberRate >= 15) interval += 6 hours;
        if (emberRate >= 30) interval += 6 hours;
        if (emberRate >= 50) interval += 12 hours;

        require(block.timestamp >= nextBurnTime, "burn not ready");
        nextBurnTime = block.timestamp + interval;

        uint256 wethGain = WETH.balanceOf(address(this));
        LOCK.claimBurn();
        LOCK.claimFees();

        wethGain = (WETH.balanceOf(address(this)) - wethGain);
        if (wethGain > 0) WETH.transfer(owner, wethGain);

        uint256 fuegoBalance = FUEGO.balanceOf(address(this));
        if (fuegoBalance > 0) FUEGO.transfer(address(0), fuegoBalance);
    }

    function causeChaos() external {
        if (LOCK.nftId() == 0) return;
        if (address(pool) == address(0)) {
            pool = IUniswapV3Pool(FACTORY.getPool(address(WETH), address(FUEGO), POOL_FEE));
            require(address(pool) != address(0), "pool not found");
            token0 = pool.token0();
        }

        uint256 balance = FUEGO.balanceOf(address(this));
        if (balance > 0) FUEGO.transfer(address(0), balance);

        for (uint256 i; i < chaosTimes; i++) {
            balance = WETH.balanceOf(address(this));
            if (balance > 0) swap(address(WETH), address(FUEGO), balance);
            balance = FUEGO.balanceOf(address(this));
            if (balance > 0) swap(address(FUEGO), address(WETH), balance);
        }

        balance = WETH.balanceOf(address(this));
        if (balance > chaosCap) WETH.transfer(DEPLOYER, balance - chaosCap);
    }

    function uniswapV3SwapCallback(int256 amount0, int256 amount1, bytes calldata data) external {
        // solhint-disable-next-line avoid-tx-origin
        require(msg.sender == address(pool) && tx.origin != address(this), "unauthorized");
        bool zeroForOne = data.length > 0;
        address token = zeroForOne ? token0 : token0 == address(WETH) ? address(FUEGO) : address(WETH);
        uint256 amount = zeroForOne ? uint256(amount0) : uint256(amount1);
        IERC20(token).transfer(address(pool), amount);
    }

    function setChaosTimes(uint256 _newChaosTimes) external onlyOwner {
        chaosTimes = _newChaosTimes;
    }

    function setChaosCap(uint256 _newChaosCap) external onlyOwner {
        chaosCap = _newChaosCap;
    }

    function swap(address tokeknIn, address tokenOut, uint256 amount) private {
        if (amount == 0) return;
        bool zeroForOne = tokeknIn < tokenOut;
        uint160 sqrt = zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1;
        // solhint-disable-next-line no-empty-blocks
        try pool.swap(address(this), zeroForOne, int256(amount), sqrt, zeroForOne ? bytes("1") : bytes("")) {} catch {}
    }
}
