import { Link } from "react-router-dom";

import { DEMO_TOKEN, explorerAddr } from "../lib/config";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-line mt-16 bg-panel/40">
      <div className="max-w-5xl mx-auto px-4 py-10 grid md:grid-cols-[1.6fr_1fr_1fr] gap-8">
        <div>
          <Logo withTag />
          <p className="text-[11px] text-muted mt-3 leading-relaxed max-w-72">
            Send tokens to a whole list with every amount encrypted on-chain. Recipients decrypt only
            their own allocation.
          </p>
          <div className="flex gap-1.5 mt-3">
            <span className="tag bg-panel-2 text-accent-2 border border-line">Sepolia</span>
            <span className="tag bg-panel-2 text-pos border border-line">ERC-7984</span>
            <span className="tag bg-panel-2 text-accent border border-line">TokenOps SDK</span>
          </div>
        </div>

        <FooterCol
          title="Product"
          links={[
            { label: "Distribute", to: "/distribute" },
            { label: "Claim", to: "/claim" },
            { label: "Faucet", to: "/faucet" },
            { label: "How it works", to: "/how-it-works" },
          ]}
        />
        <FooterCol
          title="Built on"
          links={[
            { label: "TokenOps SDK", href: "https://docs.tokenops.xyz" },
            { label: "ERC-7984 standard", href: "https://docs.zama.org/protocol/examples/openzeppelin-confidential-contracts/erc7984" },
            { label: "Zama Protocol docs", href: "https://docs.zama.org/protocol" },
            { label: "Demo token", href: `${explorerAddr(DEMO_TOKEN)}#code` },
          ]}
        />
      </div>
      <div className="border-t border-line/60">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap justify-between gap-2 text-[10px] text-muted">
          <span>© 2026 Veildrop - Confidential token distribution</span>
          <span>Sepolia testnet · Built with the TokenOps SDK</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; to?: string; href?: string }>;
}) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">{title}</div>
      <ul className="space-y-2 text-xs">
        {links.map((l) => (
          <li key={l.label}>
            {l.to ? (
              <Link to={l.to} className="text-fg hover:text-accent transition-colors">
                {l.label}
              </Link>
            ) : (
              <a href={l.href} target="_blank" rel="noreferrer" className="text-fg hover:text-accent transition-colors">
                {l.label} ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
