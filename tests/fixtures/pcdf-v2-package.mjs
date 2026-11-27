import { createHash } from "node:crypto";
import { pcdfV2Headers } from "../../src/data/pcdfV2.ts";

export const csvName = "pcdf_naturezas_2021-01.csv";
const xmlSha = "a".repeat(64);
const sha = content => createHash("sha256").update(content).digest("hex");
const json = value => JSON.stringify(value) + "\n";
const cell = value => /[;"\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
const records = (rows, columns = pcdfV2Headers) => [columns.join(";"), ...rows.map(row => columns.map(name => cell(row[name] ?? "")).join(";"))].join("\r\n") + "\r\n";
export function fixture(change = () => {}) {
  const row = {
    ano_registro: "2021", unidade_registro: "UNIDADE TESTE", numero_registro: "0007",
    ocorrencia_chave: JSON.stringify(["PCDF", "2021", "UNIDADE TESTE", "0007"]), ano_fato: "2021",
    data: "2021-01-13", horario: "09:04:59", natureza_original: "NATUREZA A", natureza_padronizada_pcdf: "GRUPO",
    crime_tentado: "NÃO", classificacao_status: "pendente", quadra_endereco_original: 'Área; "aspas"\nLínea, final',
    local: 'Área; "aspas"\nLínea, final', latitude_geo_original: "-15.123456789012345",
    longitude_geo_original: "-47.987654321987654", latitude_utm_original: "NULL", longitude_utm_original: " ",
    coordenada_status: "referencia_pendente", flagrante: "SIM", fonte: "PCDF", linha_xml: "2",
    linha_origem_id: sha(JSON.stringify(["pcdf-linha-v1", xmlSha, "NATUREZAS", 2])),
  };
  const rows = [row, { ...row, linha_xml: "3", natureza_original: "NATUREZA B",
    linha_origem_id: sha(JSON.stringify(["pcdf-linha-v1", xmlSha, "NATUREZAS", 3])) }];
  const provenance = rows.map(item => ({
    linha_origem_id: item.linha_origem_id, linha_xml: Number(item.linha_xml), data_inicio_fato_original: "13/01/2021 09:04:59",
    coordenada_status_v1: "invalida", revisao_utm_sem_geo: false, diagnosticos: {},
    coordenadas: {
      GEO: { estado: "referencia_pendente", componentes: { latitude_geo_original: "numerico", longitude_geo_original: "numerico" } },
      UTM: { estado: "ausente", componentes: { latitude_utm_original: "nulo_declarado", longitude_utm_original: "vazio_semantico" } },
    },
  }));
  const manifest = {
    status: "validado_localmente", competencia: "2021-01",
    layout: { versao: "2.0", colunas: [...pcdfV2Headers], codificacao: "UTF-8", delimitador: ";", terminador: "CRLF", bom: false },
    versao_tratamento: "pcdf-v2-teste", versao_proveniencia: "pcdf-proveniencia-v1",
    fonte: { aba: "NATUREZAS", identificador: "PCDF", sha256: xmlSha, nome: "fonte.xml", bytes: 123 },
    identificador_linha: { versao: "pcdf-linha-v1", hash: "SHA-256", serializacao: "JSON compacto UTF-8",
      componentes: ["versao_algoritmo", "sha256_xml", "aba", "linha_xml_inteira"] },
    crs_origem: null, mapeamentos_aplicados: {},
    reconciliacao: {
      associacoes_csv_v2: 2, associacoes_xml: 2, ids_distintos: 2, originais_reconciliados: 36,
      divergencias_textuais_de_origem: 0, chaves_candidatas_distintas: 1, naturezas_originais_distintas: 2,
      naturezas_originais: { "NATUREZA A": 1, "NATUREZA B": 1 }, crime_tentado: { NÃO: 2 }, flagrante: { SIM: 2 },
      coordenada_status: { referencia_pendente: 2 }, classificacao_status: { pendente: 2 },
      naturezas_padronizadas: { GRUPO: 2 }, associacoes_sem_chave: 0,
      chaves_por_quantidade_de_associacoes: { 2: 1 }, repeticoes_chave_natureza: 0, anos_registro_fato_distintos: 0,
      diagnosticos_por_associacao: {}, coordenada_status_v1_para_v2: { "invalida -> referencia_pendente": 2 },
      pares_coordenadas: { GEO: { referencia_pendente: 2 }, UTM: { ausente: 2 } }, candidatos_utm_sem_geo: [],
      quarentena_temporal: { sem_competencia: 0, ano_fato_divergente_ou_invalido: 0 },
    },
  };
  const config = { rows, provenance, manifest, columns: [...pcdfV2Headers], quarantine: "", report: "Resumo da validação sintética.\n", mutateCsv: csv => csv,
    makeProvenance: rows => rows.map(json).join("") };
  change(config);
  const content = {
    [csvName]: config.mutateCsv(records(rows, config.columns)),
    "proveniencia.jsonl": config.makeProvenance(provenance),
    "pendencias_temporais.jsonl": config.quarantine, "validacao.md": config.report,
  };
  config.manifest.arquivos = Object.fromEntries(Object.entries(content).map(([name, data]) => [
    name, { bytes: Buffer.byteLength(data), sha256: sha(data) },
  ]));
  content["manifesto.json"] = json(config.manifest);
  const checksums = Object.entries(content).map(([name, data]) => sha(data) + "  " + name + "\n").join("");
  const file = name => new File([content[name]], name);
  return { csv: file(csvName), attachments: [
    file("manifesto.json"), file("proveniencia.jsonl"), new File([checksums], "sha256sums.txt"),
    file("pendencias_temporais.jsonl"), file("validacao.md"),
  ], file, rows };
}
