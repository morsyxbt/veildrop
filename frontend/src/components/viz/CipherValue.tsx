import { useEffect, useRef, useState } from "react";

const GLYPHS = "0123456789abcdef▓▒░";

/**
 * The signature element of the UI: a value that renders as live-scrambling
 * ciphertext until revealed. `hidden` = what the chain sees; otherwise the
 * decrypted value sweeps in character by character.
 */
export function CipherValue({ value, hidden, className = "", chars = 10 }: {
  value: string;
  hidden: boolean;
  className?: string;
  chars?: number;
}) {
  const [display, setDisplay] = useState(value);
  const frame = useRef(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (hidden) {
      interval = setInterval(() => {
        setDisplay(
          Array.from({ length: chars }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join(""),
        );
      }, 90);
    } else {
      // decrypt sweep: progressively lock characters left to right
      frame.current = 0;
      interval = setInterval(() => {
        frame.current += 1;
        const locked = Math.min(frame.current, value.length);
        const scrambled = Array.from({ length: Math.max(0, value.length - locked) }, () =>
          GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        ).join("");
        setDisplay(value.slice(0, locked) + scrambled);
        if (locked >= value.length) clearInterval(interval);
      }, 35);
    }
    return () => clearInterval(interval);
  }, [hidden, value, chars]);

  return (
    <span className={`font-mono ${hidden ? "text-accent-2/70 tracking-tight" : ""} ${className}`}>
      {display}
    </span>
  );
}
