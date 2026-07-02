import { UNIT } from "./config";

/** Format a 6-decimal token amount for display. */
export function fmt6(amount: bigint, maxFraction = 4): string {
  const whole = amount / UNIT;
  const frac = amount % UNIT;
  if (frac === 0n) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(6, "0").slice(0, maxFraction).replace(/0+$/, "");
  return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
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

/** Parse a user-typed decimal into `decimals` units. Returns null when invalid.
 *  Accepts spreadsheet-style digit grouping ("1,500"); rejects values that can't
 *  fit a euint64 (they would only fail later, deep inside encryption). */
export function parseToken(text: string, decimals: number): bigint | null {
  const trimmed = stripDigitGroups(text.trim());
  if (!new RegExp(`^\\d+(\\.\\d{0,${decimals}})?$`).test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const unit = 10n ** BigInt(decimals);
  const v = BigInt(whole) * unit + BigInt(frac.padEnd(decimals, "0") || "0");
  return v < 2n ** 64n ? v : null;
}

/** Remove thousands separators ("1,500,000" -> "1500000") without touching
 *  commas that aren't between digit groups of three. */
export function stripDigitGroups(text: string): string {
  return text.replace(/(\d),(?=\d{3}\b)/g, "$1");
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
