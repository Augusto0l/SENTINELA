import AuthPanel from "@/components/auth/AuthPanel"
export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string; estado?: string }> }) {
  const params = await searchParams
  return <AuthPanel mode="recuperar" error={params.erro} state={params.estado} />
}
