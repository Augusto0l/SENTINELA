import { pcdfWorkspace } from "@/lib/db/pcdf-workspace"

export const runtime = "nodejs"
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return pcdfWorkspace(request, "decide", (await params).id)
}
