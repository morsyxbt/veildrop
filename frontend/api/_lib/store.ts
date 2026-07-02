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
  put(rec: CampaignRecord): Promise<void>;
  get(airdrop: string): Promise<CampaignRecord | null>;
  listByCreator(creator: string): Promise<CampaignRecord[]>;
  listByRecipient(recipient: string): Promise<CampaignRecord[]>;
  setSlug(slug: string, airdrop: string): Promise<boolean>;
  getBySlug(slug: string): Promise<string | null>;
  addToken(rec: TokenRecord): Promise<void>;
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

  async function fetchMany(ids: string[]): Promise<CampaignRecord[]> {
    if (!ids.length) return [];
    const vals = await cmd<(string | null)[]>(["MGET", ...ids.map((a) => `campaign:${a}`)]);
    return vals.filter((v): v is string => !!v).map((v) => JSON.parse(v) as CampaignRecord);
  }

  return {
    async put(rec) {
      await cmd(["SET", `campaign:${rec.airdrop}`, JSON.stringify(rec)]);
      await cmd(["SADD", `creator:${rec.creator}`, rec.airdrop]);
      for (const addr of Object.keys(rec.entries)) {
        await cmd(["SADD", `recipient:${addr.toLowerCase()}`, rec.airdrop]);
      }
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
      await cmd(["SET", `token:${rec.address}`, JSON.stringify(rec)]);
      await cmd(["SADD", `owner-tokens:${rec.owner}`, rec.address]);
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
  async put(rec) {
    mem.set(rec.airdrop, rec);
    for (const addr of Object.keys(rec.entries)) {
      const a = addr.toLowerCase();
      if (!memRecipients.has(a)) memRecipients.set(a, new Set());
      memRecipients.get(a)!.add(rec.airdrop);
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
  async listTokens(owner) {
    const ids = memOwnerTokens.get(owner) ?? new Set<string>();
    return [...ids].map((a) => memTokens.get(a)).filter((r): r is TokenRecord => !!r);
  },
};

let cached: Store | null = null;
export function getStore(): Store {
  if (!cached) cached = upstash() ?? memStore;
  return cached;
}
