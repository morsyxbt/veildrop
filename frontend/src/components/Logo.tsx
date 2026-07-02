/**
 * Veildrop mark: a distribution droplet whose lower half dissolves into cipher
 * cells - a payout that leaves the chain encrypted. Gold (revealed to the
 * recipient) bleeds into cyan (what everyone else sees: ciphertext).
 */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="shrink-0">
      <defs>
        <linearGradient id="vd-grad" x1="16" y1="5" x2="16" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#2dd4bf" />
        </linearGradient>
        <clipPath id="vd-drop">
          <path d="M16 5 C16 5 8.5 13.4 8.5 19 a7.5 7.5 0 0 0 15 0 C23.5 13.4 16 5 16 5 Z" />
        </clipPath>
      </defs>
      <rect width="32" height="32" rx="8" fill="var(--panel-2)" stroke="var(--line)" />
      {/* the droplet */}
      <g clipPath="url(#vd-drop)">
        <rect x="6" y="4" width="20" height="23" fill="url(#vd-grad)" />
        {/* veil: redaction cells dissolving the lower half into ciphertext */}
        <g fill="var(--panel-2)" opacity="0.92">
          <rect x="9" y="18" width="3.2" height="3.2" rx="0.7" />
          <rect x="15.4" y="18" width="3.2" height="3.2" rx="0.7" />
          <rect x="12.2" y="21.4" width="3.2" height="3.2" rx="0.7">
            <animate attributeName="opacity" values="0.92;0.35;0.92" dur="3s" repeatCount="indefinite" />
          </rect>
          <rect x="18.6" y="21.4" width="3.2" height="3.2" rx="0.7" />
        </g>
      </g>
    </svg>
  );
}

export function Logo({ size = 34, withTag = false }: { size?: number; withTag?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="leading-tight">
        <span className="font-black text-lg tracking-tight">
          Veil<span className="text-accent">drop</span>
        </span>
        {withTag && (
          <span className="block text-[10px] text-muted -mt-0.5">Confidential token distribution</span>
        )}
      </span>
    </span>
  );
}
