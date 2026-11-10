import type { ReactNode } from "react";
import SystemSidebar from "@/components/SystemSidebar";
import OperationalProvider from "@/components/OperationalProvider";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";
import { isLocalDemo } from "@/lib/auth/page-access";

export default async function SystemLayout({ children }: { children: ReactNode }) {
  const principal = await requirePrincipal();
  const demo = await isLocalDemo();
  return (
    <OperationalProvider principal={principal}><div className="system-shell" style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden", background: "var(--theme-080f1a)" }}>
      <a href="#main-content" className="skip-link">Ir para o conteúdo</a>
      <SystemSidebar />
      <main id="main-content" tabIndex={-1} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {principal.source === "local" && <div role="status" style={{ padding: "8px 16px", background: "#102945", color: "#d6e9ff", fontSize: 13 }}>Desenvolvimento local · dados fictícios · sem acesso ao banco remoto.</div>}
        {demo && <div role="status" style={{ padding: "8px 16px", background: "#102945", color: "#d6e9ff", fontSize: 13 }}>Demonstração local temporária · dados fictícios · sem autenticação real ou acesso ao banco. <a href="/login" style={{ textDecoration: "underline" }}>Voltar ao login</a></div>}
        {children}
      </main>
    </div></OperationalProvider>
  );
}
