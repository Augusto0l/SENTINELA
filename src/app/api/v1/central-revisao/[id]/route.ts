import { pcdfWorkspace } from "@/lib/db/pcdf-workspace"
import { hostedOperationalMode } from "@/lib/db/pcdf-direct-mode"
import { hostedReview } from "@/lib/db/hosted-review"

export const runtime = "nodejs"
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (hostedOperationalMode()) return hostedReview(request, id)
  return pcdfWorkspace(request, "decide", id)
}
