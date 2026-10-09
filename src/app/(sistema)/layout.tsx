import type { ReactNode } from "react";
import SystemSidebar from "@/components/SystemSidebar";

export default function SystemLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#080f1a" }}>
      <SystemSidebar />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
