import { directPcdfPath, directPreview, directReceipt } from "@/contracts/pcdf-direct";
import type { z } from "zod";

const diagnostics: Record<string, string> = {
  nome_competencia_invalido: "Use o nome original pcdf_naturezas_AAAA-MM.csv.",
  cabecalho_invalido: "Layout PCDF v1.0 incompatível. Confira a presença e a ordem dos 34 campos.",
  csv_malformado: "O conteúdo do CSV é inválido. Confira a codificação UTF-8 e as aspas dos campos.",
  largura_ou_limite_csv: "Há uma linha com quantidade de campos incorreta ou acima dos limites do layout.",
  csv_divergente_manifesto: "O SHA-256 ou o tamanho do CSV diverge do manifesto.",
  contagem_csv_divergente: "A quantidade de registros diverge do manifesto.",
  contagem_csv_invalida: "O CSV mensal precisa conter de 1 a 10.000 associações.",
  proveniencia_linha_invalida: "Há identificadores de origem ou versões de tratamento incompatíveis.",
  linha_de_origem_duplicada: "O CSV contém identificador de origem ou posição XML repetidos.",
  registro_fora_da_competencia: "Há uma data válida fora da competência indicada pelo nome do CSV.",
  manifesto_inconsistente: "Os dados técnicos do manifesto são inconsistentes.",
  competencia_nao_manifestada: "A competência do CSV não está no manifesto.",
};

export async function callDirectPcdf<T>(schema: z.ZodType<T>, query = "", body?: FormData, signal?: AbortSignal): Promise<T> {
  const response = await fetch(directPcdfPath + query, {
    cache: "no-store", signal, ...(body && { method: "POST", body }),
  }).catch(error => {
    if (signal?.aborted && error instanceof Error && error.name === "AbortError") throw error;
    throw new Error("Backend de importação indisponível.");
  });
  const result = await response.json().catch(() => null);
  if (response.status === 401) throw new Error("Sessão expirada. Entre novamente.");
  if (response.status === 403) throw new Error("Importação não autorizada para este perfil ou ambiente.");
  if (!result) throw new Error("Backend de importação indisponível.");
  if (!response.ok || result.success !== true) {
    const detail = result.error?.diagnostic;
    throw new Error(diagnostics[detail] ?? result.error?.message ?? "Receptor PCDF local indisponível.");
  }
  return schema.parse(result.data);
}

function payload(csv: File, manifest?: File) {
  const body = new FormData();
  body.set("csv", csv);
  if (manifest) body.set("manifesto", manifest);
  return body;
}

export function previewPcdf(csv: File, manifest?: File, signal?: AbortSignal) {
  return callDirectPcdf(directPreview, "?etapa=validar", payload(csv, manifest), signal);
}

export function confirmPcdf(csv: File, preview: Pick<z.infer<typeof directPreview>, "sha256" | "manifestSha">, manifest?: File) {
  const body = payload(csv, manifest);
  body.set("sha256", preview.sha256);
  if (preview.manifestSha) body.set("manifestSha", preview.manifestSha);
  return callDirectPcdf(directReceipt, "?etapa=confirmar", body);
}
