# Evidências atuais — Sprint 3, Etapa 4

Rodada de **28/10/2026**, America/Sao_Paulo, sobre `test/sprint3-homologacao`, base `33f6bf5`. As evidências são novas: os manifestos registram início/fim e build de cada execução. Não representam aceite acadêmico ou encerramento formal.

- [Relatório de homologação, problemas e checklist](../../homologacao-sprint-03.md).
- [Resumo estruturado das verificações](validacao.json).
- [Manifesto completo de arquivos e SHA-256](manifesto.json).
- [Suíte Node completa — 96 aprovados, 13 novos](registros/testes-node.txt).

Build verificado: `ZegOWoXQpLl_y15v4YfR1`. Node 22.23.2, pnpm 10.34.3, Chrome 156.0.8078.48. Instalação congelada, TypeScript, ESLint, testes, build, contratos e diff check aprovados. A validação OpenAPI conferiu 23 modelos, 13 operações e 29 payloads, além dos catálogos e da sincronização com Zod.

## Navegador — seleção das rodadas aprovadas

| Grupo | Rodada | Evidência |
| --- | --- | --- |
| Worker | r03 | [Log](registros/worker.txt), [resultado](resultados/worker.json) |
| Importação | r01 | [Log](registros/import.txt), [resultado](resultados/importacao.json) |
| Analytics | r01 | [Log](registros/analytics.txt), [resultado](resultados/analytics.json) |
| Consulta de ocorrências | r01 | [Log](registros/occurrences.txt) |
| Regressão da Sprint 2/perfis | r01 | [Log](registros/sprint2.txt), [resultado](resultados/sprint2.json) |
| Satélite real | r04 | [Log](registros/satellite.txt), [resultado](resultados/satelite.json) |
| Localização com fixtures | r04 | [Log](registros/location-ui.txt), [resultado](resultados/localizacao-fixtures.json) |
| Navegação | r04 | [Log](registros/navigation.txt), [resultado](resultados/navegacao.json) |
| Localização real | r05 | [Log](registros/location.txt), [resultado](resultados/localizacao-real.json) |

As nove verificações finais passaram. Satélite utilizou 54 tiles reais; localização real consultou ViaCEP/geocodificador e depois reproduziu as amostras obtidas no Chrome. O teste com fixtures está separado e usa referências explicitamente sintéticas; não comprova serviços externos.

Importação, Worker e analytics foram exercitados em claro/escuro e 1366/768/390/320 px. Os fluxos operacionais cobriram 1366/768/390 px. Satélite cobriu desktop/tablet/celulares; a navegação conferiu 13 larguras entre 320 e 1920 px, sete rotas nos dois temas, perfis, foco e teclado. As matrizes detalhadas e limitações estão no relatório.

## Tentativas reprovadas preservadas

[r01](rodadas/r01.json), [r02](rodadas/r02.json), [r03](rodadas/r03.json), [r04](rodadas/r04.json), [r05](rodadas/r05.json) mantêm os resultados originais, incluindo **cinco casos reprovados** nas primeiras tentativas:

- [Worker r01](registros/tentativas/r01-worker.txt): seletor exato não considerava a codificação junto à quantidade de linhas.
- [Worker r02](registros/tentativas/r02-worker.txt): seletor de alerta também capturava o anunciador do Next.js.
- [Satélite r01](registros/tentativas/r01-satellite.txt): conexão real interrompida (ECONNRESET).
- [Localização r01](registros/tentativas/r01-location.txt): timeout na consulta real ao ViaCEP.
- [Navegação r01](registros/tentativas/r01-navigation.txt): timeout de navegação; repetição isolou fontes Google e passou.

Esses resultados não foram convertidos em aprovação. As repetições têm horários e saídas próprios. Os manifestos brutos listam todos os artefatos gerados originalmente; somente as capturas selecionadas abaixo foram copiadas para o repositório. As demais permanecem nos diretórios únicos em `tmp/sprint-03-homologacao`, ignorados pelo Git.

## Capturas selecionadas

- [Worker carregando — claro, 320 px, foco no cancelamento](capturas/worker-carregamento-claro-320.png).
- [Worker — erro recuperável de prazo](capturas/worker-timeout-1366.png).
- [Importação — prévia escura de desktop](capturas/importacao-previa-escuro-1366.png).
- [Importação — celular claro](capturas/importacao-claro-390.png).
- [Dashboard — escuro, desktop](capturas/dashboard-escuro-1366.png).
- [Mapa Criminal — claro, celular](capturas/mapa-claro-390.png).
- [Cadastro — escuro, tablet](capturas/cadastro-escuro-768.png).
- [Navegação — escuro, celular](capturas/navegacao-escuro-390.png).
- [Satélite com imagens reais — claro, desktop](capturas/satelite-claro-desktop.png).

Inspeção visual direta incluiu carregamento/cancelamento claro em 320 px, navegação escura em 390 px, prévia escura de desktop e Satélite claro de desktop. Os demais tamanhos/estados foram conferidos pelos roteiros e capturados. Não é certificação visual em aparelhos físicos, leitores de tela ou outros navegadores.

## Limites e reprodução

`node scripts/homologate-sprint3.mjs` requer servidor local existente e registra cada rodada em pasta única. Para casos específicos, usar `--only=worker,import,analytics`. Nenhum servidor, publicação ou alteração Git é feito pelo roteiro. Falhas fazem o comando retornar erro, sem esconder casos reprovados.

O Worker nativo interpreta arquivos reais gerados pelo teste; seu wrapper controla atrasos/falhas. O relógio de testes confere exatamente os 60.000 ms existentes; no Chrome, o callback do watchdog é acionado de forma controlada. Isso não mede 60 segundos reais nem pico de heap. Limites de 10.000/10.001 linhas CSV/XLSX são testados na suíte Node; o navegador não recebeu esses volumes.

Fontes Google são bloqueadas em parte dos roteiros para isolar rede; capturas podem usar fallback. Testes locais não comprovam disponibilidade futura de serviços externos, autenticação, persistência ou endpoints `/api/v1`. Sem Firefox/Safari, dispositivos físicos ou homologação acadêmica.

## Inventário da Etapa 4

Modificados:

- `src/data/importTypes.ts`
- `src/features/import/ImportWorkflow.tsx`
- `src/features/import/import.worker.ts`
- `scripts/check-cep-location.mjs`
- `scripts/check-navigation.mjs`
- `scripts/check-satellite.mjs`
- `docs/importacao-demonstrativa.md`
- `sprints/sprint-03.md`

Criados fora desta pasta:

- `src/features/import/importWorkerClient.ts`
- `src/features/import/importWorkerProcessor.ts`
- `tests/import-worker.test.mjs`
- `scripts/check-import-worker.mjs`
- `scripts/homologate-sprint3.mjs`
- `docs/homologacao-sprint-03.md`

Nesta pasta, o [manifesto](manifesto.json) relaciona todos os arquivos de evidência, tamanhos e hashes (exceto ele próprio). Parser, catálogos, contratos, dependências/lockfile, renderizadores de mapas, geometrias e dados PCDF não foram alterados. Não houve commit, tag, merge, rebase, push, alteração de autoria ou modificação de PR anterior pelo agente.

Parecer: **APTO para revisão e commit da Etapa 4**, sem declarar encerramento formal da Sprint 3. PR temporário: `test/sprint3-homologacao` → `feat/sprint3-contratos-api`; reavaliar `main` quando a Etapa 3 for integrada.
