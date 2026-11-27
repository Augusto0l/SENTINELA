import { pcdfWorkspace } from "@/lib/db/pcdf-workspace"
import { hostedOperationalMode } from "@/lib/db/pcdf-direct-mode"
import { hostedReview } from "@/lib/db/hosted-review"

export const runtime = "nodejs"
export function GET(request: Request) {
  return hostedOperationalMode() ? hostedReview(request) : pcdfWorkspace(request, "review")
}
