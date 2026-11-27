import { persistentDestination } from "@/lib/db/config"

// Import visibility during local qualification is limited to consolidated fixtures.
// Keep the reviewed operations database's existing manual occurrence lifecycle.
export const visibleOccurrence = `(o.origem='manual' OR (
  current_database()='${persistentDestination.database}' AND o.origem='importacao'
  AND o.fonte='PCDF-SANDBOX' AND o.ativo AND o.consolidacao_status='consolidada'
))`
