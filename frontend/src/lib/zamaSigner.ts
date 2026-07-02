import { TransactionRevertedError } from "@zama-fhe/sdk";
import type { Config } from "wagmi";
import {
  getAccount,
  getBlock,
  getChainId,
  readContract,
  signTypedData,
  waitForTransactionReceipt,
  watchAccount,
  writeContract,
} from "wagmi/actions";

/**
 * Drop-in replacement for `@zama-fhe/react-sdk/wagmi`'s WagmiSigner.
 *
 * The published 3.0.1 adapter imports `watchConnection` from `wagmi/actions`,
 * which wagmi does not export (it has `watchConnections` / `watchAccount`).
 * That missing binding breaks the production bundle. This copy is behaviourally
 * identical - only `subscribe` is rewritten to use `watchAccount`, whose
 * `onChange(account, prevAccount)` carries the same status/address/chainId
 * fields the original read off `watchConnection`.
 */
export class WagmiSigner {
  config: Config;

  constructor({ config }: { config: Config }) {
    this.config = config;
  }

  async getChainId(): Promise<number> {
    return getChainId(this.config);
  }

  async getAddress(): Promise<`0x${string}`> {
    const account = getAccount(this.config);
    if (!account?.address) throw new TypeError("Invalid address");
    return account.address;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async signTypedData(typedData: any): Promise<`0x${string}`> {
    // wagmi derives the domain type itself; passing EIP712Domain through throws.
    const types = { ...typedData.types };
    delete types.EIP712Domain;
    return signTypedData(this.config, {
      primaryType: Object.keys(types)[0],
      types,
      domain: typedData.domain,
      message: typedData.message,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async writeContract(config: any): Promise<`0x${string}`> {
    return writeContract(this.config, config);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async readContract(config: any): Promise<any> {
    return readContract(this.config, config);
  }

  async waitForTransactionReceipt(hash: `0x${string}`) {
    try {
      return await waitForTransactionReceipt(this.config, { hash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("could not be found") || msg.includes("Transaction not found")) {
        throw new TransactionRevertedError(
          `Could not find transaction receipt for hash "${hash.slice(0, 10)}…". If using ERC-4337 with a bundler, your connector may be returning a UserOperation hash instead of a transaction hash.`,
          { cause: err instanceof Error ? err : undefined },
        );
      }
      throw err;
    }
  }

  async getBlockTimestamp(): Promise<bigint> {
    return (await getBlock(this.config)).timestamp;
  }

  subscribe({
    onDisconnect = () => {},
    onAccountChange = () => {},
    onChainChange = () => {},
  }: {
    onDisconnect?: () => void;
    onAccountChange?: (address: `0x${string}`) => void;
    onChainChange?: (chainId: number) => void;
  }) {
    return watchAccount(this.config, {
      onChange(account, prevAccount) {
        if (account.status === "disconnected" && prevAccount.status !== "disconnected") onDisconnect();
        if (account.address && prevAccount.address && account.address !== prevAccount.address)
          onAccountChange(account.address);
        if (
          typeof prevAccount.chainId === "number" &&
          typeof account.chainId === "number" &&
          account.chainId !== prevAccount.chainId
        )
          onChainChange(account.chainId);
      },
    });
  }
}
