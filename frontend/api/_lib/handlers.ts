import { createPublicClient, http, recoverMessageAddress, type Hex } from "viem";
import { sepolia } from "viem/chains";

import { getStore, type CampaignRecord, type StoredEntry, type TokenRecord } from "./store";

export interface ApiRequest {
  method: string;
  path: string;
  query: Record<string, string | undefined>;
  body: unknown;
}
export interface ApiResult {
  status: number;
  json: unknown;
}

const ADDR_RE = /^0x[0-9a-f]{40}$/; // lowercased EVM address
const TX_RE = /^0x[0-9a-f]{64}$/; // lowercased tx hash (disperse history keys)
const MAX_ENTRIES = 1000; // per-campaign recipient cap (also bounds Redis growth)
const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

const hasRoleAbi = [
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

// Server-side Sepolia reads (first-save creator verification). SEPOLIA_RPC_URL is
// optional - viem's default public endpoint is enough for one eth_call per save.
function rpcClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || undefined),
  });
}

// Campaign writes are gated by an EIP-191 signature from the creator wallet over
// this message, so a third party can't overwrite a campaign's claim file or flag
// it withdrawn. Must stay byte-identical to campaignAuthMessage in src/lib/api.ts.
function campaignAuthMessage(airdrop: string): string {
  return `Veildrop: authorize campaign updates\nAirdrop: ${airdrop.toLowerCase()}`;
}

// Token registrations are gated the same way, so nobody can plant a poisoned
// "wrapper" record in someone else's list (the Create page offers stored wrappers
// with one click). Must stay byte-identical to tokenAuthMessage in src/lib/api.ts.
function tokenAuthMessage(token: string): string {
  return `Veildrop: register token\nToken: ${token.toLowerCase()}`;
}

// EOA recovery only (smart-contract wallets can't sign this way - acceptable for
// the demo trust model, documented in the README).
async function verifySig(message: string, expectedSigner: string, auth: unknown): Promise<boolean> {
  if (typeof auth !== "string" || !auth.startsWith("0x")) return false;
  try {
    const recovered = await recoverMessageAddress({ message, signature: auth as Hex });
    return recovered.toLowerCase() === expectedSigner.toLowerCase();
  } catch {
    return false;
  }
}

// First save binds the record to `creator` forever, so the claim proves control of
// the airdrop itself, not just any wallet: airdrop records require the creator to
// hold DEFAULT_ADMIN_ROLE on the clone; disperse history records (keyed by tx hash)
// require the creator to be the tx sender. Retries cover the server RPC lagging the
// client's RPC by a block or two right after deploy/submit.
async function verifyOnChainCreator(rec: CampaignRecord): Promise<boolean> {
  const client = rpcClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (rec.mode === "disperse") {
        const tx = await client.getTransaction({ hash: rec.airdrop as Hex });
        return tx.from.toLowerCase() === rec.creator;
      }
      return await client.readContract({
        address: rec.airdrop as `0x${string}`,
        abi: hasRoleAbi,
        functionName: "hasRole",
        args: [DEFAULT_ADMIN_ROLE, rec.creator as `0x${string}`],
      });
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return false;
}

// Normalize + validate the entries map: address-shaped lowercase keys, well-formed
// hex payloads, bounded count. Anything else is rejected so a hostile client can't
// index arbitrary strings into the per-recipient sets or bloat the store.
function validateEntries(raw: unknown): { entries?: Record<string, StoredEntry>; error?: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: "entries must be an object keyed by recipient address" };
  }
  const keys = Object.keys(raw as object);
  if (keys.length > MAX_ENTRIES) return { error: `too many entries (max ${MAX_ENTRIES})` };
  const entries: Record<string, StoredEntry> = {};
  for (const k of keys) {
    const key = k.toLowerCase();
    if (!ADDR_RE.test(key)) return { error: "entries keys must be recipient addresses" };
    const v = (raw as Record<string, Partial<StoredEntry> | undefined>)[k];
    const enc = v?.encryptedInput;
    if (
      !enc ||
      typeof enc.handle !== "string" ||
      !enc.handle.startsWith("0x") ||
      enc.handle.length > 200 ||
      typeof enc.inputProof !== "string" ||
      !enc.inputProof.startsWith("0x") ||
      enc.inputProof.length > 300_000 ||
      typeof v.signature !== "string" ||
      !v.signature.startsWith("0x") ||
      v.signature.length > 1000
    ) {
      return { error: "malformed entry payload" };
    }
    entries[key] = { encryptedInput: { handle: enc.handle, inputProof: enc.inputProof }, signature: v.signature };
  }
  return { entries };
}

function parseDecimals(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 18 ? n : undefined;
}

// One entry point for every /api route, used by both the Vercel functions and
// the local Vite dev middleware. The try/catch keeps error shapes identical in
// both environments (Vercel would otherwise emit a platform HTML error page).
export async function handleApi(req: ApiRequest): Promise<ApiResult> {
  try {
    return await route(req);
  } catch (e) {
    return { status: 500, json: { error: e instanceof Error ? e.message : "internal error" } };
  }
}

async function route(req: ApiRequest): Promise<ApiResult> {
  const store = getStore();
  const path = req.path.replace(/\/+$/, "");

  // Save a campaign (index + claim file). Requires the creator's auth signature.
  if (req.method === "POST" && path.endsWith("/campaign")) {
    const b = req.body as (Partial<CampaignRecord> & { auth?: string }) | undefined;
    if (!b?.airdrop || !b?.creator || !b?.entries) {
      return { status: 400, json: { error: "airdrop, creator and entries are required" } };
    }
    const airdrop = String(b.airdrop).toLowerCase();
    const creator = String(b.creator).toLowerCase();
    const mode = (["airdrop", "disperse", "vesting"].includes(String(b.mode)) ? b.mode : "airdrop") as CampaignRecord["mode"];
    // Disperse history is keyed by the disperse tx hash; everything else by the
    // airdrop clone address.
    if (mode === "disperse" ? !TX_RE.test(airdrop) : !ADDR_RE.test(airdrop)) {
      return { status: 400, json: { error: "invalid airdrop key" } };
    }
    if (!ADDR_RE.test(creator)) return { status: 400, json: { error: "invalid creator address" } };
    const checked = validateEntries(b.entries);
    if (!checked.entries) return { status: 400, json: { error: checked.error } };
    const entryCount = Object.keys(checked.entries).length;
    const rec: CampaignRecord = {
      airdrop,
      creator,
      name: b.name ? String(b.name).slice(0, 64) : undefined,
      // Draft saves ship empty entries with a display count; final saves derive
      // the count from the validated entries.
      count: entryCount > 0 ? entryCount : Math.min(Math.max(Number(b.count) || 0, 0), MAX_ENTRIES),
      token: b.token && ADDR_RE.test(String(b.token).toLowerCase()) ? String(b.token) : "",
      symbol: b.symbol ? String(b.symbol).slice(0, 16) : undefined,
      decimals: parseDecimals(b.decimals),
      endTime: Number(b.endTime) || 0,
      block: Number(b.block) || 0,
      complete: b.complete === true,
      mode,
      entries: checked.entries,
      createdAt: Date.now(),
    };
    // Upsert: the create flow saves twice (funded, then signed). Preserve the
    // slug + creation time across updates; only mint a slug on first save.
    const existing = await store.get(rec.airdrop);
    // First save binds the campaign to whoever signed; updates must be signed by
    // the recorded creator (which also blocks creator-swap on upsert).
    if (!(await verifySig(campaignAuthMessage(rec.airdrop), existing?.creator ?? rec.creator, b.auth))) {
      return { status: 401, json: { error: "missing or invalid creator signature" } };
    }
    if (!existing && !(await verifyOnChainCreator(rec))) {
      return { status: 403, json: { error: "creator does not control this airdrop on-chain" } };
    }
    if (existing) {
      rec.creator = existing.creator;
      rec.slug = existing.slug;
      rec.createdAt = existing.createdAt;
      rec.withdrawn = existing.withdrawn;
    } else if (rec.name) {
      // Named campaigns get a readable URL slug. First-come gets the clean slug;
      // a duplicate name falls back to an address-suffixed slug (still unique).
      const base = slugify(rec.name);
      if (base) {
        if (await store.setSlug(base, rec.airdrop)) rec.slug = base;
        else {
          const alt = `${base}-${rec.airdrop.slice(-4)}`;
          if (await store.setSlug(alt, rec.airdrop)) rec.slug = alt;
        }
      }
    }
    await store.put(rec, existing);
    return { status: 200, json: { ok: true, airdrop: rec.airdrop, slug: rec.slug } };
  }

  // Record a confidential token the user created or wrapped (Portfolio auto-list +
  // Create-page wrapper detection). Only public metadata is stored. Owner-signed:
  // an unauthenticated write here would let anyone plant a malicious "wrapper"
  // record that the Create page offers for one-click shielding.
  if (req.method === "POST" && path.endsWith("/token")) {
    const b = req.body as (Partial<TokenRecord> & { auth?: string }) | undefined;
    if (!b?.address || !b?.owner || !b?.kind) {
      return { status: 400, json: { error: "address, owner and kind are required" } };
    }
    const rec: TokenRecord = {
      address: String(b.address).toLowerCase(),
      owner: String(b.owner).toLowerCase(),
      kind: b.kind === "wrapper" ? "wrapper" : "created",
      name: b.name ? String(b.name).slice(0, 64) : undefined,
      symbol: b.symbol ? String(b.symbol).slice(0, 16) : undefined,
      decimals: parseDecimals(b.decimals),
      underlying: b.underlying ? String(b.underlying).toLowerCase() : undefined,
      createdAt: Date.now(),
    };
    if (!ADDR_RE.test(rec.address) || !ADDR_RE.test(rec.owner) || (rec.underlying && !ADDR_RE.test(rec.underlying))) {
      return { status: 400, json: { error: "invalid address" } };
    }
    if (!(await verifySig(tokenAuthMessage(rec.address), rec.owner, b.auth))) {
      return { status: 401, json: { error: "missing or invalid owner signature" } };
    }
    // A registered token belongs to its first owner - re-registration under a
    // different wallet would silently rewrite the record everyone else reads.
    const existing = await store.getToken(rec.address);
    if (existing && existing.owner !== rec.owner) {
      return { status: 403, json: { error: "token already registered to another owner" } };
    }
    await store.addToken(rec);
    return { status: 200, json: { ok: true } };
  }

  // List the confidential tokens a wallet created/wrapped through Veildrop.
  if (req.method === "GET" && path.endsWith("/tokens")) {
    const owner = req.query.owner?.toLowerCase();
    if (!owner) return { status: 400, json: { error: "owner is required" } };
    const tokens = (await store.listTokens(owner)).sort((a, b) => b.createdAt - a.createdAt);
    return { status: 200, json: { tokens } };
  }

  // Mark a campaign refunded/closed by the sender - blocks recipient claims in
  // the UI. Creator-signed, so a third party can't close someone else's drop.
  if (req.method === "POST" && path.endsWith("/withdrawn")) {
    const b = req.body as { airdrop?: string; auth?: string } | undefined;
    const airdrop = b?.airdrop?.toLowerCase();
    if (!airdrop) return { status: 400, json: { error: "airdrop is required" } };
    const rec = await store.get(airdrop);
    if (!rec) return { status: 404, json: { error: "not found" } };
    if (!(await verifySig(campaignAuthMessage(airdrop), rec.creator, b?.auth))) {
      return { status: 401, json: { error: "missing or invalid creator signature" } };
    }
    rec.withdrawn = true;
    await store.put(rec, rec);
    return { status: 200, json: { ok: true } };
  }

  // List a creator's campaigns (metadata only - the heavy entries are omitted).
  if (req.method === "GET" && path.endsWith("/campaigns")) {
    const creator = req.query.creator?.toLowerCase();
    if (!creator) return { status: 400, json: { error: "creator is required" } };
    const list = await store.listByCreator(creator);
    const lite = list
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ entries, ...rest }) => rest)
      .sort((a, b) => b.createdAt - a.createdAt);
    return { status: 200, json: { campaigns: lite } };
  }

  // A recipient's own allocations across campaigns (connect-and-detect on Claim).
  if (req.method === "GET" && path.endsWith("/claims")) {
    const recipient = req.query.recipient?.toLowerCase();
    if (!recipient) return { status: 400, json: { error: "recipient is required" } };
    const list = await store.listByRecipient(recipient);
    const claims = list
      .map((c) => ({
        airdrop: c.airdrop,
        name: c.name,
        slug: c.slug,
        token: c.token,
        endTime: c.endTime,
        withdrawn: c.withdrawn,
        handle: c.entries[recipient]?.encryptedInput.handle,
      }))
      .filter((c) => !!c.handle)
      .sort((a, b) => b.endTime - a.endTime);
    return { status: 200, json: { claims } };
  }

  // Fetch a single campaign's claim file, by airdrop address or by slug.
  if (req.method === "GET" && path.endsWith("/campaign")) {
    let airdrop = req.query.airdrop?.toLowerCase();
    if (!airdrop && req.query.slug) {
      airdrop = (await store.getBySlug(req.query.slug.toLowerCase())) ?? undefined;
    }
    if (!airdrop) return { status: 400, json: { error: "airdrop or slug is required" } };
    const rec = await store.get(airdrop);
    return rec ? { status: 200, json: rec } : { status: 404, json: { error: "not found" } };
  }

  return { status: 404, json: { error: "unknown route" } };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
