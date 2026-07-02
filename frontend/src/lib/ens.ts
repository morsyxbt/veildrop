import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

// ENS names live on mainnet no matter where the send happens - the resolved
// address is the same wallet on Sepolia. This client exists only for lookups;
// every transaction still goes through the wagmi Sepolia config.
const ensClient = createPublicClient({ chain: mainnet, transport: http() });

/** Does a recipient column look like an ENS name (vs a 0x address)? */
export function looksLikeEns(s: string): boolean {
  return /^[a-z0-9-_.]+\.eth$/i.test(s);
}

// name (lowercased) -> address, or null when it doesn't resolve. Session-scoped:
// the recipients parser re-runs on every keystroke, so each name must cost at
// most one network round trip.
const cache = new Map<string, Address | null>();
const inFlight = new Map<string, Promise<Address | null>>();

/** Resolve an ENS name via mainnet, memoized for the session. Returns null for
 *  unregistered names and for lookup failures - the caller surfaces both as
 *  "couldn't resolve" on the offending line. */
export function resolveEns(name: string): Promise<Address | null> {
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = (async () => {
    try {
      const addr = await ensClient.getEnsAddress({ name: normalize(key) });
      const result = addr ?? null;
      cache.set(key, result);
      return result;
    } catch {
      cache.set(key, null);
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, p);
  return p;
}
