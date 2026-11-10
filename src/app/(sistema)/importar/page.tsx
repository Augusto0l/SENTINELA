import Screen from "@/features/ImportarDados";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";

export default async function Page() { await requirePrincipal("importar"); return <Screen />; }
