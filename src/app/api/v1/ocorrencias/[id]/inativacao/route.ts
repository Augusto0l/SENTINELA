import { isolatedOccurrenceMutation } from "@/lib/db/isolated-write"

export const runtime = "nodejs"

export function POST(request: Request) {
  return isolatedOccurrenceMutation(request)
}
