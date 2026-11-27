import Link from "next/link"
import { requirePrincipal } from "@/lib/auth/server"
export default async function Page() {
  await requirePrincipal()
  return <main className="login-page"><section className="login-card"><h1>Acesso negado</h1><p>Seu perfil não permite esta operação.</p><Link href="/dashboard">Voltar ao Dashboard</Link></section></main>
}
