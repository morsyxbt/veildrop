import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";
import { CipherValue } from "../components/viz/CipherValue";

export function Landing() {
  return (
    <div className="relative overflow-hidden">
      <header className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Logo size={30} />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/distribute" className="btn-primary text-xs">
            Open app
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 pt-16 pb-14 text-center">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="stamp text-accent">Confidential</span>
          <h1 className="mt-6 font-display text-5xl md:text-7xl font-black tracking-tight leading-[1.02]">
            Pay a whole list.
            <br />
            Reveal <span className="text-accent">nothing.</span>
          </h1>
          <p className="mt-5 text-muted max-w-xl mx-auto leading-relaxed">
            Payroll, grants, airdrops - every amount lands on-chain as ERC-7984 ciphertext. Each
            recipient decrypts only their own allocation. Everyone else sees a redaction.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/distribute" className="btn-primary">
              Start a distribution
            </Link>
            <Link to="/claim" className="btn-ghost">
              Check your mail
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Live encrypt demo - type a number, watch the chain go blind. */}
      <section className="max-w-3xl mx-auto px-4 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <EncryptDemo />
        </motion.div>
      </section>

      {/* The two flows + the guarantee */}
      <section className="max-w-5xl mx-auto px-4 pb-20 grid md:grid-cols-3 gap-4">
        <Feature
          stamp="PUSH"
          title="Disperse"
          body="Send to everyone in one transaction - a private payroll run. Tokens land straight in each confidential balance, no claim step."
        />
        <Feature
          stamp="CLAIM"
          title="Airdrop"
          body="Seal an allocation for every address and share one link. Each recipient opens it, sees only their own amount, and claims."
        />
        <Feature
          stamp="SEALED"
          title="Confidential by default"
          body="Amounts live on-chain as ERC-7984 ciphertext. The protocol moves the tokens without ever seeing the numbers."
        />
      </section>

      {/* The paper trail */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="text-center">
          <h2 className="font-display text-3xl font-black tracking-tight">The paper trail</h2>
          <p className="mt-2 text-sm text-muted">Three steps - the numbers stay sealed the whole way.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4 mt-8">
          <Step n="§1" title="Draft the list" body="Paste or upload recipients and amounts - a payroll run, a grant round, an investor unlock. Push it directly or set a claim window." />
          <Step n="§2" title="Seal & fund" body="Every amount is encrypted to its recipient and the drop is funded from your confidential balance." />
          <Step n="§3" title="Open & decrypt" body="Recipients open their link, break the seal on their own allocation, and claim it. No one else can read it." />
        </div>
        <div className="text-center mt-8">
          <Link to="/how-it-works" className="link text-sm font-semibold">
            Read the full breakdown →
          </Link>
        </div>
      </section>

      {/* First-run strip */}
      <section className="max-w-3xl mx-auto px-4 pb-24">
        <div className="sheet p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label">New here?</div>
            <p className="text-sm text-muted mt-1">
              Sepolia ETH from any faucet, demo vUSD from ours - then run a real sealed drop end to end.
              No contracts to deploy, no keys to manage.
            </p>
          </div>
          <Link to="/faucet" className="btn-ghost text-sm shrink-0">
            Mint demo tokens →
          </Link>
        </div>
      </section>
    </div>
  );
}

/**
 * The hero's proof: a payroll line the visitor can type into. The left side is
 * their ledger; the right side is what Etherscan will ever know.
 */
function EncryptDemo() {
  const [amt, setAmt] = useState("4,200");

  // A deterministic pseudo-handle derived from the input, so typing visibly
  // "re-encrypts". Purely cosmetic - real handles come from the Zama relayer.
  const handle = useMemo(() => {
    let h = 0x9e3779b9 ^ amt.length;
    for (const c of amt) h = Math.imul(h ^ c.charCodeAt(0), 0x85ebca6b) >>> 0;
    const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
    return `0x${hex(h)}${hex(Math.imul(h, 0xc2b2ae35))}`;
  }, [amt]);

  return (
    <div className="sheet overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <span className="label">Try it - type any amount</span>
        <span className="tag border-line text-muted">simulation</span>
      </div>

      <div className="grid sm:grid-cols-[1fr_auto_1fr]">
        {/* Your ledger */}
        <div className="p-5">
          <div className="label mb-2">Your ledger</div>
          <div className="flex items-center justify-between gap-3 text-sm font-mono">
            <span className="text-muted">nick.eth</span>
            <span className="flex items-center gap-1">
              <input
                aria-label="Amount to encrypt"
                className="input text-right w-28 py-1.5"
                value={amt}
                onChange={(e) => setAmt(e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))}
              />
              <span className="text-muted">vUSD</span>
            </span>
          </div>
        </div>

        {/* The seal */}
        <div className="grid place-items-center px-2 py-3 sm:py-0" aria-hidden>
          <div className="flex sm:flex-col items-center gap-1 text-muted">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em]">FHE</span>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-accent">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span className="text-[10px] font-mono uppercase tracking-[0.18em]">encrypt</span>
          </div>
        </div>

        {/* What the chain stores */}
        <div className="p-5 bg-manila/50 sm:border-l border-t sm:border-t-0 border-line">
          <div className="label mb-2">On-chain, forever</div>
          <div className="flex items-center justify-between gap-3 text-sm font-mono">
            <span className="text-muted">nick.eth</span>
            <CipherValue value="0" hidden chars={Math.max(4, Math.min(10, amt.length + 2))} />
          </div>
          <div className="mt-2 text-[10px] font-mono text-muted truncate" title="ciphertext handle">
            handle: {handle}…
          </div>
        </div>
      </div>

      <div className="px-5 py-2.5 border-t border-line text-center text-[11px] text-muted">
        That bar is all Etherscan, your competitors, or anyone else will ever see.
      </div>
    </div>
  );
}

function Feature({ stamp, title, body }: { stamp: string; title: string; body: string }) {
  return (
    <div className="panel p-5 text-left">
      <div className="flex items-center justify-between">
        <div className="font-display font-black text-lg">{title}</div>
        <span className="stamp text-muted text-[9px]">{stamp}</span>
      </div>
      <p className="mt-2 text-sm text-muted leading-relaxed">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="panel p-5 text-left">
      <div className="font-display font-black text-accent text-xl">{n}</div>
      <div className="font-bold mt-2">{title}</div>
      <p className="mt-1 text-sm text-muted leading-relaxed">{body}</p>
    </div>
  );
}
