import { isAddress, type Address } from "viem";
import { useReadContracts } from "wagmi";

import { DEMO_TOKEN, TOKEN_DECIMALS, TOKEN_SYMBOL } from "../lib/config";

const metaAbi = [
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
] as const;

export interface TokenMeta {
  symbol: string;
  decimals: number;
  valid: boolean;
  loading: boolean;
}

// Read an ERC-7984 token's symbol + decimals. Short-circuits for the demo token,
// and defaults decimals to the demo's (confidential euint64 tokens use few
// decimals) when a token doesn't expose `decimals()`.
export function useTokenMeta(token: string): TokenMeta {
  const isDemo = token.toLowerCase() === DEMO_TOKEN.toLowerCase();
  const enabled = !isDemo && isAddress(token);
  const q = useReadContracts({
    contracts: [
      { address: token as Address, abi: metaAbi, functionName: "symbol" },
      { address: token as Address, abi: metaAbi, functionName: "decimals" },
    ],
    query: { enabled },
  });

  if (isDemo) return { symbol: TOKEN_SYMBOL, decimals: TOKEN_DECIMALS, valid: true, loading: false };

  const symbol = q.data?.[0]?.result as string | undefined;
  const decimals = q.data?.[1]?.result as number | undefined;
  return {
    symbol: symbol ?? "",
    decimals: decimals !== undefined ? Number(decimals) : TOKEN_DECIMALS,
    valid: !!symbol,
    loading: enabled && q.isLoading,
  };
}
