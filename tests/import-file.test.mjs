import test from "node:test";
import assert from "node:assert/strict";
import { MAX_IMPORT_FILE_BYTES, validateImportFiles } from "../src/data/importFile.ts";

test("seleção aceita CSV/XLSX sem depender do MIME e inclui o limite de 50 MB", () => {
  for (const name of ["dados.csv", "DADOS.XLSX", "dados.CsV"]) {
    assert.equal(validateImportFiles([{ name, size: MAX_IMPORT_FILE_BYTES }]), null);
  }
});

test("seleção rejeita extensão inválida, vazio, excesso de tamanho e múltiplos arquivos", () => {
  for (const files of [[], [{ name: "dados.xls", size: 10 }], [{ name: "dados.csv.exe", size: 10 }],
    [{ name: "dados.csv", size: 0 }], [{ name: "dados.xlsx", size: MAX_IMPORT_FILE_BYTES + 1 }],
    [{ name: "a.csv", size: 1 }, { name: "b.csv", size: 1 }]]) {
    assert.equal(typeof validateImportFiles(files), "string");
  }
});
