import { SentinelaBrand } from "@/components/SentinelaLogo"
import NavigationIcon from "@/components/NavigationIcon"
import { navigationGroups } from "@/components/navigation-items"
import { useOperations } from "@/components/OperationalProvider"
import { canVisit, NAVIGATION_ROUTES } from "@/lib/auth/policy"
import styles from "@/components/Navigation.module.css"
import LogoutForm from "@/components/auth/LogoutForm"

interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
  collapsed: boolean
  onToggle?: () => void
  onClose?: () => void
  navigationId: string
  pcdf?: boolean
  dashboard?: boolean
}

export default function Sidebar({ currentPage, onNavigate, collapsed, onToggle, onClose, navigationId, pcdf = false, dashboard = false }: SidebarProps) {
  const { role, principal } = useOperations()
  return (
    <aside aria-label="Navegação do SENTINELA" className={`system-sidebar ${styles.sidebar}${dashboard ? ` ${styles.dashboardSidebar}` : ""}${collapsed ? ` ${styles.collapsed} is-collapsed` : ""}${onClose ? ` ${styles.drawerSidebar}` : ""}`}>
      <div className={styles.brand}>
        <SentinelaBrand iconSize={34} />
        {onToggle && <button className={styles.collapseButton} type="button" onClick={onToggle}
          aria-label={collapsed ? "Expandir navegação" : "Recolher navegação"}
          aria-expanded={!collapsed} aria-controls={navigationId}
          title={collapsed ? "Expandir navegação" : "Recolher navegação"}>
          <NavigationIcon name="panel" size={17} />
        </button>}
        {onClose && <button className={styles.drawerClose} type="button" onClick={onClose} aria-label="Fechar navegação">
          <NavigationIcon name="close" />
        </button>}
      </div>

      <div className={styles.workspace}>
        <span className={styles.workspaceIcon}><NavigationIcon name="shield" /></span>
        <div className={styles.sidebarText}>
          <strong>Distrito Federal</strong>
          <span>Análise e monitoramento</span>
        </div>
        <span className={styles.workspaceTag}>DF</span>
      </div>

      <nav id={navigationId} aria-label="Menu principal" className={styles.navigation}>
        {navigationGroups.map((group) => (
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
      <LogoutForm className={styles.logout}><button type="submit" className={styles.navItem} aria-label="Encerrar sessão" title="Encerrar sessão"><span className={styles.navIcon}><NavigationIcon name="logout" /></span><span className={styles.sidebarText}>Encerrar sessão</span></button></LogoutForm>

      <div className={styles.sidebarFooter}>
        <div className={styles.userCard} title={`${principal.name} · ${role}`}>
          <span className={styles.avatar}>{principal.name.slice(0, 2).toLocaleUpperCase("pt-BR")}</span>
          <div className={styles.sidebarText}><strong>{principal.name}</strong><span>{role}</span></div>
        </div>
      </div>
    </aside>
  )
}
