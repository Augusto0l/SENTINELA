"use client"

import Occurrences from "@/features/Occurrences"

export default function OccurrencesEntry({ isolated = false }: { isolated?: boolean }) {
  return <Occurrences isolated={isolated} />
}
