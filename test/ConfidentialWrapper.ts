import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import type { ConfidentialWrapper, DemoERC20 } from "../types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const RATE = 10n ** 12n; // 18-decimal underlying -> 6 confidential decimals
const ONE = 10n ** 18n; // 1 underlying token
const CONE = 10n ** 6n; // 1 confidential token

describe("ConfidentialWrapper", function () {
  let alice: HardhatEthersSigner;
  let erc20: DemoERC20;
  let wrapper: ConfidentialWrapper;

  beforeEach(async function () {
    [, alice] = await ethers.getSigners();
    const Demo = await ethers.getContractFactory("DemoERC20");
    erc20 = await Demo.deploy("Demo USD", "DUSD", 18);
    const Wrapper = await ethers.getContractFactory("ConfidentialWrapper");
    wrapper = await Wrapper.deploy(await erc20.getAddress(), "Confidential DUSD", "cDUSD", "");
  });

  it("binds to the underlying and derives rate + decimals from its precision", async function () {
    expect(await wrapper.underlying()).to.equal(await erc20.getAddress());
    expect(await wrapper.rate()).to.equal(RATE);
    expect(await wrapper.decimals()).to.equal(6);
  });

  it("wrap pulls the ERC-20 and mints a decryptable confidential balance", async function () {
    await erc20.mint(alice.address, 100n * ONE);
    await erc20.connect(alice).approve(await wrapper.getAddress(), 100n * ONE);
    await wrapper.connect(alice).wrap(alice.address, 100n * ONE);

    expect(await erc20.balanceOf(alice.address)).to.equal(0n);
    expect(await erc20.balanceOf(await wrapper.getAddress())).to.equal(100n * ONE);

    const handle = await wrapper.confidentialBalanceOf(alice.address);
    const clear = await fhevm.userDecryptEuint(FhevmType.euint64, handle, await wrapper.getAddress(), alice);
    expect(clear).to.equal(100n * CONE);
  });

  it("wrap rounds down to the nearest rate multiple and only pulls that much", async function () {
    const odd = 5n * ONE + 123n; // not a multiple of the rate
    await erc20.mint(alice.address, odd);
    await erc20.connect(alice).approve(await wrapper.getAddress(), odd);
    await wrapper.connect(alice).wrap(alice.address, odd);

    // The 123-wei remainder never leaves the holder.
    expect(await erc20.balanceOf(alice.address)).to.equal(123n);

    const handle = await wrapper.confidentialBalanceOf(alice.address);
    const clear = await fhevm.userDecryptEuint(FhevmType.euint64, handle, await wrapper.getAddress(), alice);
    expect(clear).to.equal(5n * CONE);
  });

  it("unwrap burns the balance and opens a publicly decryptable request", async function () {
    await erc20.mint(alice.address, 10n * ONE);
    await erc20.connect(alice).approve(await wrapper.getAddress(), 10n * ONE);
    await wrapper.connect(alice).wrap(alice.address, 10n * ONE);

    // Unwrap the whole balance using the balance handle (already ACL-allowed to alice).
    const handle = await wrapper.confidentialBalanceOf(alice.address);
    const tx = await wrapper.connect(alice)["unwrap(address,address,bytes32)"](alice.address, alice.address, handle);
    const receipt = await tx.wait();

    const requested = receipt!.logs
      .map((log) => {
        try {
          return wrapper.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "UnwrapRequested");
    expect(requested, "UnwrapRequested event").to.not.equal(undefined);
    const requestId = requested!.args.unwrapRequestId as string;

    // The burn already happened - the confidential balance is back to zero…
    const after = await wrapper.confidentialBalanceOf(alice.address);
    const clearAfter = await fhevm.userDecryptEuint(FhevmType.euint64, after, await wrapper.getAddress(), alice);
    expect(clearAfter).to.equal(0n);

    // …and the request is bound to alice, with the burned amount marked publicly
    // decryptable so `finalizeUnwrap` can verify the KMS cleartext later.
    expect(await wrapper.unwrapRequester(requestId)).to.equal(alice.address);
    const burned = await fhevm.publicDecryptEuint(FhevmType.euint64, requestId);
    expect(burned).to.equal(10n * CONE);
  });
});
