import { pcdfWorkspace } from "@/lib/db/pcdf-workspace"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return pcdfWorkspace(request, "general-detail", (await params).id)
}
