"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { NAVIGATION_ROUTES } from "@/lib/auth/policy";

const routes = NAVIGATION_ROUTES;

export function LocalEnvironmentNotice({ integratedImport }: { integratedImport: boolean }) {
  const pathname = usePathname();
  if (integratedImport && pathname === routes.import) return null;
  return <div role="status" style={{ padding: "8px 16px", background: "#102945", color: "#d6e9ff", fontSize: 13 }}>
    {integratedImport ? "Ambiente local · o modo de operação é indicado em cada tela." : "Desenvolvimento local · dados fictícios · sem acesso ao banco remoto."}
  </div>;
}

export default function SystemSidebar({ pcdf = false, persistent = false, integratedImport = false }: {
  pcdf?: boolean; persistent?: boolean; integratedImport?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const currentPage = Object.keys(routes).find((key) => routes[key] === pathname) ?? "dashboard";
  return (
    <Sidebar
      currentPage={currentPage}
      onNavigate={(page) => { if (routes[page]) router.push(routes[page]); }}
      collapsed={collapsed}
      onToggle={() => setCollapsed((value) => !value)}
      pcdf={pcdf}
      persistent={persistent}
      dashboard={pathname === routes.dashboard}
      localImport={integratedImport && pathname === routes.import}
    />
  );
}
