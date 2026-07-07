import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";
import { CipherValue } from "../components/viz/CipherValue";

const fade = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5 },
};

export function Landing() {
  return (
    <div className="relative overflow-hidden">
      <PillNav />

      <main className="relative">
        <Hero />
        <section className="max-w-4xl mx-auto px-4 pb-8">
          <motion.div {...fade}>
            <EncryptDemo />
          </motion.div>
        </section>
        <Bento />
        <HowItWorks />
        <Faq />
        <FinalStrip />
      </main>
    </div>
  );
}

/* --------------------------------- Nav --------------------------------- */

function PillNav() {
  return (
    <div className="sticky top-0 z-40 px-4 pt-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel/80 backdrop-blur-xl pl-4 pr-2.5 py-2 shadow-[0_6px_24px_-16px_rgba(17,19,20,0.4)]">
          <Link to="/" className="shrink-0">
            <Logo size={28} />
          </Link>
          <nav className="hidden sm:flex items-center gap-6 text-[13px] font-semibold text-muted">
            <a href="#product" className="hover:text-fg transition-colors">
              Product
            </a>
            <a href="#how" className="hover:text-fg transition-colors">
              How it works
            </a>
            <a href="#faq" className="hover:text-fg transition-colors">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/distribute" className="btn-primary text-xs">
              Open app
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Hero -------------------------------- */

function Hero() {
  return (
    <section className="relative max-w-4xl mx-auto px-4 pt-16 pb-12 text-center">
      {/* ambient floating marks */}
      <FloatingMarks />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="relative"
      >
        <span className="stamp text-accent-2">Confidential distribution</span>
        <h1 className="mt-6 font-display text-[3.25rem] leading-[0.98] sm:text-7xl font-bold tracking-tight text-balance">
          Pay a whole list.
          <br />
          Reveal{" "}
          <span className="relative inline-block">
            <span className="relative z-10">nothing.</span>
            <span className="absolute inset-x-[-6px] bottom-1 h-4 sm:h-6 bg-accent -z-0 rounded-[3px]" />
          </span>
        </h1>
        <p className="mt-6 text-muted max-w-xl mx-auto leading-relaxed">
          Payroll, grants, airdrops — every amount lands on-chain as ERC-7984 ciphertext. Each
          recipient decrypts only their own allocation. Everyone else sees a redaction.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/distribute" className="btn-primary">
            Start a distribution
          </Link>
          <Link to="/claim" className="btn-dark">
            Check your mail
          </Link>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-muted">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-pos" />
          Live on Sepolia
          <span className="opacity-40">·</span>
          TokenOps SDK
          <span className="opacity-40">·</span>
          Zama FHEVM
        </div>
      </motion.div>
    </section>
  );
}

function FloatingMarks() {
  const marks = [
    { l: "8%", t: "12%", r: -8, d: 0 },
    { l: "86%", t: "20%", r: 10, d: 0.4 },
    { l: "14%", t: "62%", r: 7, d: 0.8 },
    { l: "82%", t: "68%", r: -6, d: 1.1 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 hidden md:block">
      {marks.map((m, i) => (
        <motion.div
          key={i}
          className="absolute grid place-items-center w-11 h-11 rounded-xl border border-line bg-panel shadow-[0_10px_30px_-18px_rgba(17,19,20,0.5)]"
          style={{ left: m.l, top: m.t, rotate: `${m.r}deg` }}
          animate={{ y: [0, -9, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: m.d }}
        >
          <LockGlyph />
        </motion.div>
      ))}
    </div>
  );
}

/* --------------------------- Live encrypt demo -------------------------- */

function EncryptDemo() {
  const [amt, setAmt] = useState("4,200");

  const handle = useMemo(() => {
    let h = 0x9e3779b9 ^ amt.length;
    for (const c of amt) h = Math.imul(h ^ c.charCodeAt(0), 0x85ebca6b) >>> 0;
    const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
    return `0x${hex(h)}${hex(Math.imul(h, 0xc2b2ae35))}`;
  }, [amt]);

  return (
    <div className="sheet overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-line">
        <span className="label">Try it — type any amount</span>
        <span className="tag border-line text-muted">simulation</span>
      </div>

      <div className="grid sm:grid-cols-[1fr_auto_1fr]">
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

        <div className="grid place-items-center px-2 py-3 sm:py-0" aria-hidden>
          <div className="flex sm:flex-col items-center gap-1 text-muted">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em]">FHE</span>
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className="text-accent-2"
            >
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span className="text-[10px] font-mono uppercase tracking-[0.18em]">encrypt</span>
          </div>
        </div>

        <div className="p-5 bg-manila/40 sm:border-l border-t sm:border-t-0 border-line">
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

/* --------------------------------- Bento -------------------------------- */

function Bento() {
  return (
    <section id="product" className="max-w-5xl mx-auto px-4 pt-10 pb-6">
      <motion.div {...fade} className="text-center mb-8">
        <span className="stamp text-muted">Product</span>
        <h2 className="mt-4 font-display text-4xl sm:text-5xl font-bold tracking-tight text-balance">
          Distribution without disclosure
        </h2>
      </motion.div>

      <motion.div {...fade} className="grid gap-3 md:grid-cols-6 md:auto-rows-[minmax(0,1fr)]">
        {/* Big yellow CTA card */}
        <div className="md:col-span-3 md:row-span-2 rounded-2xl bg-accent text-onaccent p-6 flex flex-col justify-between overflow-hidden relative">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-70">Start a distribution</div>
            <p className="mt-3 text-2xl font-display font-bold leading-tight max-w-xs">
              Airdrop, vesting, or a one-transaction disperse.
            </p>
          </div>
          <div className="mt-6">
            <TicketFan />
            <Link
              to="/distribute"
              className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-onaccent text-panel px-4 py-2.5 text-sm font-semibold"
            >
              Open the app
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        {/* Amounts stay encrypted */}
        <div className="md:col-span-3 rounded-2xl border border-line bg-panel p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-lg font-bold">Amounts stay encrypted</div>
              <p className="mt-1.5 text-sm text-muted leading-relaxed max-w-sm">
                Recipient addresses are public; every allocation is sealed as ciphertext only its
                owner can decrypt.
              </p>
            </div>
            <EyeOff />
          </div>
          <div className="mt-4 space-y-2">
            <LockRow addr="0x7A4…F2" />
            <LockRow addr="0x19C…8B" />
            <LockRow addr="0xE3d…04" />
          </div>
        </div>

        {/* Stats */}
        <div className="md:col-span-3 rounded-2xl border border-line bg-panel p-6">
          <div className="font-display text-lg font-bold">Encrypted, still fast</div>
          <p className="mt-1.5 text-sm text-muted">Confidential transfers with a normal wallet flow.</p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <StatBadge big="1 tx" label="Disperse" />
            <StatBadge big="100%" label="Encrypted" filled />
            <StatBadge big="1 sig" label="To claim" />
          </div>
        </div>
      </motion.div>

      {/* Second row: two flows + built-on */}
      <motion.div {...fade} className="grid gap-3 md:grid-cols-3 mt-3">
        <FlowCard
          title="Disperse"
          tag="Push"
          body="Send to everyone in one transaction — a private payroll run. Tokens land straight in each confidential balance, no claim step."
        />
        <FlowCard
          title="Airdrop"
          tag="Claim"
          body="Seal an allocation for every address and share one link. Each recipient opens it, sees only their own amount, and claims."
        />
        <div className="rounded-2xl border border-line bg-panel p-6">
          <div className="stamp text-muted">Built on</div>
          <ul className="mt-4 space-y-2.5 text-sm font-semibold">
            {["ERC-7984", "TokenOps SDK", "Zama FHEVM"].map((x) => (
              <li key={x} className="flex items-center gap-2.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
                {x}
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </section>
  );
}

/* ------------------------------ How it works --------------------------- */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Draft the list",
      body: "Paste or upload recipients and amounts — a payroll run, a grant round, an investor unlock. Push it directly or set a claim window.",
    },
    {
      n: "02",
      title: "Seal & fund",
      body: "Every amount is encrypted to its recipient and the drop is funded from your confidential balance.",
    },
    {
      n: "03",
      title: "Open & decrypt",
      body: "Recipients open their link, break the seal on their own allocation, and claim it. No one else can read it.",
    },
  ];
  return (
    <section id="how" className="max-w-5xl mx-auto px-4 pt-12 pb-6">
      <motion.div {...fade} className="text-center mb-8">
        <span className="stamp text-muted">How it works</span>
        <h2 className="mt-4 font-display text-4xl sm:text-5xl font-bold tracking-tight">
          From upload to claim
        </h2>
      </motion.div>
      <motion.div {...fade} className="grid md:grid-cols-3 gap-3">
        {steps.map((s) => (
          <div key={s.n} className="rounded-2xl border border-line bg-panel p-6">
            <div className="inline-grid place-items-center w-10 h-10 rounded-xl bg-accent text-onaccent font-display font-bold">
              {s.n}
            </div>
            <div className="mt-4 font-display text-lg font-bold">{s.title}</div>
            <p className="mt-1.5 text-sm text-muted leading-relaxed">{s.body}</p>
          </div>
        ))}
      </motion.div>
      <div className="text-center mt-8">
        <Link to="/how-it-works" className="link text-sm font-semibold">
          Read the full breakdown →
        </Link>
      </div>
    </section>
  );
}

/* --------------------------------- FAQ --------------------------------- */

const FAQS = [
  {
    q: "What exactly stays private?",
    a: "Every allocation amount. Recipient addresses are public on-chain, but the number attached to each one is sealed as ciphertext — only that recipient can decrypt it.",
  },
  {
    q: "Who can decrypt an allocation?",
    a: "Only the recipient. Decryption is authorized per-address through an EIP-712 signature, so no one else — not even the sender — can read someone else's amount.",
  },
  {
    q: "What can Veildrop distribute?",
    a: "Any ERC-7984 confidential token. You can wrap an existing ERC-20 into one, or mint demo vUSD from the faucet to try a full run end to end.",
  },
  {
    q: "What is it built on?",
    a: "The TokenOps SDK for the airdrop/disperse logic and the Zama FHEVM for client-side encryption and decryption. It runs live on the Sepolia testnet.",
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="max-w-3xl mx-auto px-4 pt-12 pb-6">
      <motion.div {...fade} className="text-center mb-8">
        <span className="stamp text-muted">Got questions</span>
        <h2 className="mt-4 font-display text-4xl sm:text-5xl font-bold tracking-tight">
          We have answers
        </h2>
      </motion.div>
      <motion.div {...fade} className="space-y-2.5">
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="rounded-2xl border border-line bg-panel overflow-hidden">
              <button
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
              >
                <span className="font-semibold text-[15px]">{f.q}</span>
                <span
                  className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-fg text-panel text-lg leading-none transition-transform"
                  style={{ transform: isOpen ? "rotate(45deg)" : "none" }}
                  aria-hidden
                >
                  +
                </span>
              </button>
              {isOpen && (
                <div className="px-5 pb-5 -mt-1 text-sm text-muted leading-relaxed">{f.a}</div>
              )}
            </div>
          );
        })}
      </motion.div>
    </section>
  );
}

/* ------------------------------ Final strip ---------------------------- */

function FinalStrip() {
  return (
    <section className="max-w-5xl mx-auto px-4 pt-10 pb-24">
      <motion.div
        {...fade}
        className="rounded-3xl bg-fg text-panel px-6 sm:px-10 py-10 flex flex-wrap items-center justify-between gap-6 overflow-hidden relative"
      >
        <div className="relative z-10 max-w-md">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-60">New here?</div>
          <h3 className="mt-3 font-display text-3xl font-bold leading-tight">
            Run a real sealed drop in five minutes.
          </h3>
          <p className="mt-3 text-sm opacity-70 leading-relaxed">
            Grab Sepolia ETH from any faucet, mint demo vUSD from ours, then send a confidential
            distribution end to end. No contracts to deploy, no keys to manage.
          </p>
        </div>
        <div className="relative z-10 flex flex-col gap-3">
          <Link to="/distribute" className="btn-primary text-center">
            Start a distribution
          </Link>
          <Link
            to="/faucet"
            className="text-center rounded-[10px] border border-panel/25 px-4 py-2.5 text-sm font-semibold hover:bg-panel/10 transition-colors"
          >
            Mint demo tokens →
          </Link>
        </div>
        <div
          aria-hidden
          className="absolute -right-10 -bottom-16 w-64 h-64 rounded-full bg-accent/20 blur-2xl"
        />
      </motion.div>
    </section>
  );
}

/* ------------------------------ Small parts ---------------------------- */

function StatBadge({ big, label, filled }: { big: string; label: string; filled?: boolean }) {
  return (
    <div className="text-center">
      <div
        className={`mx-auto grid place-items-center w-16 h-16 rounded-full border-2 font-display font-bold text-sm ${
          filled ? "bg-accent border-accent text-onaccent" : "border-accent text-fg"
        }`}
      >
        {big}
      </div>
      <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{label}</div>
    </div>
  );
}

function LockRow({ addr }: { addr: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel-2/50 px-3 py-2">
      <span className="text-xs font-mono text-muted">{addr}</span>
      <span className="flex items-center gap-2">
        <span className="redaction h-3 w-14 rounded-[2px]" />
        <LockGlyph size={13} />
      </span>
    </div>
  );
}

function FlowCard({ title, tag, body }: { title: string; tag: string; body: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-6">
      <div className="flex items-center justify-between">
        <div className="font-display text-lg font-bold">{title}</div>
        <span className="tag border-line text-muted">{tag}</span>
      </div>
      <p className="mt-2 text-sm text-muted leading-relaxed">{body}</p>
    </div>
  );
}

/* A little fan of "ticket" cards for the yellow CTA card. */
function TicketFan() {
  return (
    <div aria-hidden className="flex items-end gap-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-lg bg-onaccent/90 h-12 w-16 shadow-sm"
          style={{ transform: `rotate(${(i - 1) * 6}deg) translateY(${Math.abs(i - 1) * 3}px)` }}
        >
          <div className="p-2 space-y-1">
            <div className="h-1.5 w-8 rounded-full bg-accent/70" />
            <div className="h-1.5 w-10 rounded-full bg-panel/30" />
            <div className="h-1.5 w-6 rounded-full bg-panel/30" />
          </div>
        </div>
      ))}
    </div>
  );
}

function LockGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="text-accent-2">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-muted shrink-0">
      <path d="M2 12s3.5-7 10-7c1.7 0 3.2.5 4.5 1.2M22 12s-3.5 7-10 7c-1.7 0-3.2-.5-4.5-1.2" />
      <path d="M3 3l18 18" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
