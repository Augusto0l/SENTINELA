import AuthPanel from "@/components/auth/AuthPanel"
import { localLoginRedirect } from "@/lib/auth/local-provider"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string; estado?: string }> }) {
  const params = await searchParams
  const canonical = localLoginRedirect((await headers()).get("host"))
  if (canonical) {
    for (const key of ["erro", "estado"] as const) {
      if (typeof params[key] === "string") canonical.searchParams.set(key, params[key])
    }
    redirect(canonical.toString())
  }
  return <AuthPanel mode="login" error={params.erro} state={params.estado} />
}
