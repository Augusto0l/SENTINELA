import { z } from "zod";
import { directCsvLimit, directHash, directManifestLimit, directMaxRows, directMonth } from "../contracts/pcdf-direct.ts";
import { pcdfInformationalFields, pcdfNatureDescriptions } from "./pcdfNatureCatalog.ts";

export const pcdfV2Headers = [
  "ano_registro", "unidade_registro", "numero_registro", "ocorrencia_chave", "ano_fato", "data", "horario",
  "natureza_original", "natureza_padronizada_pcdf", "crime_tentado", "classificacao_status", "cidade_endereco_original",
  "ra_original", "area_endereco_original", "quadra_endereco_original", "local", "latitude_geo_original",
  "longitude_geo_original", "latitude_utm_original", "longitude_utm_original", "coordenada_status", "flagrante",
  "unidade_apuracao", "fonte", "linha_origem_id", "linha_xml",
] as const;

const v1Headers = [
  "ano_registro", "unidade_registro", "numero_registro", "ocorrencia_chave", "ano_fato", "data_inicio_fato_original",
  "data", "horario", "natureza_original", "natureza_padronizada_pcdf", "crime_tentado", "natureza_sentinela_codigo",
  "classificacao_status", "versao_mapeamento", "cidade_endereco_original", "ra_original", "area_endereco_original",
  "quadra_endereco_original", "ra_codigo", "local", "latitude_geo_original", "longitude_geo_original",
  "latitude_utm_original", "longitude_utm_original", "latitude", "longitude", "coordenada_status", "flagrante",
  "unidade_apuracao", "fonte", "linha_origem_id", "linha_xml", "aba_origem", "versao_tratamento",
] as const;

const manifestName = "manifesto.json";
const provenanceName = "proveniencia.jsonl";
const quarantineName = "pendencias_temporais.jsonl";
const reportName = "validacao.md";
const checksumsName = "sha256sums.txt";
export const pcdfV2Attachments = [manifestName, provenanceName, quarantineName, reportName, checksumsName] as const;
const fileName = /^pcdf_naturezas_(\d{4}-(?:0[1-9]|1[0-2]))\.csv(?![\s\S])/;
const maxCell = 16_384;
const encoder = new TextEncoder();
const coordinateStatus = z.enum(["invalida", "incompleta", "referencia_pendente", "ausente"]);
const componentStatus = z.enum(["ausente", "vazio_semantico", "desconhecido", "nulo_declarado", "formato_invalido", "fora_do_dominio", "numerico"]);
const coordinatePair = z.strictObject({ estado: coordinateStatus, componentes: z.record(z.string(), componentStatus) });
const positive = z.int().positive();
const count = z.int().nonnegative();
const diagnostic = z.enum([
  "ausente", "vazio_semantico", "desconhecido", "invalido", "identidade_pendente", "horario_pendente", "divergente",
  "geografia_pendente", "classificacao_pendente", "registro_anterior_ao_fato", "rotulo_criminal_pendente",
  "natureza_ausente", "natureza_fora_do_catalogo",
]);
const provenanceSchema = z.strictObject({
  linha_xml: positive, linha_origem_id: directHash, data_inicio_fato_original: z.string().max(maxCell),
  coordenada_status_v1: coordinateStatus, revisao_utm_sem_geo: z.boolean(),
  coordenadas: z.strictObject({ GEO: coordinatePair, UTM: coordinatePair }),
  diagnosticos: z.partialRecord(diagnostic,
    z.array(z.enum(v1Headers)).min(1).max(v1Headers.length).refine(fields => new Set(fields).size === fields.length)),
});
const quarantineSchema = provenanceSchema.extend({
  motivo: z.enum(["sem_competencia", "ano_fato_divergente_ou_invalido"]),
  originais: z.record(z.string(), z.string().max(maxCell)),
});
const manifestSchema = z.object({
  status: z.literal("validado_localmente"), competencia: directMonth,
  layout: z.object({
    versao: z.literal("2.0"), colunas: z.array(z.string()), codificacao: z.literal("UTF-8"),
    delimitador: z.literal(";"), terminador: z.literal("CRLF"), bom: z.literal(false),
  }),
  versao_tratamento: z.string().regex(/^[A-Za-z0-9._-]{1,128}(?![\s\S])/),
  versao_proveniencia: z.literal("pcdf-proveniencia-v1"),
  fonte: z.object({ aba: z.literal("NATUREZAS"), identificador: z.literal("PCDF"), sha256: directHash,
    nome: z.string().min(1).max(256), bytes: positive }),
  identificador_linha: z.object({ versao: z.literal("pcdf-linha-v1"), hash: z.literal("SHA-256"),
    serializacao: z.literal("JSON compacto UTF-8"),
    componentes: z.tuple([z.literal("versao_algoritmo"), z.literal("sha256_xml"), z.literal("aba"), z.literal("linha_xml_inteira")]) }),
  crs_origem: z.null(), mapeamentos_aplicados: z.strictObject({}),
  arquivos: z.record(z.string(), z.strictObject({ bytes: count, sha256: directHash })),
  reconciliacao: z.object({
    associacoes_csv_v2: positive, associacoes_xml: positive, chaves_candidatas_distintas: count,
    ids_distintos: positive, naturezas_originais_distintas: count,
    originais_reconciliados: positive, divergencias_textuais_de_origem: z.literal(0),
    naturezas_originais: z.record(z.string(), positive),
    naturezas_padronizadas: z.record(z.string(), positive),
    associacoes_sem_chave: count,
    chaves_por_quantidade_de_associacoes: z.record(z.string(), positive),
    repeticoes_chave_natureza: count,
    anos_registro_fato_distintos: count,
    diagnosticos_por_associacao: z.partialRecord(diagnostic, positive),
    coordenada_status_v1_para_v2: z.record(z.string(), positive),
    pares_coordenadas: z.strictObject({
      GEO: z.partialRecord(coordinateStatus, positive), UTM: z.partialRecord(coordinateStatus, positive),
    }),
    candidatos_utm_sem_geo: z.array(directHash).max(directMaxRows),
    crime_tentado: z.record(z.string(), positive), flagrante: z.record(z.string(), positive),
    coordenada_status: z.partialRecord(coordinateStatus, positive),
    classificacao_status: z.record(z.string(), positive),
    quarentena_temporal: z.strictObject({ sem_competencia: count, ano_fato_divergente_ou_invalido: count }),
  }),
});

type Manifest = z.infer<typeof manifestSchema>;
type Provenance = z.infer<typeof provenanceSchema>;
type Column = (typeof pcdfV2Headers)[number];
type PcdfV2Row = Record<Column, string>;
export type PcdfV2Record = {
  cells: string[];
  issues: [string, string][];
  origin: { data_inicio_fato_original: string; aba_origem: string; versao_tratamento: string };
};

export class PcdfV2Error extends Error {
  constructor(message: string, row?: number, field?: string) {
    super(row === undefined ? message : ["Associação " + row, field, message].filter(Boolean).join(" · "));
  }
}
function check(ok: unknown, message: string, row?: number, field?: string): asserts ok {
  if (!ok) throw new PcdfV2Error(message, row, field);
}
function same(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

export async function detectPcdfCsv(file: File) {
  const header = (await file.slice(0, maxCell).text()).split(/\r\n|\n|\r/, 1)[0];
  const columns = header.split(";").map(value => value.replace(/^"([a-z_]+)"$/, "$1"));
  if (same(columns, v1Headers)) return { version: "1.0", columns } as const;
  if (same(columns, pcdfV2Headers)) return { version: "2.0", columns } as const;
  return { version: null, columns: header.split(/[;,\t]/) } as const;
}

export function selectPcdfV2Files(files: File[]) {
  const csvs = files.filter(file => fileName.test(file.name));
  check(csvs.length === 1, "Selecione o CSV pcdf_naturezas_AAAA-MM.csv de uma única competência.");
  const [csv] = csvs;
  const attachments = files.filter(file => file !== csv);
  for (const file of attachments) {
    check(pcdfV2Attachments.some(name => name === file.name),
      "Selecione apenas o CSV mensal e os cinco anexos da mesma competência.");
  }
  check(new Set(attachments.map(file => file.name)).size === attachments.length,
    "Há arquivos auxiliares com nomes repetidos.");
  return { csv, attachments };
}

function decode(bytes: ArrayBuffer, name: string) {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new PcdfV2Error(name + " precisa estar em UTF-8."); }
  check(!text.startsWith("\uFEFF") && !text.includes("\0"), name + " contém BOM ou byte nulo.");
  return text;
}

function csvRows(text: string) {
  const rows: string[][] = [];
  let fields: string[] = [], value = "", quoted = false, closed = false;
  function cell() {
    fields.push(value);
    value = "";
    closed = false;
    check(fields.length <= pcdfV2Headers.length, "Quantidade de colunas excede o layout v2.", rows.length);
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === ";") cell();
    else if (char === "\r" && text[i + 1] === "\n") {
      cell();
      check(fields.length === pcdfV2Headers.length,
        rows.length ? "Quantidade de colunas difere do layout v2." : "Confira as 26 colunas do cabeçalho PCDF v2.", rows.length || undefined);
      rows.push(fields);
      check(rows.length <= directMaxRows + 1, "O CSV excede 10.000 associações.");
      fields = [];
      i++;
    } else {
      const column = pcdfV2Headers[fields.length];
      check(char !== "\r" && char !== "\n", "Use CRLF entre registros do CSV v2.", rows.length || undefined, column);
      check(!closed && (char !== '"' || !value), "Aspas em posição inválida.", rows.length || undefined, column);
      if (char === '"') quoted = true;
      else value += char;
    }
    check(value.length <= maxCell, "Campo excede o limite de tamanho.", rows.length || undefined, pcdfV2Headers[fields.length]);
  }
  check(!quoted && !closed && !fields.length && !value && text.endsWith("\r\n"),
    "O CSV contém aspas não fechadas ou registro sem terminador CRLF.", rows.length || undefined);
  check(same(rows.shift() ?? [], pcdfV2Headers), "Cabeçalho incompatível com a ordem das 26 colunas PCDF v2.");
  check(rows.length > 0, "O CSV v2 precisa ter pelo menos uma associação.");
  return rows;
}

// JSON.parse validates the grammar; the token pass rejects duplicate object keys before schema validation.
function readJson(text: string, name: string, row?: number) {
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { throw new PcdfV2Error(name + " contém JSON malformado.", row); }
  const stack: (Set<string> | null)[] = [];
  for (const token of text.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\]]/gs)) {
    const value = token[0];
    if (value === "{") stack.push(new Set());
    else if (value === "[") stack.push(null);
    else if (value === "}" || value === "]") stack.pop();
    else {
      const decoded = JSON.parse(value) as string;
      check(!/[\0\p{Surrogate}]/u.test(decoded), name + " contém texto incompatível com UTF-8 ou PostgreSQL.", row);
      let next = token.index + value.length;
      while (/\s/.test(text[next] ?? "")) next++;
      if (text[next] !== ":") continue;
      const keys = stack.at(-1);
      check(keys && !keys.has(decoded), name + " contém chave JSON repetida.", row);
      keys.add(decoded);
    }
  }
  return data;
}

function recordsJsonl<T>(bytes: ArrayBuffer, name: string, schema: z.ZodType<T>) {
  if (!bytes.byteLength) return [];
  const text = decode(bytes, name);
  check(text.endsWith("\n") && !text.includes("\r"), name + " deve usar terminadores LF.");
  const lines = text.slice(0, -1).split("\n");
  check(lines.length <= directMaxRows, name + " excede 10.000 registros.");
  return lines.map((line, index) => {
    const result = schema.safeParse(readJson(line, name, index + 1));
    check(result.success, "Estrutura de " + name + " incompatível.", index + 1);
    return result.data;
  });
}

async function sha(bytes: BufferSource) {
  check(globalThis.crypto?.subtle, "A verificação SHA-256 exige um contexto seguro no navegador.");
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

const fileLimits = {
  [manifestName]: directManifestLimit, [provenanceName]: directCsvLimit, [quarantineName]: directCsvLimit,
  [checksumsName]: 16_384, [reportName]: directManifestLimit,
};
function checksums(text: string) {
  const result = new Map<string, string>();
  for (const line of text.trimEnd().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64}) {2}([a-z0-9_.-]+)$/.exec(line);
    check(match && !result.has(match[2]), "sha256sums.txt contém entrada inválida ou repetida.");
    result.set(match[2], match[1]);
  }
  return result;
}

async function readPackage(csv: File, attachments: File[]) {
  const month = fileName.exec(csv.name)?.[1];
  check(month && !month.startsWith("0000"), "Use o nome mensal pcdf_naturezas_AAAA-MM.csv.");
  check(csv.size > 0 && csv.size <= directCsvLimit, "O CSV PCDF v2 precisa ter até 16 MiB.");
  const provided = new Map<string, File>();
  for (const file of attachments) {
    check(Object.prototype.hasOwnProperty.call(fileLimits, file.name), "Há arquivo auxiliar não reconhecido no pacote.");
    check(!provided.has(file.name), "Há arquivos auxiliares com nomes repetidos.");
    const limit = fileLimits[file.name as keyof typeof fileLimits];
    check(file.size <= limit, file.name + " excede o limite de tamanho.");
    provided.set(file.name, file);
  }
  const missing = pcdfV2Attachments.filter(name => !provided.has(name));
  check(!missing.length, "Pacote PCDF v2 incompleto. Selecione " + missing.join(", ") + ".");
  const manifestBytes = await provided.get(manifestName)!.arrayBuffer();
  const result = manifestSchema.safeParse(readJson(decode(manifestBytes, manifestName), manifestName));
  check(result.success, "Manifesto incompatível com o contrato PCDF v2.");
  const manifest = result.data;
  check(manifest.competencia === month && same(manifest.layout.colunas, pcdfV2Headers),
    "O layout ou a competência do manifesto diverge do CSV.");
  const sums = checksums(decode(await provided.get(checksumsName)!.arrayBuffer(), checksumsName));
  const contentNames = [csv.name, provenanceName, quarantineName, reportName];
  check(Object.keys(manifest.arquivos).length === contentNames.length && sums.size === contentNames.length + 1
    && contentNames.every(name => Object.prototype.hasOwnProperty.call(manifest.arquivos, name)), "A lista de artefatos do pacote está incompleta.");
  check(sums.get(manifestName) === await sha(manifestBytes), "O SHA-256 de manifesto.json diverge de sha256sums.txt.");
  provided.set(csv.name, csv);
  const content = new Map<string, ArrayBuffer>();
  for (const name of contentNames) {
    const declared = manifest.arquivos[name];
    check(sums.get(name) === declared.sha256, "Os hashes declarados para " + name + " são inconsistentes.");
    const bytes = await provided.get(name)!.arrayBuffer();
    check(bytes.byteLength === declared.bytes && await sha(bytes) === declared.sha256, "O tamanho ou SHA-256 de " + name + " diverge do manifesto.");
    content.set(name, bytes);
  }
  check(decode(content.get(reportName)!, reportName).trim(), "validacao.md precisa conter o resumo da validação.");
  return { month, manifest, rows: csvRows(decode(content.get(csv.name)!, "CSV")),
    provenance: recordsJsonl(content.get(provenanceName)!, provenanceName, provenanceSchema),
    quarantine: recordsJsonl(content.get(quarantineName)!, quarantineName, quarantineSchema) };
}

const year = /^(?!0000)\d{4}(?![\s\S])/;
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?![\s\S])/;
const unknown = new Set(["não informado", "não informada", "nao informado", "nao informada", "ra 98_não informada"]);
const coordinateFields = {
  GEO: ["latitude_geo_original", "longitude_geo_original"],
  UTM: ["latitude_utm_original", "longitude_utm_original"],
} as const;
const statusPriority = coordinateStatus.options;
const originalFields = [
  "ano_registro", "unidade_registro", "numero_registro", "ano_fato", "data_inicio_fato_original", "flagrante",
  "natureza_original", "crime_tentado", "natureza_padronizada_pcdf", "cidade_endereco_original", "ra_original",
  "area_endereco_original", "quadra_endereco_original", ...coordinateFields.GEO, ...coordinateFields.UTM, "unidade_apuracao",
] as const;

function civil(literal: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})(?: ([^\r\n]*))?(?![\s\S])/.exec(literal);
  if (!match || !year.test(match[3])) return { date: "", time: "" };
  const [, day, month, yyyy, rawTime = ""] = match;
  const numericYear = Number(yyyy), numericMonth = Number(month), numericDay = Number(day);
  const leap = numericYear % 4 === 0 && (numericYear % 100 !== 0 || numericYear % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (numericDay < 1 || numericDay > (days[numericMonth - 1] ?? 0)) return { date: "", time: "" };
  return { date: [yyyy, month, day].join("-"), time: clock.test(rawTime) ? rawTime : "" };
}

function presence(value: string) {
  if (value === "") return "ausente";
  const trimmed = value.trim();
  if (!trimmed) return "vazio_semantico";
  return unknown.has(trimmed.normalize("NFC").toLowerCase()) ? "desconhecido" : "informado";
}

function component(value: string, limit?: number): z.infer<typeof componentStatus> {
  if (value.trim().toLowerCase() === "null") return "nulo_declarado";
  const state = presence(value);
  if (state !== "informado") return state;
  const match = /^[+-]?(\d+)(?:\.(\d+))?(?![\s\S])/.exec(value);
  if (!match) return "formato_invalido";
  if (limit !== undefined) {
    const digits = match[1].replace(/^0+/, "");
    const magnitude = Number(digits);
    if (magnitude > limit || (magnitude === limit && /[1-9]/.test(match[2] ?? ""))) return "fora_do_dominio";
  }
  return "numerico";
}

type CoordinateOriginals = Pick<PcdfV2Row, (typeof coordinateFields)[keyof typeof coordinateFields][number]>;

function coordinateIssues(
  record: CoordinateOriginals, prov: Provenance, ordinal?: number, declared?: PcdfV2Row["coordenada_status"],
): PcdfV2Record["issues"] {
  const issues: PcdfV2Record["issues"] = [];
  const legacyStates = new Set<z.infer<typeof coordinateStatus>>();
  const states = (["GEO", "UTM"] as const).map(name => {
    const pair = prov.coordenadas[name];
    const columns = coordinateFields[name];
    check(Object.keys(pair.componentes).length === columns.length, "Proveniência do par geográfico incompatível.", ordinal, "coordenada_status");
    const values = columns.map((field, i) => {
      const status = component(record[field], name === "GEO" ? [90, 180][i] : undefined);
      check(status === pair.componentes[field], "Diagnóstico de coordenada diverge do original.", ordinal, field);
      if (status !== "numerico") issues.push([field, status]);
      return status;
    });
    const numeric = values.filter(value => value === "numerico").length;
    const expected = values.some(value => value === "formato_invalido" || value === "fora_do_dominio")
      ? "invalida" : (["ausente", "incompleta", "referencia_pendente"] as const)[numeric];
    check(pair.estado === expected, "Estado do par diverge da proveniência.", ordinal, "coordenada_status");
    const legacyNumeric = numeric + values.filter(value => value === "fora_do_dominio").length;
    legacyStates.add(values.some(value => value === "formato_invalido" || value === "nulo_declarado")
      ? "invalida" : (["ausente", "incompleta", "referencia_pendente"] as const)[legacyNumeric]);
    return expected;
  });
  const status = statusPriority.find(value => states.includes(value))!;
  check(declared === undefined || declared === status, "Estado geral diverge dos pares GEO/UTM.", ordinal, "coordenada_status");
  check(prov.coordenada_status_v1 === statusPriority.find(value => legacyStates.has(value)),
    "Estado histórico diverge dos componentes originais.", ordinal, "coordenada_status");
  const review = states[0] === "ausente" && states[1] === "referencia_pendente";
  check(prov.revisao_utm_sem_geo === review, "Marcador UTM diverge dos pares.", ordinal, "coordenada_status");
  issues.push(["coordenada_status", status]);
  if (review) issues.push(["coordenada_status", "revisao_utm_sem_geo"]);
  return issues;
}

function withIssue(issues: PcdfV2Record["issues"], field: string, rule: string) {
  if (!issues.some(([column, reason]) => column === field && reason === rule)) issues.push([field, rule]);
}

function checkOriginalNature(issues: PcdfV2Record["issues"], description: string) {
  if (pcdfNatureDescriptions.has(description)) return;
  const state = presence(description);
  withIssue(issues, "natureza_original", state === "ausente" || state === "vazio_semantico"
    ? "natureza_ausente" : "natureza_fora_do_catalogo");
}

function validateRow(row: PcdfV2Row, prov: Provenance, month: string, ordinal: number) {
  check(row.fonte === "PCDF", "A fonte da associação deve ser PCDF.", ordinal, "fonte");
  check(/^[1-9]\d*(?![\s\S])/.test(row.linha_xml) && Number(row.linha_xml) === prov.linha_xml,
    "Posição XML incompatível com a proveniência.", ordinal, "linha_xml");
  const parsed = civil(prov.data_inicio_fato_original);
  check(parsed.date && row.data === parsed.date && parsed.date.startsWith(month + "-"),
    "Data inválida, fora da competência ou divergente da proveniência.", ordinal, "data");
  check(row.ano_fato === parsed.date.slice(0, 4), "Ano do fato diverge da data.", ordinal, "ano_fato");
  check(row.horario === parsed.time && (row.horario || prov.diagnosticos.horario_pendente?.includes("horario")),
    "Horário inválido, divergente da origem ou vazio sem pendência.", ordinal, "horario");
  const identity = [row.ano_registro, row.unidade_registro, row.numero_registro];
  const key = year.test(identity[0]) && identity.slice(1).every(value => presence(value) === "informado")
    ? JSON.stringify(["PCDF", ...identity]) : "";
  check(row.ocorrencia_chave === key, "Chave candidata diverge da identificação de registro.", ordinal, "ocorrencia_chave");
  const local = [...new Set([row.area_endereco_original, row.quadra_endereco_original].filter(value => presence(value) === "informado"))].join(" | ");
  check(row.local === local, "Local diverge dos textos originais.", ordinal, "local");
  const issues = coordinateIssues(row, prov, ordinal, row.coordenada_status);
  for (const [rule, columns] of Object.entries(prov.diagnosticos)) {
    for (const column of columns ?? []) {
      if (!pcdfInformationalFields.has(column) && (column !== "natureza_original" || rule === "divergente"))
        withIssue(issues, column, rule);
    }
  }
  checkOriginalNature(issues, row.natureza_original);
  if (!key) withIssue(issues, "ocorrencia_chave", "identidade_pendente");
  if (year.test(row.ano_registro) && row.ano_registro < row.ano_fato)
    withIssue(issues, "ano_registro", "registro_anterior_ao_fato");
  for (const field of ["crime_tentado", "flagrante"] as const) {
    if (!["SIM", "NÃO"].includes(row[field])) {
      const state = presence(row[field]);
      withIssue(issues, field, state === "informado" ? "invalido" : state);
    }
  }
  return issues;
}

async function validateId(prov: Provenance, manifest: Manifest, row?: number) {
  const material = [manifest.identificador_linha.versao, manifest.fonte.sha256, manifest.fonte.aba, prov.linha_xml];
  check(prov.linha_origem_id === await sha(encoder.encode(JSON.stringify(material))),
    "Identificador difere do SHA-256 recalculado.", row, "linha_origem_id");
}

function add(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function matchesCounts(counts: Map<string, number>, expected: Record<string, number | undefined>) {
  return counts.size === Object.keys(expected).length && [...counts].every(([key, value]) => expected[key] === value);
}

export async function inspectPcdfCsv(csv: File, regions: ReadonlyMap<number, string>, independentReview = false) {
  const month = fileName.exec(csv.name)?.[1];
  check(month && !month.startsWith("0000"), "Use o nome original pcdf_naturezas_AAAA-MM.csv.");
  check(csv.size > 0 && csv.size <= directCsvLimit, "O CSV precisa ter entre 1 byte e 16 MiB.");
  const content = await csv.arrayBuffer();
  const rows = csvRows(decode(content, csv.name));
  const ids = new Set<string>();
  const positions = new Set<string>();
  const candidates = new Set<string>();
  const associations = new Set<string>();
  const errors: { row: number; field: string; message: string }[] = [];
  const fields = Object.fromEntries(pcdfV2Headers.map(field => [field, { empty: 0, issues: 0 }]));
  let invalid = 0, pending = 0, duplicates = 0;
  const normalized = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").trim().toUpperCase();
  const records = rows.map((cells, index) => {
    const row = Object.fromEntries(pcdfV2Headers.map((field, col) => [field, cells[col]])) as PcdfV2Row;
    const issues: PcdfV2Record["issues"] = [];
    let bad = false;
    function reject(field: Column, message: string) {
      bad = true;
      if (errors.length < 100) errors.push({ row: index + 1, field, message });
      withIssue(issues, field, "valor_invalido");
    }
    function review(field: Column, rule: string, message: string) {
      if (independentReview) withIssue(issues, field, rule);
      else reject(field, message);
    }
    if (row.fonte !== "PCDF") reject("fonte", "A fonte deve ser PCDF.");
    if (!directHash.safeParse(row.linha_origem_id).success) reject("linha_origem_id", "Use o identificador SHA-256 declarado pelo gerador.");
    if (!/^[1-9]\d*$/.test(row.linha_xml) || !Number.isSafeInteger(Number(row.linha_xml))) reject("linha_xml", "Informe a posição de origem como um inteiro positivo.");
    if (ids.has(row.linha_origem_id) || positions.has(row.linha_xml)) {
      duplicates++;
      reject(ids.has(row.linha_origem_id) ? "linha_origem_id" : "linha_xml", "Origem ou posição repetida no arquivo.");
    }
    ids.add(row.linha_origem_id);
    positions.add(row.linha_xml);
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.data);
    if (!iso || civil(`${iso[3]}/${iso[2]}/${iso[1]}`).date !== row.data || !row.data.startsWith(month + "-"))
      review("data", row.data ? "data_invalida_ou_fora_da_competencia" : "data_pendente", "Data inválida ou fora da competência do arquivo.");
    if (row.ano_fato !== row.data.slice(0, 4))
      review("ano_fato", "ano_fato_divergente", "O ano do fato deve corresponder à data.");
    if (row.horario && !clock.test(row.horario)) review("horario", "horario_invalido", "Use HH:MM:SS ou deixe em branco se ausente na origem.");
    if (!row.horario) withIssue(issues, "horario", "horario_pendente");
    const identity = [row.ano_registro, row.unidade_registro, row.numero_registro];
    const key = year.test(identity[0]) && identity.slice(1).every(value => presence(value) === "informado" &&
      (!independentReview || value.trim().toLowerCase() !== "null"))
      ? JSON.stringify(["PCDF", ...identity]) : "";
    let identityMatches = row.ocorrencia_chave === key;
    if (independentReview && !identityMatches && key && row.ocorrencia_chave) {
      try { identityMatches = JSON.stringify(JSON.parse(row.ocorrencia_chave)) === key; } catch { /* Preservar a chave inválida. */ }
    }
    if (!identityMatches) review("ocorrencia_chave", "chave_divergente", "A chave diverge do ano, da unidade ou do número de registro.");
    if (!key) withIssue(issues, "ocorrencia_chave", "identidade_pendente");
    if (year.test(row.ano_registro) && row.ano_registro < row.ano_fato)
      withIssue(issues, "ano_registro", "registro_anterior_ao_fato");
    const local = [...new Set([row.area_endereco_original, row.quadra_endereco_original]
      .filter(value => presence(value) === "informado"))].join(" | ");
    if (row.local !== local) review("local", "local_divergente", "O local diverge dos textos originais de área e quadra.");
    if (!local) withIssue(issues, "local", "endereco_pendente");
    checkOriginalNature(issues, row.natureza_original);
    const ra = /^RA (\d{2})_(.+)$/u.exec(row.ra_original);
    if (!ra || normalized(regions.get(Number(ra[1])) ?? "") !== normalized(ra[2]))
      withIssue(issues, "ra_original", "ra_pendente_de_correspondencia");
    const geoStates = (["GEO", "UTM"] as const).map(pair => {
      const values = coordinateFields[pair].map((field, i) => {
        const state = component(row[field], pair === "GEO" ? [90, 180][i] : undefined);
        if (state !== "numerico") withIssue(issues, field, state);
        return state;
      });
      return values.some(state => state === "formato_invalido" || state === "fora_do_dominio")
        ? "invalida" : (["ausente", "incompleta", "referencia_pendente"] as const)[values.filter(state => state === "numerico").length];
    });
    const geoStatus = statusPriority.find(state => geoStates.includes(state));
    if (row.coordenada_status !== geoStatus)
      review("coordenada_status", "coordenada_status_divergente", "O estado declarado diverge dos componentes GEO e UTM.");
    const reviewStatus = independentReview ? geoStates[0] : geoStatus;
    if (reviewStatus) withIssue(issues, "coordenada_status", independentReview ? `geo_${reviewStatus}` : reviewStatus);
    if (geoStates[0] === "ausente" && geoStates[1] === "referencia_pendente")
      withIssue(issues, "coordenada_status", "revisao_utm_sem_geo");
    if (independentReview) {
      for (const field of ["cidade_endereco_original", "area_endereco_original", "quadra_endereco_original", "unidade_apuracao"] as const) {
        if (presence(row[field]) !== "informado" || row[field].trim().toLowerCase() === "null")
          withIssue(issues, field, "informacao_complementar_ausente");
      }
      if (geoStates[1] === "ausente" || geoStates[1] === "incompleta")
        withIssue(issues, "coordenada_status", `utm_${geoStates[1]}`);
    }
    for (const field of ["crime_tentado", "flagrante"] as const) {
      if (!["SIM", "NÃO"].includes(row[field])) withIssue(issues, field, "informacao_policial_pendente");
    }
    if (bad) invalid++;
    else {
      if (key && identityMatches) {
        candidates.add(key);
        const association = JSON.stringify([key, row.natureza_original, row.crime_tentado]);
        if (associations.has(association)) withIssue(issues, "natureza_original", "associacao_candidata_repetida");
        associations.add(association);
      }
      if (issues.length) pending++;
    }
    for (const field of pcdfV2Headers) if (presence(row[field]) !== "informado") fields[field].empty++;
    for (const field of new Set(issues.map(([field]) => field))) fields[field].issues++;
    return { cells, issues };
  });
  return {
    content, name: csv.name, month, sha256: await sha(content), bytes: csv.size, manifestSha: null,
    treatment: "pcdf-csv-avulso-v2", headers: [...pcdfV2Headers], records, fields,
    standalone: { invalid, pending, valid: rows.length - invalid - pending, candidates: candidates.size, duplicates, errors },
  };
}

export async function validatePcdfV2(csv: File, attachments: File[]) {
  const { month, manifest, rows, provenance, quarantine } = await readPackage(csv, attachments);
  const expected = manifest.reconciliacao;
  check(rows.length === provenance.length && rows.length === expected.associacoes_csv_v2
    && rows.length === expected.associacoes_xml && rows.length === expected.ids_distintos
    && rows.length * originalFields.length === expected.originais_reconciliados,
  "As contagens de CSV, proveniência e manifesto divergem.");
  const byId = new Map(provenance.map(record => [record.linha_origem_id, record]));
  check(byId.size === provenance.length, "A proveniência contém IDs técnicos repetidos.");
  const positions = new Set<number>(), seen = new Set<string>();
  const occurrences = new Map<string, { associations: number; natures: Set<string> }>();
  const natures = new Map<string, number>(), standardized = new Map<string, number>(), attempts = new Map<string, number>();
  const flagrants = new Map<string, number>(), coordinates = new Map<string, number>();
  const legacyClassification = new Map<string, number>();
  const coordinateTransitions = new Map<string, number>(), diagnostics = new Map<string, number>();
  const pairs = { GEO: new Map<string, number>(), UTM: new Map<string, number>() };
  const utmCandidates: string[] = [];
  let missingCandidate = 0, repeatedNature = 0, differentYears = 0;
  const records: PcdfV2Record[] = [];
  const identities: Provenance[] = [];
  for (const [index, cells] of rows.entries()) {
    const ordinal = index + 1;
    const row = Object.fromEntries(pcdfV2Headers.map((column, i) => [column, cells[i]])) as PcdfV2Row;
    const prov = byId.get(row.linha_origem_id);
    check(prov, "Associação sem proveniência correspondente.", ordinal, "linha_origem_id");
    check(!seen.has(prov.linha_origem_id) && !positions.has(prov.linha_xml),
      "ID ou posição XML repetida.", ordinal, "linha_origem_id");
    const issues = validateRow(row, prov, month, ordinal);
    seen.add(prov.linha_origem_id);
    positions.add(prov.linha_xml);
    if (row.ocorrencia_chave) {
      const candidate = occurrences.get(row.ocorrencia_chave) ?? { associations: 0, natures: new Set<string>() };
      if (candidate.natures.has(row.natureza_original)) {
        repeatedNature++;
        withIssue(issues, "natureza_original", "associacao_repetida_para_revisao");
      }
      candidate.associations++;
      candidate.natures.add(row.natureza_original);
      occurrences.set(row.ocorrencia_chave, candidate);
    } else {
      missingCandidate++;
    }
    if (row.ano_registro !== row.ano_fato) differentYears++;
    for (const rule of Object.keys(prov.diagnosticos)) add(diagnostics, rule);
    add(pairs.GEO, prov.coordenadas.GEO.estado);
    add(pairs.UTM, prov.coordenadas.UTM.estado);
    add(coordinateTransitions, prov.coordenada_status_v1 + " -> " + row.coordenada_status);
    if (prov.revisao_utm_sem_geo) utmCandidates.push(prov.linha_origem_id);
    add(standardized, row.natureza_padronizada_pcdf);
    add(natures, row.natureza_original);
    add(attempts, row.crime_tentado);
    add(flagrants, row.flagrante);
    add(legacyClassification, row.classificacao_status);
    add(coordinates, row.coordenada_status);
    records.push({ cells, issues, origin: { data_inicio_fato_original: prov.data_inicio_fato_original,
      aba_origem: manifest.fonte.aba, versao_tratamento: manifest.versao_tratamento } });
    identities.push(prov);
  }
  for (let i = 0; i < identities.length; i += 128)
    await Promise.all(identities.slice(i, i + 128).map((prov, index) => validateId(prov, manifest, i + index + 1)));
  const candidateSizes = new Map<string, number>();
  for (const { associations } of occurrences.values()) add(candidateSizes, String(associations));
  check(occurrences.size === expected.chaves_candidatas_distintas && natures.size === expected.naturezas_originais_distintas
    && missingCandidate === expected.associacoes_sem_chave && repeatedNature === expected.repeticoes_chave_natureza
    && differentYears === expected.anos_registro_fato_distintos
    && matchesCounts(candidateSizes, expected.chaves_por_quantidade_de_associacoes)
    && matchesCounts(natures, expected.naturezas_originais) && matchesCounts(standardized, expected.naturezas_padronizadas)
    && matchesCounts(attempts, expected.crime_tentado) && matchesCounts(flagrants, expected.flagrante)
    && matchesCounts(coordinates, expected.coordenada_status) && matchesCounts(diagnostics, expected.diagnosticos_por_associacao)
    && matchesCounts(coordinateTransitions, expected.coordenada_status_v1_para_v2)
    && matchesCounts(pairs.GEO, expected.pares_coordenadas.GEO) && matchesCounts(pairs.UTM, expected.pares_coordenadas.UTM)
    && same(utmCandidates, expected.candidatos_utm_sem_geo)
    && matchesCounts(legacyClassification, expected.classificacao_status), "A distribuição das associações diverge do manifesto.");
  const reasons = new Map<string, number>();
  for (const item of quarantine) {
    check(!seen.has(item.linha_origem_id) && !positions.has(item.linha_xml), "ID ou posição repetida na quarentena.");
    check(Object.keys(item.originais).length === originalFields.length && originalFields.every(name => Object.prototype.hasOwnProperty.call(item.originais, name))
      && item.originais.data_inicio_fato_original === item.data_inicio_fato_original, "Originais incompletos na quarentena.");
    const { date } = civil(item.data_inicio_fato_original);
    check(item.motivo === "sem_competencia" ? !date
      : date.startsWith(month + "-") && date.slice(0, 4) !== item.originais.ano_fato, "Motivo temporal inconsistente na quarentena.");
    coordinateIssues(item.originais as CoordinateOriginals, item);
    await validateId(item, manifest);
    add(reasons, item.motivo);
    seen.add(item.linha_origem_id);
    positions.add(item.linha_xml);
  }
  check(Object.entries(expected.quarentena_temporal).every(([reason, value]) => (reasons.get(reason) ?? 0) === value),
    "A contagem da quarentena diverge do manifesto.");
  return {
    version: manifest.layout.versao, month, headers: [...pcdfV2Headers], records, occurrences: occurrences.size,
    natures: natures.size, multiNature: [...occurrences.values()].filter(item => item.natures.size > 1).length,
    repeatedNature, missingCandidate,
    coordinates: Object.fromEntries(coordinates),
    utmWithoutGeo: utmCandidates.length,
    quarantine: quarantine.length, treatment: manifest.versao_tratamento, source: manifest.fonte.identificador,
    sheet: manifest.fonte.aba, sourceSha: manifest.fonte.sha256,
  };
}

export type PcdfV2Preview = Awaited<ReturnType<typeof validatePcdfV2>>;
