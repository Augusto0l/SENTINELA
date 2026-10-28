# Evidências da importação demonstrativa

Verificação local: 28/10/2026 (America/Sao_Paulo), build de produção Next.js 16.3.6. Node 22.23.2, pnpm 10.34.3 e Chrome headless 156.0.8078.48. Não representa aceite acadêmico ou fechamento remoto de issues.

- [Resultado do roteiro Chrome](resultados.json): nove grupos de verificações, zero erros JavaScript de página capturados e zero requisições de gravação observadas.
- [Identificador do build verificado](BUILD_ID.txt).
- [Desktop escuro — página](page-escuro-1366.png).
- [Desktop escuro — prévia](preview-escuro-1366.png).
- [Celular claro — página](page-claro-390.png).
- [Celular claro — prévia com rolagem horizontal própria](preview-claro-390.png).

O roteiro `node scripts/check-import.mjs` foi executado contra servidor local já iniciado, na porta 3000, usando o build concluído. Foram verificados arquivos inválidos/vazios/corrompidos, CSV e XLSX reais, seleção de planilhas, prévia, filtros, originais, duplicatas preservadas, correção de mapeamento, confirmação, drag-and-drop, limpeza, paginação e foco por teclado. Capturas adicionais de 1366, 768, 390 e 320 px nos dois temas ficam em `tmp/import-evidence/`, ignorado pelo Git.

As fontes Google foram bloqueadas somente no roteiro para evitar dependência externa durante a navegação/captura. As capturas usam a fonte de fallback; não atestam disponibilidade da CDN de fontes. A inspeção visual selecionou a página de celular no tema claro e a prévia de desktop no tema escuro. Não houve homologação em Firefox/Safari, certificação de acessibilidade ou teste de heap sob arquivos hostis.

O resultado demonstrativo foi conferido com quatro linhas: duas válidas (uma candidata a duplicata), uma pendência de localização e uma inválida. A paginação foi conferida separadamente com 26 registros, em páginas de 25 + 1. Os exemplos foram gerados pelo roteiro e não usam arquivos originais da PCDF.

Validações complementares: instalação congelada, TypeScript, ESLint, 46 testes Node, contratos, rotas estáticas e build aprovados. Detalhes: [relatório técnico](../../importacao-demonstrativa.md).
