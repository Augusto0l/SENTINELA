// Dados demonstrativos — não representam ocorrências policiais reais.

import { RAS, GEO_BOUNDS } from "../components/map/raMapData";
import { RA_LIST } from "./mockData";

export interface MockOccurrence {
  id: string;
  raCode: string;
  raName: string;
  natureza: string;
  data: string;
  horario: string;
  latitude: number;
  longitude: number;
  x: number;
  y: number;
  local: string;
}

function lcg(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rng = lcg(42);

function randomDate(rand: () => number): string {
  const start = new Date(2026, 0, 1).getTime();
  const end = new Date(2026, 7, 25).getTime();
  const d = new Date(start + rand() * (end - start));
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function randomTime(rand: () => number): string {
  const r = rand();
  let hour: number;
  if (r < 0.45) {
    hour = 18 + Math.floor(rand() * 6);
  } else {
    hour = Math.floor(rand() * 18);
  }
  const minute = Math.floor(rand() * 60);
  return `${String(hour % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function pickWeighted(
  entries: [string, number][],
  rand: () => number
): string {
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return entries[0][0];
  let pick = rand() * total;
  for (const [key, val] of entries) {
    pick -= val;
    if (pick <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function inverseProject(x: number, y: number) {
  const { minLon, maxLat, cosLat, scale, padding } = GEO_BOUNDS;
  const lon = (x - padding) / (cosLat * scale) + minLon;
  const lat = maxLat - (y - padding) / scale;
  return { lat, lon };
}

function buildValidator(path: string): (x: number, y: number) => boolean {
  if (typeof document === "undefined") return () => true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 718;
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => true;
    const p = new Path2D(path);
    return (x: number, y: number) => ctx.isPointInPath(p, x, y, "evenodd");
  } catch {
    return () => true;
  }
}

const TARGET_TOTAL = 800;
const totalCount = RA_LIST.reduce((s, r) => s + r.occurrence_count, 0);

const occurrences: MockOccurrence[] = [];
let globalIndex = 0;

for (const raData of RA_LIST) {
  const raShape = RAS.find((r) => r.code === raData.codigo);
  if (!raShape) continue;

  const rawN = (raData.occurrence_count / totalCount) * TARGET_TOTAL;
  const n = Math.max(2, Math.round(rawN));

  const natureEntries = Object.entries(raData.crimes_by_nature) as [
    string,
    number
  ][];
  const bounds = raShape.bounds;
  const isInside = buildValidator(raShape.path);

  let generated = 0;
  let attempts = 0;
  const maxAttempts = n * 50;

  while (generated < n && attempts < maxAttempts) {
    attempts++;
    const x = bounds.x + rng() * bounds.width;
    const y = bounds.y + rng() * bounds.height;

    if (!isInside(x, y)) continue;

    const { lat, lon } = inverseProject(x, y);
    const natureza = pickWeighted(natureEntries, rng);
    const data = randomDate(rng);
    const horario = randomTime(rng);

    occurrences.push({
      id: `DEMO-${String(globalIndex + 1).padStart(6, "0")}`,
      raCode: raData.codigo,
      raName: raData.nomeDisplay,
      natureza,
      data,
      horario,
      latitude: lat,
      longitude: lon,
      x,
      y,
      local: `Local demonstrativo ${String(globalIndex).padStart(3, "0")}`,
    });

    globalIndex++;
    generated++;
  }
}

export const MOCK_OCCURRENCES: MockOccurrence[] = occurrences;

export const OCCURRENCES_BY_RA_FROM_MOCK: Record<string, number> =
  MOCK_OCCURRENCES.reduce<Record<string, number>>((acc, o) => {
    acc[o.raCode] = (acc[o.raCode] ?? 0) + 1;
    return acc;
  }, {});
