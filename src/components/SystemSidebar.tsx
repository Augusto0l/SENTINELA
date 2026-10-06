"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";

const routes: Record<string, string> = {
  dashboard: "/dashboard",
  "crime-map": "/mapa-criminal",
  occurrences: "/ocorrencias",
  new: "/ocorrencias/nova",
  import: "/importar",
  users: "/usuarios",
  settings: "/configuracoes",
};

export default function SystemSidebar() {
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
    />
  );
}
