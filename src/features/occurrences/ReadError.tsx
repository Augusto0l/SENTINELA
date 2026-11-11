import Link from "next/link"
import Button from "@/components/ui/button"
import type { OccurrenceReadError } from "@/features/occurrences/client"
export default function ReadError({
  error,
  retry,
}: {
  error: OccurrenceReadError
  retry: () => void
}) {
  return (
    <div role="alert">
      <p>{error.message}</p>
      {error.status === 401 ? (
        <Link href="/login?erro=sessao">Entrar novamente</Link>
      ) : error.status === 403 ? null : (
        <Button variant="outline" onClick={retry}>
          Tentar novamente
        </Button>
      )}
    </div>
  )
}
