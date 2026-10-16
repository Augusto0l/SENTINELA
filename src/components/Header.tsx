"use client";

import { useTheme } from "@/components/ThemeProvider";
import { useRouter } from "next/navigation";
import { useDemoToast } from "./DemoProvider";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const notify = useDemoToast();
  return (
    <header className="system-topbar"
      style={{
        height: 56,
        background: "var(--theme-0d1626)",
        borderBottom: "1px solid var(--theme-1e3a5f)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 16,
        flexShrink: 0,
      }}
    >
      {/* Page title on left for context */}
      <div style={{ flex: "0 0 auto", marginRight: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--theme-94a3b8)" }}>{title}</span>
        {subtitle && <span className="topbar-subtitle" style={{ fontSize: 12, color: "var(--theme-94a3b8)", marginLeft: 8 }}>{subtitle}</span>}
      </div>

      <div style={{ flex: 1 }} />

      {/* Notifications */}
      <button
        title="Notificações"
        aria-label="Notificações demonstrativas"
        onClick={() => notify("Notificações ilustrativas. Não há alertas de ocorrências reais.")}
        style={{
          position: "relative",
          background: "transparent",
          border: "none",
          color: "var(--color-text-muted)",
          cursor: "pointer",
          fontSize: 18,
          padding: "4px 8px",
          lineHeight: 1,
        }}
      >
        🔔
        <span
          style={{
            position: "absolute",
            top: 2,
            right: 4,
            width: 8,
            height: 8,
            background: "#ef4444",
            borderRadius: "50%",
            border: "2px solid var(--theme-0d1626)",
          }}
        />
      </button>

      {/* Theme toggle */}
      <button
        title="Alternar tema"
        aria-label={resolvedTheme === "escuro" ? "Ativar tema claro" : "Ativar tema escuro"}
        aria-pressed={resolvedTheme === "escuro"}
        onClick={() => setTheme(resolvedTheme === "escuro" ? "claro" : "escuro")}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--color-text-muted)",
          cursor: "pointer",
          fontSize: 16,
          padding: "4px 8px",
        }}
      >
        {resolvedTheme === "escuro" ? "☀" : "☾"}
      </button>

      {/* User */}
      <button className="topbar-user" aria-label="Abrir configurações do usuário demonstrativo" onClick={() => router.push("/configuracoes")} style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            color: "#fff",
          }}
        >
          PA
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--theme-94a3b8)" }}>Pedro Augusto</span>
        <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>▾</span>
      </button>
    </header>
  );
}
