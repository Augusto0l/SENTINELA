export const state = { principal: null, path: "/ocorrencias" }
export function useOperations() { return {principal:state.principal,role:state.principal.role,records:{},inactive:{},correctionsEnabled:false} }
export function DemoProfileSelect() { return null }
export function usePathname() { return state.path }
export function useRouter() { return {push(){}} }
export function useTheme() { return {resolvedTheme:"claro",setTheme(){}} }
export function useDemoToast() { return ()=>{} }
export function localSelected() { return true }
export function localAllowed() { return true }
export const LOCAL_COOKIE="sentinela-local-session"
export async function localSession(token) { return token==="verified-test-session"?state.principal:null }
