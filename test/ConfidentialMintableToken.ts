import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import type { ConfidentialMintableToken } from "../types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const UNIT = 1_000_000n; // 1 token at 6 decimals

describe("ConfidentialMintableToken", function () {
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;

  async function deploy(cap: bigint): Promise<ConfidentialMintableToken> {
    const Token = await ethers.getContractFactory("ConfidentialMintableToken");
    return Token.connect(owner).deploy("Project Token", "PRJ", "", cap);
  }

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();
  });

  it("only the owner can mint", async function () {
    const token = await deploy(0n);
    await expect(token.connect(alice).mint(alice.address, UNIT)).to.be.revertedWithCustomError(
      token,
      "OwnableUnauthorizedAccount",
    );
    await expect(token.connect(owner).mint(alice.address, UNIT)).to.not.be.reverted;
  });

  it("enforces the cap, including exact-cap mints", async function () {
    const token = await deploy(1000n * UNIT);
    await token.mint(alice.address, 600n * UNIT);
    // Filling the cap exactly is allowed…
    await token.mint(alice.address, 400n * UNIT);
    expect(await token.totalMinted()).to.equal(1000n * UNIT);
    // …but one unit past it reverts.
    await expect(token.mint(alice.address, 1n)).to.be.revertedWithCustomError(token, "CapExceeded");
  });

  it("cap of zero means uncapped", async function () {
    const token = await deploy(0n);
    await token.mint(alice.address, 2n ** 40n * UNIT);
    await token.mint(alice.address, 2n ** 40n * UNIT);
    expect(await token.cap()).to.equal(0n);
  });

  it("tracks totalMinted across mints", async function () {
    const token = await deploy(0n);
    await token.mint(alice.address, 300n * UNIT);
    await token.mint(owner.address, 200n * UNIT);
    expect(await token.totalMinted()).to.equal(500n * UNIT);
  });

  it("mints an encrypted balance the recipient can decrypt", async function () {
    const token = await deploy(0n);
    await token.mint(alice.address, 42n * UNIT);

    const handle = await token.confidentialBalanceOf(alice.address);
    expect(handle).to.not.equal(ethers.ZeroHash);

    const clear = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      handle,
      await token.getAddress(),
      alice,
    );
    expect(clear).to.equal(42n * UNIT);
  });
});
