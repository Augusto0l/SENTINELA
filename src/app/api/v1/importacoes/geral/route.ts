import { pcdfWorkspace } from "@/lib/db/pcdf-workspace"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export function GET(request: Request) { return pcdfWorkspace(request, "general-lots") }
export function POST(request: Request) { return pcdfWorkspace(request, "general-upload") }
