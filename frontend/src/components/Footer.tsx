import { Link } from "react-router-dom";

import { DEMO_TOKEN, explorerAddr } from "../lib/config";
import { LogoMark } from "./Logo";

// Document footer: a slim colophon over a classification strip - nothing like
// a marketing site's link grid.
export function Footer() {
  return (
    <footer className="mt-20">
      <div className="rule-dashed" />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-3">
            <LogoMark size={28} />
            <div>
              <div className="font-display font-black tracking-tight">
                Veil<span className="text-accent">drop</span>
              </div>
              <p className="text-[11px] text-muted max-w-64 leading-relaxed">
                Pay a whole list at once. Every amount stays encrypted on-chain; each recipient decrypts
                only their own.
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs" aria-label="Footer">
            <Link to="/distribute" className="text-fg hover:text-accent transition-colors">
              Distribute
            </Link>
            <Link to="/claim" className="text-fg hover:text-accent transition-colors">
              Claims
            </Link>
            <Link to="/portfolio" className="text-fg hover:text-accent transition-colors">
              Portfolio
            </Link>
            <Link to="/campaigns" className="text-fg hover:text-accent transition-colors">
              Your campaigns
            </Link>
            <Link to="/create" className="text-fg hover:text-accent transition-colors">
              Create a token
            </Link>
            <Link to="/faucet" className="text-fg hover:text-accent transition-colors">
              Faucet
            </Link>
            <Link to="/how-it-works" className="text-fg hover:text-accent transition-colors">
              How it works
            </Link>
          </nav>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs" aria-label="Built on">
            <a href="https://docs.tokenops.xyz" target="_blank" rel="noreferrer" className="text-muted hover:text-accent transition-colors">
              TokenOps SDK ↗
            </a>
            <a
              href="https://docs.zama.org/protocol"
              target="_blank"
              rel="noreferrer"
              className="text-muted hover:text-accent transition-colors"
            >
              Zama Protocol ↗
            </a>
            <a href={`${explorerAddr(DEMO_TOKEN)}#code`} target="_blank" rel="noreferrer" className="text-muted hover:text-accent transition-colors">
              Demo token ↗
            </a>
          </nav>
        </div>
      </div>

      {/* Classification strip */}
      <div className="border-t border-line bg-manila/60">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-center gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-muted">
          <span aria-hidden>—</span>
          <span>Confidential · Sepolia testnet · ERC-7984 · TokenOps SDK</span>
          <span aria-hidden>—</span>
        </div>
      </div>
    </footer>
  );
}
