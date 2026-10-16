/** Pure rules for the fictitious dataset; never an operational crime model. */
export const DEMO_REFERENCE_DATE = "2026-08-25";
export const DEMO_PERIOD_LABEL = "01/01/2026 a 25/08/2026";

export interface DemoRecord {
  raCode: string;
  natureza: string;
  data: string;
  horario: string;
}

export function filterDemo<T extends DemoRecord>(records: T[], filters: { ra?: string | null; nature?: string; hour?: string; period?: string }) {
  const end = Date.UTC(2026, 7, 25, 23, 59, 59, 999);
  const starts: Record<string, number> = {
    today: Date.UTC(2026, 7, 25), "7d": Date.UTC(2026, 7, 19),
    "1m": Date.UTC(2026, 6, 26), "3m": Date.UTC(2026, 4, 26),
    "6m": Date.UTC(2026, 1, 26), "12m": Date.UTC(2025, 7, 26),
  };
  return records.filter((record) => {
    if (filters.ra && record.raCode !== filters.ra) return false;
    if (filters.nature && record.natureza !== filters.nature) return false;
    if (filters.hour) {
      const [start, finish] = filters.hour.split("-").map(Number);
      const hour = Number(record.horario.split(":")[0]);
      if (hour < start || hour >= finish) return false;
    }
    const [day, month, year] = record.data.split("/").map(Number);
    const date = Date.UTC(year, month - 1, day);
    return date >= (starts[filters.period ?? ""] ?? -Infinity) && date <= end;
  });
}

export function summarizeDemo(records: DemoRecord[]) {
  const byRa: Record<string, number> = {};
  const byNature: Record<string, number> = {};
  const byHour: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  for (const record of records) {
    byRa[record.raCode] = (byRa[record.raCode] ?? 0) + 1;
    byNature[record.natureza] = (byNature[record.natureza] ?? 0) + 1;
    const hour = `${record.horario.slice(0, 2)}h`;
    byHour[hour] = (byHour[hour] ?? 0) + 1;
    const [day, month, year] = record.data.split("/").map(Number);
    const weekday = weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    byDay[weekday] = (byDay[weekday] ?? 0) + 1;
  }
  const top = (values: Record<string, number>) => Object.entries(values).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  return { total: records.length, byRa, byNature, peakHour: top(byHour), peakDay: top(byDay), topNature: top(byNature) };
}
