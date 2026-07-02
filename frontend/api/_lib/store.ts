// Campaign index + claim-file store. Upstash Redis (REST) in production; an
// in-memory map for local dev when no Upstash creds are set. Only encrypted
// handles + signatures are ever stored here - never cleartext amounts.

export interface StoredEntry {
  encryptedInput: { handle: string; inputProof: string };
  signature: string;
}

export interface CampaignRecord {
  airdrop: string;
  creator: string;
  name?: string;
  count: number;
  token: string;
  symbol?: string;
  decimals?: number;
  endTime: number;
  block: number;
  complete: boolean;
  withdrawn?: boolean;
  mode: "airdrop" | "disperse" | "vesting";
  slug?: string;
  entries: Record<string, StoredEntry>;
  createdAt: number;
}

// A confidential token the user created or wrapped through Veildrop. Lets the
// Portfolio auto-list a wallet's own tokens and the Create page detect whether an
// ERC-20 already has a wrapper. Only public metadata - no encrypted material.
export interface TokenRecord {
  address: string; // lowercased confidential token contract
  owner: string; // lowercased deployer
  kind: "wrapper" | "created";
  name?: string;
  symbol?: string;
  decimals?: number;
  underlying?: string; // wrappers only: the ERC-20 being wrapped (lowercased)
  createdAt: number;
}

interface Store {
  // `prev` (the record being replaced, if any) lets put() drop stale recipient
  // index members when an upsert removes entries.
  put(rec: CampaignRecord, prev?: CampaignRecord | null): Promise<void>;
  get(airdrop: string): Promise<CampaignRecord | null>;
  listByCreator(creator: string): Promise<CampaignRecord[]>;
  listByRecipient(recipient: string): Promise<CampaignRecord[]>;
  setSlug(slug: string, airdrop: string): Promise<boolean>;
  getBySlug(slug: string): Promise<string | null>;
  addToken(rec: TokenRecord): Promise<void>;
  getToken(address: string): Promise<TokenRecord | null>;
  listTokens(owner: string): Promise<TokenRecord[]>;
}

// ---- Upstash Redis over REST (no SDK dependency, runs in Node + Edge) ----
function upstash(): Store | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  async function cmd<T = unknown>(command: (string | number)[]): Promise<T> {
    const r = await fetch(url as string, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(command),
    });
    if (!r.ok) throw new Error(`upstash ${r.status}`);
    return (await r.json()).result as T;
  }

  // All commands in one HTTPS round trip. A campaign save touches one key per
  // recipient; issued sequentially, a few hundred recipients would blow past the
  // serverless time budget - pipelined, it's a single request.
  async function pipeline(commands: (string | number)[][]): Promise<void> {
    if (!commands.length) return;
    const r = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(commands),
    });
    if (!r.ok) throw new Error(`upstash pipeline ${r.status}`);
    const results = (await r.json()) as { error?: string }[];
    const failed = results.find((x) => x && x.error);
    if (failed) throw new Error(`upstash: ${failed.error}`);
  }

  async function fetchMany(ids: string[]): Promise<CampaignRecord[]> {
    if (!ids.length) return [];
    const vals = await cmd<(string | null)[]>(["MGET", ...ids.map((a) => `campaign:${a}`)]);
    return vals.filter((v): v is string => !!v).map((v) => JSON.parse(v) as CampaignRecord);
  }

  return {
    async put(rec, prev) {
      const next = new Set(Object.keys(rec.entries).map((a) => a.toLowerCase()));
      const commands: (string | number)[][] = [
        ["SET", `campaign:${rec.airdrop}`, JSON.stringify(rec)],
        ["SADD", `creator:${rec.creator}`, rec.airdrop],
      ];
      for (const addr of next) commands.push(["SADD", `recipient:${addr}`, rec.airdrop]);
      for (const addr of Object.keys(prev?.entries ?? {})) {
        const a = addr.toLowerCase();
        if (!next.has(a)) commands.push(["SREM", `recipient:${a}`, rec.airdrop]);
      }
      await pipeline(commands);
    },
    async get(airdrop) {
      const v = await cmd<string | null>(["GET", `campaign:${airdrop}`]);
      return v ? (JSON.parse(v) as CampaignRecord) : null;
    },
    async listByCreator(creator) {
      const ids = (await cmd<string[] | null>(["SMEMBERS", `creator:${creator}`])) ?? [];
      return fetchMany(ids);
    },
    async listByRecipient(recipient) {
      const ids = (await cmd<string[] | null>(["SMEMBERS", `recipient:${recipient}`])) ?? [];
      return fetchMany(ids);
    },
    async setSlug(slug, airdrop) {
      // SET NX: claims the slug only if free.
      const r = await cmd<string | null>(["SET", `slug:${slug}`, airdrop, "NX"]);
      return r === "OK";
    },
    async getBySlug(slug) {
      return (await cmd<string | null>(["GET", `slug:${slug}`])) ?? null;
    },
    async addToken(rec) {
      await pipeline([
        ["SET", `token:${rec.address}`, JSON.stringify(rec)],
        ["SADD", `owner-tokens:${rec.owner}`, rec.address],
      ]);
    },
    async getToken(address) {
      const v = await cmd<string | null>(["GET", `token:${address}`]);
      return v ? (JSON.parse(v) as TokenRecord) : null;
    },
    async listTokens(owner) {
      const ids = (await cmd<string[] | null>(["SMEMBERS", `owner-tokens:${owner}`])) ?? [];
      if (!ids.length) return [];
      const vals = await cmd<(string | null)[]>(["MGET", ...ids.map((a) => `token:${a}`)]);
      return vals.filter((v): v is string => !!v).map((v) => JSON.parse(v) as TokenRecord);
    },
  };
}

// ---- In-memory fallback (local dev, no Upstash needed) ----
const mem = new Map<string, CampaignRecord>();
const memSlugs = new Map<string, string>();
const memRecipients = new Map<string, Set<string>>();
const memTokens = new Map<string, TokenRecord>();
const memOwnerTokens = new Map<string, Set<string>>();
const memStore: Store = {
  async put(rec, prev) {
    mem.set(rec.airdrop, rec);
    const next = new Set(Object.keys(rec.entries).map((a) => a.toLowerCase()));
    for (const a of next) {
      if (!memRecipients.has(a)) memRecipients.set(a, new Set());
      memRecipients.get(a)!.add(rec.airdrop);
    }
    for (const addr of Object.keys(prev?.entries ?? {})) {
      const a = addr.toLowerCase();
      if (!next.has(a)) memRecipients.get(a)?.delete(rec.airdrop);
    }
  },
  async get(airdrop) {
    return mem.get(airdrop) ?? null;
  },
  async listByCreator(creator) {
    return [...mem.values()].filter((r) => r.creator === creator);
  },
  async listByRecipient(recipient) {
    const ids = memRecipients.get(recipient) ?? new Set<string>();
    return [...ids].map((a) => mem.get(a)).filter((r): r is CampaignRecord => !!r);
  },
  async setSlug(slug, airdrop) {
    if (memSlugs.has(slug)) return false;
    memSlugs.set(slug, airdrop);
    return true;
  },
  async getBySlug(slug) {
    return memSlugs.get(slug) ?? null;
  },
  async addToken(rec) {
    memTokens.set(rec.address, rec);
    if (!memOwnerTokens.has(rec.owner)) memOwnerTokens.set(rec.owner, new Set());
    memOwnerTokens.get(rec.owner)!.add(rec.address);
  },
  async getToken(address) {
    return memTokens.get(address) ?? null;
  },
  async listTokens(owner) {
    const ids = memOwnerTokens.get(owner) ?? new Set<string>();
    return [...ids].map((a) => memTokens.get(a)).filter((r): r is TokenRecord => !!r);
  },
};

let cached: Store | null = null;
export function getStore(): Store {
  if (!cached) {
    const up = upstash();
    // On Vercel each route is its own lambda with its own memory, so the memory
    // fallback would "accept" writes that other routes can never read. Fail loudly
    // instead; handleApi turns this into a 500 with a clear message.
    if (!up && process.env.VERCEL) {
      throw new Error("storage not configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
    }
    cached = up ?? memStore;
  }
  return cached;
}
