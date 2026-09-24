## Período
* Data Início:28/09/2026
* Data Fim: 09/10/2026

## Objetivo
O foco e objetivo principal da sprint é a construção da Interface Operacional de Ocorrências, Leaflet UI (Pino/Mapa) e Guards de Perfil, estabelecendo os Fluxos Operacionais e a Geocodificação na UI.

## Milestone
* Épico 02: Gestão Operacional de Ocorrências e Acessos (EP02)
* Épico 03: Geolocalização e Módulo de Importação (EP03)

## Itens planejados
* **ISSUE-04**: Consulta, Pesquisa e Filtros de Ocorrências.
* **ISSUE-05**: Formulários de Cadastro, Edição e Inativação Manual.
* **ISSUE-10**: Controle de Permissões e Perfis na Interface.
* **ISSUE-06**: Interface de Geocodificação e Ajuste no Mapa.

## Responsáveis
* **Pedro Augusto**:
  * **ISSUE-04**: Consulta, Pesquisa e Filtros de Ocorrências
  * **ISSUE-05**: Formulários de Cadastro, Edição e Inativação Manual
  * **ISSUE-10**: Controle de Permissões e Perfis na Interface
  * **ISSUE-06**: Interface de Geocodificação e Ajuste no Mapa

## Entregas
* Tabela paginada para listagem de ocorrências mockadas com ordenação, busca global (por número, RA, natureza e endereço) e modal de detalhamento completo ao clicar no registro.
* Formulários de cadastro e edição de ocorrências com validação de campos obrigatórios (natureza, data, hora, RA, endereço) e diálogo de confirmação para ações de exclusão/inativação.
* Restrições de exibição e controle de navegação aplicados na interface por perfil (Analista sem ações de edição/criação, Operador sem acesso à gestão de usuários e Administrador com acesso total).
* Componente de mapa interativo com Leaflet na tela de cadastro para simular geocodificação via endereço, permitir ajuste manual do marcador (latitude/longitude) e emitir alertas para endereços inválidos.

## Issues concluídas

## Pull requests aceitos

## Evidências

## Impedimentos

## Retrospectiva

## Próximas ações
Preparação para a execução da Sprint 3 (Semanas 3 e 4), focada em Importação, Analytics e Contratos API (EP03, EP04 e EP05):
* **ISSUE-07**: Interface de Importação de Arquivos em Lote (área drag-and-drop para CSV/XLSX com de/para de colunas).
* **ISSUE-08**: Mapa Criminal do DF interativo com polígonos GeoJSON das RAs, marcadores e camada de Mapa de Calor (heatmap).
* **ISSUE-09**: Dashboard de Indicadores e Gráficos Analíticos (cards de KPI e gráficos temporais/territoriais com Recharts).
* **ISSUE-12**: Especificação formal de Contratos e Swagger da API RESTful (OpenAPI 3.0).
