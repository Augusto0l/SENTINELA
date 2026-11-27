import { pcdfWorkspace } from "@/lib/db/pcdf-workspace"

export const runtime = "nodejs"
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return pcdfWorkspace(request, "promote", (await params).id)
}
