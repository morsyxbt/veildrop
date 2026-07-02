import { useEffect, useState } from "react";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The signature element of the UI: a value rendered as a redaction bar - the
 * black strip over a number in a classified document - until revealed. On
 * reveal, the bar peels away character by character, left to right.
 *
 * `hidden` = what the chain sees. The bar itself is pure CSS (see .redaction),
 * so hidden values cost no re-renders; reduced-motion users get a static bar
 * and an instant reveal.
 */
export function CipherValue({
  value,
  hidden,
  className = "",
  chars = 10,
}: {
  value: string;
  hidden: boolean;
  className?: string;
  chars?: number;
}) {
  // Start revealed values at 0 so the first paint shows the bar, not one frame
  // of the cleartext before the effect kicks in (effects run after paint).
  const [locked, setLocked] = useState(() => (hidden || !prefersReducedMotion() ? 0 : value.length));

  useEffect(() => {
    if (hidden) return;
    if (prefersReducedMotion()) {
      setLocked(value.length);
      return;
    }
    setLocked(0);
    const interval = setInterval(() => {
      setLocked((n) => {
        const next = Math.min(n + 1, value.length);
        if (next >= value.length) clearInterval(interval);
        return next;
      });
    }, 45);
    return () => clearInterval(interval);
  }, [hidden, value]);

  if (hidden) {
    return (
      <span className={`font-mono ${className}`} role="img" aria-label="encrypted amount">
        <span aria-hidden className="redaction" style={{ width: `${chars}ch`, height: "1.05em" }} />
      </span>
    );
  }

  return (
    <span className={`font-mono ${className}`}>
      {value.slice(0, locked)}
      {locked < value.length && (
        <span
          aria-hidden
          className="redaction"
          style={{ width: `${value.length - locked}ch`, height: "1.05em" }}
        />
      )}
    </span>
  );
}
