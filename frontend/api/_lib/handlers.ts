import { recoverMessageAddress, type Hex } from "viem";

import { getStore, type CampaignRecord, type TokenRecord } from "./store";

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

// Campaign writes are gated by an EIP-191 signature from the creator wallet over
// this message, so a third party can't overwrite a campaign's claim file or flag
// it withdrawn. Must stay byte-identical to campaignAuthMessage in src/lib/api.ts.
function campaignAuthMessage(airdrop: string): string {
  return `Veildrop: authorize campaign updates\nAirdrop: ${airdrop.toLowerCase()}`;
}

// EOA recovery only (smart-contract wallets can't sign this way - acceptable for
// the demo trust model, documented in the README).
async function verifyAuth(airdrop: string, expectedCreator: string, auth: unknown): Promise<boolean> {
  if (typeof auth !== "string" || !auth.startsWith("0x")) return false;
  try {
    const recovered = await recoverMessageAddress({
      message: campaignAuthMessage(airdrop),
      signature: auth as Hex,
    });
    return recovered.toLowerCase() === expectedCreator.toLowerCase();
  } catch {
    return false;
  }
}

// One entry point for every /api route, used by both the Vercel functions and
// the local Vite dev middleware.
export async function handleApi(req: ApiRequest): Promise<ApiResult> {
  const store = getStore();
  const path = req.path.replace(/\/+$/, "");

  // Save a campaign (index + claim file). Requires the creator's auth signature.
  if (req.method === "POST" && path.endsWith("/campaign")) {
    const b = req.body as (Partial<CampaignRecord> & { auth?: string }) | undefined;
    if (!b?.airdrop || !b?.creator || !b?.entries) {
      return { status: 400, json: { error: "airdrop, creator and entries are required" } };
    }
    const rec: CampaignRecord = {
      airdrop: String(b.airdrop).toLowerCase(),
      creator: String(b.creator).toLowerCase(),
      name: b.name ? String(b.name).slice(0, 64) : undefined,
      count: Number(b.count) || Object.keys(b.entries).length,
      token: b.token ? String(b.token) : "",
      symbol: b.symbol ? String(b.symbol) : undefined,
      decimals: Number(b.decimals) || undefined,
      endTime: Number(b.endTime) || 0,
      block: Number(b.block) || 0,
      complete: b.complete === true,
      mode: (["airdrop", "disperse", "vesting"].includes(String(b.mode)) ? b.mode : "airdrop") as CampaignRecord["mode"],
      entries: b.entries as CampaignRecord["entries"],
      createdAt: Date.now(),
    };
    // Upsert: the create flow saves twice (funded, then signed). Preserve the
    // slug + creation time across updates; only mint a slug on first save.
    const existing = await store.get(rec.airdrop);
    // First save binds the campaign to whoever signed; updates must be signed by
    // the recorded creator (which also blocks creator-swap on upsert).
    if (!(await verifyAuth(rec.airdrop, existing?.creator ?? rec.creator, b.auth))) {
      return { status: 401, json: { error: "missing or invalid creator signature" } };
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
    await store.put(rec);
    return { status: 200, json: { ok: true, airdrop: rec.airdrop, slug: rec.slug } };
  }

  // Record a confidential token the user created or wrapped (Portfolio auto-list +
  // Create-page wrapper detection). Only public metadata is stored.
  if (req.method === "POST" && path.endsWith("/token")) {
    const b = req.body as Partial<TokenRecord> | undefined;
    if (!b?.address || !b?.owner || !b?.kind) {
      return { status: 400, json: { error: "address, owner and kind are required" } };
    }
    const rec: TokenRecord = {
      address: String(b.address).toLowerCase(),
      owner: String(b.owner).toLowerCase(),
      kind: b.kind === "wrapper" ? "wrapper" : "created",
      name: b.name ? String(b.name).slice(0, 64) : undefined,
      symbol: b.symbol ? String(b.symbol).slice(0, 16) : undefined,
      decimals: Number(b.decimals) || undefined,
      underlying: b.underlying ? String(b.underlying).toLowerCase() : undefined,
      createdAt: Date.now(),
    };
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
    if (!(await verifyAuth(airdrop, rec.creator, b?.auth))) {
      return { status: 401, json: { error: "missing or invalid creator signature" } };
    }
    rec.withdrawn = true;
    await store.put(rec);
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
