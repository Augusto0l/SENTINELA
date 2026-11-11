"use client";
import { useRouter } from "next/navigation";
import OccurrenceForm from "@/components/occurrences/OccurrenceForm";
import Header from "@/components/Header";

export default function NovaOcorrenciaEntry() {
  const router = useRouter();
  return <><Header title="Nova Ocorrência" subtitle="Cadastro demonstrativo" /><div style={{ overflow: "auto", padding: 24 }}><h1>Nova ocorrência</h1><p role="note">Cadastro somente demonstrativo. Simulações não gravam no banco nem aparecem na listagem persistente.</p><OccurrenceForm onDone={() => router.push("/ocorrencias")} /></div></>;
}
