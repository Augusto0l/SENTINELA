import { getLocalPrincipal } from "@/lib/auth/local-server"
import { queryOccurrences } from "@/lib/db/occurrences"
import { occurrenceGET } from "@/lib/db/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return occurrenceGET(request, (await context.params).id, { principal: getLocalPrincipal, query: queryOccurrences })
}
