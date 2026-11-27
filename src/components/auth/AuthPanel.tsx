import { headers } from "next/headers"
import { localSelected, localAllowed, localConfig } from "@/lib/auth/local-provider"
import Link from "next/link"
import { SentinelaBrand } from "@/components/SentinelaLogo"
import Button from "@/components/ui/button"
import { authMessage } from "@/lib/auth/core"
import { publicSupabaseConfig } from "@/lib/supabase/config"
import LoginScreen from "@/components/auth/LoginScreen"
import { isLocalDemo } from "@/lib/auth/page-access"
import { institutionalDatabaseMode } from "@/lib/db/pcdf-direct-mode"

export default async function AuthPanel({ mode, error, state, firstPassword = false }: {
  mode: "login" | "recuperar" | "senha"; error?: string; state?: string; firstPassword?: boolean;
}) {
  const local = localSelected()
  let localReady = false
  if (local && localAllowed((await headers()).get("host"))) {
    try { await localConfig(); localReady = true } catch { /* Generic configuration message only. */ }
  }
  const configured = local ? localReady : Boolean(publicSupabaseConfig() && process.env.SENTINELA_APP_ORIGIN)
  const operational = Boolean(institutionalDatabaseMode())
  const needsLocalRestart = local && process.env.NODE_ENV === "development" && process.env.SENTINELA_LOCAL_BIND !== "127.0.0.1"
  const title = mode === "login" ? "Acesse o SENTINELA" : mode === "recuperar" ? "Recuperar acesso" : "Definir nova senha"
  const message = authMessage(error) ?? (!configured ? authMessage(needsLocalRestart ? "local_reinicio" : "configuracao") : undefined)
  const notice = state === "enviado" ? "Se houver uma conta elegível, você receberá as instruções de recuperação."
    : state === "senha" ? "Senha atualizada. Entre novamente." : state === "saiu" ? "Sessão encerrada." : undefined
  if (mode === "login") return <LoginScreen localProvider={local} configured={configured} message={message} notice={notice}
    localDemo={await isLocalDemo()} operational={operational} />
  if (local) return <main><p>Recuperação e alteração de senha indisponíveis no provedor local.</p><Link href="/login">Voltar ao login</Link></main>
  return <main className="login-page"><section className="login-card" aria-labelledby="auth-title">
    <SentinelaBrand iconSize={48} /><h1 id="auth-title">{title}</h1>
    <p>{operational ? "Acesso restrito a contas institucionais autorizadas."
      : "Acesso restrito a contas autorizadas. O conteúdo das telas permanece demonstrativo, com dados fictícios."}</p>
    {firstPassword && <p>Defina uma nova senha com pelo menos 16 caracteres, incluindo maiúsculas, minúsculas, número e símbolo, para concluir o primeiro acesso.</p>}
    {message && <p role="alert">{message}</p>}{notice && <p role="status">{notice}</p>}
    <form action={`/auth/${mode}`} method="post">
      {mode !== "senha" && <><label htmlFor="auth-email">E-mail</label><input id="auth-email" name="email" type="email" required autoComplete="username" maxLength={254} /></>}
      {mode !== "recuperar" && <><label htmlFor="auth-password">{mode === "senha" ? "Nova senha" : "Senha"}</label><input id="auth-password" name="password" type="password" required minLength={mode === "senha" ? (firstPassword ? 16 : 12) : undefined} maxLength={mode === "senha" ? 72 : 1024} autoComplete={mode === "senha" ? "new-password" : "current-password"} /></>}
      {mode === "senha" && <><label htmlFor="auth-confirmation">Confirme a nova senha</label><input id="auth-confirmation" name="confirmation" type="password" required minLength={firstPassword ? 16 : 12} maxLength={72} autoComplete="new-password" /></>}
      <Button type="submit" disabled={!configured}>{mode === "recuperar" ? "Enviar instruções" : "Atualizar senha"}</Button>
    </form>
    <Link href="/login">Voltar ao login</Link>
    <p><small>Não há cadastro público. Solicite o provisionamento à administração.</small></p>
  </section></main>
}
