import { directCsvPreview, directPcdfPath, directPreview, directReceipt } from "@/contracts/pcdf-direct";
import type { z } from "zod";
import { PcdfHttpError } from "./pcdf-client";

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
    cache: "no-store", credentials: "same-origin", signal, ...(body && { method: "POST", body }),
  }).catch(error => {
    if (signal?.aborted && error instanceof Error && error.name === "AbortError") throw error;
    throw new PcdfHttpError(503, "Não foi possível conectar ao serviço de importação. Verifique a conexão e tente novamente.");
  });
  const result = await response.json().catch(() => null);
  if (response.status === 401) throw new PcdfHttpError(401, "Sessão expirada. Entre novamente.");
  if (response.status === 403) throw new PcdfHttpError(403, result?.error?.diagnostic === "autorizacao_institucional_ausente"
    ? "Gravação bloqueada: este Administrador não tem autorização institucional ativa no PostgreSQL. Solicite a liberação ao responsável pela manutenção. A prévia continua disponível."
    : "Importação não autorizada para este perfil ou origem.");
  if (!response.ok) {
    const detail = result?.error?.diagnostic;
    const message = typeof result?.error?.message === "string" ? result.error.message : "Receptor PCDF local indisponível.";
    throw new PcdfHttpError(response.status, diagnostics[detail] ?? message);
  }
  const data = schema.safeParse(result?.success === true ? result.data : undefined);
  if (!data.success) throw new PcdfHttpError(502, "Resposta inesperada do receptor PCDF.");
  return data.data;
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

const standalone = "&versao=2.0&modalidade=csv";
export function previewPcdfCsv(csv: File, signal: AbortSignal) {
  return callDirectPcdf(directCsvPreview, "?etapa=validar" + standalone, payload(csv), signal);
}

export function confirmPcdfCsv(csv: File, sha256: string) {
  const body = payload(csv);
  body.set("sha256", sha256);
  return callDirectPcdf(directReceipt, "?etapa=confirmar" + standalone, body);
}
