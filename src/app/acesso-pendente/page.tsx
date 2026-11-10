import { requireIdentity } from "@/lib/auth/server"
import { SentinelaBrand } from "@/components/SentinelaLogo"
import Button from "@/components/ui/button"
export default async function Page() {
  await requireIdentity()
  return <main className="login-page"><section className="login-card">
    <SentinelaBrand /><h1>Acesso pendente</h1>
    <p>Não foi possível confirmar um vínculo ativo. Solicite a liberação à administração. Nenhum dado interno foi disponibilizado.</p>
    <form method="post" action="/auth/logout"><Button type="submit">Encerrar sessão</Button></form>
  </section></main>
}
