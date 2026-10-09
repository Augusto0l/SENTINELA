import type { ReactNode } from "react";
import SystemSidebar from "@/components/SystemSidebar";

export default function SystemLayout({ children }: { children: ReactNode }) {
  return (
    <div className="system-shell" style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "#080f1a" }}>
      <a href="#main-content" className="skip-link">Ir para o conteúdo</a>
      <SystemSidebar />
      <main id="main-content" tabIndex={-1} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <div className="demo-banner">Demonstração · Dados fictícios · Alterações não são gravadas · Sem autenticação real</div>
        {children}
      </main>
    </div>
  );
}
