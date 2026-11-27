# Saídas temporárias da validação HTTP

Os executores HTTP usam um UUID para a saída do Next.js e reservam
`tmp/http-validation.lock` antes de gerar tipos. O lock coordena os
executores mesmo quando usam portas diferentes, pois todos compartilham
`next-env.d.ts`. Execute `pnpm dev` e o build manual em momentos distintos
da validação HTTP.

No encerramento, o executor confirma a saída da árvore de processos e a
liberação da porta. Ele restaura `next-env.d.ts` e copia os logs, traces e
diagnósticos do Next.js para `http-diagnostics-<uuid>` junto às evidências
da execução. `manifest.json` registra os bytes e o SHA-256 de cada cópia.
O executor remove somente a saída e os auxiliares que ele reservou para
esse UUID. Se a cópia falhar ou houver links na saída, ela é preservada.
Os recibos e capturas já produzidos pelos executores permanecem nos
diretórios originais.

Em caso de interrupção forçada, o lock pode permanecer. Confira o PID e
o UUID registrados e confirme que a árvore do Next.js e os listeners
foram encerrados antes de liberar o lock. O campo `previousTypes` guarda
a versão anterior de `next-env.d.ts` em Base64, ou `null` se o arquivo
estava ausente. Restaure esse estado somente se a versão atual ainda
for a que referencia a saída do mesmo UUID.

## Preparar a limpeza do histórico

1. Encerre os testes, o Next.js e builds manuais. Rode na raiz do projeto
   `node scripts/audit-http-validation.mjs --archive`. O comando reserva
   o mesmo lock, verifica processos e portas antes e depois do inventário,
   e cria uma cópia nova em `.cache/http-validation-historical/`.
2. Confira o `inventory.json` retornado. Cada saída tem a lista exata de
   auxiliares e diagnósticos, hashes e motivos eventuais de bloqueio. A
   auditoria compara os hashes da origem e das cópias durante a leitura.
   Antes de uma exclusão posterior, reconfira os hashes com `Get-FileHash`
   e revalide que os caminhos e o estado dos processos seguem iguais.
3. Em uma etapa autorizada, considere somente os nomes exatos com
   `eligible: true` e os auxiliares listados sob o mesmo UUID. Confirme
   novamente que cada diretório resolve para um filho físico da raiz do
   projeto e que nenhum filho é um link ou junção. Mantenha as saídas
   com links, referências nos tipos, entradas inesperadas ou arquivos
   rastreados. A estimativa de espaço usa o tamanho lógico dos arquivos.
4. Preserve `.next-build-validation`, `.cache`, `tmp`,
   `.tmp-sprint02-build-cache-backup`, os dumps, as evidências privadas,
   o código-fonte e a store global do pnpm. O comando de auditoria
   apenas inventaria e arquiva. A exclusão histórica é uma etapa separada.

## Inventário inicial

Das 80 pastas históricas, 20 estavam aptas à remoção integral, com
2,51 GiB recuperáveis. As demais 60 continham junções ou links. Foram
arquivados e reconferidos 196 diagnósticos históricos, incluindo logs,
traces e metadados de build. O inventário também registra a primeira
execução da correção, preservada porque o Turbopack ainda gerou uma
junção. O modo com UUID passou a empacotar `pg` para evitar esse resíduo.

## Arquivos da implementação

- [Ciclo de vida da execução](../../scripts/http-validation-output.mjs),
  [auditoria histórica](../../scripts/audit-http-validation.mjs) e
  [testes da limpeza](../../tests/http-validation-output.test.mjs).
- [Leitor HTTP](../../scripts/homologate-local-reader.mjs),
  [navegador](../../scripts/check-occurrence-workflows-browser.mjs),
  [sandbox de escrita](../../database/local/write-sandbox/qualify-next.mjs)
  e [homologação persistente](../../database/local/persistent-homologation/qualify.mjs).
- [`next.config.ts`](../../next.config.ts) e [`.gitignore`](../../.gitignore).
