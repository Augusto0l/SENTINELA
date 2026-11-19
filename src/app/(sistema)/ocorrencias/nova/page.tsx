import Screen from "@/features/NovaOcorrenciaEntry";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";
import { isolatedWriteMode } from "@/lib/db/isolated-write-mode";

export default async function Page() { await requirePrincipal("cadastrar"); return <Screen isolated={Boolean(isolatedWriteMode())} />; }
