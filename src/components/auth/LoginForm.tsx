"use client"
import Link from "next/link"
import { useState, type FormEvent } from "react"
import LoginIcon from "@/components/auth/LoginIcon"
import styles from "@/components/auth/LoginScreen.module.css"

export default function LoginForm({ configured, message, notice, localProvider = false }: { configured: boolean; message?: string; notice?: string; localProvider?: boolean }) {
  const [visible, setVisible] = useState(false)
  const [pending, setPending] = useState(false)
  const [emailInvalid, setEmailInvalid] = useState(false)
  const [passwordInvalid, setPasswordInvalid] = useState(false)
  function submit(event: FormEvent<HTMLFormElement>) {
    if (!configured || pending) { event.preventDefault(); return }
    if (event.currentTarget.checkValidity()) setPending(true)
  }
  return <form className={styles.form} action="/auth/login" method="post" onSubmit={submit} aria-busy={pending}>
    <div className={styles.field}>
      <label htmlFor="auth-email">E-mail institucional</label>
      <div className={styles.inputShell}>
        <LoginIcon name="mail" />
        <input id="auth-email" name="email" type="email" autoComplete="username" placeholder="seuemail@instituicao.gov.br" required maxLength={254} disabled={!configured} readOnly={pending}
          aria-invalid={emailInvalid || undefined} aria-describedby={emailInvalid ? "login-email-error" : undefined}
          onInvalid={() => setEmailInvalid(true)} onChange={() => setEmailInvalid(false)} />
      </div>
      {emailInvalid && <span id="login-email-error" className={styles.fieldError} role="alert">Informe um e-mail válido.</span>}
    </div>
    <div className={styles.field}>
      <label htmlFor="auth-password">Senha</label>
      <div className={styles.inputShell}>
        <LoginIcon name="lock" />
        <input id="auth-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" placeholder="Digite sua senha" required maxLength={1024} disabled={!configured} readOnly={pending}
          aria-invalid={passwordInvalid || undefined} aria-describedby={passwordInvalid ? "login-password-error" : undefined}
          onInvalid={() => setPasswordInvalid(true)} onChange={() => setPasswordInvalid(false)} />
        <button className={styles.visibility} type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible} aria-controls="auth-password" disabled={pending}>
          <LoginIcon name={visible ? "eye" : "eye-off"} />
        </button>
      </div>
      {passwordInvalid && <span id="login-password-error" className={styles.fieldError} role="alert">Informe sua senha.</span>}
    </div>
    <div className={styles.options}>
      <label className={styles.remember} title="A duração da sessão é definida pelo provedor. Não é alterável nesta tela.">
        <input type="checkbox" checked disabled aria-describedby="login-session-policy" /><span>Lembrar-me</span>
      </label>
      <span id="login-session-policy" className={styles.srOnly}>A duração da sessão é definida pelo provedor. Esta opção não é alterável nesta tela.</span>
      {!localProvider && <Link href="/recuperar-senha">Esqueci minha senha?</Link>}
    </div>
    <button className={styles.submit} type="submit" disabled={!configured || pending}>
      {pending && <span className={styles.spinner} aria-hidden="true" />}<span>{pending ? "Entrando…" : "Entrar"}</span><LoginIcon name="arrow" />
    </button>
    {configured && message && <p className={styles.feedback} role="alert">{message}</p>}
    {notice && <p className={styles.feedback} role="status">{notice}</p>}
  </form>
}
