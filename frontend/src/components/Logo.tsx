/**
 * Veildrop mark: a manila envelope, address lines redacted, closed with a
 * vermillion wax seal - a payout you can hold without reading. Tracks the
 * theme via CSS variables.
 */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="shrink-0" aria-hidden>
      {/* envelope */}
      <rect x="1" y="1" width="30" height="30" rx="7" fill="var(--manila)" stroke="var(--line)" />
      {/* flap */}
      <path
        d="M5.5 8 L16 17 L26.5 8"
        fill="none"
        stroke="var(--fg)"
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* redacted address lines */}
      <rect x="7" y="21.5" width="10.5" height="2.6" rx="1" fill="var(--fg)" opacity="0.8" />
      <rect x="7" y="25.6" width="6.5" height="2.6" rx="1" fill="var(--fg)" opacity="0.45" />
      {/* wax seal */}
      <circle cx="16" cy="16.2" r="5" fill="var(--primary)" />
      <circle cx="16" cy="16.2" r="2.8" fill="none" stroke="var(--onaccent)" strokeOpacity="0.55" strokeWidth="1.1" />
    </svg>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="leading-tight">
        <span className="font-display font-black text-lg tracking-tight">
          Veil<span className="text-accent">drop</span>
        </span>
      </span>
    </span>
  );
}
