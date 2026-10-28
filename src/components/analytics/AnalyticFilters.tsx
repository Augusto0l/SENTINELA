"use client";
import { useId, useRef, useState } from "react";
import Button from "@/components/ui/button";
import { RA_LIST, CRIME_NATURES, PERIODS, HOURS } from "@/data/mockData";
import { demoPeriodLabel, emptyDemoFilters, validateDemoPeriod, type DemoFilters } from "@/data/demoAnalytics";
import styles from "@/components/analytics/Analytics.module.css";

export default function AnalyticFilters({ filters, onChange }: { filters: DemoFilters; onChange: (filters: DemoFilters) => void }) {
  const [period, setPeriod] = useState(filters.period);
  const [startDate, setStartDate] = useState(filters.startDate);
  const [endDate, setEndDate] = useState(filters.endDate);
  const [error, setError] = useState(validateDemoPeriod(filters) ?? "");
  const startInput = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const fieldId = useId();
  return <form className={styles.filters} aria-label="Filtros analíticos" noValidate onSubmit={event => {
    event.preventDefault();
    const next = { ...filters, period, startDate: period === "custom" ? startDate : "", endDate: period === "custom" ? endDate : "" };
    const message = validateDemoPeriod(next);
    setError(message ?? "");
    if (message) startInput.current?.focus(); else onChange(next);
  }}>
    <div className={styles.field}><label htmlFor={`${fieldId}-period`}>Período da base fictícia</label><select id={`${fieldId}-period`} value={period} onChange={event => {
      const value = event.target.value; setPeriod(value); setError("");
      if (value !== "custom") onChange({ ...filters, period: value, startDate: "", endDate: "" });
    }}><option value="all">Toda a base fictícia</option>{PERIODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
    {period === "custom" && <div className={styles.dates}>
      <label className={styles.field}>Data inicial<input ref={startInput} type="date" min="1900-01-01" max="9999-12-31" value={startDate} required aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={event => { setStartDate(event.target.value); setError(""); }} /></label>
      <label className={styles.field}>Data final<input type="date" min="1900-01-01" max="9999-12-31" value={endDate} required aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={event => { setEndDate(event.target.value); setError(""); }} /></label>
      <Button type="submit" size="sm">Aplicar período</Button>
    </div>}
    <div className={styles.field}><label htmlFor={`${fieldId}-ra`}>Região Administrativa</label><select id={`${fieldId}-ra`} value={filters.ra} onChange={event => onChange({ ...filters, ra: event.target.value })}><option value="">Todas as regiões</option>{RA_LIST.map(ra => <option key={ra.codigo} value={ra.codigo}>{ra.nomeDisplay}</option>)}</select></div>
    <div className={styles.field}><label htmlFor={`${fieldId}-nature`}>Natureza criminal</label><select id={`${fieldId}-nature`} value={filters.nature} onChange={event => onChange({ ...filters, nature: event.target.value })}><option value="">Todas as naturezas</option>{CRIME_NATURES.map(nature => <option key={nature}>{nature}</option>)}</select></div>
    <div className={styles.field}><label htmlFor={`${fieldId}-hour`}>Faixa de horário</label><select id={`${fieldId}-hour`} value={filters.hour} onChange={event => onChange({ ...filters, hour: event.target.value })}>{HOURS.map(hour => <option key={hour.value} value={hour.value}>{hour.label}</option>)}</select></div>
    <Button variant="outline" size="sm" onClick={() => { setPeriod("all"); setStartDate(""); setEndDate(""); setError(""); onChange(emptyDemoFilters()); }}>Limpar filtros</Button>
    {error && <p id={errorId} role="alert" className={styles.error}>{error} {validateDemoPeriod(filters) ? "Limpe os filtros ou aplique um período válido para consultar os dados." : "O último filtro aplicado foi mantido."}</p>}
    <p role="status" className={styles.applied}>Período aplicado: {demoPeriodLabel(filters)}. Atalhos relativos à base fictícia de 25/08/2026. {period === "custom" && "Edite as datas e use Aplicar período."}</p>
  </form>;
}
