export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024;

/** Validação inicial de metadados; não verifica o conteúdo do arquivo. */
export function validateImportFiles(files: readonly { name: string; size: number }[]): string | null {
  if (files.length !== 1) return "Selecione um único arquivo CSV ou XLSX por vez.";
  const file = files[0];
  if (!/\.(csv|xlsx)$/i.test(file.name)) return "Formato não aceito. Selecione um arquivo CSV ou XLSX.";
  if (file.size === 0) return "O arquivo está vazio. Selecione um arquivo com dados.";
  if (file.size > MAX_IMPORT_FILE_BYTES) return "O arquivo excede o limite de 50 MB (52.428.800 bytes).";
  return null;
}
