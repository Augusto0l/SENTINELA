"use client";
import Link from "next/link";
import SimulationWorkspace from "@/features/occurrences/SimulationWorkspace";
import Header from "@/components/Header";
import IsolatedCreate from "@/features/occurrences/IsolatedCreate";

export default function NovaOcorrenciaEntry({ isolated = false }: { isolated?: boolean }) {
  if (isolated) return <><Header title="Nova Ocorrência" subtitle="Cadastro persistente isolado" /><div style={{ overflow: "auto", padding: 16, minWidth: 0 }}><h1>Nova ocorrência</h1><IsolatedCreate /></div></>;
  return <><Header title="Nova Ocorrência" subtitle="Cadastro demonstrativo" /><div style={{ overflow: "auto", padding: 16, minWidth: 0 }}><h1>Nova ocorrência</h1><p role="note">Cadastro somente demonstrativo. Simulações não gravam no banco nem aparecem na listagem persistente.</p><SimulationWorkspace startCreate /><Link href="/ocorrencias">Voltar à consulta de ocorrências</Link></div></>;
}
