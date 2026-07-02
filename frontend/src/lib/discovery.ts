import { confidentialAirdropCloneableAbi } from "@tokenops/sdk/fhe-airdrop";
import { getAbiItem, getAddress, type AbiEvent, type Address } from "viem";

const CHUNK = 9_000n; // safe getLogs range for the public RPCs
const CLAIMED_EVENT = getAbiItem({
  abi: confidentialAirdropCloneableAbi,
  name: "Claimed",
}) as AbiEvent;

// ERC-7984 confidential transfer (mints included, from == 0x0). All three args are
// indexed, so we can query across every token contract by the `to` topic alone.
const CONFIDENTIAL_TRANSFER_EVENT: AbiEvent = {
  type: "event",
  name: "ConfidentialTransfer",
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: true, name: "amount", type: "bytes32" },
  ],
};

// How far back to scan for received confidential tokens (~1 week on Sepolia). Kept
// bounded so a public RPC returns quickly; backend discovery covers older tokens.
const SCAN_LOOKBACK = 50_000n;

// Minimal client surface so we don't fight viem's getLogs generics.
interface Client {
  getBlockNumber(): Promise<bigint>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getLogs(args: any): Promise<any[]>;
}

/**
 * Count how many recipients have claimed, from the airdrop's `Claimed` events.
 * Scans from the campaign's creation block (stored in the backend) so it stays
 * cheap even on public RPCs. Claims are on-chain, so this is read live.
 * `partial` flags a result that may undercount: a chunk failed on the RPC, or no
 * creation block was stored so the scan was bounded to the recent window instead
 * of walking back to genesis (hundreds of sequential calls).
 */
export async function countClaims(
  client: Client,
  airdrop: Address,
  fromBlock: number,
): Promise<{ count: number; partial: boolean }> {
  const latest = await client.getBlockNumber();
  const bounded = fromBlock <= 0;
  const start = bounded ? (latest > SCAN_LOOKBACK ? latest - SCAN_LOOKBACK : 0n) : BigInt(fromBlock);
  let count = 0;
  let partial = bounded;
  for (let from = start; from <= latest; from += CHUNK + 1n) {
    const to = from + CHUNK > latest ? latest : from + CHUNK;
    try {
      const logs = await client.getLogs({
        address: airdrop,
        event: CLAIMED_EVENT,
        fromBlock: from,
        toBlock: to,
      });
      count += logs.length;
    } catch {
      partial = true;
      continue;
    }
  }
  return { count, partial };
}

/**
 * Best-effort on-chain auto-detect: find every confidential (ERC-7984) token that
 * has transferred to `owner` in the recent window, across all contracts. Returns
 * the distinct token contract addresses (checksummed). Silent on RPC limits - the
 * backend token registry is the reliable source; this only augments it.
 */
export async function scanReceivedTokens(client: Client, owner: Address): Promise<Address[]> {
  let latest: bigint;
  try {
    latest = await client.getBlockNumber();
  } catch {
    return [];
  }
  const start = latest > SCAN_LOOKBACK ? latest - SCAN_LOOKBACK : 0n;
  const found = new Map<string, Address>();
  for (let from = start; from <= latest; from += CHUNK + 1n) {
    const to = from + CHUNK > latest ? latest : from + CHUNK;
    try {
      const logs = await client.getLogs({
        event: CONFIDENTIAL_TRANSFER_EVENT,
        args: { to: owner },
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const addr = log?.address as string | undefined;
        if (addr) found.set(addr.toLowerCase(), getAddress(addr));
      }
    } catch {
      continue;
    }
  }
  return [...found.values()];
}
