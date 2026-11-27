import "server-only"
import { localSelected } from "@/lib/auth/local-provider"
import { headers } from "next/headers"
import { localDemoEnabled } from "@/lib/auth/local-demo"
import { requirePrincipal } from "@/lib/auth/server"
import type { Permission, Principal } from "@/lib/auth/policy"

export async function isLocalDemo() {
  return !localSelected() && localDemoEnabled((await headers()).get("host"))
}

// Page rendering only; API handlers must keep using real Auth checks.
export async function requirePagePrincipal(permission?: Permission): Promise<Principal> {
  if (await isLocalDemo()) return {
    source: "preview", id: "DEMO-LOCAL", authUserId: "", name: "Demonstração local", role: "Administrador",
  }
  return requirePrincipal(permission)
}
