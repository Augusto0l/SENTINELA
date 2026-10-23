"use client"
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  DEMO_ROLES,
  canVisit,
  canWrite,
  canInactivate,
  type DemoRole,
} from "@/data/demoPermissions"
import type { MockOccurrence } from "@/data/mockOccurrences"

interface Operations {
  role: DemoRole
  records: Record<string, MockOccurrence>
  inactive: Record<string, string>
  save: (record: MockOccurrence) => boolean
  inactivate: (id: string, reason: string) => boolean
}
const Context = createContext<Operations | null>(null)
const roleKey = "sentinela-demo-role"
function subscribeHydration() {
  return () => {}
}
function subscribeRole(callback: () => void) {
  window.addEventListener("sentinela-role", callback)
  return () => window.removeEventListener("sentinela-role", callback)
}
function readRole(): DemoRole {
  try {
    const value = sessionStorage.getItem(roleKey)
    return DEMO_ROLES.find((role) => role === value) ?? "Administrador"
  } catch {
    return "Administrador"
  }
}
export function useOperations() {
  const context = useContext(Context)
  if (!context) throw new Error("OperationalProvider ausente")
  return context
}
export default function OperationalProvider({
  children,
}: {
  children: ReactNode
}) {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  )
  const role = useSyncExternalStore(
    subscribeRole,
    readRole,
    () => "Administrador" as DemoRole,
  )
  function setRole(value: DemoRole) {
    try {
      sessionStorage.setItem(roleKey, value)
      window.dispatchEvent(new Event("sentinela-role"))
      setRoleError("")
    } catch {
      setRoleError(
        "O navegador bloqueou o armazenamento da sessão; não foi possível trocar o perfil demonstrativo.",
      )
    }
  }
  const [records, setRecords] = useState<Record<string, MockOccurrence>>({})
  const [inactive, setInactive] = useState<Record<string, string>>({})
  const [roleError, setRoleError] = useState("")
  const pathname = usePathname()
  return (
    <Context.Provider
      value={{
        role,
        records,
        inactive,
        save: (record) => {
          if (!canWrite(role) || inactive[record.id]) return false
          setRecords((previous) => ({ ...previous, [record.id]: record }))
          return true
        },
        inactivate: (id, reason) => {
          if (!canInactivate(role) || !reason.trim() || inactive[id])
            return false
          setInactive((previous) => ({ ...previous, [id]: reason.trim() }))
          return true
        },
      }}
    >
      <div
        style={{
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div className="demo-profile-bar">
          <span>
            Demonstração · alterações somente em memória, perdidas ao
            recarregar.
          </span>
          <label>
            Simular perfil{" "}
            <select
              disabled={!hydrated}
              value={role}
              onChange={(event) => setRole(event.target.value as DemoRole)}
            >
              {DEMO_ROLES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        {roleError && <p role="alert">{roleError}</p>}
        {!hydrated ? (
          <p role="status">Carregando demonstração…</p>
        ) : canVisit(role, pathname) ? (
          children
        ) : (
          <div role="alert" style={{ padding: 32 }}>
            <h1>Acesso negado na demonstração</h1>
            <p>
              O perfil {role} não pode acessar esta tela. Esta restrição é
              apenas de interface; não há autenticação ou autorização no
              servidor.
            </p>
            <Link href="/ocorrencias">Voltar às ocorrências</Link>
          </div>
        )}
      </div>
    </Context.Provider>
  )
}
