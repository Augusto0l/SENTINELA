export const OFFICIAL_PCDF_BLOCK = "Arquivo com layout ou proveniência PCDF. Use o receptor institucional com as três autorizações do piloto."

const provenance = new Set(["linhaorigemid", "linhaxml", "abaorigem", "versaotratamento"])
const layout = new Set(["naturezaoriginal", "naturezapadronizadapcdf", "datainiciofatooriginal",
  "anoregistro", "unidaderegistro", "numeroregistro", "ocorrenciachave", "latitudegeooriginal", "longitudegeooriginal"])

export function isInstitutionalPcdf(name: string, headers: string[]) {
  const normalized = new Set(headers.map(header => header.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "")))
  return /pcdf[_ -]*naturezas/i.test(name) || [...provenance].some(token => normalized.has(token))
    || [...layout].filter(token => normalized.has(token)).length >= 5
}
