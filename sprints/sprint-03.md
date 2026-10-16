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

## Impedimentos

## Retrospectiva

## Próximas ações
Preparação para a execução da Sprint 4 (Semanas 5 e 6), focada em QA Front-end, Persistência e Serviços Core Backend (EP05, EP06 e EP07):
* **Feature [#15](https://github.com/CAMPUSCEUB/Sentinela/issues/15)** — Validação de Mocks e QA de Interface; PBIs: [#113](https://github.com/CAMPUSCEUB/Sentinela/issues/113) (`EP05-PBI-07`), [#116](https://github.com/CAMPUSCEUB/Sentinela/issues/116) (`EP05-PBI-08`).
* **Feature [#16](https://github.com/CAMPUSCEUB/Sentinela/issues/16)** — Modelagem Física e Scripts DDL do Banco de Dados; PBIs: [#120](https://github.com/CAMPUSCEUB/Sentinela/issues/120) (`EP06-PBI-01`), [#123](https://github.com/CAMPUSCEUB/Sentinela/issues/123) (`EP06-PBI-02`), [#126](https://github.com/CAMPUSCEUB/Sentinela/issues/126) (`EP06-PBI-03`).
* **Feature [#17](https://github.com/CAMPUSCEUB/Sentinela/issues/17)** — Autenticação, Usuários e RBAC; PBIs: [#142](https://github.com/CAMPUSCEUB/Sentinela/issues/142) (`EP07-PBI-01`), [#145](https://github.com/CAMPUSCEUB/Sentinela/issues/145) (`EP07-PBI-02`), [#148](https://github.com/CAMPUSCEUB/Sentinela/issues/148) (`EP07-PBI-03`).
* **Feature [#18](https://github.com/CAMPUSCEUB/Sentinela/issues/18)** — CRUD Transacional de Ocorrências; PBIs: [#151](https://github.com/CAMPUSCEUB/Sentinela/issues/151) (`EP07-PBI-04`), [#154](https://github.com/CAMPUSCEUB/Sentinela/issues/154) (`EP07-PBI-05`), [#157](https://github.com/CAMPUSCEUB/Sentinela/issues/157) (`EP07-PBI-06`).
