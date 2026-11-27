import { getLocalPrincipal } from "@/lib/auth/local-server"
import { queryCatalog } from "@/lib/db/catalogs"
import { catalogGET } from "@/lib/db/catalog-http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export function GET(request: Request) {
  return catalogGET(request, "naturezas", { principal: getLocalPrincipal, query: queryCatalog })
}
