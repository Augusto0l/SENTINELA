import "server-only"
import { cookies, headers } from "next/headers"
import { LOCAL_COOKIE, localSession } from "@/lib/auth/local-provider"

export async function getLocalPrincipal() {
  return localSession((await cookies()).get(LOCAL_COOKIE)?.value, (await headers()).get("host"))
}
