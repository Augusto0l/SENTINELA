"use client"
import { createContext, useContext, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { hasPermission, routePermission, type Principal, type Role } from "@/lib/auth/policy"
import type { MockOccurrence } from "@/data/mockOccurrences"

interface Operations {
  role: Role
  principal: Principal
  hydrated: boolean
  correctionsEnabled: boolean
  records: Record<string, MockOccurrence>
  inactive: Record<string, string>
  save: (record: MockOccurrence) => boolean
  inactivate: (id: string, reason: string) => boolean
}
const Context = createContext<Operations | null>(null)
export function useOperations() {
  const context = useContext(Context)
  if (!context) throw new Error("OperationalProvider ausente")
  return context
}
// Retained export for existing headers; displays the verified role, never a selector.
export function DemoProfileSelect({ className = "" }: { className?: string }) {
  const { role } = useOperations()
  return <div className={`demo-profile-bar ${className}`}><span>Perfil: {role}</span></div>
}
export default function OperationalProvider({ children, principal }: { children: ReactNode; principal: Principal }) {
  const [records, setRecords] = useState<Record<string, MockOccurrence>>({})
  const pathname = usePathname()
  return <Context.Provider value={{
    role: principal.role, principal, hydrated: true, correctionsEnabled: false, records, inactive: {},
    save: record => {
      // Drafts only. Existing occurrences/corrections stay blocked pending audited backend.
      if (!hasPermission(principal.role, "cadastrar") || !record.id.startsWith("DEMO-")) return false
      setRecords(previous => ({ ...previous, [record.id]: record }))
      return true
    },
    inactivate: () => false,
  }}>
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {hasPermission(principal.role, routePermission(pathname)) ? children : <div role="alert" style={{ padding: 32 }}>
        <h1>Acesso negado</h1><p>Seu perfil não permite acessar esta tela.</p><Link href="/dashboard">Voltar ao Dashboard</Link>
      </div>}
    </div>
  </Context.Provider>
}
