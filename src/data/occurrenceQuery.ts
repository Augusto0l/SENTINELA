import type { MockOccurrence } from "@/data/mockOccurrences";

export type SortColumn = "id" | "data" | "horario" | "natureza" | "raName" | "local";
export interface OccurrenceFilters { search: string; ra: string; nature: string }
export interface OccurrenceSort { column: SortColumn; direction: "asc" | "desc" }
export function emptyOccurrenceFilters(): OccurrenceFilters {
  return { search: "", ra: "", nature: "" };
}
export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim().replace(/\s+/g, " ");
}
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
function dateValue(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  return Date.UTC(year, month - 1, day);
}
function timeValue(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

/** Receives browser-generated records without importing or mutating their collection. */
export function queryOccurrences<T extends MockOccurrence>(
  records: readonly T[], filters: OccurrenceFilters, sort: OccurrenceSort | null, page = 1, pageSize = 25,
) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError("Tamanho de página inválido");
  const query = normalizeSearch(filters.search);
  const filtered = records.filter((record) =>
    (!filters.ra || record.raCode === filters.ra) &&
    (!filters.nature || record.natureza === filters.nature) &&
    (!query || [record.id, record.raCode, record.raName, record.natureza, record.local].some((value) => normalizeSearch(value).includes(query))),
  );
  if (sort) {
    const { column, direction } = sort;
    filtered.sort((a, b) => {
      const comparison = column === "data" ? dateValue(a.data) - dateValue(b.data)
        : column === "horario" ? timeValue(a.horario) - timeValue(b.horario)
        : collator.compare(normalizeSearch(a[column]), normalizeSearch(b[column]));
      return comparison * (direction === "asc" ? 1 : -1) || collator.compare(a.id, b.id);
    });
  }
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Number.isFinite(page) ? Math.max(1, Math.min(totalPages, Math.trunc(page))) : 1;
  return { total, totalPages, page: currentPage, records: filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize) };
}
