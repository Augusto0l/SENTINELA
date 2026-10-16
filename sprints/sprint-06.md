## Período

* Data Início: 09/11/2026
* Data Fim: 15/11/2026

## Objetivo

O foco e objetivo principal da sprint é concluir a infraestrutura de produção, os serviços de auditoria e exportação, o pipeline ETL da base histórica PCDF/SSP-DF e a integração e homologação do MVP. A sprint consolida segurança, publicação e evidências de aceitação da solução.

## Milestone

* Épico 06: Infraestrutura, Segurança e Banco de Dados (EP06)
* Épico 07: Serviços e Motores Backend (EP07)
* Épico 08: ETL, Integração e Homologação Final (EP08)

## Itens planejados

**Planejamento proposto:** 43 issues (4 Features, 13 PBIs e 26 Tasks). A distribuição das novas issues é derivada da Sprint das Features originais do Artefato 2; a Feature de integração e homologação final foi proposta para a Sprint 6. Este documento não altera os campos de Sprint ou de responsável no GitHub Projects.

### EP06 — Infraestrutura, Segurança e Banco de Dados

* **Feature [#24](https://github.com/CAMPUSCEUB/Sentinela/issues/24)** — Hospedagem Vercel, HTTPS e Deploy Produtivo (`GH#24`), vinculada ao EP06.
  * **PBI [#129](https://github.com/CAMPUSCEUB/Sentinela/issues/129)** — Publicar o SENTINELA em ambiente produtivo seguro (`EP06-PBI-04`).
    * **Task [#130](https://github.com/CAMPUSCEUB/Sentinela/issues/130)** — Configurar Vercel e variáveis de ambiente (`EP06-PBI-04-T1`).
    * **Task [#131](https://github.com/CAMPUSCEUB/Sentinela/issues/131)** — Validar HTTPS/TLS e ausência de exposição de segredos (`EP06-PBI-04-T2`).
  * **PBI [#132](https://github.com/CAMPUSCEUB/Sentinela/issues/132)** — Automatizar o processo de build e deploy (`EP06-PBI-05`).
    * **Task [#133](https://github.com/CAMPUSCEUB/Sentinela/issues/133)** — Configurar CI/CD GitHub Actions e Vercel (`EP06-PBI-05-T1`).
    * **Task [#134](https://github.com/CAMPUSCEUB/Sentinela/issues/134)** — Implementar verificações de build e validar publicação (`EP06-PBI-05-T2`).
  * **PBI [#135](https://github.com/CAMPUSCEUB/Sentinela/issues/135)** — Garantir backup e recuperação do banco de dados (`EP06-PBI-06`).
    * **Task [#136](https://github.com/CAMPUSCEUB/Sentinela/issues/136)** — Configurar/documentar backup diário Supabase (`EP06-PBI-06-T1`).
    * **Task [#137](https://github.com/CAMPUSCEUB/Sentinela/issues/137)** — Executar restore de teste e medir RPO/RTO (`EP06-PBI-06-T2`).
  * **PBI [#138](https://github.com/CAMPUSCEUB/Sentinela/issues/138)** — Centralizar logs de infraestrutura (`EP06-PBI-07`).
    * **Task [#139](https://github.com/CAMPUSCEUB/Sentinela/issues/139)** — Configurar coleta e consulta de logs operacionais (`EP06-PBI-07-T1`).
    * **Task [#140](https://github.com/CAMPUSCEUB/Sentinela/issues/140)** — Testar registros de falhas e documentar diagnóstico (`EP06-PBI-07-T2`).


### EP07 — Serviços e Motores Backend

* **Feature [#22](https://github.com/CAMPUSCEUB/Sentinela/issues/22)** — Auditoria, Logs e Exportação (`GH#22`), vinculada ao EP07.
  * **PBI [#187](https://github.com/CAMPUSCEUB/Sentinela/issues/187)** — Registrar eventos técnicos e ações críticas (`EP07-PBI-16`).
    * **Task [#188](https://github.com/CAMPUSCEUB/Sentinela/issues/188)** — Registrar autenticação, alterações e importações com metadados (`EP07-PBI-16-T1`).
    * **Task [#189](https://github.com/CAMPUSCEUB/Sentinela/issues/189)** — Proteger logs contra segredos e restringir acesso (`EP07-PBI-16-T2`).
  * **PBI [#190](https://github.com/CAMPUSCEUB/Sentinela/issues/190)** — Exportar dados de consultas e relatórios (`EP07-PBI-17`).
    * **Task [#191](https://github.com/CAMPUSCEUB/Sentinela/issues/191)** — Implementar exportação CSV/XLSX respeitando filtros (`EP07-PBI-17-T1`).
    * **Task [#192](https://github.com/CAMPUSCEUB/Sentinela/issues/192)** — Validar permissões e integridade dos arquivos (`EP07-PBI-17-T2`).


### EP08 — ETL, Integração e Homologação Final

* **Feature [#23](https://github.com/CAMPUSCEUB/Sentinela/issues/23)** — ETL e Carga Histórica (`GH#23`), vinculada ao EP08.
  * **PBI [#194](https://github.com/CAMPUSCEUB/Sentinela/issues/194)** — Preparar os dados históricos oficiais (`EP08-PBI-01`).
    * **Task [#195](https://github.com/CAMPUSCEUB/Sentinela/issues/195)** — Identificar/organizar fontes PCDF/SSP-DF (~5 anos) (`EP08-PBI-01-T1`).
    * **Task [#196](https://github.com/CAMPUSCEUB/Sentinela/issues/196)** — Ler e transformar arquivos para formato de processamento (`EP08-PBI-01-T2`).
  * **PBI [#197](https://github.com/CAMPUSCEUB/Sentinela/issues/197)** — Normalizar e validar os dados históricos (`EP08-PBI-02`).
    * **Task [#198](https://github.com/CAMPUSCEUB/Sentinela/issues/198)** — Normalizar datas, horários, RAs, naturezas e coordenadas (`EP08-PBI-02-T1`).
    * **Task [#199](https://github.com/CAMPUSCEUB/Sentinela/issues/199)** — Validar registros e gerar relatório de inconsistências (`EP08-PBI-02-T2`).
  * **PBI [#200](https://github.com/CAMPUSCEUB/Sentinela/issues/200)** — Executar a carga histórica no banco de dados (`EP08-PBI-03`).
    * **Task [#201](https://github.com/CAMPUSCEUB/Sentinela/issues/201)** — Implementar script de carga no PostgreSQL (`EP08-PBI-03-T1`).
    * **Task [#202](https://github.com/CAMPUSCEUB/Sentinela/issues/202)** — Executar carga e reconciliar entrada/inserções/rejeições (`EP08-PBI-03-T2`).
  * **PBI [#203](https://github.com/CAMPUSCEUB/Sentinela/issues/203)** — Disponibilizar dados históricos para as análises (`EP08-PBI-04`).
    * **Task [#204](https://github.com/CAMPUSCEUB/Sentinela/issues/204)** — Conectar APIs analíticas à base histórica (`EP08-PBI-04-T1`).
    * **Task [#205](https://github.com/CAMPUSCEUB/Sentinela/issues/205)** — Conciliar contagens do Dashboard e Mapa com o banco (`EP08-PBI-04-T2`).

* **Feature [#206](https://github.com/CAMPUSCEUB/Sentinela/issues/206)** — Integração e Homologação Final do MVP (`EP08-FEAT-NOVA`), vinculada ao EP08.
  * **PBI [#207](https://github.com/CAMPUSCEUB/Sentinela/issues/207)** — Validar os fluxos integrados do sistema (`EP08-PBI-05`).
    * **Task [#208](https://github.com/CAMPUSCEUB/Sentinela/issues/208)** — Testar ponta a ponta autenticação, RBAC e CRUD (`EP08-PBI-05-T1`).
    * **Task [#209](https://github.com/CAMPUSCEUB/Sentinela/issues/209)** — Testar ponta a ponta importação, geocodificação, filtros, mapa e dashboard (`EP08-PBI-05-T2`).
  * **PBI [#210](https://github.com/CAMPUSCEUB/Sentinela/issues/210)** — Homologar segurança e qualidade do MVP (`EP08-PBI-06`).
    * **Task [#211](https://github.com/CAMPUSCEUB/Sentinela/issues/211)** — Validar autorização backend, proteção de dados e segredos (`EP08-PBI-06-T1`).
    * **Task [#212](https://github.com/CAMPUSCEUB/Sentinela/issues/212)** — Testar desempenho, responsividade e navegadores (`EP08-PBI-06-T2`).
  * **PBI [#213](https://github.com/CAMPUSCEUB/Sentinela/issues/213)** — Consolidar evidências e homologar a entrega (`EP08-PBI-07`).
    * **Task [#214](https://github.com/CAMPUSCEUB/Sentinela/issues/214)** — Criar checklist requisito x funcionalidade x teste (`EP08-PBI-07-T1`).
    * **Task [#215](https://github.com/CAMPUSCEUB/Sentinela/issues/215)** — Consolidar evidências, pendências e decisão de homologação (`EP08-PBI-07-T2`).

## Responsáveis

## Entregas

* Deploy produtivo na Vercel com integração ao GitHub, verificações de build, acesso via HTTPS/TLS e gestão adequada das variáveis de ambiente.
* Rotinas de backup e testes de recuperação do banco, além de logs operacionais para acompanhamento e diagnóstico da infraestrutura.
* Auditoria de eventos críticos e exportação CSV/XLSX de dados consultados, preservando filtros, permissões e proteção de informações sensíveis.
* Pipeline ETL para preparação, normalização, validação e carga da base histórica oficial PCDF/SSP-DF (aproximadamente cinco anos), com conciliação de inserções e rejeições.
* Integração do Dashboard e do Mapa Criminal com os dados reais, com comparação de quantitativos e validação dos fluxos funcionais ponta a ponta.
* Homologação final do MVP mediante testes de autorização, segurança, responsividade, desempenho e rastreabilidade entre requisitos, funcionalidades, testes e evidências.

## Issues concluídas

## Pull requests aceitos

## Evidências

## Impedimentos

## Retrospectiva

## Próximas ações

Após o encerramento da Sprint 6, revisar com a equipe os resultados da homologação do MVP, formalizar as pendências remanescentes e definir seu encaminhamento para o Backlog ou um próximo ciclo, sem presumir que as entregas já foram concluídas.
