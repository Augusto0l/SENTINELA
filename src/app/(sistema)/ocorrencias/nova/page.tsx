import Screen from "@/features/NovaOcorrenciaEntry";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";

export default async function Page() { await requirePrincipal("cadastrar"); return <Screen />; }
