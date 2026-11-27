import styles from "@/components/auth/LoginScreen.module.css"

// Same shield/diamond geometry as SentinelaIcon, adapted only for this login.
// The S sits at the diamond's center (18, 22.5).
export default function LoginBrand() {
  const id = "login-institution"
  return <div className={styles.brandLarge}>
    <svg className={styles.shield} viewBox="0 0 36 46" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-stroke`} x1="8" y1="2" x2="26" y2="44" gradientUnits="userSpaceOnUse"><stop stopColor="#30b3ff" /><stop offset="1" stopColor="#0056ff" /></linearGradient>
      </defs>
      <path d="M18 2 32 7 34 10.5V26C34 34 27 40 18 43 9 40 2 34 2 26V10.5L4 7Z" fill="#031121" fillOpacity=".48" stroke={`url(#${id}-stroke)`} strokeWidth="1.8" />
      <path d="M18 2V11.5M18 11.5 27.5 22.5 18 33.5 8.5 22.5Z" stroke={`url(#${id}-stroke)`} strokeWidth="1.7" strokeLinejoin="round" />
      <text x="18" y="22.5" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="800" fontFamily="Inter, Arial, sans-serif" fill="#fff">S</text>
    </svg>
    <div className={styles.brandText}><span className={styles.wordmark}>SENTINELA</span><span className={styles.tagline}>ANÁLISE E MONITORAMENTO</span></div>
  </div>
}
