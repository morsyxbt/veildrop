import { sepolia } from "wagmi/chains";

export const CHAIN = sepolia;

// Demo confidential token (ConfidentialToken.sol), deployed via deploy/001_token.ts.
// Set VITE_DEMO_TOKEN in frontend/.env after deploying. The faucet mints this token
// so reviewers have something to distribute.
export const DEMO_TOKEN = (import.meta.env.VITE_DEMO_TOKEN ??
  "0xAf3bC39cb178EbCb94047095400A387bC65779Af") as `0x${string}`;

export const TOKEN_SYMBOL = "vUSD";
export const TOKEN_DECIMALS = 6;
export const UNIT = 1_000_000n; // 1 token in 6-decimal units

export const EXPLORER = "https://sepolia.etherscan.io";

export function explorerAddr(addr: string): string {
  return `${EXPLORER}/address/${addr}`;
}
export function explorerTx(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}

// TokenOps confidential airdrop factory on Sepolia - the SDK calls into this to
// create + fund campaigns. Before funding, the sender must authorize it as an
// ERC-7984 operator on the token: token.setOperator(factory, deadline).
export const FHE_AIRDROP_FACTORY = "0xbE6A3B78B36684fFee48De77d47Bc3393F5Acd4c" as `0x${string}`;
// TokenOps confidential disperse singleton on Sepolia - "direct" mode pushes
// encrypted amounts straight to recipients (no claim). Approve it as operator first.
export const DISPERSE_SINGLETON = "0x710dD9885Cc9986EfD234E7719483147a6d8DBb4" as `0x${string}`;
export const OPERATOR_DEADLINE = 2_000_000_000; // uint48 unix seconds (~year 2033)
