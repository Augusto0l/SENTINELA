"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { NAVIGATION_ROUTES } from "@/lib/auth/policy";

const routes = NAVIGATION_ROUTES;

export default function SystemSidebar({ pcdf = false }: { pcdf?: boolean }) {
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
    />
  );
}
