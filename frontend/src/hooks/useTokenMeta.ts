import { isAddress, zeroAddress, type Address } from "viem";
import { useReadContracts } from "wagmi";

import { DEMO_TOKEN, TOKEN_DECIMALS, TOKEN_SYMBOL } from "../lib/config";

const metaAbi = [
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  // ERC-7984 marker: plain ERC-20s don't expose this, so the call's success tells
  // confidential tokens apart from lookalike ERC-20s without an ERC-165 probe.
  {
    type: "function",
    name: "confidentialBalanceOf",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
] as const;

export interface TokenMeta {
  symbol: string;
  decimals: number;
  /** Has readable ERC-20 metadata (symbol). True for plain ERC-20s too. */
  valid: boolean;
  /** Exposes confidentialBalanceOf - an actual ERC-7984 token. */
  confidential: boolean;
  loading: boolean;
  /** Transient read failure (RPC down) - NOT the same as "invalid token". */
  error: boolean;
}

// Read a token's symbol + decimals + ERC-7984-ness. Short-circuits for the demo
// token, and defaults decimals to the demo's (confidential euint64 tokens use few
// decimals) when a token doesn't expose `decimals()`.
export function useTokenMeta(token: string): TokenMeta {
  const isDemo = token.toLowerCase() === DEMO_TOKEN.toLowerCase();
  const enabled = !isDemo && isAddress(token);
  const q = useReadContracts({
    contracts: [
      { address: token as Address, abi: metaAbi, functionName: "symbol" },
      { address: token as Address, abi: metaAbi, functionName: "decimals" },
      { address: token as Address, abi: metaAbi, functionName: "confidentialBalanceOf", args: [zeroAddress] },
    ],
    query: { enabled },
  });

  if (isDemo) {
    return { symbol: TOKEN_SYMBOL, decimals: TOKEN_DECIMALS, valid: true, confidential: true, loading: false, error: false };
  }

  const symbol = q.data?.[0]?.result as string | undefined;
  const decimals = q.data?.[1]?.result as number | undefined;
  return {
    symbol: symbol ?? "",
    decimals: decimals !== undefined ? Number(decimals) : TOKEN_DECIMALS,
    valid: !!symbol,
    confidential: q.data?.[2]?.status === "success",
    loading: enabled && q.isLoading,
    error: enabled && q.isError,
  };
}
