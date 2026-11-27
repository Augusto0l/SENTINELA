export function onboardingPhase(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("sentinela_onboarding" in metadata)) return undefined
  const phase = metadata.sentinela_onboarding
  return phase === "provisioning" || phase === "password" ? phase : undefined
}

export function strongInstitutionalPassword(value: string) {
  return value.length >= 16 && new TextEncoder().encode(value).length <= 72 && value === value.trim()
    && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value) && /[^a-zA-Z0-9\s]/.test(value)
    && new Set(value).size >= 10
}
