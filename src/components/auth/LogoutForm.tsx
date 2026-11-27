"use client"

import { useRef, useState, type FormEvent, type FormHTMLAttributes } from "react"

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "method" | "onSubmit">

export default function LogoutForm({ children, ...props }: Props) {
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  async function logout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    busy.current = true
    setPending(true)
    setFailed(false)
    try {
      // Unlike form navigation under no-referrer, same-origin fetch preserves Origin.
      // The selected provider still validates CSRF and revokes the server session.
      const response = await fetch("/auth/logout", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "",
      })
      const destination = new URL(response.url)
      if (!response.ok || !response.redirected || destination.origin !== window.location.origin
        || destination.pathname !== "/login" || destination.searchParams.get("estado") !== "saiu") throw Error("Logout failed")
      // Full navigation discards the authenticated client router and its cached tree.
      window.location.replace(destination.href)
    } catch {
      setFailed(true)
      setPending(false)
      busy.current = false
    }
  }
  return <form {...props} action="/auth/logout" method="post" onSubmit={logout} aria-busy={pending}>
    {children}
    {failed && <p role="alert">Não foi possível encerrar a sessão. Tente novamente.</p>}
  </form>
}
