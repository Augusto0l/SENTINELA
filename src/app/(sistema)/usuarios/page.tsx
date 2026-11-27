import Screen from "@/features/Usuarios";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";
import { institutionalUserCapabilities, institutionalUsers } from "@/lib/db/institutional-users";
import { institutionalAuthAdmin } from "@/lib/supabase/admin";
import { hostedOperationalMode, institutionalDatabaseMode, institutionalUsersWriteEnabled } from "@/lib/db/pcdf-direct-mode";

export default async function Page() {
  const principal = await requirePrincipal("administrar");
  if (principal.source !== "supabase") return <Screen />;
  const writable = institutionalUsersWriteEnabled();
  const [records, capabilities, admin] = await Promise.all([
    institutionalUsers(principal).catch(() => null),
    writable ? institutionalUserCapabilities(principal).catch(() => null) : null,
    writable ? institutionalAuthAdmin() : null,
  ]);
  return <Screen institutional records={records ?? []} unavailable={records === null}
    canCreate={Boolean(records && capabilities?.create && admin)}
    canManage={Boolean(records && capabilities?.manage)}
    canEdit={Boolean(records && (capabilities?.manage || (institutionalDatabaseMode() && !hostedOperationalMode())))}
    administratorId={principal.id} />;
}
