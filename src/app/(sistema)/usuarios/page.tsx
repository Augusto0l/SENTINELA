import Screen from "@/features/Usuarios";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";
import { institutionalUsers } from "@/lib/db/institutional-users";
import { institutionalAuthAdmin } from "@/lib/supabase/admin";
import { hostedOperationalMode } from "@/lib/db/pcdf-direct-mode";

export default async function Page() {
  const principal = await requirePrincipal("administrar");
  if (principal.source !== "supabase") return <Screen />;
  const [records, admin] = await Promise.all([institutionalUsers(principal).catch(() => null), institutionalAuthAdmin()]);
  return <Screen institutional records={records ?? []} unavailable={records === null}
    canCreate={Boolean(records && admin && hostedOperationalMode()?.write !== false)}
    administratorId={principal.id} />;
}
