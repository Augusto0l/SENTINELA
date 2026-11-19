import Screen from "@/features/DashboardEntry";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";

export default async function Page() { const principal = await requirePrincipal("analisar"); return <Screen persistent={principal.source === "local"} />; }
