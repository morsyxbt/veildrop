import { UNIT } from "./config";

/** Format a 6-decimal token amount for display. */
export function fmt6(amount: bigint, maxFraction = 4): string {
  const whole = amount / UNIT;
  const frac = amount % UNIT;
  if (frac === 0n) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(6, "0").slice(0, maxFraction).replace(/0+$/, "");
  return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
}

/** Parse a user-typed decimal into 6-decimal units. Returns null when invalid. */
export function parse6(text: string): bigint | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{0,6})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  return BigInt(whole) * UNIT + BigInt(frac.padEnd(6, "0") || "0");
}

/** 6-decimal bigint -> plain input string ("1234.5678", no grouping). */
export function toInputString(v: bigint): string {
  const whole = v / UNIT;
  const frac = (v % UNIT).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

// ---- Generic (arbitrary-decimals) variants for bring-your-own-token ----

/** Format a token amount with `decimals` for display (grouped, trimmed). */
export function fmtToken(amount: bigint, decimals: number, maxFraction = 4): string {
  const unit = 10n ** BigInt(decimals);
  const whole = amount / unit;
  const frac = amount % unit;
  if (frac === 0n) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
}

/** Parse a user-typed decimal into `decimals` units. Returns null when invalid. */
export function parseToken(text: string, decimals: number): bigint | null {
  const trimmed = text.trim();
  if (!new RegExp(`^\\d+(\\.\\d{0,${decimals}})?$`).test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const unit = 10n ** BigInt(decimals);
  return BigInt(whole) * unit + BigInt(frac.padEnd(decimals, "0") || "0");
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
