"use client"

import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "@/components/ThemeProvider"
import { useDemoToast } from "@/components/DemoProvider"
import { DemoProfileSelect, useOperations } from "@/components/OperationalProvider"
import NavigationIcon from "@/components/NavigationIcon"
import styles from "@/components/Navigation.module.css"

interface HeaderProps {
  title: string
  subtitle?: string
}

export default function Header({ title, subtitle }: HeaderProps) {
  const router = useRouter()
  const { principal } = useOperations()
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const notify = useDemoToast()
  const group = pathname.startsWith("/ocorrencias") || pathname === "/importar"
    ? "Ocorrências" : pathname === "/usuarios" || pathname === "/configuracoes" ? "Gestão" : "Visão Geral"
  return (
    <header className={`system-topbar ${styles.header}`}>
      <div className={styles.pageContext}>
        <div className={styles.breadcrumb}>
          <span className={styles.breadcrumbBrand}>SENTINELA</span>
          <NavigationIcon name="chevron" size={11} />
          <span>{group}</span>
          <span className={styles.demoBadge} title="Dados fictícios. Alterações somente em memória, perdidas ao recarregar.">Demonstração · sem persistência</span>
        </div>
        <div className={styles.pageTitleRow}>
          <span className={styles.pageTitle}>{title}</span>
          {subtitle && <span className={`topbar-subtitle ${styles.subtitle}`}>{subtitle}</span>}
        </div>
      </div>

      <div className={styles.headerActions}>
        <div className={styles.utilityActions}>
          <button className={styles.iconButton} type="button" title="Notificações demonstrativas" aria-label="Notificações demonstrativas"
            onClick={() => notify("Notificações ilustrativas. Não há alertas de ocorrências reais.")}>
            <NavigationIcon name="bell" />
          </button>
          <button className={styles.iconButton} type="button" title="Alternar tema"
            aria-label={resolvedTheme === "escuro" ? "Ativar tema claro" : "Ativar tema escuro"}
            aria-pressed={resolvedTheme === "escuro"}
            onClick={() => setTheme(resolvedTheme === "escuro" ? "claro" : "escuro")}>
            <NavigationIcon name={resolvedTheme === "escuro" ? "sun" : "moon"} />
          </button>
        </div>
        <DemoProfileSelect className={styles.profile} />
        <button className={`topbar-user ${styles.headerUser}`} type="button" aria-label="Abrir configurações da conta"
          title={`Configurações de ${principal.name}`} onClick={() => router.push("/configuracoes")}>
          <span className={styles.avatar}>{principal.name.slice(0, 2).toLocaleUpperCase("pt-BR")}</span>
          <span className={styles.headerUserName}>{principal.name}<small>{principal.role}</small></span>
          <NavigationIcon name="chevron" size={14} />
        </button>
      </div>
    </header>
  )
}
