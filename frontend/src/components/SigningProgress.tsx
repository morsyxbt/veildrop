import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const TIPS = [
  "Encrypting each amount to its recipient - the chain never sees the numbers.",
  "Every recipient will only ever see their own line of this list.",
  "Each amount ships with a proof that the ciphertext is well-formed.",
  "A throwaway key seals your allocations locally, then it's discarded.",
  "Your wallet keys stay in this browser; the chain only ever receives ciphertext.",
];

/** The sealing ceremony: a wax seal pressing each allocation shut. */
export function SigningProgress({ done, total, label }: { done: number; total: number; label: string }) {
  const [minimal, setMinimal] = useState(false);
  const [tip, setTip] = useState(0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  useEffect(() => {
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 3500);
    return () => clearInterval(id);
  }, []);

  if (minimal) {
    return (
      <div className="panel p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">{label}</span>
          <button className="link text-[11px]" onClick={() => setMinimal(false)}>
            Show animation
          </button>
        </div>
        <Bar pct={pct} indeterminate={total === 0} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="sheet p-6 text-center relative overflow-hidden"
    >
      <button
        className="absolute top-3 right-3 text-[11px] text-muted hover:text-fg"
        onClick={() => setMinimal(true)}
      >
        Hide ✕
      </button>

      {/* The seal, pressing */}
      <div className="relative mx-auto w-24 h-24 grid place-items-center" aria-hidden>
        {/* ink ripple on each press */}
        {[0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-3 rounded-full border-2 border-accent/30"
            animate={{ scale: [0.8, 1.5], opacity: [0.6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
          />
        ))}
        {/* envelope under the seal */}
        <svg viewBox="0 0 40 26" className="absolute bottom-1 w-16 text-muted/50" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="1" y="1" width="38" height="24" rx="3" />
          <path d="M2 3 L20 15 L38 3" />
        </svg>
        {/* wax seal pressing down */}
        <motion.div
          className="relative w-12 h-12 rounded-full grid place-items-center"
          style={{
            background: "var(--primary)",
            boxShadow: "inset 0 2px 4px rgba(255,249,239,.25), 0 3px 8px rgba(28,23,15,.35)",
          }}
          animate={{ y: [-14, 2, -14], scale: [1, 0.94, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="w-6 h-6 rounded-full border-2 border-onaccent/50" />
        </motion.div>
      </div>

      <div className="mt-4 font-display font-black tracking-tight">{label}</div>

      {total > 0 ? (
        <>
          <Bar pct={pct} />
          <div className="text-[11px] text-muted mt-1 font-mono" aria-live="polite">
            {done} / {total} sealed · {pct}%
          </div>
        </>
      ) : (
        <Bar pct={0} indeterminate />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={tip}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.4 }}
          className="text-[11px] text-muted mt-4 min-h-8 max-w-xs mx-auto leading-relaxed"
        >
          {TIPS[tip]}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

function Bar({ pct, indeterminate }: { pct: number; indeterminate?: boolean }) {
  return (
    <div className="mt-3 h-2 rounded-sm bg-panel-2 border border-line/60 overflow-hidden">
      {indeterminate ? (
        <motion.div
          className="h-full w-1/3 bg-accent rounded-sm"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <motion.div
          className="h-full bg-accent rounded-sm"
          animate={{ width: `${pct}%` }}
          transition={{ ease: "easeOut", duration: 0.4 }}
        />
      )}
    </div>
  );
}
