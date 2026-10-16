"use client";
import Button from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="page-skeleton" role="alert"><h1>Não foi possível carregar a tela</h1><p>Tente novamente para continuar a demonstração.</p><Button onClick={reset}>Tentar novamente</Button></section>;
}
