## Período
* Data Início:05/10/2026
* Data Fim:18/10/2026

## Objetivo
O foco e objetivo principal da sprint é o desenvolvimento do Módulo de Upload (Excel/CSV), Mapa de Calor/GeoJSON RAs, Dashboard com Recharts e Especificação do Swagger/OpenAPI, consolidando as áreas de Importação, Analytics e Contratos de API.

## Milestone
* Épico 03: Geolocalização e Módulo de Importação (EP03)
* Épico 04: Visualizações Analíticas e Mapeamento Criminal (EP04)
* Épico 05: Governança, Contratos e Qualidade (EP05)

## Itens planejados

**Planejamento proposto:** 43 issues (4 Features e seus PBIs/Tasks), com a distribuição das novas issues derivada da Sprint de suas Features originais. Esta documentação não altera o campo Sprint no GitHub Projects.

### EP03 — Geolocalização e Módulo de Importação

* **Feature [#10](https://github.com/CAMPUSCEUB/Sentinela/issues/10)** — Interface de Importação de Arquivos em Lote (`GH#10`), vinculada ao EP03.
  * **PBI [#60](https://github.com/CAMPUSCEUB/Sentinela/issues/60)** — Selecionar arquivos para importação (`EP03-PBI-03`).
    * **Task [#61](https://github.com/CAMPUSCEUB/Sentinela/issues/61)** — Implementar drag-and-drop de CSV/XLSX (`EP03-PBI-03-T1`).
    * **Task [#62](https://github.com/CAMPUSCEUB/Sentinela/issues/62)** — Validar extensão e limite inicial de 50 MB na interface (`EP03-PBI-03-T2`).
  * **PBI [#63](https://github.com/CAMPUSCEUB/Sentinela/issues/63)** — Mapear colunas da planilha (`EP03-PBI-04`).
    * **Task [#64](https://github.com/CAMPUSCEUB/Sentinela/issues/64)** — Ler cabeçalhos do arquivo selecionado (`EP03-PBI-04-T1`).
    * **Task [#65](https://github.com/CAMPUSCEUB/Sentinela/issues/65)** — Construir interface de mapeamento de colunas de/para (`EP03-PBI-04-T2`).
  * **PBI [#66](https://github.com/CAMPUSCEUB/Sentinela/issues/66)** — Pré-visualizar e validar dados antes da importação (`EP03-PBI-05`).
    * **Task [#67](https://github.com/CAMPUSCEUB/Sentinela/issues/67)** — Exibir tabela de pré-visualização (`EP03-PBI-05-T1`).
    * **Task [#68](https://github.com/CAMPUSCEUB/Sentinela/issues/68)** — Exibir resumo simulado de válidos, erros, pendências e duplicatas (`EP03-PBI-05-T2`).
  * **PBI [#69](https://github.com/CAMPUSCEUB/Sentinela/issues/69)** — Orientar o preenchimento do modelo de importação (`EP03-PBI-06`).
    * **Task [#70](https://github.com/CAMPUSCEUB/Sentinela/issues/70)** — Preparar arquivo-modelo CSV/XLSX conforme esquema homologado (`EP03-PBI-06-T1`).
    * **Task [#71](https://github.com/CAMPUSCEUB/Sentinela/issues/71)** — Disponibilizar download e instruções de preenchimento (`EP03-PBI-06-T2`).

### EP04 — Visualizações Analíticas e Mapeamento Criminal

* **Feature [#11](https://github.com/CAMPUSCEUB/Sentinela/issues/11)** — Mapa Criminal do DF — Camadas, Pontos e Calor (`GH#11`), vinculada ao EP04.
  * **PBI [#73](https://github.com/CAMPUSCEUB/Sentinela/issues/73)** — Visualizar as Regiões Administrativas no mapa (`EP04-PBI-01`).
    * **Task [#74](https://github.com/CAMPUSCEUB/Sentinela/issues/74)** — Implementar mapa do DF com Leaflet/OpenStreetMap (`EP04-PBI-01-T1`).
    * **Task [#75](https://github.com/CAMPUSCEUB/Sentinela/issues/75)** — Carregar GeoJSON das RAs e hover com nome/contagem (`EP04-PBI-01-T2`).
  * **PBI [#76](https://github.com/CAMPUSCEUB/Sentinela/issues/76)** — Visualizar pontos individuais de ocorrências (`EP04-PBI-02`).
    * **Task [#77](https://github.com/CAMPUSCEUB/Sentinela/issues/77)** — Exibir marcadores para coordenadas válidas (`EP04-PBI-02-T1`).
    * **Task [#78](https://github.com/CAMPUSCEUB/Sentinela/issues/78)** — Atualizar camada de pontos conforme filtros ativos (`EP04-PBI-02-T2`).
  * **PBI [#79](https://github.com/CAMPUSCEUB/Sentinela/issues/79)** — Visualizar a concentração criminal por mapa de calor (`EP04-PBI-03`).
    * **Task [#80](https://github.com/CAMPUSCEUB/Sentinela/issues/80)** — Implementar camada Leaflet.heat (`EP04-PBI-03-T1`).
    * **Task [#81](https://github.com/CAMPUSCEUB/Sentinela/issues/81)** — Permitir alternância entre pontos e mapa de calor (`EP04-PBI-03-T2`).
  * **PBI [#82](https://github.com/CAMPUSCEUB/Sentinela/issues/82)** — Filtrar ocorrências no Mapa Criminal (`EP04-PBI-04`).
    * **Task [#83](https://github.com/CAMPUSCEUB/Sentinela/issues/83)** — Criar controles de período, natureza e RA (`EP04-PBI-04-T1`).
    * **Task [#84](https://github.com/CAMPUSCEUB/Sentinela/issues/84)** — Aplicar filtros a pontos, calor e contagens das RAs com mocks (`EP04-PBI-04-T2`).

* **Feature [#12](https://github.com/CAMPUSCEUB/Sentinela/issues/12)** — Dashboard de Indicadores e Gráficos Analíticos (`GH#12`), vinculada ao EP04.
  * **PBI [#85](https://github.com/CAMPUSCEUB/Sentinela/issues/85)** — Consultar indicadores gerais de criminalidade (`EP04-PBI-05`).
    * **Task [#86](https://github.com/CAMPUSCEUB/Sentinela/issues/86)** — Criar cards de indicadores totais (`EP04-PBI-05-T1`).
    * **Task [#87](https://github.com/CAMPUSCEUB/Sentinela/issues/87)** — Implementar agregações simuladas para os cards (`EP04-PBI-05-T2`).
  * **PBI [#88](https://github.com/CAMPUSCEUB/Sentinela/issues/88)** — Analisar tendências temporais e distribuição territorial (`EP04-PBI-06`).
    * **Task [#89](https://github.com/CAMPUSCEUB/Sentinela/issues/89)** — Criar gráfico de evolução temporal com Recharts (`EP04-PBI-06-T1`).
    * **Task [#90](https://github.com/CAMPUSCEUB/Sentinela/issues/90)** — Criar gráficos de distribuição por RA e natureza (`EP04-PBI-06-T2`).
  * **PBI [#91](https://github.com/CAMPUSCEUB/Sentinela/issues/91)** — Filtrar os indicadores do Dashboard (`EP04-PBI-07`).
    * **Task [#92](https://github.com/CAMPUSCEUB/Sentinela/issues/92)** — Implementar filtro global de período (`EP04-PBI-07-T1`).
    * **Task [#93](https://github.com/CAMPUSCEUB/Sentinela/issues/93)** — Atualizar cards e gráficos com dados mockados filtrados (`EP04-PBI-07-T2`).

### EP05 — Governança, Contratos e Qualidade

* **Feature [#14](https://github.com/CAMPUSCEUB/Sentinela/issues/14)** — Especificação de Contratos e Swagger de API (`GH#14`), vinculada ao EP05.
  * **PBI [#107](https://github.com/CAMPUSCEUB/Sentinela/issues/107)** — Documentar os contratos de comunicação da API (`EP05-PBI-05`).
    * **Task [#108](https://github.com/CAMPUSCEUB/Sentinela/issues/108)** — Especificar endpoints, métodos, parâmetros e estruturas de entrada/saída (`EP05-PBI-05-T1`).
    * **Task [#109](https://github.com/CAMPUSCEUB/Sentinela/issues/109)** — Documentar payloads JSON, tipos e códigos HTTP (`EP05-PBI-05-T2`).
  * **PBI [#110](https://github.com/CAMPUSCEUB/Sentinela/issues/110)** — Padronizar erros e publicar a documentação Swagger (`EP05-PBI-06`).
    * **Task [#111](https://github.com/CAMPUSCEUB/Sentinela/issues/111)** — Definir respostas padronizadas de erro/validação (`EP05-PBI-06-T1`).
    * **Task [#112](https://github.com/CAMPUSCEUB/Sentinela/issues/112)** — Estruturar e disponibilizar OpenAPI 3.0/Swagger (`EP05-PBI-06-T2`).

## Responsáveis

* **Pedro Augusto**:
  * **Feature [#10](https://github.com/CAMPUSCEUB/Sentinela/issues/10)** — Interface de Importação de Arquivos em Lote (issue original do Artefato 2).
  * **Feature [#11](https://github.com/CAMPUSCEUB/Sentinela/issues/11)** — Mapa Criminal do DF — Camadas, Pontos e Calor (issue original do Artefato 2).
  * **Feature [#12](https://github.com/CAMPUSCEUB/Sentinela/issues/12)** — Dashboard de Indicadores e Gráficos Analíticos (issue original do Artefato 2).
  * **Feature [#14](https://github.com/CAMPUSCEUB/Sentinela/issues/14)** — Especificação de Contratos e Swagger de API (issue original do Artefato 2).

Os responsáveis pelas novas PBIs e Tasks não foram definidos nos arquivos originais da sprint.

## Entregas
* Interface Drag-and-Drop para carregamento de folhas de cálculo (.csv e .xlsx até 50MB) com ecrã de de/para para mapeamento de colunas e tabela de pré-visualização (linhas válidas, erros e duplicidades).
* Mapa Criminal interativo do DF com renderização dos polígonos GeoJSON das RAs, marcadores de ocorrências e camada alternável de Mapa de Calor (heatmap).
* Dashboard analítico composto por cartões de KPI, gráficos de evolução temporal (linhas) e distribuição por categoria/RA (barras) integrados ao filtro de período.
* Documentação OpenAPI 3.0 (Swagger) publicada, detalhando endpoints RESTful, payloads de requisição/resposta, validações e estruturas de erros para a API backend.
* Arquivo-modelo CSV/XLSX e orientações de preenchimento conforme o esquema de importação homologado.

## Issues concluídas

## Pull requests aceitos

## Evidências

### Fluxo de importação demonstrativa — 28/10/2026

Leitura real de CSV/XLSX, seleção de planilha, cabeçalhos, mapeamento automático/manual, validação por linha/coluna, múltiplas naturezas, prévia paginada e confirmação em memória implementadas para a Feature #10 (PBIs #60/#63/#66/#69). A seleção inicial abaixo foi reaproveitada; o novo fluxo substitui os exemplos fixos na rota ativa. Modelos CSV/XLSX demonstrativos disponíveis, sem declaração de homologação institucional.

Detalhes, regras e limites: [relatório da importação](../docs/importacao-demonstrativa.md). Decisão: [ADR do processamento local](../docs/decisoes/adr-importacao-demonstrativa-local.md). Não representa encerramento remoto de issues, aceite acadêmico ou conclusão integral da Sprint 3.

Validação final: instalação congelada com pnpm 10.34.3, TypeScript, ESLint, 46 testes Node, contratos, rotas e build aprovados. Chrome verificou o fluxo completo nos dois temas e larguras de 1366, 768, 390 e 320 px, incluindo prévia, correção de mapeamento, confirmação, troca de planilha, paginação, drag-and-drop e foco visível. [Resultados e capturas preservados](../docs/evidencias/importacao/README.md). Sem persistência, commit, push ou publicação.

### Seleção inicial de arquivos — 28/10/2026

Implementada validação compartilhada para seleção pelo botão e drag-and-drop na tela de importação (PBIs #60, tasks #61/#62): um arquivo CSV/XLSX, extensão sem distinção de caixa, não vazio e até 50 MB (52.428.800 bytes). Seleções inválidas limpam o nome anterior e apresentam mensagem acessível; cancelar restaura o estado vazio. A seleção do mesmo arquivo pode ser repetida.

TypeScript e lint aprovados. Suíte Node com 30 testes aprovada, incluindo dois testes novos de seleção e limites. O comando padrão de testes encontrou `spawn EPERM` no sandbox; a execução direta do mesmo runner fora do sandbox passou. O pnpm disponível era 12.9.1, divergente do 10.34.3 declarado, e tentou verificar dependências sem acesso ao lock do store; nenhuma dependência foi adicionada nesta entrega.

Build Next.js aprovado fora do sandbox após a tentativa restrita compilar e falhar com `spawn EPERM` na etapa seguinte.

Esta etapa valida somente metadados: não lê CSV/XLSX, não comprova o formato interno e não envia ou grava dados. Prévia, mapeamento e histórico continuam fictícios. Leitura de cabeçalhos, mapeamento real, processamento e modelos permanecem pendentes. Não houve homologação visual desta alteração, fechamento de issues, commit ou publicação.

### Correção final da contagem CSV — 28/10/2026

Corrigida a falha identificada na auditoria: linhas vazias antes do cabeçalho não consomem mais o limite de 10.000 registros, mantendo os contadores de células/texto e as posições originais. Linhas vazias após o cabeçalho continuam contando e sendo inválidas. Aceitação de 10.000 e rejeição de 10.001 registros verificadas; comportamento XLSX preservado e testado na mesma fronteira.

TypeScript, ESLint, suíte completa com **51 testes Node** (cinco regressões novas) e build de produção aprovados com pnpm 10.34.3. As evidências visuais anteriores permanecem históricas; não houve nova rodada no navegador. Escopo restrito ao parser CSV, testes e documentação da importação. Sem commit, push, alteração de autoria ou aceite acadêmico. Detalhes: [relatório da importação](../docs/importacao-demonstrativa.md).

### Etapa 2 — Mapas e Analytics — 28/10/2026

Implementado intervalo personalizado inclusivo no Dashboard e no Mapa Criminal, com datas civis independentes do fuso, validação acessível, preservação dos atalhos existentes e limpeza para restaurar a base fictícia. Período, RA, natureza e horário compartilham controles e consulta analítica. Cards, ranking, distribuições e série mensal respondem ao mesmo recorte; a navegação Dashboard → Mapa transporta os filtros aplicados.

As variações fixas foram substituídas por indicadores calculados e série mensal real dos mocks. Uma ocorrência com múltiplas naturezas continua única no total; vínculos são contabilizados na distribuição. A intensidade de calor mantém a referência integral. Geometria, dados, marcadores, clusters e implementação do Satélite preservados; nenhuma alteração na importação da Etapa 1.

Critérios locais atendidos: intervalo válido/invertido/incompleto, primeiro e último dia incluídos, período vazio, limpeza/restauração, combinação dos filtros, coerência dos totais, datas bissextas/inválidas, quatro fusos e regressões cartográficas. TypeScript, ESLint, **62 testes Node** (11 novos), build e roteiros de Chrome aprovados. Temas claro/escuro, desktop/tablet/celular e teclado verificados. Detalhamento: [filtros e analytics](../docs/filtros-analytics.md), [ADR](../docs/decisoes/adr-periodo-civil-analytics.md) e [evidências](../docs/evidencias/analytics/README.md).

Relaciona-se aos PBIs #82/#85/#88/#91 e respectivas tasks de filtros/agregações/gráficos. Sem fechamento remoto de issues, atribuição individual de autoria, commit, push ou aceite acadêmico. A integração persistida dos dados e os contratos de timestamp do futuro backend permanecem para outras etapas; a Sprint 3 não está integralmente concluída.

### Etapa 3 — Contratos de API — 28/10/2026

Contratos TypeScript/Zod implementados para ocorrências (cadastro, PATCH, detalhes, inativação, consulta/paginação/ordenação), importação (arquivo, lote, mapeamento, prévia, erros, pendências, possíveis duplicatas, estados e resultado simulado) e analytics/mapas (filtros combinados, indicadores, séries, distribuições, pontos e referência integral de calor). Tipos inferidos, múltiplas naturezas e adaptadores explícitos preservam a compatibilidade com as Etapas 1 e 2, sem modificar suas telas ou parsers.

OpenAPI 3.1.1 gerado dos schemas e exemplos: 11 caminhos, 13 operações planejadas e 23 modelos. Todas as rotas versionadas estão marcadas como propostas, sem implementação/persistência. O proxy existente de geocodificação mantém seu formato anterior. Validação automatizada de sincronização, Swagger Parser, AJV e Zod integrada a `pnpm validate:contracts` e à suíte de testes. Detalhes: [documentação técnica](../docs/contratos/api-v0.1.0.md), [OpenAPI](../docs/contratos/openapi-v0.1.0.json), [ADR](../docs/decisoes/adr-contratos-executaveis-api.md) e [evidências](../docs/evidencias/contratos-api/README.md).

Validação local: TypeScript, ESLint, **83 testes Node** (21 novos), build de produção, instalação congelada, sincronização OpenAPI, Swagger Parser, AJV/Zod e `git diff --check` aprovados. Sem nova homologação visual, pois nenhuma interface foi alterada.

Branch exclusiva `feat/sprint3-contratos-api`, criada a partir de `integracao-pedro`/`626ab00` enquanto o PR #219 estava aberto. Posteriormente, o usuário integrou #219: fetch confirmou `ceub/main` em `2739dbb`, contendo a Etapa 2. O futuro PR da Etapa 3 passa a ter **main institucional** como destino, sem merge/rebase local. Responsável **planejado**: Pedro Felizardo Barbosa, conforme solicitação; este planejamento não atribui autoria de commits ou comprova participação individual.

Rastreabilidade local: Feature #14, PBIs #107/#110, tasks #108/#109/#111/#112. Critérios remotos não foram confirmados; não há fechamento de issues ou aceite acadêmico. Homologação dos catálogos, regras históricas, autorização, deduplicação, upload, políticas de consolidação e integração Supabase/PostgreSQL/PostGIS permanecem pendentes. Sem commit, tag, merge, rebase, push ou alteração de autoria Git.

### Etapa 4 — Testes e homologação integrada — 28/10/2026

Criada `test/sprint3-homologacao` a partir de `feat/sprint3-contratos-api`/`33f6bf5`: o fetch inicial confirmou que `ceub/main` (`2739dbb`) ainda não contém a Etapa 3. PR temporariamente direcionado à branch da Etapa 3, evitando reapresentar commits anteriores. Responsável **planejado**: João Pedro Roriz Costa, sem atribuição automática de autoria.

Implementada robustez do Worker: correlação por operação, bloqueio de sobreposição, proteção contra respostas/timers obsoletos, falhas de envio/desserialização/execução, cleanup e recuperação. Extraídos controlador e processador testáveis, mantendo o prazo existente de 60 segundos por operação, o parser e os limites de segurança. Acrescentados 13 testes Node e roteiro Chrome com Worker nativo e falhas controladas; automação registra cada rodada em pasta única, inclusive reprovações e repetições.

Validação atual: instalação congelada, TypeScript, ESLint, **96 testes Node**, build, contratos/OpenAPI e `git diff --check` aprovados. Nove grupos finais de navegador aprovados: Worker, importação, analytics, ocorrências, Sprint 2/perfis, Satélite com 54 tiles reais, localização com serviços reais, localização com fixtures identificadas e navegação. Temas claro/escuro, desktop/tablet/celular e teclado verificados. Falhas iniciais de seletores/rede/fontes foram registradas e repetidas; não foram contadas como aprovação.

Relatório, critérios, problemas, limites e evidências: [homologação da Sprint 3](../docs/homologacao-sprint-03.md) e [evidências desta rodada](../docs/evidencias/sprint-03/README.md). Parecer técnico local: apto para revisão e commit da Etapa 4. **Não declara encerramento formal da sprint**, homologação institucional, persistência, autenticação, transações ou deduplicação definitiva. Sem commit, tag, merge, rebase, push ou alteração de identidade Git pelo agente.

## Impedimentos

## Retrospectiva

## Próximas ações
Preparação para a execução da Sprint 4 (Semanas 5 e 6), focada em QA Front-end, Persistência e Serviços Core Backend (EP05, EP06 e EP07):
* **Feature [#15](https://github.com/CAMPUSCEUB/Sentinela/issues/15)** — Validação de Mocks e QA de Interface; PBIs: [#113](https://github.com/CAMPUSCEUB/Sentinela/issues/113) (`EP05-PBI-07`), [#116](https://github.com/CAMPUSCEUB/Sentinela/issues/116) (`EP05-PBI-08`).
* **Feature [#16](https://github.com/CAMPUSCEUB/Sentinela/issues/16)** — Modelagem Física e Scripts DDL do Banco de Dados; PBIs: [#120](https://github.com/CAMPUSCEUB/Sentinela/issues/120) (`EP06-PBI-01`), [#123](https://github.com/CAMPUSCEUB/Sentinela/issues/123) (`EP06-PBI-02`), [#126](https://github.com/CAMPUSCEUB/Sentinela/issues/126) (`EP06-PBI-03`).
* **Feature [#17](https://github.com/CAMPUSCEUB/Sentinela/issues/17)** — Autenticação, Usuários e RBAC; PBIs: [#142](https://github.com/CAMPUSCEUB/Sentinela/issues/142) (`EP07-PBI-01`), [#145](https://github.com/CAMPUSCEUB/Sentinela/issues/145) (`EP07-PBI-02`), [#148](https://github.com/CAMPUSCEUB/Sentinela/issues/148) (`EP07-PBI-03`).
* **Feature [#18](https://github.com/CAMPUSCEUB/Sentinela/issues/18)** — CRUD Transacional de Ocorrências; PBIs: [#151](https://github.com/CAMPUSCEUB/Sentinela/issues/151) (`EP07-PBI-04`), [#154](https://github.com/CAMPUSCEUB/Sentinela/issues/154) (`EP07-PBI-05`), [#157](https://github.com/CAMPUSCEUB/Sentinela/issues/157) (`EP07-PBI-06`).
