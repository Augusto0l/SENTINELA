// SentinelaIcon — shield + S, no text. Use collapsed sidebar, favicon placeholder, etc.
// SentinelaBrand — shield + SENTINELA wordmark + subtitle. Use expanded sidebar header.

// ─── Shield SVG icon ──────────────────────────────────────────────────────────
// Geometry mirrors the reference logo: angular heraldic shield,
// rotated-square diamond frame, bold "S" at center. Flat/clean for sidebar use.

export function SentinelaIcon({ size = 40 }: { size?: number }) {
  const w = 36;
  const h = 44;
  const id = "si"; // short stable id prefix

  return (
    <svg
      width={size}
      height={(size * h) / w}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      aria-label="SENTINELA"
    >
      <defs>
        {/* Shield fill – deep navy */}
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="36" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#132040" />
          <stop offset="100%" stopColor="#0a1525" />
        </linearGradient>

        {/* Shield stroke – blue gradient top-to-bottom */}
        <linearGradient id={`${id}-stroke`} x1="18" y1="0" x2="18" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#93c5fd" />
          <stop offset="50%"  stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>

        {/* Diamond stroke – electric blue */}
        <linearGradient id={`${id}-dstroke`} x1="9" y1="12" x2="27" y2="33" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>

        {/* Subtle inner glow filter */}
        <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* ── Shield body ── */}
      {/* Outer glow ring (very subtle) */}
      <path
        d="M18,0.5 L34,5.5 L35.5,10 L35.5,27 C35.5,36.5 27,42.5 18,44.5 C9,42.5 0.5,36.5 0.5,27 L0.5,10 L2,5.5 Z"
        fill="none"
        stroke="#2563eb"
        strokeWidth="0.5"
        opacity="0.35"
      />

      {/* Main shield – fill */}
      <path
        d="M18,2 L32,6.5 L34,10.5 L34,27 C34,35.5 26,41.5 18,43.5 C10,41.5 2,35.5 2,27 L2,10.5 L4,6.5 Z"
        fill={`url(#${id}-fill)`}
      />

      {/* Main shield – border */}
      <path
        d="M18,2 L32,6.5 L34,10.5 L34,27 C34,35.5 26,41.5 18,43.5 C10,41.5 2,35.5 2,27 L2,10.5 L4,6.5 Z"
        fill="none"
        stroke={`url(#${id}-stroke)`}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* Centre ridge line (top to diamond) */}
      <line x1="18" y1="2" x2="18" y2="11.5" stroke="#60a5fa" strokeWidth="0.8" opacity="0.5" />

      {/* ── Diamond / rhombus frame ── */}
      {/* Diamond outer */}
      <path
        d="M18,11.5 L27.5,22.5 L18,33.5 L8.5,22.5 Z"
        fill="none"
        stroke={`url(#${id}-dstroke)`}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />

      {/* Diamond inner (slightly inset) */}
      <path
        d="M18,14 L25.5,22.5 L18,31 L10.5,22.5 Z"
        fill="none"
        stroke="#60a5fa"
        strokeWidth="0.5"
        opacity="0.3"
      />

      {/* ── S letter ── */}
      <text
        x="18"
        y="27.5"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="13"
        fontWeight="700"
        fontFamily='"Inter","Segoe UI",system-ui,sans-serif'
        fill="#e2e8f0"
        letterSpacing="-0.5"
      >
        S
      </text>

      {/* Corner accent dots – subtle */}
      <circle cx="18" cy="2.5" r="1.2" fill="#60a5fa" opacity="0.6" />
      <circle cx="18" cy="43.5" r="1" fill="#2563eb" opacity="0.5" />
    </svg>
  );
}

// ─── Full brand lockup ─────────────────────────────────────────────────────────
// Layout: [icon] [SENTINELA / Análise e Monitoramento]
export function SentinelaBrand({ iconSize = 36 }: { iconSize?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <SentinelaIcon size={iconSize} />
      <div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: "#f1f5f9",
            letterSpacing: "0.12em",
            lineHeight: 1,
            fontFamily: '"Inter","Segoe UI",system-ui,sans-serif',
          }}
        >
          SENTINELA
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 500,
            color: "#475569",
            letterSpacing: "0.07em",
            marginTop: 4,
            textTransform: "uppercase",
            fontFamily: '"Inter","Segoe UI",system-ui,sans-serif',
          }}
        >
          Análise e Monitoramento
        </div>
      </div>
    </div>
  );
}
