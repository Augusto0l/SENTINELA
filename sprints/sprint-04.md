## Período

* Data Início: 19/10/2026
* Data Fim: 01/11/2026

**Complementação posterior registrada em 11/11/2026:** as atividades de preparação/homologação continuaram em novembro, com registros em 06/11 e entregas locais em 10–11/11. O período acima permanece como planejamento original; esta atualização registra o replanejamento operacional, sem alterar retroativamente o calendário nem declarar aprovação acadêmica de uma nova data de encerramento.

**Estado da entrega:** fatia local de leitura persistente implementada e homologada nos limites descritos abaixo. O escopo original da sprint não foi integralmente concluído.

## Objetivo

O foco e objetivo principal da sprint é executar o QA do front-end, implementar a modelagem física do PostgreSQL/PostGIS e iniciar os serviços essenciais de backend, incluindo autenticação, autorização e CRUD transacional de ocorrências. A sprint consolida a persistência e a integração dos serviços centrais do SENTINELA.

## Milestone

* Épico 05: Governança, Contratos e Qualidade (EP05)
* Épico 06: Infraestrutura, Segurança e Banco de Dados (EP06)
* Épico 07: Serviços e Motores Backend (EP07)

No levantamento institucional de 11/11/2026, não havia milestone denominada Sprint 4. As milestones complementares são EPICO 5 (#5), EPICO 6 (#6) e EPICO 7 (#7), sem datas previstas. O [ADR do backlog](../docs/decisoes/adr-organizacao-hierarquica-backlog-sentinela.md) define a iteração pelo campo Sprint do GitHub Projects. Sua associação não foi confirmada: a consulta disponível não possui `read:project`. Não presumir que vínculo ao épico atribui automaticamente uma sprint aos descendentes.

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

Contribuições confirmadas pelo responsável pelo projeto e registradas nos commits. Esta tabela não atribui revisão institucional ou aprovação de ADR a quem não as realizou.

| Integrante / identidade Git | Contribuição nesta entrega | Grupos |
|---|---|---|
| Pedro Augusto — augustolourenco100@gmail.com | Backup, segurança PostgreSQL local, controlador do sandbox, pool e APIs persistentes; regularização documental em commit separado | C2, C3, C6, C8 |
| João Pedro Roriz Costa — jpedrororiz850@gmail.com | Interface persistente e qualificação HTTP/visual | C9 |
| Pedro Felizardo Barbosa — pedro.felizardo@sempreceub.com | Substituição atômica HBA, recuperação e testes descartáveis | C4 |
| Henrique Rabelo Rega — rega.henrique.rabelo@sempreceub.com | Planejamento seguro de recuperação do sandbox | C5 |
| Arthur de Jesus Lira Rojas — arthur.jr@sempreceub.com | Infraestrutura de validação e executor de homologação RLS | C1, C7 |

Os nove commits técnicos, publicados na branch `feat/sprint4-auth-local-mapas`, preservam o histórico anterior:

| Grupo | Commit | Entrega |
|---|---|---|
| C1 | `005f1f05` | Infraestrutura de build/homologação |
| C2 | `6d76d444` | Backup PostgreSQL com TLS verificado |
| C3 | `04fde6c6` | Segurança local de leitura e RLS |
| C4 | `3346f59f` | Instalador HBA e recuperação controlada |
| C5 | `63b3cdb3` | Planejamento de recuperação |
| C6 | `dd1be7aa` | Ciclo de vida e atestação do sandbox |
| C7 | `fe372132` | Executor e relatório de homologação RLS |
| C8 | `e253cc36` | Pool PostgreSQL, contratos e APIs GET |
| C9 | `132cf676` | Interface persistente de ocorrências |

HEAD técnico: `132cf676e0ef6d6345df764e4d5daf44f56d9cbd`. Committer dos nove: Pedro Augusto. O bloco do Next.js em `AGENTS.md` é geração automática incluída na manutenção de C1, não redação manual atribuída a Arthur.

A entrega anterior de autenticação local, NTFS, logout e mapas foi registrada em quatro commits dos respectivos participantes e integrada pelo PR #224; não integra novamente a contagem destes nove.

## Entregas

**Escopo originalmente planejado, cuja conclusão integral não está declarada:**

* Interfaces e mocks validados contra os protótipos, com verificações de usabilidade, testes de consistência entre Dashboard, Mapa e tabelas, e registro de ajustes necessários.
* Scripts versionados de migração/DDL para as oito tabelas-base do PostgreSQL, incluindo chaves, relacionamentos, restrições, índices e suporte geoespacial com PostGIS.
* Autenticação via Supabase Auth, controle de sessão com JWT, políticas RLS conforme a matriz aprovada e gerenciamento administrativo de usuários.
* APIs de consulta, cadastro, atualização e inativação de ocorrências com validação no servidor, filtros, paginação e eventos de auditoria para ações críticas.

**Entregas efetivamente registradas nesta complementação:**

- PostgreSQL 17.11/PostGIS 3.6.2 local: baseline consolidada 0001–0005, 19 tabelas, 34 FKs, 77 índices, 55 triggers, 17 funções e ENABLE/FORCE RLS. A 0006 Auth não foi aplicada nesse perfil local.
- Role técnica de leitura com atributos restritos, seis policies SELECT, 48 grants por coluna e isolamento HBA. Sem escrita operacional ou credencial administrativa na aplicação.
- Provedor temporário local com três contas, scrypt/salt individual, proteção NTFS, sessões no servidor, cookie HttpOnly/SameSite e logout. Supabase Auth e SSR preservados, sem afirmar homologação definitiva.
- Sandbox PostgreSQL independente, porta distinta, atestação de identidade/configuração e 20 fixtures sintéticas. Comparação estrutural completa e testes de conjuntos visíveis/invisíveis por autenticação real da role.
- Pool exclusivamente no servidor e endpoints GET `/api/v1/ocorrencias` e `/api/v1/ocorrencias/{id}`, com consultas parametrizadas, validação Zod/OpenAPI, autorização e paginação.
- `/ocorrencias` integrada ao backend, sem fallback para mocks, com filtros, ordenação, paginação, detalhes por UUID, estados de erro/vazio e acessibilidade. Dashboard e Mapa permanecem demonstrativos.
- Homologação HTTP/visual com PostgreSQL operacional vazio nos três perfis. Nenhuma fixture foi inserida no operacional. Ações persistentes de cadastro, edição e inativação continuam indisponíveis.
- Dois ADRs complementares registrados como **propostos**, para avaliação institucional: [provedor local temporário](../docs/decisoes/adr-auth-local-temporario.md) e [leitura local/homologação isolada](../docs/decisoes/adr-leitura-postgresql-local-homologacao-isolada.md).

## Issues concluídas

O levantamento de 11/11/2026 encontrou #15 e #128 fechadas entre as 37 issues planejadas; as outras 35 estavam abertas. Isso registra o estado consultado, sem declarar que todas as tasks descendentes de #15 tenham sido concluídas. A regularização não fecha ou edita issues.

Principal proposta para o novo PR: [#151 — Consultar ocorrências pela API](https://github.com/CAMPUSCEUB/Sentinela/issues/151), com vínculos diretos a #152 e #153. Referências complementares: #126/#127, #145/#146/#147 e #135/#136/#137, nos respectivos escopos parciais. Os critérios detalhados desses PBIs/Tasks ainda requerem homologação da equipe; nenhum comando de fechamento automático foi autorizado.

O aceite técnico comprovado é a leitura local autenticada de dados sintéticos, com filtragem RLS no sandbox e respostas HTTP reais de base vazia. Não representa o aceite integral de CRUD, Auth hospedado, usuários administrativos ou recuperação/backup diário.

## Pull requests aceitos

- [PR #224 — Feat/sprint4 auth local mapas](https://github.com/CAMPUSCEUB/Sentinela/pull/224), integrado em 10/11/2026, HEAD histórico `0b58c385`. Cobre a entrega anterior, não os nove commits atuais.
- O novo PR da leitura PostgreSQL está em preparação. Não registrar número, CI aprovado, revisão ou merge sem evidência institucional posterior. Esta regularização não cria nem modifica PRs.

## Evidências

**Registros históricos das etapas iniciais:** os estados abaixo correspondem às respectivas datas, não substituem as evidências posteriores.

* Etapa 2.1: [homologação local das duas baselines](../docs/banco/preparacao-baseline-supabase-etapa2-1.md), com regressões SQL e equivalência integral dos catálogos aprovadas; Supabase remoto não homologado.
* Etapa 2.2: [Auth inicial, testes e bloqueios](../docs/banco/autenticacao-supabase-etapa2-2.md) e [ADR de acesso fechado](../docs/decisoes/adr-auth-inicial-acesso-fechado.md). Integração SDK/SSR, vínculo próprio e autorização preparados; 111 testes, TypeScript, lint e build aprovados localmente. Auth hospedado/SMTP, provisionamento e escopo de dados ainda dependem de aprovação e integração real. Esta evidência não conclui toda a sprint nem fecha issues automaticamente.

**Consolidação de novembro, conferida por leitura em 11/11/2026:**

| Classe de evidência | Resultado e limite |
|---|---|
| Testes unitários/simulados | 138 Node, dez estáticos PostgreSQL, 132 simulados do sandbox e 12 Windows descartáveis aprovados; não são leituras de dados operacionais |
| SQL real no sandbox | 20 fixtures sintéticas, seis policies, seis projeções permitidas e 49 negativas; comparação por UUID e definições, não apenas contagens |
| HTTP real com PostgreSQL operacional vazio | 166 verificações PASS, zero falhas, 54 respostas HTTP 200; `databaseTested=true`; tela vazia real validada nos três perfis |
| Interface preenchida | Respostas HTTP contratuais exclusivamente nos testes; nulos, múltiplas naturezas, concorrência, filtros, paginação, detalhes, erros e ações indisponíveis |
| Qualidade e build | TypeScript, ESLint, contratos/OpenAPI, rotas, estilos, build Next.js isolado e `git diff --check` aprovados nas validações técnicas precedentes |

O ensaio HTTP tem um grupo NOT_EXERCISED: dados persistentes não vazios/múltiplas naturezas/linha oculta por RLS via HTTP. Não há evidência de HTTP real com ocorrências operacionais preenchidas. O ensaio anterior sem banco teve 165 PASS; seus resultados são distintos dos 166 PASS posteriores com PostgreSQL real.

O relatório privado original foi conferido por leitura; somente o resumo sanitizado foi incorporado. As suítes de código e as homologações SQL/HTTP não foram repetidas nesta atualização documental. O relatório está identificado, sem caminho privado completo, em [APIs locais](../docs/postgresql-leitura-local.md#homologação-real-confirmada-em-11112026).

Evidências versionadas: [RLS](../database/local/sandbox/HOMOLOGACAO.md), [APIs](../docs/postgresql-leitura-local.md), [interface](../docs/ocorrencias-persistentes.md), [autenticação local](../docs/autenticacao-local.md) e os nove commits. Relatórios completos, screenshots recentes, contas/sessões e backups permanecem fora do Git. A existência de backup/inventário não comprova restauração integral Supabase.

## Impedimentos

- Critérios de aceite detalhados e vínculo principal #151 dependem de confirmação da equipe; não há autorização de fechamento automático.
- Campo Sprint no Projects não confirmado por falta de `read:project`; milestones por épico não comprovam alocação de sprint.
- Novos ADRs aguardam avaliação institucional; cronograma complementar e encerramento acadêmico também precisam de validação.
- Homologação definitiva de Supabase Auth, convites/e-mail, recuperação e provisionamento permanecem adiados. O estado remoto informado anteriormente não foi reconsultado nesta regularização.
- CRUD persistente completo, administração de usuários, autorização de escrita e auditoria humana não foram entregues. RPO/RTO e recuperação integral do Supabase não foram comprovados.
- CI/revisão do novo PR devem ser conferidos após sua abertura. Testes locais não equivalem a aprovação institucional.

## Retrospectiva

- Privilégios mínimos e fail-closed evitaram usar postgres ou credenciais remotas para contornar falhas locais.
- Atestação de identidade e comparação estrutural foram mais confiáveis que contagens isoladas; fixtures no sandbox permitiram comprovar RLS sem contaminar o operacional.
- Falhas anteriores de subprocessos Windows e troca atômica HBA motivaram observabilidade, limites de tempo e recuperação condicionada ao estado real, com evidências preservadas.
- A rastreabilidade acadêmica ficou defasada em relação à implementação: critérios genéricos, relatório inicial e ADRs anteriores não descreviam a leitura local atual. Esta regularização registra a evolução sem reescrever commits ou decisões históricas.
- Manter separados testes simulados, SQL real isolado, HTTP vazio real e interface preenchida evita atribuir às evidências uma cobertura que não possuem.

## Próximas ações

1. Revisar o novo PR e os dois ADRs, confirmar #151 e as tasks #152/#153 e homologar seus critérios. Não reescrever os nove commits para inserir vínculos retroativos.
2. Conferir Sprint no Projects e validar o replanejamento/encerramento acadêmico; não transferir silenciosamente pendências nem alterar milestones.
3. Planejar cadastro, edição e inativação persistentes com contratos, privilégios e RLS de escrita, autorização por operação, integridade e auditoria. Não reutilizar a role reader nem a conexão administrativa para isso.
4. Retomar Supabase Auth definitivo, administração de usuários e recuperação por e-mail em homologação própria, com aprovação operacional.
5. Registrar as pendências e sua alocação futura antes de executar importação, geocodificação ou analytics persistentes. O planejamento abaixo continua referência, não comprovação de entregas.

Preparação para a execução da Sprint 5 (Semana 7), focada em Processamento em Lote, Geocodificação Real e Analytics (EP07):
* **Feature [#19](https://github.com/CAMPUSCEUB/Sentinela/issues/19)** — Motor Transacional de Importação e Deduplicação; PBIs: [#160](https://github.com/CAMPUSCEUB/Sentinela/issues/160) (`EP07-PBI-07`), [#163](https://github.com/CAMPUSCEUB/Sentinela/issues/163) (`EP07-PBI-08`), [#166](https://github.com/CAMPUSCEUB/Sentinela/issues/166) (`EP07-PBI-09`), [#169](https://github.com/CAMPUSCEUB/Sentinela/issues/169) (`EP07-PBI-10`).
* **Feature [#20](https://github.com/CAMPUSCEUB/Sentinela/issues/20)** — Serviço Real de Geocodificação Integrado; PBIs: [#172](https://github.com/CAMPUSCEUB/Sentinela/issues/172) (`EP07-PBI-11`), [#175](https://github.com/CAMPUSCEUB/Sentinela/issues/175) (`EP07-PBI-12`).
* **Feature [#21](https://github.com/CAMPUSCEUB/Sentinela/issues/21)** — Analytics e Dados Espaciais; PBIs: [#178](https://github.com/CAMPUSCEUB/Sentinela/issues/178) (`EP07-PBI-13`), [#181](https://github.com/CAMPUSCEUB/Sentinela/issues/181) (`EP07-PBI-14`), [#184](https://github.com/CAMPUSCEUB/Sentinela/issues/184) (`EP07-PBI-15`).
