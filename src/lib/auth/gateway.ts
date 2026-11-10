import { localSelected } from "@/lib/auth/local-provider"
import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AuthGateway } from "@/lib/auth/core"

export default function authGateway(client: SupabaseClient): AuthGateway {
  if (localSelected()) throw new Error("Remote Auth unavailable for local provider")
  return {
    async identity() {
      const { data, error } = await client.auth.getUser()
      return error ? null : data.user && { id: data.user.id }
    },
    async access() {
      const { data, error } = await client.schema("sentinela_api").rpc("meu_acesso")
      if (error) throw new Error("Acesso indisponível.")
      return data
    },
    async login(email, password) { return !(await client.auth.signInWithPassword({ email, password })).error },
    async logout() { return !(await client.auth.signOut({ scope: "global" })).error },
    async recover(email, redirectTo) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw new Error("Recuperação indisponível.")
    },
    async updatePassword(password) { return !(await client.auth.updateUser({ password })).error },
    async exchange(code) { return !(await client.auth.exchangeCodeForSession(code)).error },
    async verify(token_hash, type) { return !(await client.auth.verifyOtp({ token_hash, type })).error },
  }
}
