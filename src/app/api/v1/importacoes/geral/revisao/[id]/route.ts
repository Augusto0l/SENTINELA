import { pcdfWorkspace } from "@/lib/db/pcdf-workspace"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return pcdfWorkspace(request, "general-decide", (await params).id)
}
