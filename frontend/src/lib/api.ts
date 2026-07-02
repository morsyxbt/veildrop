import type { Address, Hex } from "viem";

import type { Campaign, ClaimEntry } from "./claimLink";

/** The message the creator wallet signs (EIP-191) to authorize writes to a
 *  campaign's store record. Must stay byte-identical to campaignAuthMessage in
 *  api/_lib/handlers.ts, which verifies it server-side. */
export function campaignAuthMessage(airdrop: string): string {
  return `Veildrop: authorize campaign updates\nAirdrop: ${airdrop.toLowerCase()}`;
}

/** The message the owner wallet signs (EIP-191) to register a created/wrapped
 *  token. Must stay byte-identical to tokenAuthMessage in api/_lib/handlers.ts. */
export function tokenAuthMessage(token: string): string {
  return `Veildrop: register token\nToken: ${token.toLowerCase()}`;
}

// Lightweight campaign metadata (no heavy entries) - used by the dashboard.
export interface CampaignMeta {
  airdrop: Address;
  creator: Address;
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
  createdAt: number;
}

interface FullRecord extends CampaignMeta {
  entries: Record<string, ClaimEntry>;
  withdrawn?: boolean;
}

/** Persist a campaign (index + claim file). Only encrypted handles + signatures
 *  are sent - never cleartext amounts. `auth` is the creator's signature over
 *  campaignAuthMessage(airdrop); the server rejects unsigned writes. */
export async function saveCampaign(input: {
  airdrop: Address;
  creator: Address;
  name?: string;
  count: number;
  token: Address;
  symbol?: string;
  decimals?: number;
  endTime: number;
  block: number;
  complete?: boolean;
  mode?: "airdrop" | "disperse" | "vesting";
  entries: Record<string, ClaimEntry>;
  auth: Hex;
}): Promise<{ slug?: string }> {
  const r = await fetch("/api/campaign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "airdrop", ...input }),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Couldn't save the campaign (${r.status}).`);
  }
  const j = (await r.json().catch(() => ({}))) as { slug?: string };
  return { slug: j.slug };
}

/** Every campaign a wallet created, newest first. */
export async function listCampaigns(creator: Address): Promise<CampaignMeta[]> {
  const r = await fetch(`/api/campaigns?creator=${creator}`);
  if (!r.ok) return [];
  const j = (await r.json()) as { campaigns?: CampaignMeta[] };
  return j.campaigns ?? [];
}

/** Fetch one campaign's claim file (for the claim page). */
export async function getCampaign(airdrop: string): Promise<Campaign | null> {
  const r = await fetch(`/api/campaign?airdrop=${airdrop}`);
  if (!r.ok) return null;
  const rec = (await r.json()) as FullRecord;
  return {
    airdrop: rec.airdrop as Address,
    claims: rec.entries,
    name: rec.name,
    withdrawn: rec.withdrawn,
    symbol: rec.symbol,
    decimals: rec.decimals,
    token: rec.token as Address,
  };
}

/** Fetch a campaign by its readable slug (the /claim/<slug> URL). */
export async function getCampaignBySlug(slug: string): Promise<Campaign | null> {
  const r = await fetch(`/api/campaign?slug=${encodeURIComponent(slug)}`);
  if (!r.ok) return null;
  const rec = (await r.json()) as FullRecord;
  return {
    airdrop: rec.airdrop as Address,
    claims: rec.entries,
    name: rec.name,
    withdrawn: rec.withdrawn,
    symbol: rec.symbol,
    decimals: rec.decimals,
    token: rec.token as Address,
  };
}

// One of a recipient's own allocations (connect-and-detect on the Claim page).
export interface MyClaim {
  airdrop: Address;
  name?: string;
  slug?: string;
  token: string;
  endTime: number;
  withdrawn?: boolean;
  handle: string;
}

/** Mark a campaign refunded/closed by the sender (after a successful withdraw).
 *  `auth` is the creator's signature over campaignAuthMessage(airdrop).
 *  Best-effort by design (errors swallowed): the withdraw itself is on-chain;
 *  this flag only improves what the claim page shows. */
export async function markWithdrawn(airdrop: string, auth: Hex): Promise<void> {
  await fetch("/api/withdrawn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ airdrop, auth }),
  }).catch(() => {});
}

/** Every campaign the connected wallet is a recipient in. */
export async function listMyClaims(recipient: Address): Promise<MyClaim[]> {
  const r = await fetch(`/api/claims?recipient=${recipient}`);
  if (!r.ok) return [];
  const j = (await r.json()) as { claims?: MyClaim[] };
  return j.claims ?? [];
}

// A confidential token a wallet created or wrapped through Veildrop.
export interface TokenMetaRecord {
  address: Address;
  owner: Address;
  kind: "wrapper" | "created";
  name?: string;
  symbol?: string;
  decimals?: number;
  underlying?: string;
  createdAt: number;
}

/** Record a confidential token the connected wallet created/wrapped. `auth` is
 *  the owner's signature over tokenAuthMessage(address); the server rejects
 *  unsigned writes. Best-effort by design: a failed save only costs the
 *  convenience listing - ownership stays enforced on-chain. */
export async function saveToken(input: {
  address: Address;
  owner: Address;
  kind: "wrapper" | "created";
  name?: string;
  symbol?: string;
  decimals?: number;
  underlying?: string;
  auth: Hex;
}): Promise<void> {
  await fetch("/api/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }).catch(() => {});
}

/** Every confidential token a wallet created/wrapped, newest first. */
export async function listTokens(owner: Address): Promise<TokenMetaRecord[]> {
  const r = await fetch(`/api/tokens?owner=${owner}`);
  if (!r.ok) return [];
  const j = (await r.json()) as { tokens?: TokenMetaRecord[] };
  return j.tokens ?? [];
}
