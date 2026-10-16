## Período

* Data Início: 19/10/2026
* Data Fim: 01/11/2026

## Objetivo

O foco e objetivo principal da sprint é executar o QA do front-end, implementar a modelagem física do PostgreSQL/PostGIS e iniciar os serviços essenciais de backend, incluindo autenticação, autorização e CRUD transacional de ocorrências. A sprint consolida a persistência e a integração dos serviços centrais do SENTINELA.

## Milestone

* Épico 05: Governança, Contratos e Qualidade (EP05)
* Épico 06: Infraestrutura, Segurança e Banco de Dados (EP06)
* Épico 07: Serviços e Motores Backend (EP07)

## Itens planejados

**Planejamento proposto:** 37 issues (4 Features, 11 PBIs e 22 Tasks). A distribuição das novas issues é derivada da Sprint das Features originais do Artefato 2; a Feature de integração e homologação final foi proposta para a Sprint 6. Este documento não altera os campos de Sprint ou de responsável no GitHub Projects.

### EP05 — Governança, Contratos e Qualidade

* **Feature [#15](https://github.com/CAMPUSCEUB/Sentinela/issues/15)** — Validação de Mocks e QA de Interface (`GH#15`), vinculada ao EP05.
  * **PBI [#113](https://github.com/CAMPUSCEUB/Sentinela/issues/113)** — Validar interfaces conforme os protótipos (`EP05-PBI-07`).
    * **Task [#114](https://github.com/CAMPUSCEUB/Sentinela/issues/114)** — Comparar telas com protótipos e registrar divergências (`EP05-PBI-07-T1`).
    * **Task [#115](https://github.com/CAMPUSCEUB/Sentinela/issues/115)** — Corrigir ou registrar problemas visuais/de usabilidade (`EP05-PBI-07-T2`).
  * **PBI [#116](https://github.com/CAMPUSCEUB/Sentinela/issues/116)** — Garantir consistência dos dados mockados (`EP05-PBI-08`).
    * **Task [#117](https://github.com/CAMPUSCEUB/Sentinela/issues/117)** — Criar testes de consistência entre mocks das visualizações (`EP05-PBI-08-T1`).
    * **Task [#118](https://github.com/CAMPUSCEUB/Sentinela/issues/118)** — Comparar quantitativos de Dashboard, Mapa e tabelas (`EP05-PBI-08-T2`).


### EP06 — Infraestrutura, Segurança e Banco de Dados

* **Feature [#16](https://github.com/CAMPUSCEUB/Sentinela/issues/16)** — Modelagem Física e Scripts DDL do Banco de Dados (`GH#16`), vinculada ao EP06.
  * **PBI [#120](https://github.com/CAMPUSCEUB/Sentinela/issues/120)** — Estruturar o banco de dados relacional (`EP06-PBI-01`).
    * **Task [#121](https://github.com/CAMPUSCEUB/Sentinela/issues/121)** — Criar migrações das oito tabelas-base (`EP06-PBI-01-T1`).
    * **Task [#122](https://github.com/CAMPUSCEUB/Sentinela/issues/122)** — Implementar PKs, FKs, restrições e índices relacionais (`EP06-PBI-01-T2`).
  * **PBI [#123](https://github.com/CAMPUSCEUB/Sentinela/issues/123)** — Habilitar a persistência e as consultas geoespaciais (`EP06-PBI-02`).
    * **Task [#124](https://github.com/CAMPUSCEUB/Sentinela/issues/124)** — Habilitar PostGIS e campos espaciais (`EP06-PBI-02-T1`).
    * **Task [#125](https://github.com/CAMPUSCEUB/Sentinela/issues/125)** — Criar índices espaciais e testar consultas geográficas (`EP06-PBI-02-T2`).
  * **PBI [#126](https://github.com/CAMPUSCEUB/Sentinela/issues/126)** — Garantir a reprodutibilidade das migrações (`EP06-PBI-03`).
    * **Task [#127](https://github.com/CAMPUSCEUB/Sentinela/issues/127)** — Organizar scripts versionados e ordem de execução (`EP06-PBI-03-T1`).
    * **Task [#128](https://github.com/CAMPUSCEUB/Sentinela/issues/128)** — Testar aplicação de migrações em ambiente de desenvolvimento (`EP06-PBI-03-T2`).


### EP07 — Serviços e Motores Backend

* **Feature [#17](https://github.com/CAMPUSCEUB/Sentinela/issues/17)** — Autenticação, Usuários e RBAC (`GH#17`), vinculada ao EP07.
  * **PBI [#142](https://github.com/CAMPUSCEUB/Sentinela/issues/142)** — Autenticar usuários com segurança (`EP07-PBI-01`).
    * **Task [#143](https://github.com/CAMPUSCEUB/Sentinela/issues/143)** — Implementar login e-mail/senha Supabase Auth (`EP07-PBI-01-T1`).
    * **Task [#144](https://github.com/CAMPUSCEUB/Sentinela/issues/144)** — Validar JWT e tratar sessões inválidas (`EP07-PBI-01-T2`).
  * **PBI [#145](https://github.com/CAMPUSCEUB/Sentinela/issues/145)** — Aplicar permissões no backend (`EP07-PBI-02`).
    * **Task [#146](https://github.com/CAMPUSCEUB/Sentinela/issues/146)** — Implementar RLS conforme matriz aprovada (`EP07-PBI-02-T1`).
    * **Task [#147](https://github.com/CAMPUSCEUB/Sentinela/issues/147)** — Implementar autorização e testes por perfil (`EP07-PBI-02-T2`).
  * **PBI [#148](https://github.com/CAMPUSCEUB/Sentinela/issues/148)** — Gerenciar contas de usuários (`EP07-PBI-03`).
    * **Task [#149](https://github.com/CAMPUSCEUB/Sentinela/issues/149)** — Implementar criação/listagem/edição administrativa (`EP07-PBI-03-T1`).
    * **Task [#150](https://github.com/CAMPUSCEUB/Sentinela/issues/150)** — Implementar perfis e ativação/desativação com testes (`EP07-PBI-03-T2`).

* **Feature [#18](https://github.com/CAMPUSCEUB/Sentinela/issues/18)** — CRUD Transacional de Ocorrências (`GH#18`), vinculada ao EP07.
  * **PBI [#151](https://github.com/CAMPUSCEUB/Sentinela/issues/151)** — Consultar ocorrências pela API (`EP07-PBI-04`).
    * **Task [#152](https://github.com/CAMPUSCEUB/Sentinela/issues/152)** — Implementar listagem paginada, busca e filtros (`EP07-PBI-04-T1`).
    * **Task [#153](https://github.com/CAMPUSCEUB/Sentinela/issues/153)** — Implementar detalhe por ID e testes de resposta (`EP07-PBI-04-T2`).
  * **PBI [#154](https://github.com/CAMPUSCEUB/Sentinela/issues/154)** — Cadastrar ocorrências no banco de dados (`EP07-PBI-05`).
    * **Task [#155](https://github.com/CAMPUSCEUB/Sentinela/issues/155)** — Implementar endpoint de criação PostgreSQL (`EP07-PBI-05-T1`).
    * **Task [#156](https://github.com/CAMPUSCEUB/Sentinela/issues/156)** — Validar campos, formatos e catálogos no servidor (`EP07-PBI-05-T2`).
  * **PBI [#157](https://github.com/CAMPUSCEUB/Sentinela/issues/157)** — Editar e inativar ocorrências com rastreabilidade (`EP07-PBI-06`).
    * **Task [#158](https://github.com/CAMPUSCEUB/Sentinela/issues/158)** — Implementar endpoint de atualização com autorização (`EP07-PBI-06-T1`).
    * **Task [#159](https://github.com/CAMPUSCEUB/Sentinela/issues/159)** — Implementar inativação controlada e evento de auditoria (`EP07-PBI-06-T2`).

## Responsáveis

## Entregas

* Interfaces e mocks validados contra os protótipos, com verificações de usabilidade, testes de consistência entre Dashboard, Mapa e tabelas, e registro de ajustes necessários.
* Scripts versionados de migração/DDL para as oito tabelas-base do PostgreSQL, incluindo chaves, relacionamentos, restrições, índices e suporte geoespacial com PostGIS.
* Autenticação via Supabase Auth, controle de sessão com JWT, políticas RLS conforme a matriz aprovada e gerenciamento administrativo de usuários.
* APIs de consulta, cadastro, atualização e inativação de ocorrências com validação no servidor, filtros, paginação e eventos de auditoria para ações críticas.

## Issues concluídas

## Pull requests aceitos

## Evidências

## Impedimentos

## Retrospectiva

## Próximas ações

Preparação para a execução da Sprint 5 (Semana 7), focada em Processamento em Lote, Geocodificação Real e Analytics (EP07):
* **Feature [#19](https://github.com/CAMPUSCEUB/Sentinela/issues/19)** — Motor Transacional de Importação e Deduplicação; PBIs: [#160](https://github.com/CAMPUSCEUB/Sentinela/issues/160) (`EP07-PBI-07`), [#163](https://github.com/CAMPUSCEUB/Sentinela/issues/163) (`EP07-PBI-08`), [#166](https://github.com/CAMPUSCEUB/Sentinela/issues/166) (`EP07-PBI-09`), [#169](https://github.com/CAMPUSCEUB/Sentinela/issues/169) (`EP07-PBI-10`).
* **Feature [#20](https://github.com/CAMPUSCEUB/Sentinela/issues/20)** — Serviço Real de Geocodificação Integrado; PBIs: [#172](https://github.com/CAMPUSCEUB/Sentinela/issues/172) (`EP07-PBI-11`), [#175](https://github.com/CAMPUSCEUB/Sentinela/issues/175) (`EP07-PBI-12`).
* **Feature [#21](https://github.com/CAMPUSCEUB/Sentinela/issues/21)** — Analytics e Dados Espaciais; PBIs: [#178](https://github.com/CAMPUSCEUB/Sentinela/issues/178) (`EP07-PBI-13`), [#181](https://github.com/CAMPUSCEUB/Sentinela/issues/181) (`EP07-PBI-14`), [#184](https://github.com/CAMPUSCEUB/Sentinela/issues/184) (`EP07-PBI-15`).
