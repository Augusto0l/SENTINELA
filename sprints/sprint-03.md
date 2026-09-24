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
* **ISSUE-07**: Interface de Importação de Ficheiros em Lote.
* **ISSUE-08**: Mapa Criminal do DF (Camadas, Pontos e Calor).
* **ISSUE-09**: Dashboard de Indicadores e Gráficos Analíticos.
* **ISSUE-12**: Especificação de Contratos e Swagger de API.

## Responsáveis
* **Pedro Augusto**:
  * **ISSUE-07**: Interface de Importação de Ficheiros em Lote
  * **ISSUE-08**: Mapa Criminal do DF (Camadas, Pontos e Calor)
  * **ISSUE-09**: Dashboard de Indicadores e Gráficos Analíticos
  * **ISSUE-12**: Especificação de Contratos e Swagger de API

## Entregas
* Interface Drag-and-Drop para carregamento de folhas de cálculo (.csv e .xlsx até 50MB) com ecrã de de/para para mapeamento de colunas e tabela de pré-visualização (linhas válidas, erros e duplicidades).
* Mapa Criminal interativo do DF com renderização dos polígonos GeoJSON das RAs, marcadores de ocorrências e camada alternável de Mapa de Calor (heatmap).
* Dashboard analítico composto por cartões de KPI, gráficos de evolução temporal (linhas) e distribuição por categoria/RA (barras) integrados ao filtro de período.
* Documentação OpenAPI 3.0 (Swagger) publicada, detalhando endpoints RESTful, payloads de requisição/resposta, validações e estruturas de erros para a API backend.

## Issues concluídas

## Pull requests aceitos

## Evidências

## Impedimentos

## Retrospectiva

## Próximas ações
Preparação para a execução da Sprint 4 (Semanas 5 e 6), focada em QA Front-end, Persistência e Serviços Core Backend (EP05, EP06 e EP07):
* **ISSUE-13**: Testes de usabilidade e integração no front-end para validação de coerência de dados e paridade com protótipos aprovados.
* **ISSUE-14**: Desenvolvimento e aplicação dos scripts DDL para criação da base de dados relacional geoespacial (8 tabelas base e suporte a PostGIS).
* **ISSUE-15**: Implementação da API Backend de autenticação, gestão de sessão JWT e políticas de segurança RLS no Supabase Auth.
* **ISSUE-16**: Construção da API RESTful transacional para o CRUD de ocorrências e gravação automática na tabela de auditoria.
