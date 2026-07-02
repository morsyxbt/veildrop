import { RelayerWeb, indexedDBStorage } from "@zama-fhe/react-sdk";
import type { GenericSigner } from "@zama-fhe/sdk";
import { SepoliaConfig } from "@zama-fhe/sdk";

import { wagmiConfig } from "./wagmi";
// Local copy of WagmiSigner - the published @zama-fhe/react-sdk/wagmi adapter
// imports a non-existent wagmi action (`watchConnection`) and breaks the build.
import { WagmiSigner } from "./zamaSigner";

// The relayer needs a single RPC URL (not a fallback array). Reads/writes still
// go through wagmi's multi-RPC fallback; only relayer traffic uses this one.
const RELAYER_RPC =
  (import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) ??
  "https://ethereum-sepolia-rpc.publicnode.com";

// Signs decryption sessions + transactions through the connected wagmi wallet.
export const zamaSigner = new WagmiSigner({ config: wagmiConfig }) as unknown as GenericSigner;

// Talks to the public Zama Sepolia relayer for encryption/decryption.
// SepoliaConfig carries the relayer URL + on-chain coprocessor addresses; we
// only override the RPC endpoint.
export const zamaRelayer = new RelayerWeb({
  getChainId: () => zamaSigner.getChainId(),
  transports: {
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      network: RELAYER_RPC,
    },
  },
});

// Persist the ML-KEM keypair across reloads so users don't re-derive it.
export const zamaStorage = indexedDBStorage;
