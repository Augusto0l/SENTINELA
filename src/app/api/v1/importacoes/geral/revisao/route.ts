import { pcdfWorkspace } from "@/lib/db/pcdf-workspace"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export function GET(request: Request) { return pcdfWorkspace(request, "general-review") }
