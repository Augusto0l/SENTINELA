import { SentinelaBrand } from "@/components/SentinelaLogo"
import NavigationIcon, { type NavigationIconName } from "@/components/NavigationIcon"
import { useOperations } from "@/components/OperationalProvider"
import { canVisit, NAVIGATION_ROUTES } from "@/lib/auth/policy"
import styles from "@/components/Navigation.module.css"
import LogoutForm from "@/components/auth/LogoutForm"

interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
  collapsed: boolean
  onToggle: () => void
  pcdf?: boolean
  persistent?: boolean
  dashboard?: boolean
  localImport?: boolean
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
      { key: "review", label: "Central de Revisão", icon: "records" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { key: "users", label: "Usuários", icon: "users" },
      { key: "settings", label: "Configurações", icon: "settings" },
      { key: "login", label: "Encerrar sessão", icon: "logout" },
    ],
  },
]

export default function Sidebar({ currentPage, onNavigate, collapsed, onToggle, pcdf = false, persistent = false, dashboard = false, localImport = false }: SidebarProps) {
  const { role, principal } = useOperations()
  return (
    <aside aria-label="Navegação do SENTINELA" className={`system-sidebar ${styles.sidebar}${dashboard ? ` ${styles.dashboardSidebar}` : ""}${collapsed ? ` ${styles.collapsed} is-collapsed` : ""}`}>
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
            {group.items.filter((item) => (item.key !== "review" || pcdf)
              && item.key in NAVIGATION_ROUTES && canVisit(role, NAVIGATION_ROUTES[item.key])).map((item) => (
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
      <LogoutForm><button type="submit" className={styles.navItem} aria-label="Encerrar sessão" title="Encerrar sessão"><NavigationIcon name="logout" /><span className={styles.sidebarText}>Encerrar sessão</span></button></LogoutForm>

      <div className={styles.sidebarFooter}>
        <div className={styles.demoNote}>
          <span className={styles.demoIndicator} aria-hidden="true" />
          <div><strong>{localImport ? "Ambiente local" : persistent ? "Homologação local" : "Ambiente demonstrativo"}</strong>
            <p>{localImport ? "Importação em origem e staging." : persistent ? "Dados sintéticos no banco local." : "Alterações em memória, perdidas ao recarregar."}</p></div>
        </div>
        <div className={styles.userCard} title={`${principal.name} · ${role}`}>
          <span className={styles.avatar}>{principal.name.slice(0, 2).toLocaleUpperCase("pt-BR")}</span>
          <div className={styles.sidebarText}><strong>{principal.name}</strong><span>{role}</span></div>
        </div>
      </div>
    </aside>
  )
}
