# SENTINELA — resumo executivo de progresso

**Corte em 22/11/2026.** O projeto está na **continuação técnica da Sprint 4**, com partes das Sprints 5 e 6 adiantadas. A Sprint 1 tem encerramento acadêmico registrado. As Sprints 2 e 3 foram tecnicamente revisadas e integradas, com o aceite acadêmico formal ainda por confirmar. O quadro oficial ao vivo ficou fora do acesso da auditoria.

| Indicador | Resultado |
| --- | ---: |
| Projeto, implementação ponderada dos PBIs | **46/60 · 77%** |
| Projeto, evidência de aceite técnico | **36/60 · 60%** |
| Sprint 1 / 2 / 3, técnico | 100% / 100% / 96% |
| Sprint 4 / 5 / 6, técnico | **68%** / 67% / 46% |
| MVP local, critérios ponderados | 3/5 · 60% |
| Preparação para publicação | 2/6 · 33% |

**O que funciona hoje.** Autenticação local por perfil, recepção PCDF em staging, histórico, consulta das associações e geocodificação pública por ViaCEP/IPEDF. A consulta de janeiro confirmou **6.393 associações de 34 campos, 20.020 pendências e zero ocorrências consolidadas**. O fluxo de cadastro manual gravou e recuperou ocorrências com auditoria em ambiente sintético.

**O que está bloqueado.** Dashboard e Mapa usam um leitor sem configuração para o banco operacional de `npm run dev:local`. O cadastro manual ainda exige aprovação dos catálogos e ativação autorizada do SQL. Há 37 geometrias de RAs preparadas e zero naturezas homologadas. Consolidação e divulgação analítica dependem de regras de classificação, identidade e revisão. A identidade institucional e a publicação permanecem abertas.

**Próxima tarefa.** Corrigir o leitor analítico da Sprint 4 e validar vazio, erros e permissões no Dashboard e no Mapa. Padronizar e homologar o conjunto de telas com dados sintéticos. Retomar os outros **67 meses** da fonte histórica só após a aprovação das telas e autorização da carga.

**Testes e Git.** TypeScript, ESLint, build, contratos, 264 testes Node e 30 testes Python passaram. O checkout principal está em `feat/redesign-interface`, HEAD `3e1b3ad`, dez commits à frente da `main` institucional. Antes da auditoria havia 52 arquivos modificados e 34 não rastreados. Esses arquivos, o banco real e o histórico foram preservados. A auditoria acrescentou somente os dois relatórios.

[Relatório completo, evidências e plano priorizado](auditoria-geral-sentinela-2026-11-22.md)
