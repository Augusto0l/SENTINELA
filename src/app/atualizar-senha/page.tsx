import AuthPanel from "@/components/auth/AuthPanel"
import { requireIdentity } from "@/lib/auth/server"
export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  await requireIdentity()
  return <AuthPanel mode="senha" error={(await searchParams).erro} />
}
