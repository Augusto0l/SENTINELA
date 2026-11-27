import { pcdfWorkspace } from "@/lib/db/pcdf-workspace"

export const runtime = "nodejs"
export function GET(request: Request) { return pcdfWorkspace(request, "lots") }
export function POST(request: Request) { return pcdfWorkspace(request, "upload") }
