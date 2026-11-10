import AuthPanel from "@/components/auth/AuthPanel"
export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string; estado?: string }> }) {
  const params = await searchParams
  return <AuthPanel mode="login" error={params.erro} state={params.estado} />
}
