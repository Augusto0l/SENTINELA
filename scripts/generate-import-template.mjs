import { readFile, writeFile } from "node:fs/promises";
import * as XLSX from "xlsx";

// Mantém os mesmos valores literais do modelo CSV; não usa dados institucionais.
const csv = await readFile(new URL("../public/modelos/ocorrencias-demonstracao.csv", import.meta.url), "utf8");
const workbook = XLSX.read(csv, { type: "string", raw: true, FS: "," });
workbook.SheetNames[0] = "Ocorrencias";
workbook.Sheets.Ocorrencias = workbook.Sheets.Sheet1;
delete workbook.Sheets.Sheet1;
workbook.Props = { Title: "SENTINELA — modelo demonstrativo não homologado", CreatedDate: new Date("2026-10-28T00:00:00Z") };
await writeFile(new URL("../public/modelos/ocorrencias-demonstracao.xlsx", import.meta.url), XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true }));
console.log("Modelo XLSX gerado a partir do CSV demonstrativo.");
