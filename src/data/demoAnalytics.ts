/** Pure rules for the fictitious dataset; never an operational crime model. */
export const DEMO_REFERENCE_DATE = "2026-08-25";
export const DEMO_PERIOD_LABEL = "01/01/2026 a 25/08/2026";

export interface DemoRecord {
  raCode: string;
  natureza: string;
  data: string;
  horario: string;
  naturezas?: readonly string[];
}

export interface DemoFilters {
  period: string;
  startDate: string;
  endDate: string;
  ra: string;
  nature: string;
  hour: string;
}
export type DemoFilterInput = Partial<Omit<DemoFilters, "ra">> & { ra?: string | null };
export const emptyDemoFilters = (): DemoFilters => ({ period: "all", startDate: "", endDate: "", ra: "", nature: "", hour: "" });
const quickStarts: Record<string, string> = {
  today: DEMO_REFERENCE_DATE, "7d": "2026-08-19", "1m": "2026-07-26",
  "3m": "2026-05-26", "6m": "2026-02-26", "12m": "2025-08-26",
};

/** Civil date key, independent of the host timezone; never parse localized strings with Date.parse. */
export function demoCivilDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 9999) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() : null;
}
export function validateDemoPeriod(filters: DemoFilterInput): string | null {
  const period = filters.period ?? "all";
  if (period !== "custom") return period === "all" || Object.prototype.hasOwnProperty.call(quickStarts, period) ? null : "Período não reconhecido.";
  const start = demoCivilDate(filters.startDate ?? ""), end = demoCivilDate(filters.endDate ?? "");
  if (start === null || end === null) return "Informe datas inicial e final válidas (anos de 1900 a 9999).";
  return start > end ? "A data inicial não pode ser posterior à data final." : null;
}
export function demoPeriodLabel(filters: DemoFilterInput): string {
  if (validateDemoPeriod(filters)) return "Período inválido";
  const format = (value: string) => value.split("-").reverse().join("/");
  if (!filters.period || filters.period === "all") return DEMO_PERIOD_LABEL;
  return `${format(filters.period === "custom" ? filters.startDate! : quickStarts[filters.period])} a ${format(filters.period === "custom" ? filters.endDate! : DEMO_REFERENCE_DATE)}`;
}
export function demoFiltersFromSearch(search: { get: (name: string) => string | null }): DemoFilters {
  const filters = emptyDemoFilters();
  for (const name of Object.keys(filters) as (keyof DemoFilters)[]) filters[name] = search.get(name) ?? filters[name];
  return filters;
}
export function crimeMapHref(filters: DemoFilters): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(filters)) if (value && !(name === "period" && value === "all")) search.set(name, value);
  return `/mapa-criminal${search.size ? `?${search}` : ""}`;
}
const recordNatures = (record: DemoRecord) => [...new Set(record.naturezas?.length ? record.naturezas : [record.natureza])];

export function filterDemo<T extends DemoRecord>(records: readonly T[], filters: DemoFilterInput) {
  if (validateDemoPeriod(filters)) return [];
  const custom = filters.period === "custom";
  const start = custom ? demoCivilDate(filters.startDate!)! : demoCivilDate(quickStarts[filters.period ?? ""] ?? "") ?? -Infinity;
  const end = demoCivilDate(custom ? filters.endDate! : DEMO_REFERENCE_DATE)!;
  return records.filter((record) => {
    if (filters.ra && record.raCode !== filters.ra) return false;
    if (filters.nature && !recordNatures(record).includes(filters.nature)) return false;
    if (filters.hour) {
      const [start, finish] = filters.hour.split("-").map(Number);
      const hour = Number(record.horario.split(":")[0]);
      if (hour < start || hour >= finish) return false;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(record.data)) return false;
    const date = demoCivilDate(record.data.split("/").reverse().join("-"));
    return date !== null && date >= start && date <= end;
  });
}

export function summarizeDemo(records: readonly DemoRecord[]) {
  const byRa: Record<string, number> = {};
  const byNature: Record<string, number> = {};
  const byHour: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  for (const record of records) {
    byRa[record.raCode] = (byRa[record.raCode] ?? 0) + 1;
    for (const nature of recordNatures(record)) byNature[nature] = (byNature[nature] ?? 0) + 1;
    const hour = `${record.horario.slice(0, 2)}h`;
    byHour[hour] = (byHour[hour] ?? 0) + 1;
    const [day, month, year] = record.data.split("/").map(Number);
    const key = `${year}-${String(month).padStart(2, "0")}`;
    byMonth[key] = (byMonth[key] ?? 0) + 1;
    const weekday = weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    byDay[weekday] = (byDay[weekday] ?? 0) + 1;
  }
  const top = (values: Record<string, number>) => Object.entries(values).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const timeline = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
  return { total: records.length, byRa, byNature, timeline, peakHour: top(byHour), peakDay: top(byDay), topNature: top(byNature) };
}

/** Filter the period once; selecting an RA must not reapply a default period to that subset. */
export function queryDemoAnalytics<T extends DemoRecord>(records: readonly T[], filters: DemoFilterInput) {
  const mapRecords = filterDemo(records, { ...filters, ra: null });
  const visibleRecords = filters.ra ? mapRecords.filter(record => record.raCode === filters.ra) : mapRecords;
  const mapSummary = summarizeDemo(mapRecords);
  return { mapRecords, mapSummary, records: visibleRecords, summary: visibleRecords === mapRecords ? mapSummary : summarizeDemo(visibleRecords) };
}
