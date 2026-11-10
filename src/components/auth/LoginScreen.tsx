import LoginBrand from "@/components/auth/LoginBrand"
import LoginForm from "@/components/auth/LoginForm"
import LoginIcon from "@/components/auth/LoginIcon"
import styles from "@/components/auth/LoginScreen.module.css"
import Link from "next/link"

export default function LoginScreen({ configured, message, notice, localDemo = false, localProvider = false }: { configured: boolean; message?: string; notice?: string; localDemo?: boolean; localProvider?: boolean }) {
  return <main className={styles.page}>
    <div className={styles.background} aria-hidden="true" /><div className={styles.grid} aria-hidden="true" />
    <span className={`${styles.corner} ${styles.cornerTop}`} aria-hidden="true" /><span className={`${styles.corner} ${styles.cornerBottom}`} aria-hidden="true" />
    <div className={styles.layout}>
      <section className={styles.institution} aria-label="Sobre o SENTINELA">
        <LoginBrand large /><div className={styles.rule} />
        <h2>Inteligência para<br />uma sociedade<br /><span>mais segura.</span></h2>
        <p className={styles.description}>Dados, análise e tecnologia a serviço<br />da segurança pública.</p>
        <ul className={styles.features}>
          <li><LoginIcon name="chart" /><span>Análise de<br />dados criminais</span></li>
          <li><LoginIcon name="target" /><span>Visualização<br />geográfica</span></li>
          <li><LoginIcon name="database" /><span>Apoio à<br />tomada de decisão</span></li>
        </ul>
      </section>
      <div className={styles.cardFrame}>
        <section className={styles.card} aria-labelledby="auth-title">
          <LoginBrand />
          <h1 id="auth-title">Acesse sua conta</h1>
          <p className={styles.intro}>Plataforma de análise criminal com dados fictícios.<br />{" "}Acesso restrito a usuários autorizados.</p>
          <LoginForm configured={configured} message={message} notice={notice} localProvider={localProvider} />
          {localDemo && <div className={styles.feedback} role="status"><p>Prévia local com dados fictícios, sem autenticação real ou acesso ao banco.</p><Link className={styles.submit} href="/dashboard">Entrar na demonstração local →</Link></div>}
          <footer className={styles.security}><LoginIcon name="lock" /><p>Acesso exclusivo para usuários autorizados.<br />Ambiente demonstrativo com dados fictícios.</p></footer>
        </section>
        {!configured && <p className={styles.serviceNotice} role="status">{message}</p>}
      </div>
    </div>
  </main>
}
