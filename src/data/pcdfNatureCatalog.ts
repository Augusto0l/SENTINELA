import catalog from "../../docs/catalogos/pcdf-naturezas-xml-v1.json" with { type: "json" };

export const pcdfNatureDescriptions: ReadonlySet<string> = new Set(catalog.naturezas);
export const pcdfInformationalFields: ReadonlySet<string> = new Set([
  "natureza_padronizada_pcdf", "natureza_sentinela_codigo", "classificacao_status", "versao_mapeamento",
]);
