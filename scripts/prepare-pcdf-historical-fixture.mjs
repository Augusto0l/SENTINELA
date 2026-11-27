import { createHash } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { fixture } from "../tests/fixtures/pcdf-v2-package.mjs"

const target = process.argv[2]
const xml = "faf82ae0620fa3ecc53bc002d9c2e49b24b6ec0126a44449510d12948dc0a022"
const hash = value => createHash("sha256").update(value).digest("hex")
const sample = fixture(({ rows }) => rows.forEach((row, index) => {
  const position = 2000000001 + index
  Object.assign(row, {
    ano_registro: "2021", unidade_registro: "UNIDADE SINTÉTICA", numero_registro: "00000000",
    ocorrencia_chave: JSON.stringify(["PCDF", "2021", "UNIDADE SINTÉTICA", "00000000"]),
    data: "2021-03-15", horario: "", natureza_original: ["HOMICIDIO", "ROUBO A TRANSEUNTE"][index],
    latitude_geo_original: "", longitude_geo_original: "", latitude_utm_original: "", longitude_utm_original: "",
    coordenada_status: "ausente", linha_xml: String(position),
    linha_origem_id: hash(JSON.stringify(["pcdf-linha-v1", xml, "NATUREZAS", position])),
  })
}))
const content = Buffer.from(await sample.csv.arrayBuffer())
await writeFile(target, content, { flag: "wx" })
console.log(JSON.stringify({ bytes: content.length, hash: hash(content) }))
