import { fallback, http } from "viem";
import { createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

// Public Sepolia RPCs with automatic failover. Log-driven features (discovery.ts)
// chunk their eth_getLogs queries, so the app works on public endpoints without a
// private key in the bundle. An optional VITE_SEPOLIA_RPC_URL override is tried
// first when present (e.g. a domain-locked dedicated key in production).
const override = import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined;
const wcProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

// WalletConnect's Verify API compares this metadata to the actual page origin -
// a hardcoded domain would flag "unverified" on any other deployment.
const appOrigin = typeof window !== "undefined" ? window.location.origin : "https://veildrop.app";
const appLogo = `${appOrigin}/logo.svg`;

// Injected (MetaMask/Rabby/Brave) + Coinbase always; WalletConnect (mobile /
// QR) activates only when a project id is provided so a missing key can't crash
// the app.
const connectors = [
  injected(),
  coinbaseWallet({ appName: "Veildrop", appLogoUrl: appLogo, preference: "all" }),
  ...(wcProjectId
    ? [
        walletConnect({
          projectId: wcProjectId,
          showQrModal: true,
          metadata: {
            name: "Veildrop",
            description: "Confidential token distribution",
            url: appOrigin,
            icons: [appLogo],
          },
        }),
      ]
    : []),
];

// Several independent public endpoints. viem's fallback rotates to the next on
// error/timeout; `rank` periodically reorders them by latency + stability so the
// healthiest one is preferred during the live demo.
const transports = [
  http("https://ethereum-sepolia-rpc.publicnode.com"),
  http("https://sepolia.gateway.tenderly.co"),
  http("https://1rpc.io/sepolia"),
  http("https://rpc.sepolia.org"),
];

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors,
  transports: {
    [sepolia.id]: fallback(override ? [http(override), ...transports] : transports, {
      rank: { interval: 60_000, sampleCount: 3 },
      retryCount: 2,
    }),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
