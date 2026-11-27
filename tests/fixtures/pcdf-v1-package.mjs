import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { csvName } from "./pcdf-v2-package.mjs";

export function v1(xml, rows, manifestEnabled = true, name = csvName) {
  const code = [
    "import csv, io, json, runpy, sys",
    "sys.path.insert(0, 'database/local/pcdf-sandbox')",
    "from direct_input import prepare_direct",
    "from pipeline import HEADERS",
    "fixture=runpy.run_path('database/local/pcdf-sandbox/qualify-manifest.py')",
    "name, xml, rows, enabled=json.load(sys.stdin)",
    "out=io.StringIO(newline='')",
    "writer=csv.DictWriter(out, HEADERS, delimiter=';', lineterminator='\\r\\n')",
    "writer.writeheader()",
    "for item in rows:",
    " row=dict.fromkeys(HEADERS,'')",
    " row.update(data_inicio_fato_original='13/01/2021 09:04:59', aba_origem='NATUREZAS', versao_tratamento=fixture['TREATMENT'])",
    " row.update(item)",
    " row['coordenada_status']='invalida'; writer.writerow(row)",
    "content=out.getvalue()",
    "month=name.removeprefix('pcdf_naturezas_').removesuffix('.csv')",
    "m=json.dumps(fixture['manifest_for']({month:(content.encode(),len(rows))}, xml.encode(), finalized=True), ensure_ascii=False) if enabled else None",
    "delivery=prepare_direct(name,content.encode(),m.encode() if m else None)",
    "print(json.dumps(dict(csv=content,manifest=m,delivery=delivery)))",
  ].join("\n");
  const input = JSON.stringify([name, xml.toString("utf8"), rows, manifestEnabled]);
  const p = spawnSync("python", ["-X", "utf8", "-B", "-c", code], { input, encoding: "utf8" });
  assert.equal(p.status, 0, p.stderr || "o parser de referência precisa preparar a fixture v1");
  return JSON.parse(p.stdout);
}
