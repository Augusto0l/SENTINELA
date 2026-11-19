import { pcdfWorkspace } from "@/lib/db/pcdf-workspace"

export const runtime = "nodejs"
export function GET(request: Request) { return pcdfWorkspace(request, "review") }
