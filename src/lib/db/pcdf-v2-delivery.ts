import { createHash } from "node:crypto";
import { inspectPcdfCsv, validatePcdfV2, type PcdfV2Record } from "../../data/pcdfV2.ts";
import regions from "../../../docs/catalogos/ras-revisao-2026-11-13-v1/matrix.json" with { type: "json" };

function sha(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function reviewDiagnostic(field: string, rule: string, independentReview = false) {
  if (field === "ocorrencia_chave" || ["ano_registro", "unidade_registro", "numero_registro"].includes(field))
    return { field, rule, kind: "identificacao", priority: "alta", effect: "bloqueia_consolidacao" };
  if (field === "natureza_original")
    return { field, rule, kind: "classificacao", priority: independentReview ? "media" : "alta",
      effect: independentReview ? "nao_bloqueante" : "bloqueia_consolidacao" };
  if (/^(latitude|longitude|coordenada_)/.test(field))
    return { field, rule, kind: "coordenadas", priority: "media", effect: independentReview &&
      (field.includes("_utm_") || rule.startsWith("utm_") || ["revisao_utm_sem_geo", "coordenada_status_divergente"].includes(rule))
      ? "nao_bloqueante" : "bloqueia_dimensao" };
  if (/^(data|horario|ano_fato)/.test(field))
    return { field, rule, kind: "datas_horarios", priority: "media", effect: "bloqueia_dimensao" };
  if (["crime_tentado", "flagrante", "unidade_apuracao"].includes(field))
    return { field, rule, kind: "informacoes_policiais", priority: "baixa", effect: "nao_bloqueante" };
  if (/^(ra_|cidade_|area_|quadra_|local$)/.test(field))
    return { field, rule, kind: "endereco_ra", priority: "media", effect: "nao_bloqueante" };
  return { field, rule, kind: "proveniencia", priority: "media", effect: "nao_bloqueante" };
}

const csvRegions = new Map(regions.entries.flatMap(region =>
  region.status === "APROVADA" && region.legalNumber && region.administrativeName
    ? [[region.legalNumber, region.administrativeName] as const] : []));

function monthlyReviewDiagnostics(issues: PcdfV2Record["issues"], independentReview: boolean) {
  const hasCoordinateReview = issues.some(([field, rule]) => field === "coordenada_status" &&
    ["ausente", "incompleta", "invalida", "referencia_pendente"].includes(independentReview ? rule.replace(/^geo_/, "") : rule));
  return issues.filter(([field, rule]) => !(hasCoordinateReview &&
    /^(latitude|longitude)_(geo|utm)_original$/.test(field) &&
    ["ausente", "nulo_declarado", "vazio_semantico"].includes(rule)))
    .map(([field, rule]) => reviewDiagnostic(field, rule, independentReview));
}

export async function preparePcdfCsvDelivery(csv: File, independentReview = false) {
  const { content, ...preview } = await inspectPcdfCsv(csv, csvRegions, independentReview);
  return { preview, content,
    get batch() {
      return {
        name: preview.name, month: preview.month, records: preview.records.length,
        sha256: preview.sha256, candidates: preview.standalone.candidates,
        rows: preview.records.map(({ cells, issues }, index) => ({
          ordinal: index + 1,
          raw: Object.fromEntries(preview.headers.map((name, column) => [name, cells[column]])),
          diagnostics: monthlyReviewDiagnostics(issues, independentReview),
        })),
      };
    },
  };
}

export async function preparePcdfV2Delivery(csv: File, attachments: File[]) {
  const preview = await validatePcdfV2(csv, attachments);
  const files = [csv, ...attachments].sort((a, b) => a.name < b.name ? -1 : 1);
  const names = files.map(file => file.name);
  const parts = await Promise.all(files.map(async file => Buffer.from(await file.arrayBuffer())));
  const hashes = parts.map(sha);
  const digest = sha("pcdf-pacote-v1\n" + names.map((name, i) => [name, parts[i].length, hashes[i]].join(" ")).join("\n"));
  const manifestIndex = names.indexOf("manifesto.json");
  const csvIndex = names.indexOf(csv.name);
  const manifest = JSON.parse(parts[manifestIndex].toString("utf8")) as {
    fonte: { identificador: string; nome: string; sha256: string; bytes: number; aba: string };
    versao_proveniencia: string;
  };
  const delivery = {
    source: manifest.fonte, provenanceVersion: manifest.versao_proveniencia, manifestSha: hashes[manifestIndex],
    quarantine: preview.quarantine,
    batch: {
      name: csv.name, month: preview.month, sha256: hashes[csvIndex], size: parts[csvIndex].length,
      treatment: preview.treatment,
      rows: preview.records.map(({ cells, issues, origin }, i) => {
        const raw = Object.fromEntries(preview.headers.map((name, index) => [name, cells[index]]));
        return {
          ordinal: i + 1, raw, origin: { data_inicio_fato_original: origin.data_inicio_fato_original },
          derived: { candidate: raw.ocorrencia_chave ? JSON.parse(raw.ocorrencia_chave).slice(1) : null,
            data: raw.data, horario: raw.horario || null, classificacao_status: raw.classificacao_status },
          diagnostics: issues.map(([field, rule]) => reviewDiagnostic(field, rule)),
        };
      }),
    },
  };
  return { digest, names, parts, delivery };
}
