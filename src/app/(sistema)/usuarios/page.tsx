import Screen from "@/features/Usuarios";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";

export default async function Page() { await requirePrincipal("administrar"); return <Screen />; }
