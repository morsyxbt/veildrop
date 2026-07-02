import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import type { ConfidentialToken } from "../types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const UNIT = 1_000_000n; // 1 token at 6 decimals

describe("ConfidentialToken", function () {
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let token: ConfidentialToken;

  beforeEach(async function () {
    [deployer, alice] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("ConfidentialToken");
    token = await Token.deploy("Veildrop Demo USD", "vUSD", "");
  });

  it("mints an encrypted balance the owner can decrypt", async function () {
    await token.mint(alice.address, 1000n * UNIT);

    const handle = await token.confidentialBalanceOf(alice.address);
    expect(handle).to.not.equal(ethers.ZeroHash);

    const clear = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      handle,
      await token.getAddress(),
      alice,
    );
    expect(clear).to.equal(1000n * UNIT);
  });

  it("never exposes the amount as cleartext on-chain", async function () {
    await token.mint(deployer.address, 5n * UNIT);
    const handle = await token.confidentialBalanceOf(deployer.address);
    // The balance is a ciphertext handle, not the plaintext amount.
    expect(handle).to.not.equal(ethers.toBeHex(5n * UNIT, 32));
  });

  it("reports the ERC-7984 metadata", async function () {
    expect(await token.name()).to.equal("Veildrop Demo USD");
    expect(await token.symbol()).to.equal("vUSD");
  });
});
