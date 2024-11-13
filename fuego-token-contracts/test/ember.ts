import { loadFixture, time, reset } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import {
  AddressLike,
  BigNumberish,
  MaxUint256,
  parseEther,
  resolveAddress,
  Signer,
  ZeroAddress,
  zeroPadValue,
} from "ethers";
import { IERC20, INonfungiblePositionManager, IWETH } from "../typechain-types";

describe("EmberCore", function () {
  const FEE = 10000;
  before(async () => await reset("https://mainnet.base.org", 21530000));

  async function deploy() {
    const [deployer, owner, user] = await ethers.getSigners();
    const emberCore = await ethers.deployContract("EmberCore");
    const token = await ethers.getContractAt("Fuego", await emberCore.FUEGO());
    const lock = await ethers.getContractAt("LiquidityLock", await emberCore.LOCK());

    await emberCore.transferOwnership(owner);

    // all tokens in supply are sent to deployer
    const supply = await token.totalSupply();
    expect(supply).gt(0n);
    expect(await token.balanceOf(deployer)).eq(supply);

    // verify ownership
    expect(await token.owner()).eq(ZeroAddress);
    expect(await lock.owner()).eq(emberCore);
    expect(await emberCore.owner()).eq(owner);

    return { deployer, owner, user, emberCore, lock };
  }

  it("end-to-end", async function () {
    // 1. deploy
    const { deployer, owner, user, emberCore, lock } = await loadFixture(deploy);
    const positionManager = await ethers.getContractAt(
      "INonfungiblePositionManager",
      await emberCore.POSITION_MANAGER()
    );
    const factory = await ethers.getContractAt("IUniswapV3Factory", await emberCore.FACTORY());
    const weth = (await ethers.getContractAt("IWETH", await emberCore.WETH())) as IERC20;
    const token = await ethers.getContractAt("IERC20", await emberCore.FUEGO());

    // 2. create and lock nft position
    const nftId = await createNFT(deployer, positionManager, weth, token);
    await positionManager.approve(lock, nftId);
    await lock.lockNFT(nftId);
    expect(await positionManager.ownerOf(nftId)).eq(lock);

    // 3. users swap
    await (weth as IWETH).connect(user).deposit({ value: parseEther("5") });
    await swap(user, weth, token);
    await swap(user, token, weth);
    await swap(user, weth, token);

    // 4. claim fees
    let [wethBalance, tokenBalance] = [await weth.balanceOf(owner), await token.balanceOf(owner)];
    await emberCore.claimFees();
    expect(await weth.balanceOf(owner)).gt(wethBalance);
    expect(await token.balanceOf(owner)).gt(tokenBalance);

    // 5. burn tokens
    [wethBalance, tokenBalance] = [await weth.balanceOf(owner), await token.balanceOf(ZeroAddress)];
    await emberCore.burnFUEGO();
    expect(await weth.balanceOf(owner)).gt(wethBalance);
    expect(await token.balanceOf(ZeroAddress)).gt(tokenBalance);
    const nextBurnTime = (await time.latest()) + 12 * 60 * 60;
    expect(await emberCore.nextBurnTime()).eq(nextBurnTime);

    // 6. time skip and burn tokens again
    await expect(emberCore.burnFUEGO()).revertedWith("burn not ready");
    await time.setNextBlockTimestamp(nextBurnTime);
    [wethBalance, tokenBalance] = [await weth.balanceOf(owner), await token.balanceOf(ZeroAddress)];
    await emberCore.burnFUEGO();
    expect(await weth.balanceOf(owner)).gt(wethBalance);
    expect(await token.balanceOf(ZeroAddress)).gt(tokenBalance);
    expect(await emberCore.nextBurnTime()).gt(await time.latest());

    // 7. cause chaos
    await deployer.sendTransaction({ to: emberCore, value: parseEther("1") });
    expect(await weth.balanceOf(emberCore)).eq(parseEther("1"));
    wethBalance = await weth.balanceOf(deployer);
    const tx = await emberCore.causeChaos();
    expect(await weth.balanceOf(deployer)).gt(wethBalance);
    const pool = await factory.getPool(weth, token, FEE);
    expect(await emberCore.pool()).eq(pool);
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    const swapTopic = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
    const logs = receipt?.logs.filter((log) => log.address === pool && log.topics[0] === swapTopic);
    expect(logs?.length).eq(2n * (await emberCore.chaosTimes()));
  });

  it("ownership", async function () {
    const { owner, user, emberCore, lock } = await loadFixture(deploy);
    await expect(lock.connect(user).claimBurn()).revertedWith("UNAUTHORIZED");
    await expect(lock.connect(owner).claimBurn()).revertedWith("UNAUTHORIZED");
    await expect(emberCore.connect(user).setChaosCap(1)).revertedWith("UNAUTHORIZED");
    await expect(emberCore.connect(user).setChaosTimes(10)).revertedWith("UNAUTHORIZED");
    await emberCore.connect(owner).setChaosCap(1);
    await emberCore.connect(owner).setChaosTimes(10);
  });

  const createNFT = async (
    signer: Signer,
    positionManager: INonfungiblePositionManager,
    weth: IERC20,
    token: IERC20
  ): Promise<bigint> => {
    const [token0, token1, amount0, amount1] = (await lt(weth, token))
      ? [weth, token, 0n, await token.totalSupply()]
      : [token, weth, await token.totalSupply(), 0n];
    const sqrtPriceX96 = 61583567927630976384755580n; // tick = -143201
    const recipient = await signer.getAddress();

    await token.approve(positionManager, MaxUint256);
    await positionManager.createAndInitializePoolIfNecessary(token0, token1, FEE, sqrtPriceX96);
    const tx = await positionManager.connect(signer).mint({
      token0,
      token1,
      fee: FEE,
      tickLower: -143200,
      tickUpper: 887200,
      amount0Desired: amount0,
      amount1Desired: amount1,
      amount0Min: 0,
      amount1Min: 0,
      recipient,
      deadline: (await time.latest()) + 60,
    });

    const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    const nftLog = receipt?.logs.filter(
      (log) =>
        log.topics.length == 4 &&
        log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" &&
        log.topics[1] === "0x0000000000000000000000000000000000000000000000000000000000000000" &&
        log.topics[2] === zeroPadValue(recipient, 32)
    )[0];
    const nftId = nftLog?.topics[3];
    return BigInt(nftId || "0");
  };

  const swap = async (user: Signer, tokenIn: IERC20, tokenOut: IERC20, amount?: BigNumberish) => {
    const router = await ethers.getContractAt("IV3SwapRouter", "0x2626664c2603336E57B271c5C0b26F421741e481");
    const amountIn = amount ?? (await tokenIn.balanceOf(user));
    await tokenIn.connect(user).approve(router, amountIn);
    await router.connect(user).exactInputSingle({
      tokenIn,
      tokenOut,
      fee: FEE,
      recipient: user,
      amountIn,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0,
    });
  };

  const lt = async (a: AddressLike, b: AddressLike) =>
    (await resolveAddress(a)).toLowerCase() < (await resolveAddress(b)).toLowerCase();
});
