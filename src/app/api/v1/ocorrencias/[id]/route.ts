import { getLocalPrincipal } from "@/lib/auth/local-server"
import { queryOccurrences } from "@/lib/db/occurrences"
import { occurrenceGET } from "@/lib/db/http"
import { isolatedOccurrenceMutation } from "@/lib/db/isolated-write"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return occurrenceGET(request, (await context.params).id, { principal: getLocalPrincipal, query: queryOccurrences })
}
export function PATCH(request: Request) {
  return isolatedOccurrenceMutation(request)
}
