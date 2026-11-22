import type { ReactNode } from "react";
import SystemSidebar from "@/components/SystemSidebar";
import { LocalEnvironmentNotice } from "@/components/SystemSidebar";
import OperationalProvider from "@/components/OperationalProvider";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";
import { isLocalDemo } from "@/lib/auth/page-access";
import { isolatedPcdfMode } from "@/lib/db/isolated-write-mode";
import { persistentCrudEnabled, persistentPcdfEnabled } from "@/lib/db/config";
import { mainImportOrigin } from "@/lib/db/pcdf-direct-mode";

export default async function SystemLayout({ children }: { children: ReactNode }) {
  const principal = await requirePrincipal();
  const demo = await isLocalDemo();
  const integratedImport = principal.source === "local" && process.env.SENTINELA_APP_ORIGIN === mainImportOrigin;
  return (
    <OperationalProvider principal={principal}><div className="system-shell" style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden", background: "var(--theme-080f1a)" }}>
      <a href="#main-content" className="skip-link">Ir para o conteúdo</a>
      <SystemSidebar pcdf={principal.source === "local" && (Boolean(isolatedPcdfMode()) || persistentPcdfEnabled())}
        persistent={principal.source === "local" && persistentCrudEnabled()} integratedImport={integratedImport} />
      <main id="main-content" tabIndex={-1} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {principal.source === "local" && <LocalEnvironmentNotice integratedImport={integratedImport} />}
        {demo && <div role="status" style={{ padding: "8px 16px", background: "#102945", color: "#d6e9ff", fontSize: 13 }}>Demonstração local temporária · dados fictícios · sem autenticação real ou acesso ao banco. <a href="/login" style={{ textDecoration: "underline" }}>Voltar ao login</a></div>}
        {children}
      </main>
    </div></OperationalProvider>
  );
}
