import { createElement } from "react"

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
export default function Link(props) { return createElement("a", props) }

// Render the expanded dialog so the static test can inspect the actions offered by each role.
export function Root({ children }) { return children }
export function Trigger(props) { return createElement("button", { ...props, "aria-haspopup": "dialog" }) }
export function Content({ children }) { return createElement("div", { role: "dialog" }, children) }
export function Title(props) { return createElement("h2", props) }
export function Description(props) { return createElement("p", props) }
export function Close({ children }) { return children }
