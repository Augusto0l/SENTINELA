"use client";
import Header from "@/components/Header";
import IsolatedCreate from "@/features/occurrences/IsolatedCreate";
import ManualCreate from "@/features/occurrences/ManualCreate";
import styles from "@/features/occurrences/ManualCreate.module.css";

export default function NovaOcorrenciaEntry({ isolated = false, persistent = false, mapLink = false }: { isolated?: boolean; persistent?: boolean; mapLink?: boolean }) {
  if (isolated) return <><Header title="Nova Ocorrência" subtitle="Cadastro persistente isolado" /><div style={{ overflow: "auto", padding: 16, minWidth: 0 }}><h1>Nova ocorrência</h1><IsolatedCreate persistent={persistent} /></div></>;
  return <><Header title="Nova Ocorrência" /><div className={styles.workspace}><ManualCreate mapLink={mapLink} /></div></>;
}
