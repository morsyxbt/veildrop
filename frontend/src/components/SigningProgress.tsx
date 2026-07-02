import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const TIPS = [
  "Encrypting each amount to its recipient - the chain never sees the numbers.",
  "One grant tx replaced a wallet popup per recipient.",
  "Amounts are sealed with FHE; only each recipient can decrypt their own.",
  "A throwaway key is signing your allocations, then it's discarded.",
  "Everything runs in your browser - nothing sensitive leaves this device.",
];

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
          <button className="text-[11px] text-accent-2 hover:underline" onClick={() => setMinimal(false)}>
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
      className="panel p-6 text-center relative overflow-hidden"
    >
      <button
        className="absolute top-3 right-3 text-[11px] text-muted hover:text-fg"
        onClick={() => setMinimal(true)}
      >
        Hide ✕
      </button>

      {/* Pulsing shield */}
      <div className="relative mx-auto w-24 h-24 grid place-items-center">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border-2 border-accent/40"
            animate={{ scale: [1, 1.45], opacity: [0.5, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
          />
        ))}
        <motion.div
          className="w-14 h-14 rounded-2xl bg-accent grid place-items-center text-onaccent"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </motion.div>
      </div>

      <div className="mt-4 font-black tracking-tight">{label}</div>

      {total > 0 ? (
        <>
          <Bar pct={pct} />
          <div className="text-[11px] text-muted mt-1">
            {done} / {total} · {pct}%
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
    <div className="mt-3 h-2 rounded-full bg-panel-2 overflow-hidden">
      {indeterminate ? (
        <motion.div
          className="h-full w-1/3 bg-accent rounded-full"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <motion.div
          className="h-full bg-accent rounded-full"
          animate={{ width: `${pct}%` }}
          transition={{ ease: "easeOut", duration: 0.4 }}
        />
      )}
    </div>
  );
}
