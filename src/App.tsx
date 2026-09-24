import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import CrimeMap from "./pages/CrimeMap";
import Occurrences from "./pages/Occurrences";
import NovaOcorrencia from "./pages/NovaOcorrencia";
import Configuracoes from "./pages/Configuracoes";
import ImportarDados from "./pages/ImportarDados";
import Usuarios from "./pages/Usuarios";

type Page = "dashboard" | "crime-map" | "occurrences" | "new" | "import" | "users" | "settings";

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [initialRaCode, setInitialRaCode] = useState<string | undefined>(undefined);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navigateToCrimeMap = (raCode?: string) => {
    setInitialRaCode(raCode);
    setPage("crime-map");
  };

  const handleNavigate = (p: string) => {
    if (p === "crime-map") setInitialRaCode(undefined);
    setPage(p as Page);
  };

  const renderPage = () => {
    switch (page) {
      case "dashboard":
        return <Dashboard onNavigateToCrimeMap={navigateToCrimeMap} />;
      case "crime-map":
        return <CrimeMap key={initialRaCode ?? "all"} initialRaCode={initialRaCode} />;
      case "occurrences":
        return <Occurrences />;
      case "new":
        return <NovaOcorrencia onBack={() => handleNavigate("dashboard")} />;
      case "import":
        return <ImportarDados />;
      case "users":
        return <Usuarios />;
      case "settings":
        return <Configuracoes />;
      default:
        return (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 12, color: "#334155",
          }}>
            <div style={{ fontSize: 48, opacity: 0.3 }}>⊘</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#475569" }}>Módulo em desenvolvimento</div>
            <div style={{ fontSize: 13, color: "#334155" }}>Esta seção estará disponível em breve.</div>
          </div>
        );
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#080f1a" }}>
      <Sidebar
        currentPage={page}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {renderPage()}
      </main>
    </div>
  );
}
