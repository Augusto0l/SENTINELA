import { getLocalPrincipal } from "@/lib/auth/local-server"
import { queryOccurrences } from "@/lib/db/occurrences"
import { occurrenceGET } from "@/lib/db/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export function GET(request: Request) {
  return occurrenceGET(request, undefined, { principal: getLocalPrincipal, query: queryOccurrences })
}
