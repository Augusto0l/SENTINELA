import type { ReactNode } from "react";
import SystemSidebar from "@/components/SystemSidebar";
import OperationalProvider from "@/components/OperationalProvider";

export default function SystemLayout({ children }: { children: ReactNode }) {
  return (
    <OperationalProvider><div className="system-shell" style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden", background: "var(--theme-080f1a)" }}>
      <a href="#main-content" className="skip-link">Ir para o conteúdo</a>
      <SystemSidebar />
      <main id="main-content" tabIndex={-1} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {children}
      </main>
    </div></OperationalProvider>
  );
}
