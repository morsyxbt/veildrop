import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

import { shortAddr } from "../lib/format";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { useWalletModal } from "./WalletModal";

// The three journeys. Everything else (faucet, create, docs) is reachable from
// inside them, the menu, and the footer.
const LINKS = [
  ["/distribute", "Distribute"],
  ["/claim", "Claims"],
  ["/portfolio", "Portfolio"],
] as const;

const MENU_EXTRAS = [
  ["/campaigns", "Your campaigns"],
  ["/create", "Create a token"],
  ["/faucet", "Faucet"],
  ["/how-it-works", "How it works"],
] as const;

export function Nav() {
  const { address, chainId, isConnected } = useAccount();
  const { open } = useWalletModal();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  // The menu closes via each link's onClick - the only navigation inside it.
  const [menuOpen, setMenuOpen] = useState(false);

  const wrongChain = isConnected && chainId !== sepolia.id;

  // Active route gets a vermillion rubric underline, not a pill.
  const tab = ({ isActive }: { isActive: boolean }) =>
    `relative px-3 py-1.5 text-[13px] font-semibold transition-colors ${
      isActive
        ? "text-fg after:absolute after:left-3 after:right-3 after:-bottom-[3px] after:h-[2px] after:bg-accent"
        : "text-muted hover:text-fg"
    }`;

  const mobileTab = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2.5 rounded-md text-sm font-semibold transition-colors ${
      isActive ? "bg-manila text-fg" : "text-fg hover:bg-panel-2"
    }`;

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-md bg-ink/85"
      style={{ borderBottom: "3px double var(--line)" }}
    >
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <Link to="/" className="shrink-0">
          <Logo size={30} />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to} className={tab}>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {wrongChain && (
            <button className="btn bg-neg text-onaccent text-xs" onClick={() => switchChain({ chainId: sepolia.id })}>
              Switch network
            </button>
          )}
          {isConnected ? (
            <button className="btn-ghost font-mono text-xs" onClick={() => disconnect()}>
              {shortAddr(address!)}
            </button>
          ) : (
            <button className="btn-primary text-xs" onClick={open}>
              Connect
            </button>
          )}
          <button
            className="md:hidden p-2 -mr-1 rounded-md text-fg hover:bg-panel-2 transition-colors"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="md:hidden border-t border-line bg-ink/95 backdrop-blur-md px-4 py-3 space-y-1">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to} className={mobileTab} onClick={() => setMenuOpen(false)}>
              {label}
            </NavLink>
          ))}
          <div className="rule-dashed my-2" />
          {MENU_EXTRAS.map(([to, label]) => (
            <NavLink key={to} to={to} className={mobileTab} onClick={() => setMenuOpen(false)}>
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
