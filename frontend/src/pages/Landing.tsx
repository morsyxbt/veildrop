import { motion } from "framer-motion";
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

      <section className="max-w-5xl mx-auto px-4 pt-16 pb-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="tag bg-panel-2 text-accent-2 border border-line">
            Confidential distribution · TokenOps SDK · Zama FHEVM
          </span>
          <h1 className="mt-5 text-5xl md:text-6xl font-black tracking-tight leading-[1.05]">
            Pay a whole list.
            <br />
            <span className="text-accent">Reveal nothing.</span>
          </h1>
          <p className="mt-5 text-muted max-w-2xl mx-auto leading-relaxed">
            Send tokens to a whole list with every amount encrypted on-chain. The list stays private,
            and each recipient can decrypt only their own allocation.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/distribute" className="btn-primary">
              Start a distribution
            </Link>
            <Link to="/claim" className="btn-ghost">
              Claim your allocation
            </Link>
          </div>

          <div className="mt-10 inline-flex items-center gap-3 panel px-5 py-3 font-mono text-sm">
            <span className="text-muted">Contributor payout:</span>
            <span className="text-muted">amount =</span>
            <CipherValue value="4,200.00" hidden chars={8} />
            <span className="text-muted text-xs">(what the chain sees)</span>
          </div>
        </motion.div>
      </section>

      <section className="max-w-5xl mx-auto px-4 pb-24 grid md:grid-cols-3 gap-4">
        <Feature
          title="Disperse"
          body="Push tokens to everyone in one flow - like a private payroll run. Recipients receive instantly into their confidential balance."
        />
        <Feature
          title="Airdrop & claim"
          body="Commit encrypted allocations and share a claim link. Recipients open it, decrypt their own amount, and claim - no one else can see it."
        />
        <Feature
          title="Confidential by default"
          body="Amounts and recipient lists live on-chain as ERC-7984 ciphertext. The protocol moves the tokens without ever seeing the numbers."
        />
      </section>

      <section className="max-w-5xl mx-auto px-4 pb-24">
        <div className="text-center">
          <h2 className="text-2xl font-black tracking-tight">How it works</h2>
          <p className="mt-2 text-sm text-muted">Three steps - amounts stay encrypted the whole way.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <OverviewStep n={1} title="Configure" body="Paste or upload recipients + amounts; set a claim window." />
          <OverviewStep n={2} title="Encrypt & fund" body="Each amount is encrypted to its recipient and funded from your confidential balance." />
          <OverviewStep n={3} title="Claim & decrypt" body="Recipients open their link, decrypt only their own allocation, and claim it." />
        </div>
        <div className="text-center mt-6">
          <Link to="/how-it-works" className="text-accent-2 hover:underline text-sm font-semibold">
            Read the full breakdown →
          </Link>
        </div>
      </section>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel p-5 text-left">
      <div className="font-bold text-accent">{title}</div>
      <p className="mt-2 text-sm text-muted leading-relaxed">{body}</p>
    </div>
  );
}

function OverviewStep({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="panel p-5 text-left">
      <div className="w-7 h-7 rounded-full bg-accent text-onaccent grid place-items-center font-black text-sm">{n}</div>
      <div className="font-bold mt-3">{title}</div>
      <p className="mt-1 text-sm text-muted leading-relaxed">{body}</p>
    </div>
  );
}
