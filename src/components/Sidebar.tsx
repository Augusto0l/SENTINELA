import { SentinelaBrand } from "@/components/SentinelaLogo"
import NavigationIcon, { type NavigationIconName } from "@/components/NavigationIcon"
import { useOperations } from "@/components/OperationalProvider"
import { canVisit } from "@/data/demoPermissions"
import styles from "@/components/Navigation.module.css"

interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
  collapsed: boolean
  onToggle: () => void
}

const navGroups: { label: string; items: { key: string; label: string; icon: NavigationIconName }[] }[] = [
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
      { key: "login", label: "Voltar ao login demonstrativo", icon: "logout" },
    ],
  },
]

export default function Sidebar({ currentPage, onNavigate, collapsed, onToggle }: SidebarProps) {
  const { role } = useOperations()
  return (
    <aside aria-label="Navegação do SENTINELA" className={`system-sidebar ${styles.sidebar} ${collapsed ? `${styles.collapsed} is-collapsed` : ""}`}>
      <div className={styles.brand}>
        <SentinelaBrand iconSize={34} />
        <button className={styles.collapseButton} type="button" onClick={onToggle}
          aria-label={collapsed ? "Expandir navegação" : "Recolher navegação"}
          aria-expanded={!collapsed} aria-controls="system-navigation"
          title={collapsed ? "Expandir navegação" : "Recolher navegação"}>
          <NavigationIcon name="panel" size={17} />
        </button>
      </div>

      <div className={styles.workspace}>
        <span className={styles.workspaceIcon}><NavigationIcon name="shield" /></span>
        <div className={styles.sidebarText}>
          <strong>Distrito Federal</strong>
          <span>Análise e monitoramento</span>
        </div>
        <span className={styles.workspaceTag}>DF</span>
      </div>

      <nav id="system-navigation" aria-label="Menu principal" className={styles.navigation}>
        {navGroups.map((group) => (
          <div key={group.label} className={styles.navGroup}>
            <p className={styles.groupLabel}>{group.label}</p>
            {group.items.filter((item) => canVisit(role, ({ new: "/ocorrencias/nova", import: "/importar", users: "/usuarios" } as Record<string, string>)[item.key] ?? "/dashboard")).map((item) => (
              <button key={item.key} type="button" className={styles.navItem}
                aria-label={item.label} aria-current={currentPage === item.key ? "page" : undefined}
                title={item.label} onClick={() => onNavigate(item.key)}>
                <span className={styles.navIcon}><NavigationIcon name={item.icon} /></span>
                <span className={styles.sidebarText}>{item.label}</span>
                {currentPage === item.key && <span className={styles.activeDot} aria-hidden="true" />}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className={styles.sidebarFooter}>
        <div className={styles.demoNote}>
          <span className={styles.demoIndicator} aria-hidden="true" />
          <div><strong>Ambiente demonstrativo</strong><p>Alterações em memória, perdidas ao recarregar.</p></div>
        </div>
        <div className={styles.userCard} title={`Pedro Augusto · ${role} · demonstração`}>
          <span className={styles.avatar}>PA</span>
          <div className={styles.sidebarText}><strong>Pedro Augusto</strong><span>{role} · demonstração</span></div>
        </div>
      </div>
    </aside>
  )
}
