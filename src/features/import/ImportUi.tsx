"use client";

import type { ReactNode } from "react";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import styles from "./ImportWorkflow.module.css";

export const pageSize = 25;
export const formatCount = (value: number) => value.toLocaleString("pt-BR");
export const formatMonth = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(value + "-01T00:00:00Z"));
export const formatBytes = (value: number) => value >= 1024 * 1024
  ? (value / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " MiB"
  : (value / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " KiB";

export function Metrics({ items }: { items: { label: string; value: ReactNode }[] }) {
  return <dl className={styles.metrics}>{items.map(({ label, value }) =>
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function Pager({ page, total, onChange, label = "Paginação da prévia" }: {
  page: number; total: number; onChange: (page: number) => void; label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav className={styles.pager} aria-label={label}>
    <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onChange(page - 1)}>Anterior</Button>
    <span aria-live="polite">Página {formatCount(page)} de {formatCount(pages)}</span>
    <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Próxima</Button>
  </nav>;
}

export function ImportDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <Dialog title={title} onClose={onClose} drawer style={{ width: "min(680px, 100vw)" }}>
    <div className={styles.drawer}>
      <div className={styles.drawerHeader}><h2>{title}</h2>
        <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
      </div>
      {children}
    </div>
  </Dialog>;
}

export function Fields({ items }: { items: { label: string; value: ReactNode }[] }) {
  return <dl className={styles.fields}>{items.map(({ label, value }, i) => <div key={i}>
    <dt>{label}</dt><dd>{value === "" || value === null || value === undefined
      ? <span className={styles.empty}>Vazio</span> : value}</dd>
  </div>)}</dl>;
}
