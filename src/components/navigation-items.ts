import type { NavigationIconName } from "@/components/NavigationIcon"

export const navigationGroups: { label: string; items: { key: string; label: string; icon: NavigationIconName }[] }[] = [
  {
    label: "Visão Geral",
    items: [
      { key: "dashboard", label: "Dashboard", icon: "dashboard" },
      { key: "crime-map", label: "Mapa Criminal", icon: "map" },
    ],
  },
  {
    label: "Ocorrências",
    items: [
      { key: "occurrences", label: "Ocorrências", icon: "records" },
      { key: "new", label: "Nova Ocorrência", icon: "plus" },
      { key: "import", label: "Importar Dados", icon: "upload" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { key: "users", label: "Usuários", icon: "users" },
      { key: "settings", label: "Configurações", icon: "settings" },
    ],
  },
]
