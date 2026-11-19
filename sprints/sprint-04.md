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

## Continuidade da Etapa 2.17.6 — catálogo das 37 RAs

- A Etapa 2.17.4 qualificou o inventário global, o ledger e o backup com
  restauração lógica em cluster isolado. O resultado se aplica ao snapshot
  de 13/11/2026. [Evidência da qualificação](../docs/backup-recuperacao-postgresql-local.md)
- O pacote `ra-public-sandbox-2026-11-13-v2` tem recibo de homologação em
  PostgreSQL/PostGIS isolado para as 37 RAs, com UUIDs preservados na reexecução,
  rollback e acesso da reader filtrado por RLS.
- A variante operacional `local-ra-0002` passou pela requalificação isolada
  dos seis cenários, incluindo reconciliação do COMMIT em nova conexão de
  leitura. A ressalva de HTTP permanece restrita ao login/sessão ponta a ponta.
  A auditoria operacional está registrada na seção seguinte. A autorização
  para aplicação segue pendente. [Relatório de homologação](../docs/homologacao-ra-operacional-sprint-04.md)
  [Procedimento e checklist](../docs/catalogo-ras-carga.md#pacote-operacional-preparado-para-revisão)

## Auditoria pré-operacional autorizada — 18/11/2026

**Parecer: APTO para receber a migration e a carga inicial, sujeito à autorização
de aplicação e à reconfirmação do estado na janela de manutenção.**

- **Verificado diretamente no banco.** Destino atestado
  `127.0.0.1:5432/sentinela_dev_operacional`, system identifier
  `7702156035351602692`, PostgreSQL 17.11 e PostGIS 3.6.2. O auditor usou
  `default_transaction_read_only=on`, `REPEATABLE READ READ ONLY` e
  `statement_timeout=60000`. Duas sessões de leitura foram encerradas com
  rollback.
- **Inventário atual.** Esquemas `sentinela` e `extensions`, 19 tabelas com
  RLS ENABLE/FORCE, 163 constraints, 34 FKs validadas, 77 índices válidos e
  prontos, seis policies e 48 grants SELECT por coluna para a reader.
  O executor administrativo tem os privilégios esperados para o inventário
  global. A reader tem LOGIN e passou nas verificações de proteção do preflight,
  que incluem ausência de privilégios elevados, memberships, escrita no catálogo
  e SELECT em geometria e ledger. A política de RAs vigente permanece sintética.
- **Ledger e catálogo.** Ledger exato `0001`, `0002`, `0003`, `0004`, `0005`
  e `local-read-0001`. Contagens globais administrativas de RAs, códigos distintos
  e grupos de códigos duplicados iguais a zero. O preflight encontrou o estado
  de primeira carga, sem `local-ra-0002`, coluna de referência ou policies
  oficiais. O catálogo vazio também exclui registros parciais e divergências
  de geometria ou metadados persistidos de RAs nesse snapshot.
- **Backup.** `audit_backup.py --authorized-read postgres` retornou `PASS`,
  com `inventoryMatches=true`, `schemaDifferences=[]` e `dataDifferences=[]`.
  Foram verificados os SHA-256 do dump, do recibo e dos artefatos de fingerprints.
  As 19 tabelas coincidiram com o snapshot de 13/11/2026. O recibo anterior
  documenta a restauração isolada e preservação da origem. O backup é adequado
  ao estado auditado. Nenhum novo dump ou restore foi executado nesta auditoria.
- **Preflight.** `preflight.sql` e `inspect.sql` passaram em sessão independente
  de leitura. O manifesto `798ab31229f2c1ab9ddf019dc6aa1370364b7df146d96a4ba4f43049315dfe54`
  e seus arquivos passaram na verificação offline, incluindo o payload de 37 RAs
  e a cartografia fixada. A idempotência permanece comprovada pelo ensaio
  isolado. O tempo de aquisição dos locks exclusivos e os GETs com catálogo
  operacional carregado ainda dependem da futura janela autorizada.

- **Validação local.** 25 testes direcionados aprovados, zero falhas ou ignorados.
  TypeScript, ESLint, contratos/OpenAPI, build isolado de produção e
  `git diff --check` passaram. A atualização foi exclusivamente documental.

A auditoria não realizou DDL, carga, alterações de segurança, acesso ao Supabase
ou geração de vínculos operacionais. A aplicação deve seguir o
[roteiro de liberação](../docs/catalogo-ras-carga.md#roteiro-de-liberação-do-pacote-revisado).

## Aplicação operacional da Etapa 2.17.6 — 18/11/2026

- Uma verificação real do Next.js em loopback passou em 11 requisições HTTP,
  incluindo rejeição dos dois GETs sem sessão e com cookie inválido. O servidor
  de ensaio foi encerrado sem criar contas nem conectar ao banco.
- A URL da reader está ausente. O modo `-ApplicationOnly` da ferramenta
  de leitura recebe a senha existente em entrada oculta e usa as contas
  demonstrativas já configuradas. Os GETs autenticados permanecem pendentes.
  [Verificação e próximos passos](../docs/catalogo-ras-carga.md#verificação-http-independente-e-credencial-pendente)

- Preflight e auditoria de backup aprovados. Uma única execução confirmou
  `COMMITTED`, com 37 inserções e zero reutilizações.
- Reconciliador em nova conexão confirmou `PERSISTED`, com 37 RAs, 37 códigos
  e UUIDs distintos e uma entrada `local-ra-0002`. As 17 tabelas não
  relacionadas mantiveram os fingerprints do backup.
- A reader via role viu os 37 registros e o arquivo operacional recebeu 37
  vínculos validados contra o GeoJSON. O teste HTTP integrado segue pendente,
  pois a aplicação está sem a credencial de login da reader.
- A operação ficou restrita ao PostgreSQL local autorizado. Nenhum dado de
  ocorrência, conta ou credencial foi alterado.
  [Registro da aplicação e hashes](../docs/catalogo-ras-carga.md#aplicação-operacional--18112026)

## Desenvolvimento Autônomo 01 — leitura persistente

- Busca literal e direção de ordenação disponíveis no GET de naturezas.
  O filtro preserva a descrição de origem. O OpenAPI foi atualizado.
- HTTP com PostgreSQL/PostGIS isolado passou para catálogos e ocorrências,
  incluindo paginação, detalhe, filtros combinados e ocultação por RLS.
  [Recibo e limites](../docs/catalogos-persistentes.md#requalificação-do-desenvolvimento-autônomo-01)
- Em ensaio independente, o Next.js real retornou `401` em 11 requisições
  sem sessão, com cookie inválido ou cabeçalhos forjados. O servidor de
  ensaio foi encerrado. O recibo sanitizado local é
  `320c2aee-a713-4e9b-a314-7d55b8c458bd`. Nenhuma conta foi criada e o
  ensaio do Next.js ficou sem conexão ao banco.
- 236 testes automatizados passaram, com zero falhas ou ignorados. TypeScript,
  ESLint, OpenAPI, verificação de rotas, build de produção e
  `git diff --check` também passaram.
- A Etapa 2.17.6 permanece em 83% (cinco de seis marcos). A carga e os vínculos
  estão confirmados. Falta validar HTTP 200 e sessões dos três perfis com a
  reader do ambiente operacional.
- Carga das naturezas aguarda o artefato integral das 41 descrições e a
  homologação dos mapeamentos para as 20 categorias previstas. A Central
  reserva a permissão de correção ao Administrador. A escrita segue
  desabilitada para todos até a existência de backend auditado.

## Desenvolvimento Autônomo 02 — CRUD persistente em laboratório

- O adaptador HTTP do cluster descartável executou cadastro, edição e
  inativação lógica com PostGIS, idempotência no cadastro, controle de versão
  e trilha técnica. O cadastro validou bairro ou setor e múltiplas naturezas.
- Administrador editou e inativou ocorrências sintéticas elegíveis, e Operador
  cadastrou. O Analista teve escrita recusada por serviço e SQL. Os testes
  cobriram rollback, concorrência e RLS. O cluster terminou parado.
- Passaram 237 testes automatizados, TypeScript da aplicação e do sandbox,
  ESLint, contratos/OpenAPI, verificação de rotas, build de produção e
  `git diff --check`.
- A listagem e o detalhe existentes mantêm leitura persistente. A publicação
  das operações de escrita e a ligação dos formulários à escrita operacional
  dependem de autoria humana verificável, escopo aprovado, catálogos
  homologados e autorização para migrations. A leitura HTTP operacional das
  37 RAs continua pendente da credencial da reader.
  [Evidência do CRUD em laboratório](../database/local/write-sandbox/MUTACOES.md)

## Desenvolvimento Autônomo 03 — staging PCDF

- O pipeline experimental persiste extração, lote, execução, dados originais,
  staging, pendências e auditoria técnica na baseline local. O CSV sintético
  segue o candidato de 34 colunas. A reimportação exata é idempotente.
- PostgreSQL 17.11/PostGIS 3.6.2 isolado recebeu 10 mil registros no ensaio
  de volume. Foram conferidos rollback, conflitos, originais, a consulta
  filtrada de pendências e as negativas de permissão.
- Passaram 237 testes automatizados, TypeScript, ESLint, contratos/OpenAPI,
  rotas, build de produção, integridade estática da baseline e
  `git diff --check`.
- Consolidação das ocorrências, reprocessamento versionado e correção na
  Central permanecem condicionados à homologação da identidade, dos
  catálogos e da autoria. A aplicação mantém a importação demonstrativa.
  [Pipeline, medidas e evidência](../docs/importacao-pcdf-sandbox.md)

## Desenvolvimento Autônomo 04 — indicadores e mapas persistentes

- Dashboard e Mapa Criminal com sessão local compartilham o GET analítico.
  Os filtros de período, RA, natureza, categoria e hora são aplicados no banco
  sob RLS. Os totais de ocorrências permanecem distintos.
- O mapa usa o GeoJSON oficial validado por hash. Pontos e clusters exibem
  apenas localizações válidas. O calor mantém a referência integral até o
  limite de apresentação e o Satélite mantém o provedor de imagens existente.
- O ensaio PostgreSQL isolado confirmou os agregados, filtros, RLS e limites
  de volume. A reader operacional continua sem credencial configurada.
  [Definições, desempenho e evidências](../docs/analytics-postgresql-local.md)

## Desenvolvimento Autônomo 05 — preparação de publicação

A homologação avançou em ambiente isolado. Foram repetidos os ensaios
de catálogo e analytics, CRUD experimental, importação PCDF e restauração
do backup histórico. O roteiro registra os limites de cada ensaio e a
divisão das alterações para revisão.
[Guia de implantação e evidências](../docs/guia-implantacao-sprint-04.md)

A Etapa 2.17.6 permanece em 83% (5 de 6 verificações registradas),
pendente dos GETs reais com a reader operacional. A Sprint 4 segue em
andamento. A Sprint 5 continua como planejamento. A publicação com dados
reais depende de autenticação hospedada homologada, autorização por
perfil no ambiente de destino e recuperação validada com cópia atual.

## Correções pós-auditoria

- A suíte estática expande o guard e o payload do pacote RA v2. Os quatro
  scripts de escrita experimental com funções privilegiadas têm o SQL
  expandido fixado por hash. SQL/HBA passou em 11 testes.
- Administrador e Operador podem simular cadastro, edição e inativação
  regular. As duas últimas exigem ocorrência manual, ativa e consolidada.
  Analista tem somente leitura. Correção pela Central é uma permissão
  exclusiva do Administrador e continua pendente de implementação.
- Node passou em 241 testes. TypeScript, ESLint, OpenAPI, verificação de
  rotas e build passaram. Foram aprovadas 194 verificações HTTP sem banco
  e duas verificações de limpeza, com analytics nos três perfis.
- A configuração da reader operacional permanece indisponível. A
  Etapa 2.17.6 segue em 83%, pendente de homologação HTTP autenticada
  com o PostgreSQL operacional.
  [Procedimento e evidências HTTP](../docs/postgresql-leitura-local.md)

## Verificação HTTP final da Etapa 2.17.6

**Etapa 2.17.6 encerrada em 100% (seis de seis marcos).** O recibo final
`a65dbd7f-7b70-4c48-b5d3-2ac93e989a58` comprovou 198 verificações com
Next.js e PostgreSQL operacional, mais duas verificações de limpeza.
Os três perfis obtiveram HTTP 200 nos quatro GETs. Os 37 pares UUID/nome
coincidiram com os vínculos. Parâmetros inválidos retornaram 400. Sessões
ausentes, inválidas, expiradas ou encerradas retornaram 401. As consultas
usaram a reader em modo somente leitura. A Etapa terminou sem alterações
operacionais pelo ensaio HTTP. A validação HTTP de casos com ocorrências
preenchidas e linha oculta por RLS fica para a homologação em cluster isolado.
[Checklist e evidências](../docs/homologacao-ra-operacional-sprint-04.md#checklist-da-verificação-no-servidor-operacional-local)

## Homologação de ocorrências preenchidas

- Os handlers HTTP de listagem e detalhe passaram com reader real no
  PostgreSQL 17.11/PostGIS 3.6.2 descartável. Dois registros ficaram
  visíveis. Uma ocorrência manteve duas naturezas e apareceu uma única
  vez. A terceira ocorrência, oculta por RLS, retornou 404 no detalhe.
  Filtros combinados, busca textual, ordenação e paginação passaram.
- O ensaio revelou que `categorias_criminais.codigo_interno` aceita
  nulo, enquanto o contrato exigia string. O schema da resposta e o
  OpenAPI foram corrigidos e o ensaio repetido com sucesso.
- Os principais do HTTP isolado são sintéticos. A integração das
  mutações ao Next.js ainda depende de identidade vinculada a autor SQL,
  escopo e políticas de escrita, catálogo autorizado e contrato de endereço
  estruturado. Cadastro, edição e inativação da interface seguem demonstrativos.
- O executor de escrita existente passou em 45 verificações de cadastro
  e 48 de mutações, incluindo histórico, concorrência e rollback. Cadastro
  no laboratório autoriza Administrador e Operador. Edição e inativação
  no laboratório autorizam Administrador e recusam Operador e Analista.
  O ensaio espacial independente passou em cinco etapas, incluindo
  paridade JavaScript/PostGIS, escrita sintética e rollback.
- A Etapa 2.17.6 continua em 100%. No escopo de integração de ocorrências,
  foi concluída a homologação de leitura preenchida. Cadastro, edição,
  inativação e homologação integrada dos formulários são os quatro marcos
  restantes de cinco neste bloco.
  [Evidência isolada, cenário F](../tmp/ra-operational-homologation/rls-sandbox-af9e627b-c052-402f-91c8-f742956fc1ce/evidence/ra-operational.json)

## Revisão 2 da escrita isolada de ocorrências

O instalador `database/local/write-sandbox/mutations.sql` passou na revisão
2 em cluster novo e descartável. A sessão sintética verificada seleciona
uma conexão exclusiva do perfil e o SQL fixa autoria em `session_user`.
Administrador e Operador podem editar e inativar ocorrências sintéticas
elegíveis. Analista continua sem escrita. O contexto de transação, a RLS
forçada e o histórico obrigatório permanecem ativos.

Foram aprovadas 45 verificações de cadastro e 46 de mutações. O HTTP de
laboratório confirmou autoria do Operador, recusou autoria fornecida no
corpo e testou conflito de versão. A conferência final registrou oito
eventos de histórico, três vínculos retirados logicamente, zero usuários
humanos e nenhum contexto transacional residual. A reader do laboratório
continuou sem login. O recibo privado é
`rls-sandbox-7fcc6499-582d-478a-bd34-702e053db20f/evidence/mutation-completion.json`.
O ensaio PostGIS da mesma revisão também passou em cinco etapas, com
paridade espacial, escrita sintética e rollback. Recibo
`rls-sandbox-e83d4c65-b6e9-41e6-bf71-2caa6e301989/evidence/geography-completion.json`.

A revisão amplia a evidência do laboratório. O progresso da integração à
aplicação continua em 20% (leitura preenchida, um de cinco marcos). Faltam
vínculo de autoria individual e escopo para a aplicação, armazenamento
estruturado de endereço, APIs do Next.js e formulários integrados.

## CRUD de ocorrências no Next.js em modo isolado

As três rotas de escrita encaminham sessões locais verificadas ao escritor
do cluster descartável. O formulário em `/ocorrencias/nova` cadastra, edita
e inativa registros sintéticos. A lista real mantém seus GETs e oferece
acesso ao formulário no modo de ensaio.

A rodada final com Next.js, navegador e PostgreSQL/PostGIS passou em sete
grupos. Os três envios de formulário persistiram, os perfis e o logout
foram conferidos, e o cluster e o servidor de ensaio foram encerrados.
O recibo privado é
`rls-sandbox-0e22fe00-277f-4f53-a05c-1ee83074bb18/evidence/next-write-tests.json`.
O escopo da confirmação é sintético. Faltam autoria individual vinculada
à aplicação, endereço armazenado em campos separados e seleção por lista
ou detalhe para edição e inativação.

Integração de ocorrências: 60% pelo critério de cinco marcos. A leitura
vale um ponto. Cadastro, edição, inativação e ensaio dos formulários valem
meio ponto cada, pois funcionam no Next.js isolado e ainda têm pendências
de integração operacional. A Etapa 2.17.6 permanece em 100%.

## Retomada do CRUD persistente

A branch `feat/sprint4-auth-local-mapas` estava em
`fe874f68e4d6e36f9661fb00b683ecddad4c3ea9`. O histórico versionado
já tinha leitura persistente e qualificação da reader. O trabalho
interrompido estava em 68 arquivos rastreados modificados e 142 arquivos
novos ainda não rastreados.
[Inventário antes das alterações](sprint-04-inventario-retomada.txt)

| Item | Estado na retomada |
| --- | --- |
| Cadastro, edição, inativação, histórico, concorrência e perfis no laboratório | Concluído e validado no histórico disponível. |
| UUID individual, vínculo SQL, auditoria por versão e RLS | Implementado. A primeira reexecução confirmou a gravação por dois autores. Faltava testar a troca de vínculo e o rollback resultante. |
| Local, endereço, bairro ou setor, RA, coordenadas e geometria | Implementado e confirmado na primeira reexecução. Faltava tratar a reutilização da chave com alteração apenas no endereço estruturado. |
| Listagem, detalhe, edição preenchida, versão, inativação com confirmação e recarga | Implementado. A primeira reexecução confirmou cadastro pelo Administrador e edição e inativação pelo Operador no navegador. As operações restantes dos perfis tinham cobertura HTTP e SQL. |
| Auth definitivo, auditoria humana e implantação operacional de escrita | Dependem de autorização e de homologação própria. |

A correção desta retomada faz o cadastro retornar HTTP 409 quando a mesma
chave é reutilizada com endereço ou setor divergente. O roteiro do Next.js
passou a exercer as três mutações via navegador para ambos os perfis de
escrita, além de testar repetição idempotente e expiração da sessão local.
O roteiro SQL verifica que o UUID de outro perfil provoca HTTP 403 e deixa
ocorrência, vínculos, versão e histórico intactos após rollback.

As versões sintéticas vinculam UUID individual, evento de auditoria e
geometria `Point` SRID 4326 na mesma transação. Local, RA e coordenadas
permanecem na ocorrência. Endereço e setor ficam na versão e podem estar
ausentes em registros anteriores. A inativação mantém o último endereço
estruturado. [Modelo de gravação](../docs/ocorrencias-persistentes.md#crud-no-ambiente-descartável)

### Evidência da retomada em 18/11/2026

- PostgreSQL 17.11 e PostGIS 3.6.2 em cluster novo e atestado, sem conexões
  operacionais. Três suites aprovadas, com 45 verificações de cadastro,
  48 de mutações e 12 grupos Next.js, HTTP e navegador.
- No navegador, Administrador e Operador cadastraram, editaram e
  inativaram. A lista foi atualizada depois das mutações. O Analista
  consultou o estado inativo e recebeu HTTP 403 nas três mutações.
  O cadastro entra em revisão. As ações de edição e inativação foram
  exercitadas em registros sintéticos consolidados e elegíveis.
- HTTP 201 confirmou cadastro e reapresentação do recibo. HTTP 200
  confirmou edição e inativação. HTTP 401 confirmou ausência, logout e
  expiração de sessão. HTTP 403 confirmou a proteção de perfil e origem.
  HTTP 409 confirmou versão obsoleta e divergência no endereço do comando
  repetido. HTTP 422 confirmou a rejeição de autoria fornecida no corpo.
- O banco confirmou oito versões com dois autores, sete versões com
  endereço e setor, oito pontos SRID 4326, três cadastros, três edições
  e duas inativações. As suites confirmaram RLS, cadeia de versões,
  múltiplas naturezas, concorrência e rollback sem perda de histórico.
- Relatório privado `mutation-completion.json`, execução
  `7983b032-5652-43e4-994b-3f5f522784c6`, SHA-256
  `114e4ec94bd079248da4219299ddca4e18af930875ee1e6f7147b56e5b42869a`.
  O controlador confirmou o encerramento do cluster e a preservação
  dos manifestos anteriores.
- TypeScript, ESLint, 241 testes Node, 11 testes SQL/HBA estáticos,
  contratos e OpenAPI, verificação de rotas, build e `git diff --check`
  aprovados. O primeiro ensaio sob restrições do Windows não permitiu
  subprocessos. As verificações correspondentes passaram com a execução
  autorizada e o parser SQL local.

**CRUD em laboratório: 100% (5/5).** Leitura, cadastro, edição, inativação
e ensaio de interface verificados no escopo isolado. **Integração
operacional: 60% (3/5 pontos)** pelo critério histórico acima. A próxima
etapa depende de autorização específica para revisar a implantação, a
vinculação de identidade humana e as permissões de escrita. A Etapa 2.17.6
permanece concluída.

## Impedimentos

O [pacote final da homologação privada](../database/release/README.md)
reúne restore, regressão PostGIS, SQL PCDF e navegador sob um executor.
O [registro desta etapa](../docs/desenvolvimento/progresso-conclusao.md#pacote-final-de-homologação-privada)
contém o inventário Git, a divisão recomendada de PRs e as decisões
necessárias para a homologação persistente e a escrita operacional.

A preparação para homologação privada acrescentou a matriz rastreável
PCDF, o bloqueio de colisões simultâneas em staging, decisão administrativa
de flagrante e um preflight somente leitura com reconciliação após rollback.
Os critérios operacionais continuam nas [pendências da Sprint](../docs/desenvolvimento/pendencias-conclusao.md).

O trabalho de conclusão da Sprint 4 prossegue nos registros de
[desenvolvimento](../docs/desenvolvimento/progresso-conclusao.md).
Os ensaios PCDF acrescentam recebimento de CSV pela aplicação, decisões
administrativas versionadas e promoção transacional com vínculos de
origem. O aceite operacional continua condicionado às liberações
documentadas nas [pendências](../docs/desenvolvimento/pendencias-conclusao.md).

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

## Homologação persistente local — 19/11/2026

A branch `feat/sprint4-homologacao-persistente` foi criada em `f98ec07` após
fast-forward da `main` local, que estava em `86fc921`. A árvore inicial estava
limpa em `feat/sprint4-auth-local-mapas`, HEAD `c6b9372`. A entrega
`24bd59f` é ancestral da base atual.

O cluster `sentinela-sprint4-homologacao`, identificador `7709847064550752852`,
usa PostgreSQL 17.11, PostGIS 3.6.2 e `127.0.0.1:55473`. O banco
`sentinela_sprint4_homologacao` fica em um diretório de dados próprio sob
`.cache/sprint4-homologacao-persistente/`, ignorado pelo Git e protegido por
ACL local. O login de instalação usa credencial exclusiva e SCRAM. O acesso
padrão de PUBLIC ao banco foi revogado.

Foram instalados PostGIS no schema `extensions` e a baseline
`database/supabase/baseline/0001_modelo_inicial.sql`. O inventário preservou
identidade, versões e 19 tabelas com RLS habilitada e forçada após parada e
partida do PostgreSQL. O backup lógico da baseline foi restaurado em
`sentinela_sprint4_restore`, banco separado no mesmo cluster, com as mesmas
versões e contagem de tabelas protegidas verificadas. SHA-256 do arquivo
`baseline.dump`: `874a523afa71cad49f294e7bd50a588f45bcd4a3257d424c119af3458fd2bda9`.

Os scripts de escrita e PCDF e os conectores locais de leitura e PCDF
atestam o banco e a porta do sandbox descartável. O catálogo de 37 RAs
também precisa de um caminho de instalação atestado para este destino.
Permanecem pendentes as roles de aplicação, os grants efetivos, a carga do
catálogo, os fluxos sintéticos, a reinicialização integrada com Next.js,
a prova de UUIDs e idempotência e o restore com dados de aplicação.

Pela lista técnica da instalação e integração desta rodada, 1 de 10
verificações está concluída (estrutura PostgreSQL/PostGIS, 10%). A régua
oficial da Sprint 4 segue em 30 de 40 critérios (75%).

Validação desta rodada: 241 testes Node, 11 testes estáticos SQL/HBA com
o parser local, 14 testes de recuperação, typecheck, lint, contratos, rotas
e build de produção aprovados. As primeiras tentativas no sandbox do agente
foram limitadas por criação de subprocessos e acesso a diretórios temporários.
O build concluiu na reexecução com acesso local autorizado.

### Integração de leitura no ambiente persistente — 19/11/2026

- A auditoria confirmou o cluster `7709847064550752852` em
  `127.0.0.1:55473/sentinela_sprint4_homologacao`, PostgreSQL 17.11,
  PostGIS 3.6.2 e ledger inicial `0001`–`0005`. As duas constraints
  `NOT VALID` de transação são as previstas na baseline.
- `homolog-persist-0001` carregou 37 RAs com 37 códigos e UUIDs distintos.
  Em nova conexão, cada registro coincidiu com nome, código, UUID,
  metadados e geometria EWKB esperados. O arquivo operacional de vínculos
  serviu de referência para as identidades aprovadas. A extração IDE-DF
  de 13/11/2026 continua com validade jurídica desconhecida. O SHA-256
  dos vínculos verificados é
  `8228cc09e07728f6646dac7120d8ce9a67ba111ef8797342d83be8d207397905`.
- `homolog-persist-0002` corrigiu a atestação apontada pela regressão
  SQL/HBA. O identificador é consultado sob o próprio login de leitura
  usando a função nativa do PostgreSQL. A reconciliação confirmou as
  19 tabelas com RLS forçada, três logins SCRAM e bloqueio efetivo de
  escrita, correção, auditoria, coluna geométrica e outros bancos.
- O Next.js em `127.0.0.1:3317` confirmou os logins sintéticos de
  Administrador, Operador e Analista. Para cada perfil, o catálogo retornou
  as 37 RAs, a listagem retornou zero ocorrências, o detalhe inexistente
  retornou `404` e o endpoint analítico retornou totais zero. Sessões
  ausentes ou inválidas, Host divergente, Origin divergente no login e
  chamadas de escrita foram recusados.
- A parada do PostgreSQL produziu `503` na leitura autenticada do
  catálogo. Após reiniciar PostgreSQL e Next.js, os três cookies ainda
  válidos retornaram o mesmo catálogo e as mesmas respostas. Recibo
  privado `http-c4f8c2a2-9961-4c8f-8159-ac190bf6bc11.json`.
- Validação aprovada com 243 testes Node, 11 testes SQL/HBA,
  14 testes de recuperação, typecheck, ESLint, contratos/OpenAPI,
  inventário de rotas, build de produção e `git diff --check`.

A homologação persistente passa a **3/10 (30%)**, com estrutura, catálogo
e leitura. Os controles de leitura dos três perfis foram validados.
O marco completo de roles, grants e RLS depende dos papéis de escrita
e da autorização de cada ação. As evidências desta rodada correspondem
a marcos já contabilizados na Sprint 4, que segue em **30/40 (75%)**.
A próxima etapa é validar o SQL e a autoria sintética de escrita com
credenciais próprias de Administrador e Operador antes de habilitar
mutações HTTP. O roteiro está no
[guia de homologação persistente](../database/local/persistent-homologation/README.md).

### Homologação funcional sintética — 19/11/2026

As migrations `homolog-persist-0003` a `homolog-persist-0005` colocaram
CRUD, staging PCDF, revisão e consolidação no cluster privado. O recibo
`2967fa3d-2036-4521-adb8-523fdade300d` comprova o cenário integrado,
incluindo concorrência, idempotência, negações por perfil, interrupção
com `503`, persistência das 37 RAs, versões e auditoria após reiniciar
Next.js e PostgreSQL. A cópia `funcional-b0a88c5432c8bddf.dump` foi
restaurada e 30 tabelas foram reconciliadas.

O staging processou 10.000 associações sintéticas em teste com rollback.
Passaram 246 testes Node, 11 SQL/HBA, 14 de recuperação, TypeScript,
ESLint, contratos/OpenAPI, rotas e build. A homologação técnica passa
para **8/10 (80%)**. A Sprint 4 permanece em **30/40 (75%)**.
O [relatório por fase](../docs/desenvolvimento/relatorio-homologacao-funcional.md)
registra as restrições de CSV/XLSX, de revisão e de aceite visual.

### Finalização da homologação local — 19/11/2026

- `homolog-persist-0006` foi aplicada somente no cluster privado
  `7709847064550752852`, porta 55473. Foram homologados o XLSX de 34
  colunas, o replay entre CSV e XLSX, a guarda do original, a Central
  com busca e paginação e as permissões de decisão administrativa.
- A regressão SQL, HTTP e Edge confirmou catálogo de 37 RAs, CRUD,
  consolidação de uma ocorrência com duas naturezas, totais conciliados,
  histórico e auditoria depois do reinício. O backup final reconciliou
  31 tabelas em um banco separado.
- Passaram 249 testes Node, 11 SQL/HBA, 14 de recuperação, typecheck,
  ESLint, contratos/OpenAPI, rotas e build. As nove rotas estão no
  inventário para redesign.

**Homologação persistente local sintética — 10/10 (100%).** A Sprint 4
permanece em **30/40 (75%)**. As decisões sobre identidade e classificação
entre extrações, política de reprocessamento e regras adicionais de
correção seguem abertas. [Relatório e recibos](../docs/desenvolvimento/relatorio-homologacao-funcional.md#finalização-do-xlsx-e-da-central--19112026) ·
[Inventário de telas](../docs/desenvolvimento/inventario-telas-redesign.md)

### Registro de autoria do PR #226

O merge `f98ec07` integrou 12 commits, incluindo a correção de CI
`24bd59f`, posterior à descrição que enumerava 11. A base incorporada
preserva as contribuições verificadas nos PRs #224 e #225. O registro
de autoria identifica os commits de origem por integrante e contém
o texto proposto para retificação documental do PR #226.
[Auditoria de autoria](../docs/desenvolvimento/auditoria-autoria-pr-226.md)
