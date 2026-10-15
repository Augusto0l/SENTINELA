## Período

* Data Início: 02/11/2026
* Data Fim: 08/11/2026

## Objetivo

O foco e objetivo principal da sprint é desenvolver o motor transacional de importação de arquivos CSV/XLSX, aplicar regras homologadas de deduplicação, integrar o geocodificador Nominatim e disponibilizar serviços analíticos e geoespaciais otimizados para o Dashboard e o Mapa Criminal.

## Milestone

* Épico 07: Serviços e Motores Backend (EP07)

## Itens planejados

**Planejamento proposto:** 30 issues (3 Features, 9 PBIs e 18 Tasks). A distribuição das novas issues é derivada da Sprint das Features originais do Artefato 2; a Feature de integração e homologação final foi proposta para a Sprint 6. Este documento não altera os campos de Sprint ou de responsável no GitHub Projects.

### EP07 — Serviços e Motores Backend

* **Feature [#19](https://github.com/CAMPUSCEUB/Sentinela/issues/19)** — Motor Transacional de Importação e Deduplicação (`GH#19`), vinculada ao EP07.
  * **PBI [#160](https://github.com/CAMPUSCEUB/Sentinela/issues/160)** — Validar arquivos e registros de importação (`EP07-PBI-07`).
    * **Task [#161](https://github.com/CAMPUSCEUB/Sentinela/issues/161)** — Receber/processar CSV/XLSX com limite 50MB (`EP07-PBI-07-T1`).
    * **Task [#162](https://github.com/CAMPUSCEUB/Sentinela/issues/162)** — Validar cabeçalhos, mapeamento, campos e erros por linha (`EP07-PBI-07-T2`).
  * **PBI [#163](https://github.com/CAMPUSCEUB/Sentinela/issues/163)** — Importar ocorrências de forma transacional (`EP07-PBI-08`).
    * **Task [#164](https://github.com/CAMPUSCEUB/Sentinela/issues/164)** — Persistir lote após validação e confirmação (`EP07-PBI-08-T1`).
    * **Task [#165](https://github.com/CAMPUSCEUB/Sentinela/issues/165)** — Implementar rollback e testes de consistência (`EP07-PBI-08-T2`).
  * **PBI [#166](https://github.com/CAMPUSCEUB/Sentinela/issues/166)** — Identificar duplicidades e rastrear a origem (`EP07-PBI-09`).
    * **Task [#167](https://github.com/CAMPUSCEUB/Sentinela/issues/167)** — Aplicar regras homologadas de deduplicação (`EP07-PBI-09-T1`).
    * **Task [#168](https://github.com/CAMPUSCEUB/Sentinela/issues/168)** — Vincular ocorrência importada a lote/fonte (`EP07-PBI-09-T2`).
  * **PBI [#169](https://github.com/CAMPUSCEUB/Sentinela/issues/169)** — Consultar o histórico e os resultados das importações (`EP07-PBI-10`).
    * **Task [#170](https://github.com/CAMPUSCEUB/Sentinela/issues/170)** — Registrar usuário, arquivo, data, contagens e resultado (`EP07-PBI-10-T1`).
    * **Task [#171](https://github.com/CAMPUSCEUB/Sentinela/issues/171)** — Criar consulta do histórico e relatório de erros por linha (`EP07-PBI-10-T2`).

* **Feature [#20](https://github.com/CAMPUSCEUB/Sentinela/issues/20)** — Serviço Real de Geocodificação Integrado (`GH#20`), vinculada ao EP07.
  * **PBI [#172](https://github.com/CAMPUSCEUB/Sentinela/issues/172)** — Geocodificar endereços automaticamente (`EP07-PBI-11`).
    * **Task [#173](https://github.com/CAMPUSCEUB/Sentinela/issues/173)** — Integrar API Nominatim para endereços (`EP07-PBI-11-T1`).
    * **Task [#174](https://github.com/CAMPUSCEUB/Sentinela/issues/174)** — Persistir latitude/longitude de resultados válidos (`EP07-PBI-11-T2`).
  * **PBI [#175](https://github.com/CAMPUSCEUB/Sentinela/issues/175)** — Tratar localizações ambíguas ou não encontradas (`EP07-PBI-12`).
    * **Task [#176](https://github.com/CAMPUSCEUB/Sentinela/issues/176)** — Registrar estado Pendente de Localização (`EP07-PBI-12-T1`).
    * **Task [#177](https://github.com/CAMPUSCEUB/Sentinela/issues/177)** — Tratar falhas/ambiguidades e testar integração (`EP07-PBI-12-T2`).

* **Feature [#21](https://github.com/CAMPUSCEUB/Sentinela/issues/21)** — Analytics e Dados Espaciais (`GH#21`), vinculada ao EP07.
  * **PBI [#178](https://github.com/CAMPUSCEUB/Sentinela/issues/178)** — Disponibilizar indicadores analíticos pela API (`EP07-PBI-13`).
    * **Task [#179](https://github.com/CAMPUSCEUB/Sentinela/issues/179)** — Criar views/agregações por RA, natureza e período (`EP07-PBI-13-T1`).
    * **Task [#180](https://github.com/CAMPUSCEUB/Sentinela/issues/180)** — Implementar endpoints de indicadores e série temporal (`EP07-PBI-13-T2`).
  * **PBI [#181](https://github.com/CAMPUSCEUB/Sentinela/issues/181)** — Disponibilizar dados geoespaciais para o Mapa Criminal (`EP07-PBI-14`).
    * **Task [#182](https://github.com/CAMPUSCEUB/Sentinela/issues/182)** — Criar endpoints de coordenadas/agregações por RA (`EP07-PBI-14-T1`).
    * **Task [#183](https://github.com/CAMPUSCEUB/Sentinela/issues/183)** — Aplicar filtros e validar consistência com Dashboard (`EP07-PBI-14-T2`).
  * **PBI [#184](https://github.com/CAMPUSCEUB/Sentinela/issues/184)** — Otimizar consultas analíticas (`EP07-PBI-15`).
    * **Task [#185](https://github.com/CAMPUSCEUB/Sentinela/issues/185)** — Otimizar queries, views e índices (`EP07-PBI-15-T1`).
    * **Task [#186](https://github.com/CAMPUSCEUB/Sentinela/issues/186)** — Testar tempo de resposta p95 com volume MVP (`EP07-PBI-15-T2`).

## Responsáveis

## Entregas

* Motor de importação de CSV/XLSX com validações de arquivo e de registros por linha, processamento transacional, controle de duplicidades, rollback e histórico/relatório de erros.
* Integração real com a API Nominatim para geocodificação de endereços, persistência de coordenadas válidas e tratamento de localizações ambíguas ou não encontradas.
* Views, consultas e endpoints de indicadores por RA, natureza e período, incluindo séries temporais e dados espaciais para o Mapa Criminal.
* Filtros consistentes entre Dashboard e Mapa e testes de desempenho das consultas analíticas, conforme os requisitos e a base de dados disponível.

## Issues concluídas

## Pull requests aceitos

## Evidências

## Impedimentos

## Retrospectiva

## Próximas ações

Preparação para a execução da Sprint 6 (Semana 8), focada em Auditoria, ETL, Deploy Produtivo e Homologação Final (EP06, EP07 e EP08):
* **Feature [#24](https://github.com/CAMPUSCEUB/Sentinela/issues/24)** — Hospedagem Vercel, HTTPS e Deploy Produtivo; PBIs: [#129](https://github.com/CAMPUSCEUB/Sentinela/issues/129) (`EP06-PBI-04`), [#132](https://github.com/CAMPUSCEUB/Sentinela/issues/132) (`EP06-PBI-05`), [#135](https://github.com/CAMPUSCEUB/Sentinela/issues/135) (`EP06-PBI-06`), [#138](https://github.com/CAMPUSCEUB/Sentinela/issues/138) (`EP06-PBI-07`).
* **Feature [#22](https://github.com/CAMPUSCEUB/Sentinela/issues/22)** — Auditoria, Logs e Exportação; PBIs: [#187](https://github.com/CAMPUSCEUB/Sentinela/issues/187) (`EP07-PBI-16`), [#190](https://github.com/CAMPUSCEUB/Sentinela/issues/190) (`EP07-PBI-17`).
* **Feature [#23](https://github.com/CAMPUSCEUB/Sentinela/issues/23)** — ETL e Carga Histórica; PBIs: [#194](https://github.com/CAMPUSCEUB/Sentinela/issues/194) (`EP08-PBI-01`), [#197](https://github.com/CAMPUSCEUB/Sentinela/issues/197) (`EP08-PBI-02`), [#200](https://github.com/CAMPUSCEUB/Sentinela/issues/200) (`EP08-PBI-03`), [#203](https://github.com/CAMPUSCEUB/Sentinela/issues/203) (`EP08-PBI-04`).
* **Feature [#206](https://github.com/CAMPUSCEUB/Sentinela/issues/206)** — Integração e Homologação Final do MVP; PBIs: [#207](https://github.com/CAMPUSCEUB/Sentinela/issues/207) (`EP08-PBI-05`), [#210](https://github.com/CAMPUSCEUB/Sentinela/issues/210) (`EP08-PBI-06`), [#213](https://github.com/CAMPUSCEUB/Sentinela/issues/213) (`EP08-PBI-07`).
