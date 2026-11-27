import Screen from "@/features/Configuracoes";
import { requirePagePrincipal } from "@/lib/auth/page-access";
import createServerSupabaseClient from "@/lib/supabase/server";

const accessDate = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default async function Page() {
  const principal = await requirePagePrincipal("administrar");
  const client = principal.source === "supabase" ? await createServerSupabaseClient() : null;
  const result = await client?.auth.getUser().catch(() => null);
  const user = result && !result.error && result.data.user?.id === principal.authUserId ? result.data.user : null;
  const lastAccess = user?.last_sign_in_at ? new Date(user.last_sign_in_at) : null;

  return (
    <Screen
      name={principal.name}
      role={principal.role}
      source={principal.source}
      email={user?.email ?? null}
      lastAccess={lastAccess && Number.isFinite(lastAccess.getTime()) ? accessDate.format(lastAccess) : null}
      mfaEnabled={user ? user.factors?.some(factor => factor.status === "verified") ?? false : null}
    />
  );
}
