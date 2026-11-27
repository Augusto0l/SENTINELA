"use client"

import * as Dialog from "@radix-ui/react-dialog"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "@/components/ThemeProvider"
import { useOperations } from "@/components/OperationalProvider"
import NavigationIcon from "@/components/NavigationIcon"
import { navigationGroups } from "@/components/navigation-items"
import { canVisit, NAVIGATION_ROUTES } from "@/lib/auth/policy"
import styles from "@/components/Navigation.module.css"

interface HeaderProps {
  title: string
  // Existing screens pass these presentation props. The header uses the route title alone.
  subtitle?: string
  dataMode?: "read-only" | "pcdf-staging" | "import-staging" | "occurrence-read"
}

const navigationItems = navigationGroups.flatMap(group => group.items)

export default function Header({ title }: HeaderProps) {
  const { principal } = useOperations()
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const current = navigationItems.find(item => NAVIGATION_ROUTES[item.key] === pathname)
  const settingsRoute = NAVIGATION_ROUTES.settings
  const canOpenSettings = canVisit(principal.role, settingsRoute)
  return (
    <header className={`system-topbar ${styles.header}`}>
      <div className={styles.pageContext}>
        <NavigationIcon name={current?.icon ?? "records"} size={18} />
        <span className={styles.pageTitle}>{current?.label ?? title}</span>
      </div>

      <div className={styles.headerActions}>
        <button className={styles.iconButton} type="button" title="Alternar tema"
          aria-label={resolvedTheme === "escuro" ? "Ativar tema claro" : "Ativar tema escuro"}
          aria-pressed={resolvedTheme === "escuro"}
          onClick={() => setTheme(resolvedTheme === "escuro" ? "claro" : "escuro")}>
          <span className={styles.themeIconDark}><NavigationIcon name="sun" /></span>
          <span className={styles.themeIconLight}><NavigationIcon name="moon" /></span>
        </button>
        <div className={styles.account}>
          <Dialog.Root modal={false}>
            <Dialog.Trigger className={`topbar-user ${styles.headerUser}`} aria-label={`Abrir perfil de ${principal.name}`}>
              <span className={styles.avatar} aria-hidden="true">{principal.name.slice(0, 2).toLocaleUpperCase("pt-BR")}</span>
              <span className={styles.headerUserName}>{principal.name}</span>
              <NavigationIcon name="chevron" size={14} />
            </Dialog.Trigger>
            <Dialog.Content className={styles.accountPanel} aria-describedby={undefined}>
              <Dialog.Title className={styles.accountName}>{principal.name}</Dialog.Title>
              <p className={styles.accountRole}>{principal.role}</p>
              {principal.source === "preview" && <p className={styles.accountRole}>Demonstração local · dados fictícios · sem autenticação real ou acesso ao banco.</p>}
              {canOpenSettings ? (
                <Dialog.Close asChild>
                  <Link className={styles.accountLink} href={settingsRoute}>
                    <NavigationIcon name="settings" size={16} />
                    Configurações da conta
                  </Link>
                </Dialog.Close>
              ) : <p className={styles.accountRole}>Configurações disponíveis para administradores.</p>}
              {principal.source === "preview" && <Dialog.Close asChild><Link className={styles.accountLink} href="/login">Voltar ao login</Link></Dialog.Close>}
            </Dialog.Content>
          </Dialog.Root>
        </div>
      </div>
    </header>
  )
}
