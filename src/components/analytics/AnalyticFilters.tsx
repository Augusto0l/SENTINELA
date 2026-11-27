"use client";
import { useId, useRef, useState } from "react";
import Button from "@/components/ui/button";
import { RA_LIST, CRIME_NATURES, PERIODS, HOURS } from "@/data/mockData";
import { demoPeriodLabel, emptyDemoFilters, validateDemoPeriod } from "@/data/demoAnalytics";
import type { AnalyticSelection } from "@/components/analytics/usePersistentAnalytics";
import styles from "@/components/analytics/Analytics.module.css";

export default function AnalyticFilters({ filters, onChange, regions = RA_LIST, catalog, compact = false }: {
  filters: AnalyticSelection; onChange: (filters: AnalyticSelection) => void;
  regions?: readonly { codigo: string; nomeDisplay: string }[];
  catalog?: { natures: { id: string; name: string }[]; categories: { id: string; name: string }[] };
  compact?: boolean;
}) {
  const [period, setPeriod] = useState(filters.period);
  const [startDate, setStartDate] = useState(filters.startDate);
  const [endDate, setEndDate] = useState(filters.endDate);
  const [error, setError] = useState(validateDemoPeriod(filters) ?? "");
  const startInput = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const fieldId = useId();
  const active = [filters.ra, filters.nature, filters.category, filters.hour].filter(Boolean).length;
  const complementary = <>
    <div className={styles.field}><label htmlFor={`${fieldId}-ra`}>Região Administrativa</label><select id={`${fieldId}-ra`} value={filters.ra} onChange={event => onChange({ ...filters, ra: event.target.value })}><option value="">Todas as regiões</option>{regions.map(ra => <option key={ra.codigo} value={ra.codigo}>{ra.nomeDisplay}</option>)}</select></div>
    <div className={styles.field}><label htmlFor={`${fieldId}-nature`}>Natureza criminal</label><select id={`${fieldId}-nature`} value={filters.nature} onChange={event => onChange({ ...filters, nature: event.target.value })}><option value="">Todas as naturezas</option>{catalog ? catalog.natures.map(item => <option key={item.id} value={item.id}>{item.name}</option>) : CRIME_NATURES.map(nature => <option key={nature}>{nature}</option>)}</select></div>
    {catalog && <div className={styles.field}><label htmlFor={`${fieldId}-category`}>Categoria</label><select id={`${fieldId}-category`} value={filters.category ?? ""} onChange={event => onChange({ ...filters, category: event.target.value })}><option value="">Todas as categorias</option>{catalog.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
    <div className={styles.field}><label htmlFor={`${fieldId}-hour`}>Faixa de horário</label><select id={`${fieldId}-hour`} value={filters.hour} onChange={event => onChange({ ...filters, hour: event.target.value })}>{HOURS.map(hour => <option key={hour.value} value={hour.value}>{hour.label}</option>)}</select></div>
    <Button type="button" variant="outline" size="sm" onClick={() => { setPeriod("all"); setStartDate(""); setEndDate(""); setError(""); onChange(emptyDemoFilters()); }}>Limpar filtros</Button>
  </>;
  return <form className={compact ? styles.compactFilters : styles.filters} aria-label="Filtros analíticos" noValidate onSubmit={event => {
    event.preventDefault();
    const next = { ...filters, period, startDate: period === "custom" ? startDate : "", endDate: period === "custom" ? endDate : "" };
    const message = validateDemoPeriod(next);
    setError(message ?? "");
    if (message) startInput.current?.focus(); else onChange(next);
  }}>
    <div className={compact ? `${styles.field} ${styles.compactPeriod}` : styles.field}><label className={compact ? "sr-only" : undefined} htmlFor={`${fieldId}-period`}>{catalog ? "Período" : "Período da base fictícia"}</label>
      {compact && <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4" /></svg>}
      <select id={`${fieldId}-period`} value={period} onChange={event => {
      const value = event.target.value; setPeriod(value); setError("");
      if (value !== "custom") onChange({ ...filters, period: value, startDate: "", endDate: "" });
    }}><option value="all">{catalog ? "Todo o período" : "Toda a base fictícia"}</option>{PERIODS.filter(item => !catalog || item.value === "custom").map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
    {compact && <details className={styles.compactDetails} onKeyDown={event => {
      if (event.key === "Escape" && event.currentTarget.open) {
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }
    }}>
      <summary>Filtros {active > 0 && <span aria-label={`${active} filtros complementares ativos`}>{active}</span>}</summary>
      <div className={styles.compactPanel}>{complementary}</div>
    </details>}
    {period === "custom" && <div className={compact ? `${styles.dates} ${styles.compactDates}` : styles.dates}>
      <label className={styles.field}>Data inicial<input ref={startInput} type="date" min="1900-01-01" max="9999-12-31" value={startDate} required aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={event => { setStartDate(event.target.value); setError(""); }} /></label>
      <label className={styles.field}>Data final<input type="date" min="1900-01-01" max="9999-12-31" value={endDate} required aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={event => { setEndDate(event.target.value); setError(""); }} /></label>
      <Button type="submit" size="sm">Aplicar período</Button>
    </div>}
    {!compact && complementary}
    {error && <p id={errorId} role="alert" className={styles.error}>{error} {validateDemoPeriod(filters) ? "Limpe os filtros ou aplique um período válido para consultar os dados." : "O último filtro aplicado foi mantido."}</p>}
    <p role="status" className={compact && period !== "custom" ? "sr-only" : styles.applied}>Período aplicado: {catalog && filters.period === "all" ? "Todo o período" : demoPeriodLabel(filters)}. {!catalog && "Atalhos relativos à base fictícia de 25/08/2026."} {period === "custom" && "Edite as datas e use Aplicar período."}</p>
  </form>;
}
