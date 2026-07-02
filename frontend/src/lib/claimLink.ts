import type { Address, Hex } from "viem";

export interface EncryptedInput {
  handle: Hex;
  inputProof: Hex;
}

/** One recipient's claim authorization. */
export interface ClaimEntry {
  encryptedInput: EncryptedInput;
  signature: Hex;
}

/** A whole airdrop: every recipient's entry, keyed by lowercased address. */
export interface Campaign {
  airdrop: Address;
  claims: Record<string, ClaimEntry>;
  name?: string;
  withdrawn?: boolean;
  token?: Address;
  symbol?: string;
  decimals?: number;
}

/** A single resolved claim (one recipient) - used by the portal at claim time. */
export interface ClaimPayload extends ClaimEntry {
  airdrop: Address;
  name?: string;
}

// URL-safe base64 so a small campaign can ride in the URL hash.
function b64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad)));
}

function isEntry(e: unknown): e is ClaimEntry {
  const x = e as ClaimEntry;
  return !!x?.encryptedInput?.handle && !!x.encryptedInput?.inputProof && !!x.signature;
}

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");

// ---- The one link ----

export function encodeCampaign(c: Campaign): string {
  return b64urlEncode(JSON.stringify(c));
}
export function decodeCampaign(encoded: string): Campaign | null {
  try {
    const c = JSON.parse(b64urlDecode(encoded)) as Campaign;
    if (c?.airdrop && c.claims && typeof c.claims === "object") return c;
    return null;
  } catch {
    return null;
  }
}

/** One link, self-contained: the whole campaign rides in the hash (small lists). */
export function portalUrl(c: Campaign): string {
  return `${origin()}/claim#c=${encodeCampaign(c)}`;
}

/** One link backed by a hosted campaign file (any size) - used by the IPFS flow. */
export function hostedUrl(fileUrl: string): string {
  return `${origin()}/claim?c=${encodeURIComponent(fileUrl)}`;
}

/** One link backed by our campaign store - the claim page fetches by airdrop. */
export function backedUrl(airdrop: Address): string {
  return `${origin()}/claim?a=${airdrop}`;
}

/** The nicest claim link for a campaign: a readable slug when we have one,
 *  otherwise the airdrop-address form. */
export function claimLinkFor(c: { slug?: string; airdrop: Address }): string {
  return c.slug ? `${origin()}/claim/${c.slug}` : backedUrl(c.airdrop);
}

/** Find the connected wallet's claim inside a campaign. */
export function entryFor(c: Campaign, address: string): ClaimPayload | null {
  const e = c.claims[address.toLowerCase()];
  return e && isEntry(e) ? { airdrop: c.airdrop, name: c.name, ...e } : null;
}

/** Parse the /claim location into a source the portal can act on. */
export type ClaimSource =
  | { kind: "campaign"; campaign: Campaign }
  | { kind: "backed"; airdrop: Address }
  | { kind: "hosted"; url: string }
  | { kind: "none" };

export function parseClaimLocation(hash: string, search: string): ClaimSource {
  const h = hash.replace(/^#/, "");
  if (h.startsWith("c=")) {
    const c = decodeCampaign(h.slice(2));
    if (c) return { kind: "campaign", campaign: c };
  }
  const params = new URLSearchParams(search);
  const a = params.get("a");
  if (a && /^0x[a-fA-F0-9]{40}$/.test(a)) return { kind: "backed", airdrop: a as Address };
  const url = params.get("c");
  if (url) return { kind: "hosted", url };
  return { kind: "none" };
}
