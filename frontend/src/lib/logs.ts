import type { AbiEvent } from "viem";
import type { usePublicClient } from "wagmi";

type Client = NonNullable<ReturnType<typeof usePublicClient>>;

/** A decoded event log, with the fields the UI consumes. */
export interface DecodedLog {
  address: `0x${string}`;
  blockNumber: bigint | null;
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
  eventName?: string;
  args: Record<string, unknown>;
}

/**
 * RPC-safe event fetch. Tries one wide getLogs first (works on generous RPCs);
 * if the provider rejects the range (some free tiers cap eth_getLogs at as few
 * as 10 blocks), falls back to chunked requests over a bounded recent window so
 * the feature still shows recent activity instead of failing silently.
 */
export async function safeGetLogs(
  client: Client,
  params: {
    address: `0x${string}` | `0x${string}`[];
    events?: AbiEvent[];
    event?: AbiEvent;
    wideLookback?: bigint;
    fallbackLookback?: bigint;
    chunk?: bigint;
  },
): Promise<DecodedLog[]> {
  const latest = await client.getBlockNumber();
  const wide = params.wideLookback ?? 9_000n;
  const fallback = params.fallbackLookback ?? 150n;
  const chunk = params.chunk ?? 9n;

  const selector = params.event ? { event: params.event } : { events: params.events };
  const call = (fromBlock: bigint, toBlock: bigint): Promise<DecodedLog[]> =>
    // viem's getLogs union typing is too strict for this dynamic wrapper; the
    // runtime call is correct, so we relax the param type here only.
    client.getLogs({ address: params.address, ...selector, fromBlock, toBlock } as never) as unknown as Promise<
      DecodedLog[]
    >;

  // 1) one wide request
  try {
    return await call(latest - wide > 0n ? latest - wide : 0n, latest);
  } catch {
    // fall through to chunked
  }

  // 2) chunked over a small recent window
  const start = latest - fallback > 0n ? latest - fallback : 0n;
  const requests: Array<Promise<DecodedLog[]>> = [];
  for (let from = start; from <= latest; from += chunk + 1n) {
    const to = from + chunk > latest ? latest : from + chunk;
    requests.push(call(from, to).catch(() => [] as DecodedLog[]));
  }
  const chunks = await Promise.all(requests);
  return chunks.flat();
}
