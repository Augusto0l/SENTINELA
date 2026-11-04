let scenario = {}
export function configure(value) { scenario = value }
export function createServerClient(_url, _key, options) {
  return { auth: { async getClaims() {
    for (const cookies of scenario.cookies ?? []) options.cookies.setAll(cookies,{})
    if (scenario.throw) throw new Error("simulated provider failure")
    return scenario.result ?? { data: null, error: { message: "invalid token" } }
  } } }
}
