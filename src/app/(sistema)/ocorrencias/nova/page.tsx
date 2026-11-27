import Screen from "@/features/NovaOcorrenciaEntry";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";
import { isolatedWriteMode } from "@/lib/db/isolated-write-mode";
import { hostedOperationalMode } from "@/lib/db/pcdf-direct-mode";
import { persistentCrudEnabled } from "@/lib/db/config";

export default async function Page() {
  await requirePrincipal("cadastrar");
  const persistent = persistentCrudEnabled();
  return <Screen isolated={persistent || Boolean(isolatedWriteMode())} persistent={persistent} mapLink={Boolean(hostedOperationalMode())} />;
}
