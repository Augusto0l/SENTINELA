import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const url = new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url);
    if (existsSync(url)) return nextResolve(url.href, context);
  }
  return nextResolve(specifier, context);
} });
const { parseImportCsv, readImportBuffer, tableFromWorkbook, inspectImportZip } = await import("../src/data/importParser.ts");
const { analyzeImport, autoMapImport, importMappingErrors, simulateImportConfirmation } = await import("../src/data/importValidation.ts");
const { IMPORT_LIMITS } = await import("../src/data/importTypes.ts");
const header = "Data da ocorrência,Hora,Tipo do crime,Região Administrativa,Local,lat,lng";
const valid = "29/02/2024,23:59,Furto,Plano Piloto,Quadra demonstrativa 10,-15.79,-47.88";
const parse = (body = valid, head = header) => parseImportCsv(`${head}\n${body}`);
const analyze = table => analyzeImport(table, autoMapImport(table.headers));
const leadingEmptyRows = ["", "\n", "\n  \n", "\r\n \r\n", ",,,,,,\n", '\"\",\"\"\n'];

test("regressão do limite: CSV aceita 10 mil registros sem contar linhas vazias iniciais", () => {
  const records = Array(IMPORT_LIMITS.rows).fill(valid).join("\n");
  for (const prefix of leadingEmptyRows) {
    const table = parseImportCsv(`${prefix}${header}\n${records}`);
    const headerLine = prefix.split(/\r\n|\r|\n/).length;
    assert.equal(table.rows.length, IMPORT_LIMITS.rows);
    assert.equal(table.headerLine, headerLine);
    assert.equal(table.rows[0].line, headerLine + 1);
    assert.equal(table.rows.at(-1).line, headerLine + IMPORT_LIMITS.rows);
    assert.equal(table.rows[0].cells[0].value, "29/02/2024");
    if (prefix === "\n") assert.equal(analyze(table).counts.valid, IMPORT_LIMITS.rows);
  }
});

test("regressão do limite: CSV rejeita 10.001 registros com ou sem linhas vazias iniciais", () => {
  const records = Array(IMPORT_LIMITS.rows + 1).fill(valid).join("\n");
  for (const prefix of leadingEmptyRows) {
    assert.throws(() => parseImportCsv(`${prefix}${header}\n${records}`), /Limite demonstrativo: 10000 registros/);
  }
});

test("regressão do limite: linhas vazias depois do cabeçalho continuam contando e gerando erro", () => {
  const records = Array(IMPORT_LIMITS.rows - 2).fill(valid).join("\n");
  const input = `\n${header}\n${valid}\n\n${records}`;
  const table = parseImportCsv(input);
  assert.equal(table.rows.length, IMPORT_LIMITS.rows);
  const analysis = analyze(table);
  assert.equal(analysis.counts.valid, IMPORT_LIMITS.rows - 1);
  assert.equal(analysis.counts.invalid, 1);
  assert.equal(analysis.rows[1].line, 4);
  assert.ok(analysis.rows[1].issues.some(issue => issue.message === "Linha vazia."));
  assert.throws(() => parseImportCsv(`${input}\n${valid}`), /Limite demonstrativo: 10000 registros/);
});

test("regressão do limite: prefixo vazio respeita os controles de colunas e células", () => {
  assert.throws(() => parseImportCsv(`${",".repeat(IMPORT_LIMITS.columns)}\n${header}\n${valid}`), /limite de colunas, células ou texto/);
  assert.throws(() => parseImportCsv(`${"\n".repeat(IMPORT_LIMITS.cells + 1)}${header}\n${valid}`), /limite de colunas, células ou texto/);
});

test("regressão do limite: XLSX mantém a fronteira de 10 mil registros", () => {
  const records = Array.from({ length: IMPORT_LIMITS.rows }, () => valid.split(","));
  const accepted = readImportBuffer("limite.xlsx", workbookBuffer({ Dados: [header.split(","), ...records] }));
  assert.equal(accepted.table.rows.length, IMPORT_LIMITS.rows);
  assert.equal(accepted.table.sheetError, undefined);
  const rejected = readImportBuffer("excesso.xlsx", workbookBuffer({ Dados: [header.split(","), ...records, valid.split(",")] }));
  assert.equal(rejected.table.rows.length, 0);
  assert.match(rejected.table.sheetError, /limites demonstrativos/);
});

function workbookBuffer(sheets) {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(book, { type: "array", bookType: "xlsx", compression: true });
}
test("CSV real reconhece cabeçalhos equivalentes, normaliza sem alterar os originais", () => {
  const table = parse(valid.replace("Furto", "  fÚrto ").replace("Plano Piloto", "RA-I"));
  const result = analyze(table);
  assert.equal(result.counts.valid, 1);
  assert.equal(result.rows[0].original[2].value, "  fÚrto ");
  assert.equal(result.rows[0].normalized.naturezas[0], "Furto");
  assert.equal(result.rows[0].normalized.raCode, "RA-I");
});
test("CSV aceita BOM, ponto e vírgula, tabulação, aspas escapadas e endereço multilinha", () => {
  const table = parseImportCsv('\uFEFFdata;horário;naturezas;RA;endereço\r\n2024-02-29;09:30;"Furto; Ameaça";Ceilândia;"Quadra ""10""\nBloco A"\r\n');
  const result = analyze(table);
  assert.equal(result.counts.pending, 1);
  assert.equal(result.rows[0].line, 2);
  assert.deepEqual(result.rows[0].normalized.naturezas, ["Furto", "Ameaça"]);
  assert.equal(result.rows[0].normalized.data, "29/02/2024");
  assert.equal(result.rows[0].original[4].value, 'Quadra "10"\nBloco A');
  assert.equal(analyze(parseImportCsv("data\thora\tnatureza\tRA\tendereco\n29/02/2024\t09:30\tFurto\tGama\tQuadra 10")).counts.pending, 1);
});
test("CSV inválido, vazio, só cabeçalho, binário e aspas malformadas são rejeitados", () => {
  for (const text of ["", "  \n", header, `${header}\n\n`, "texto sem separadores", `${header}\n\"não fechado`, `${header}\nabc\"erro`, `${header}\n\"abc\"erro`, `${header}\n\0`]) assert.throws(() => parseImportCsv(text));
});
test("linhas vazias internas e quantidade de colunas incorreta geram erros com posição original", () => {
  const result = analyze(parse(`${valid}\n\n${valid}\n29/02/2024,10:00,Furto`));
  assert.equal(result.counts.total, 4);
  assert.equal(result.counts.invalid, 2);
  assert.equal(result.rows[1].line, 3);
  assert.ok(result.rows[1].issues.some(issue => issue.message === "Linha vazia."));
  assert.ok(result.rows[3].issues.some(issue => issue.message.includes("Quantidade de colunas")));
});
test("mapeamento manual resolve cabeçalhos desconhecidos e impede coluna reutilizada", () => {
  const table = parse(valid, "A,B,C,D,E,F,G");
  const automatic = autoMapImport(table.headers);
  assert.equal(importMappingErrors(table.headers, automatic).length, 5);
  const mapping = { data: 0, horario: 1, naturezas: 2, ra: 3, local: 4, latitude: 5, longitude: 6 };
  assert.equal(analyzeImport(table, mapping).counts.valid, 1);
  assert.ok(importMappingErrors(table.headers, { ...mapping, local: 0 }).length);
  assert.ok(importMappingErrors(table.headers, { ...mapping, data: 99 }).length);
  assert.ok(importMappingErrors(table.headers, { ...mapping, data: -2 }).length);
  assert.equal(autoMapImport(["Data", "data", "hora", "natureza", "RA", "local"]).data, -1);
});
test("campos obrigatórios, data, hora, RA, natureza e endereço registram erro por coluna", () => {
  for (const [index, value] of [[0, "31/02/2024"], [0, "29/02/2023"], [1, "24:00"], [1, "12:60"], [2, "Não catalogada"], [3, "RA inexistente"], [4, "Rua"]]) {
    const cells = valid.split(","); cells[index] = value;
    const row = analyze(parse(cells.join(","))).rows[0];
    assert.equal(row.status, "invalido");
    assert.ok(row.issues.some(issue => issue.column === index + 1), JSON.stringify(row.issues));
  }
  for (let index = 0; index < 5; index++) {
    const cells = valid.split(","); cells[index] = "";
    assert.equal(analyze(parse(cells.join(","))).counts.invalid, 1);
  }
});
test("coordenadas ausentes são pendências; fornecidas inválidas são erros", () => {
  assert.equal(analyze(parse(valid.replace("-15.79,-47.88", ","))).counts.pending, 1);
  const pending = analyze(parse(valid.replace("-15.79,-47.88", ","))).rows[0];
  assert.equal(pending.normalized.latitude, "");
  assert.equal(pending.normalized.longitude, "");
  assert.equal(analyze(parse(valid.replace("-15.79,-47.88", "-15.79,"))).counts.pending, 1);
  for (const coordinate of ["-90,-47.88", "abc,-47.88", "-15.79,0", "-1.579e1,-47.88", "0x10,-47.88"]) assert.equal(analyze(parse(valid.replace("-15.79,-47.88", coordinate))).counts.invalid, 1);
  assert.equal(analyze(parse(valid.replace("-15.79,-47.88", '"-15,79","-47,88"'))).counts.valid, 1);
});
test("múltiplas naturezas não multiplicam ocorrências e não ocultam natureza inválida", () => {
  const result = analyze(parse(valid.replace("Furto", "Furto|Ameaça|Furto")));
  assert.deepEqual(result.rows[0].normalized.naturezas, ["Furto", "Ameaça"]);
  assert.equal(result.counts.total, 1);
  assert.equal(analyze(parse(valid.replace("Furto", "Furto|Inválida"))).counts.invalid, 1);
  assert.equal(analyze(parse(valid.replace("Furto", "Furto|"))).counts.invalid, 1);
  const excessive = analyze(parse(valid.replace("Furto", "Furto|".repeat(100))));
  assert.equal(excessive.counts.invalid, 1);
  assert.ok(excessive.rows[0].issues.length < 34);
});
test("possíveis duplicatas apenas sinalizam e são mantidas na confirmação", () => {
  const analysis = analyze(parse(`${valid}\n${valid}`));
  assert.equal(analysis.counts.valid, 2);
  assert.equal(analysis.counts.possibleDuplicates, 1);
  assert.equal(analysis.rows[1].possibleDuplicateOf, 2);
  assert.equal(simulateImportConfirmation(analysis).simulated, 2);
});
test("confirmação usa o resultado da prévia e rejeita lotes sem registros aptos ou pendentes", () => {
  const table = parse(`${valid}\n${valid.replace("-15.79,-47.88", ",")}\n${valid.replace("23:59", "99:99")}`);
  const analysis = analyze(table);
  assert.deepEqual(simulateImportConfirmation(analysis), { total: 3, simulated: 1, pending: 1, rejected: 1, possibleDuplicates: 0, persisted: false });
  assert.throws(() => simulateImportConfirmation(analyze(parse(valid.replace("23:59", "99:99")))));
  assert.throws(() => simulateImportConfirmation(analyzeImport(table, { ...autoMapImport(table.headers), data: -1 })));
  assert.equal(simulateImportConfirmation(analyze(parse(valid.replace("-15.79,-47.88", ",")))).pending, 1);
});
test("XLSX real identifica planilhas e permite selecionar os dados corretos", () => {
  const buffer = workbookBuffer({ Vazia: [], Ocorrencias: [header.split(","), valid.split(",")] });
  const parsed = readImportBuffer("dados.xlsx", buffer);
  assert.deepEqual(parsed.table.sheetNames, ["Vazia", "Ocorrencias"]);
  assert.ok(parsed.table.sheetError);
  const table = tableFromWorkbook(parsed.workbook, "Ocorrencias");
  assert.equal(analyze(table).counts.valid, 1);
  assert.throws(() => tableFromWorkbook(parsed.workbook, "Inexistente"));
});
test("XLSX interpreta data/horário numéricos e preserva números originais", () => {
  const values = valid.split(","); values[0] = 45351; values[1] = 0.5;
  const parsed = readImportBuffer("dados.xlsx", workbookBuffer({ Dados: [header.split(","), values] }));
  const row = analyze(parsed.table).rows[0];
  assert.equal(row.status, "valido");
  assert.equal(row.original[0].value, 45351);
  assert.equal(row.normalized.data, "29/02/2024");
  assert.equal(row.normalized.horario, "12:00");
  const book = XLSX.utils.book_new();
  book.Workbook = { WBProps: { date1904: true } };
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([header.split(","), [43889, 0.5, ...values.slice(2)]]), "Dados");
  assert.equal(analyze(tableFromWorkbook(book, "Dados")).rows[0].normalized.data, "29/02/2024");
});
test("XLSX não executa fórmulas e aponta células com erros", () => {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([header.split(","), valid.split(","), valid.split(",")]);
  sheet.E2 = { t: "s", v: "Quadra 10", f: 'CONCAT("Quadra", " 10")' };
  sheet.E3 = { t: "e", v: 7 };
  XLSX.utils.book_append_sheet(book, sheet, "Dados");
  const table = readImportBuffer("dados.xlsx", XLSX.write(book, { type: "array", bookType: "xlsx", compression: true })).table;
  const analysis = analyze(table);
  assert.equal(analysis.counts.invalid, 2);
  assert.ok(analysis.rows[0].original[4].formula);
  assert.ok(analysis.rows[1].original[4].error);
});
test("XLSX inválido, truncado, arquivo renomeado e ZIP não Excel são rejeitados", () => {
  const good = workbookBuffer({ Dados: [header.split(","), valid.split(",")] });
  for (const buffer of [new ArrayBuffer(0), new TextEncoder().encode("não é Excel").buffer, new TextEncoder().encode(`${header}\n${valid}`).buffer, good.slice(0, 100)]) assert.throws(() => readImportBuffer("dados.xlsx", buffer));
  const malformed = good.slice(0);
  const bytes = new Uint8Array(malformed);
  const decoder = new TextDecoder();
  const workbookName = new TextEncoder().encode("xl/workbook.xml");
  for (let i = 0; i <= bytes.length - workbookName.length; i++) if (decoder.decode(bytes.subarray(i, i + workbookName.length)) === "xl/workbook.xml") bytes[i] = 121;
  assert.throws(() => inspectImportZip(malformed));
});
test("limites recusam conteúdo excessivo sem truncar registros", () => {
  assert.throws(() => parse(`${valid}\n`.repeat(IMPORT_LIMITS.rows + 1)), /Limite/);
  assert.throws(() => parse(valid.replace("Quadra demonstrativa 10", "A".repeat(IMPORT_LIMITS.cellLength + 1))), /Célula/);
  assert.throws(() => parseImportCsv(Array.from({ length: 65 }, (_, i) => `C${i}`).join(",") + "\n1"), /limite/);
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([header.split(","), valid.split(",")]); sheet["!ref"] = "A1:G10002";
  XLSX.utils.book_append_sheet(book, sheet, "Dados");
  assert.throws(() => tableFromWorkbook(book, "Dados"), /limites/);
  const buffer = workbookBuffer({ Dados: [header.split(","), valid.split(",")] });
  const view = new DataView(buffer);
  for (let i = 0; i < buffer.byteLength - 46; i++) if (view.getUint32(i, true) === 0x02014b50) {
    view.setUint32(i + 24, IMPORT_LIMITS.expanded + 1, true);
    view.setUint32(view.getUint32(i + 42, true) + 22, IMPORT_LIMITS.expanded + 1, true);
    break;
  }
  assert.throws(() => inspectImportZip(buffer), /descompactados/);
});
test("decodificação CSV suporta UTF-8, UTF-16 e Windows-1252 sem substituir acentos", () => {
  const csv = `${header}\n${valid.replace("Plano Piloto", "Ceilândia")}`;
  const utf8 = readImportBuffer("dados.csv", new TextEncoder().encode(csv).buffer).table;
  assert.equal(analyze(utf8).counts.valid, 1);
  const utf16 = Buffer.concat([Buffer.from([255, 254]), Buffer.from(csv, "utf16le")]);
  assert.equal(analyze(readImportBuffer("dados.csv", utf16.buffer.slice(utf16.byteOffset, utf16.byteOffset + utf16.byteLength)).table).counts.valid, 1);
  const latin = Buffer.from(csv, "latin1");
  const parsed = readImportBuffer("dados.csv", latin.buffer.slice(latin.byteOffset, latin.byteOffset + latin.byteLength));
  assert.equal(parsed.table.encoding, "Windows-1252");
  assert.equal(analyze(parsed.table).counts.valid, 1);
});
