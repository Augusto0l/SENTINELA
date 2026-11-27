import LoginBrand from "@/components/auth/LoginBrand"
import LoginForm from "@/components/auth/LoginForm"
import LoginIcon from "@/components/auth/LoginIcon"
import styles from "@/components/auth/LoginScreen.module.css"
import Link from "next/link"

export default function LoginScreen({ configured, message, notice, localDemo = false, localProvider = false, operational = false }: {
  configured: boolean; message?: string; notice?: string; localDemo?: boolean; localProvider?: boolean; operational?: boolean;
}) {
  return <main className={styles.page}>
    <div className={styles.background} aria-hidden="true" />
    <div className={styles.layout}>
      <section className={styles.institution} aria-label="Sobre o SENTINELA">
        <LoginBrand />
        <div className={styles.rule} aria-hidden="true" />
        <p className={styles.description}>Acesso seguro para usuários autorizados.</p>
      </section>
      <div className={styles.cardFrame}>
        <section className={styles.card} aria-labelledby="auth-title">
          <h1 id="auth-title">Acesse sua conta</h1>
          <LoginForm configured={configured} message={message} notice={notice} localProvider={localProvider} />
          {localDemo && <div className={styles.feedback} role="status"><p>Prévia local com dados fictícios, sem autenticação real ou acesso ao banco.</p><Link className={styles.submit} href="/dashboard">Entrar na demonstração local →</Link></div>}
          <footer className={styles.security}>
            <LoginIcon name="lock" />
            <p>{operational ? "Acesso institucional com Supabase Auth."
              : localProvider ? "Ambiente demonstrativo (acesso local)." : "Ambiente demonstrativo com dados fictícios."}</p>
          </footer>
        </section>
        {!configured && <p className={styles.serviceNotice} role="status">{message}</p>}
      </div>
    </div>
  </main>
}
