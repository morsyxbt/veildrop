import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { CipherValue } from "../components/viz/CipherValue";

export function HowItWorks() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-14">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <span className="tag bg-panel-2 text-accent-2 border border-line">How it works</span>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Confidential distribution, end to end</h1>
        <p className="mt-3 text-muted leading-relaxed">
          Veildrop pays a whole list at once while every amount stays encrypted on-chain. The protocol
          moves the funds without ever seeing the numbers - only each recipient can decrypt their own
          allocation.
        </p>
      </motion.section>

      {/* The core idea */}
      <section className="panel p-6">
        <div className="grid sm:grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">What you set</div>
            <div className="text-2xl font-black mt-1">
              4,200 <span className="text-muted text-base">vUSD</span>
            </div>
          </div>
          <div className="text-accent text-2xl font-black">→</div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">What the chain stores</div>
            <div className="text-2xl font-black mt-1 text-accent-2">
              <CipherValue value="4200" hidden chars={10} />
            </div>
          </div>
        </div>
        <p className="text-xs text-muted text-center mt-3">
          Same number - encrypted as an ERC-7984 ciphertext the moment it touches the chain.
        </p>
      </section>

      <Section title="The flow">
        <div className="grid md:grid-cols-3 gap-4">
          <Step n={1} title="Configure" body="Paste or upload recipients + amounts, and set a claim window." />
          <Step
            n={2}
            title="Encrypt & fund"
            body="Each amount is encrypted to its recipient, and the airdrop is funded from your confidential balance - one signature per recipient."
          />
          <Step
            n={3}
            title="Claim & decrypt"
            body="Recipients open their link, decrypt only their own allocation, and claim it. No one else can read it."
          />
        </div>
      </Section>

      <Section title="Two ways to distribute">
        <div className="grid sm:grid-cols-2 gap-4">
          <Card title="Airdrop · claim" body="Allocate encrypted amounts and share a link; recipients verify + claim themselves. Best for community rewards, grants, broad drops." />
          <Card title="Disperse · push" body="Send straight to everyone in one flow, no claim step. Best for payroll and team payouts." />
        </div>
      </Section>

      <Section title="One link, any size">
        <div className="grid sm:grid-cols-2 gap-4">
          <Card title="Share one link" body="Every recipient opens the same URL, connects their wallet, and only their own allocation appears. Amounts stay encrypted, and a leaked link can never move funds." />
          <Card title="Scales with hosting" body="Small drops ride entirely in the link; larger ones store the campaign file off-chain (e.g. IPFS) so the link stays short. The on-chain claim is identical either way." />
        </div>
      </Section>

      <Section title="What's private, what's visible">
        <div className="grid sm:grid-cols-3 gap-4">
          <Pill tone="pos" title="Always encrypted" body="Every allocation amount. Only the recipient can decrypt theirs." />
          <Pill tone="accent-2" title="Visible" body="Recipient addresses become visible on-chain when someone claims - Zama keeps amounts confidential, not identities." />
          <Pill tone="neg" title="Your secret" body="Your wallet key - it signs the campaign and is the only thing that can refund. Never shared." />
        </div>
      </Section>

      <Section title="Recovery & refund">
        <ul className="space-y-2 text-sm text-muted">
          <li>
            <strong className="text-fg">Refund anywhere:</strong> reconnect your wallet on any device and
            the app reads every airdrop you created straight from the chain - no stored data - and lets
            you withdraw unclaimed funds to your wallet or any address, anytime.
          </li>
          <li>
            <strong className="text-fg">Links are shown once:</strong> claim links live only in the link
            itself, and nothing is stored in your browser. Save them the moment you create a campaign.
          </li>
          <li>
            <strong className="text-fg">Lost the links?</strong> your funds are always safe - you're the
            on-chain admin. Refund the campaign and create it again with fresh links.
          </li>
        </ul>
      </Section>

      <section className="panel p-6">
        <div className="text-[11px] uppercase tracking-wider text-muted">Built on</div>
        <div className="flex flex-wrap gap-2 mt-2">
          <a className="tag bg-panel-2 text-accent border border-line" href="https://docs.tokenops.xyz" target="_blank" rel="noreferrer">
            TokenOps SDK ↗
          </a>
          <a
            className="tag bg-panel-2 text-pos border border-line"
            href="https://docs.zama.org/protocol/examples/openzeppelin-confidential-contracts/erc7984"
            target="_blank"
            rel="noreferrer"
          >
            ERC-7984 ↗
          </a>
          <a className="tag bg-panel-2 text-accent-2 border border-line" href="https://docs.zama.org/protocol" target="_blank" rel="noreferrer">
            Zama Protocol ↗
          </a>
        </div>
      </section>

      <div className="text-center">
        <Link to="/distribute" className="btn-primary">
          Start a distribution
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-black tracking-tight mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="panel p-5">
      <div className="w-7 h-7 rounded-full bg-accent text-onaccent grid place-items-center font-black text-sm">{n}</div>
      <div className="font-bold mt-3">{title}</div>
      <p className="text-sm text-muted mt-1 leading-relaxed">{body}</p>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel p-5">
      <div className="font-bold text-accent">{title}</div>
      <p className="text-sm text-muted mt-1 leading-relaxed">{body}</p>
    </div>
  );
}

function Pill({ tone, title, body }: { tone: "pos" | "neg" | "accent-2"; title: string; body: string }) {
  const color = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-accent-2";
  return (
    <div className="panel p-4">
      <div className={`font-bold text-sm ${color}`}>{title}</div>
      <p className="text-[12px] text-muted mt-1 leading-relaxed">{body}</p>
    </div>
  );
}
