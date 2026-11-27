# Importação demonstrativa local com processamento em Web Worker

## Status

Implementada no protótipo; sujeita à revisão da entrega. Não homologa catálogos nem contratos operacionais.

## Data

2026-10-28

## Contexto

A Sprint 3 exige leitura real de CSV/XLSX, mapeamento e prévia. A tela anterior apresentava exemplos estáticos e apenas validava extensão/tamanho. O protótipo continua sem persistência, autenticação ou autorização real. Dados originais e várias naturezas por ocorrência devem ser preservados.

## Decisão

- Processar arquivos no navegador, em um Web Worker empacotado pelo Next.js, sem enviar dados a APIs.
- Usar SheetJS CE 0.20.3, fixado pela distribuição oficial com integridade no lockfile, para XLSX. O parser CSV próprio faz leitura estrita de aspas, separadores e posições de linha, mantendo strings originais.
- Compartilhar validações com `occurrenceSchema` e catálogos existentes. Naturezas múltiplas são uma lista derivada, não novas ocorrências. Valores brutos ficam separados dos normalizados.
- Distinguir inválidos de pendentes por ausência de coordenadas. Coordenadas fornecidas inválidas continuam erros; não gerar localização artificial nem geocodificar lotes.
- Alertar possíveis duplicatas entre linhas pelos atributos normalizados, sem exclusão ou fusão. Não comprovar identidade nem comparar com bases externas.
- Admitir até 50 MB por arquivo, mas recusar conteúdo que ultrapasse os limites de 10 mil linhas, 64 colunas, 200 mil células, 4 mil caracteres/célula, 16 Mi caracteres e 100 MB declarados no diretório ZIP. O limite de processamento é 60 segundos; cancelar encerra o Worker. ZIP64, arquivos criptografados e fórmulas não são suportados.
- Confirmar apenas um resumo demonstrativo: aptos, rejeitados e pendências, sem alteração da listagem ou dos mapas. O resultado vive nesta tela e se perde ao sair/recarregar.
- Preservar a implementação legada como export nomeado, sem rota adicional, e manter a rota `/importar` como entrada do novo fluxo.

## Alternativas consideradas

- Processamento no servidor: exigiria expandir o escopo para upload, autorização e retenção de arquivos.
- Leitura no thread principal: poderia bloquear a interface em arquivos maiores.
- Interpretar XLSX sem biblioteca: aumentaria a complexidade de ZIP, XML, datas seriais e compatibilidade.
- Conectar o resultado ao cenário operacional em memória: criaria divergência com os mapas e exigiria tratar pendências/múltiplas naturezas em módulos fora desta entrega.

## Consequências

Há uma nova dependência e um bundle de Worker. Limites de conteúdo podem recusar arquivos menores que 50 MB; a recusa é explícita, sem truncamento silencioso. O preflight ZIP é uma mitigação de memória, não uma sandbox de segurança ou garantia de pico de heap contra arquivos maliciosos. A interpretação de CSV Windows-1252 é uma tentativa explícita quando UTF-8 não é válido. Não existe auditoria, fila durável, idempotência ou transação real. Os modelos e aliases são demonstrativos e dependem de homologação.

## Links relacionados

- [Sprint 3](../../sprints/sprint-03.md), Feature #10 / PBIs #60, #63, #66 e #69.
- [Contrato de deduplicação e permissões](../contratos/deduplicacao-permissoes-v0.1.0.md).
- [Instalação oficial do SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/).
- [Processamento em Web Workers](https://docs.sheetjs.com/docs/demos/bigdata/worker/).
