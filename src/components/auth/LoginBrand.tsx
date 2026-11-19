import styles from "@/components/auth/LoginScreen.module.css"

// Same shield/diamond geometry as SentinelaIcon, adapted only for this login.
// The S sits at the diamond's center (18, 22.5).
export default function LoginBrand() {
  const id = "login-institution"
  return <div className={styles.brandLarge}>
    <svg className={styles.shield} viewBox="0 0 36 44" fill="none" role="img" aria-label="Escudo SENTINELA">
      <defs>
        <linearGradient id={`${id}-stroke`} x1="8" y1="2" x2="26" y2="44" gradientUnits="userSpaceOnUse"><stop stopColor="#55a4ff" /><stop offset="1" stopColor="#0050ff" /></linearGradient>
      </defs>
      <path d="M18 2 32 6.5 34 10.5V27C34 35.5 26 41.5 18 43.5 10 41.5 2 35.5 2 27V10.5L4 6.5Z" fill="#0b1b2b" fillOpacity=".32" stroke={`url(#${id}-stroke)`} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M18 2V11.5M18 11.5 27.5 22.5 18 33.5 8.5 22.5Z" stroke={`url(#${id}-stroke)`} strokeWidth="1.7" strokeLinejoin="round" />
      <text x="18" y="22.5" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="800" fontFamily="Inter, Arial, sans-serif" fill="#fff">S</text>
    </svg>
    <div className={styles.brandText}><span className={styles.wordmark}>SENTINELA</span><span className={styles.tagline}>ANÁLISE E MONITORAMENTO</span></div>
  </div>
}
