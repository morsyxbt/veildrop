import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";

import App from "./App";
import { WalletModalProvider } from "./components/WalletModal";
import "./index.css";
import { wagmiConfig } from "./lib/wagmi";
import { zamaRelayer, zamaSigner, zamaStorage } from "./lib/zama";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider relayer={zamaRelayer} signer={zamaSigner} storage={zamaStorage}>
          <WalletModalProvider>
            <App />
          </WalletModalProvider>
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
