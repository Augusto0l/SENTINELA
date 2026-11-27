import { localSelected } from "@/lib/auth/local-provider"
import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AuthGateway } from "@/lib/auth/core"
import { onboardingPhase } from "@/lib/auth/onboarding"

export default function authGateway(client: SupabaseClient): AuthGateway {
  if (localSelected()) throw new Error("Remote Auth unavailable for local provider")
  return {
    async identity() {
      const { data, error } = await client.auth.getUser()
      if (error || !data.user) return null
      const onboarding = onboardingPhase(data.user.app_metadata)
      return { id: data.user.id, ...(onboarding && { onboarding }) }
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
    async updatePassword(password) {
      const { data, error } = await client.auth.getUser()
      if (error || !data.user) return false
      const phase = onboardingPhase(data.user.app_metadata)
      if (phase === "provisioning") return false
      if (phase !== "password") return !(await client.auth.updateUser({ password })).error
      const { institutionalAuthAdmin } = await import("@/lib/supabase/admin")
      const admin = await institutionalAuthAdmin()
      if (!admin || (await client.auth.updateUser({ password })).error) return false
      return !(await admin.auth.admin.updateUserById(data.user.id, {
        app_metadata: { ...data.user.app_metadata, sentinela_onboarding: "complete" },
      })).error
    },
    async exchange(code) { return !(await client.auth.exchangeCodeForSession(code)).error },
    async verify(token_hash, type) { return !(await client.auth.verifyOtp({ token_hash, type })).error },
  }
}
