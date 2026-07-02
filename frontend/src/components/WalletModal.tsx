import { AnimatePresence, motion } from "framer-motion";
import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useConnect, type Connector } from "wagmi";

interface WalletModalCtx {
  open: () => void;
}
const Ctx = createContext<WalletModalCtx>({ open: () => {} });
// Lives beside the provider on purpose; losing HMR fast-refresh here is fine.
// eslint-disable-next-line react-refresh/only-export-components
export const useWalletModal = () => useContext(Ctx);

// Inline brand logos for connectors that don't self-report an icon. EIP-6963
// wallets (MetaMask, Rabby, Trust, OKX…) provide their own via connector.icon.
const svgUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
const COINBASE_LOGO = svgUri(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'><rect width='28' height='28' rx='6' fill='#0052FF'/><circle cx='14' cy='14' r='6.4' fill='none' stroke='#fff' stroke-width='3'/><rect x='11.6' y='11.6' width='4.8' height='4.8' rx='1' fill='#fff'/></svg>`,
);
const WALLETCONNECT_LOGO = svgUri(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'><rect width='28' height='28' rx='6' fill='#3B99FC'/><path fill='#fff' d='M9 12.4c2.8-2.7 7.3-2.7 10 0l.3.3a.2.2 0 0 1 0 .3l-1.1 1a.1.1 0 0 1-.2 0l-.5-.4c-1.9-1.9-5-1.9-6.9 0l-.5.5a.1.1 0 0 1-.2 0l-1.1-1a.2.2 0 0 1 0-.3l.4-.4Zm12.3 2.3 1 1a.2.2 0 0 1 0 .3l-4.5 4.4a.36.36 0 0 1-.5 0l-3.2-3.1a.1.1 0 0 0-.1 0l-3.2 3.1a.36.36 0 0 1-.5 0l-4.5-4.4a.2.2 0 0 1 0-.3l1-1a.36.36 0 0 1 .5 0l3.2 3.1a.1.1 0 0 0 .1 0l3.2-3.1a.36.36 0 0 1 .5 0l3.2 3.1a.1.1 0 0 0 .1 0l3.2-3.1a.36.36 0 0 1 .5 0Z'/></svg>`,
);

// Friendly labels + logos per connector id.
const META: Record<string, { label: string; hint: string; logo?: string }> = {
  injected: { label: "Browser wallet", hint: "MetaMask, Rabby, Brave" },
  metaMaskSDK: { label: "MetaMask", hint: "Browser or mobile" },
  coinbaseWalletSDK: { label: "Coinbase Wallet", hint: "Extension or mobile", logo: COINBASE_LOGO },
  walletConnect: { label: "WalletConnect", hint: "Scan with any mobile wallet", logo: WALLETCONNECT_LOGO },
};

function WalletGlyph() {
  return (
    <span className="grid place-items-center w-7 h-7 rounded-md bg-manila border border-line shrink-0 text-muted">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="2" y="6" width="20" height="14" rx="3" />
        <path d="M16 13h4" strokeLinecap="round" />
        <path d="M4 6.5 6.5 3h9L18 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function WalletModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const { connect, connectors, isPending, error } = useConnect();
  const panelRef = useRef<HTMLDivElement>(null);

  function pick(connector: Connector) {
    connect({ connector }, { onSuccess: () => setIsOpen(false) });
  }

  // Move focus into the dialog on open; return it to the trigger on close. The
  // trigger may be gone by then (the Connect button becomes an address chip after
  // connecting) - fall back to the header so focus doesn't drop to <body>.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
      else document.querySelector<HTMLElement>("header button, header a")?.focus();
    };
  }, [isOpen]);

  // Escape closes; Tab cycles within the dialog instead of escaping it.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input, [tabindex]:not([tabindex='-1'])",
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    // Focus can sit on the panel container itself right after open - treat any
    // position outside the focusable list as an edge, or Shift+Tab escapes.
    const active = document.activeElement as HTMLElement | null;
    const inList = !!active && Array.from(focusables).includes(active);
    if (e.shiftKey && (!inList || active === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (!inList || active === last)) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <Ctx.Provider value={{ open: () => setIsOpen(true) }}>
      {children}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center bg-ink/60 backdrop-blur-sm px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            onKeyDown={onKeyDown}
          >
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="wallet-modal-title"
              tabIndex={-1}
              className="sheet p-5 w-full max-w-sm outline-none"
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div id="wallet-modal-title" className="font-display font-black tracking-tight">
                  Connect a wallet
                </div>
                <button
                  className="text-muted hover:text-fg text-sm px-1"
                  aria-label="Close"
                  onClick={() => setIsOpen(false)}
                >
                  ✕
                </button>
              </div>
              <p className="text-[11px] text-muted mt-1">You'll be connected on the Sepolia testnet.</p>

              <div className="mt-4 space-y-2 max-h-[52vh] overflow-y-auto pr-1">
                {walletList(connectors).map((c) => {
                  const m = META[c.id];
                  const label = m?.label ?? c.name;
                  const hint = m?.hint ?? "";
                  const src = c.icon ?? m?.logo;
                  return (
                    <button
                      key={c.uid}
                      onClick={() => pick(c)}
                      disabled={isPending}
                      className="w-full flex items-center gap-3 bg-manila/50 border border-line hover:border-accent rounded-md px-3 py-3 text-left transition-colors disabled:opacity-60"
                    >
                      {src ? (
                        <img src={src} alt="" className="w-7 h-7 rounded-md shrink-0" />
                      ) : (
                        <WalletGlyph />
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold truncate">{label}</span>
                        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>

              {error && <div className="text-[11px] text-neg mt-3">{cleanErr(error.message)}</div>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

// Drop the generic "Browser wallet" injected connector when specific EIP-6963
// wallets were discovered - they already cover it, with real names + logos.
function walletList(connectors: readonly Connector[]): readonly Connector[] {
  const hasDiscovered = connectors.some((c) => c.id !== "injected" && c.type === "injected");
  return hasDiscovered ? connectors.filter((c) => c.id !== "injected") : connectors;
}

function cleanErr(msg: string): string {
  if (/rejected|denied/i.test(msg)) return "Connection rejected.";
  if (/already/i.test(msg)) return "Already connecting - check your wallet.";
  return msg.split("\n")[0].slice(0, 100);
}
