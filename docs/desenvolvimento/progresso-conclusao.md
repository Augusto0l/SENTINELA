# Progresso da conclusão

## Auditoria inicial — 18/11/2026

- Branch `feat/sprint4-auth-local-mapas`, HEAD
  `fe874f68e4d6e36f9661fb00b683ecddad4c3ea9`. A árvore continha 68 arquivos
  rastreados modificados e 143 não rastreados antes desta execução.
- A [Sprint 4](../../sprints/sprint-04.md) registra o CRUD isolado e a carga
  anterior das 37 RAs. O [pipeline PCDF](../importacao-pcdf-sandbox.md) já
  preservava origem e staging, com qualificação de 10.000 linhas. Os
  pontos pendentes eram promoção, Central no Next.js e autorização humana.
- [Analytics](../analytics-postgresql-local.md) reaproveita a mesma consulta
  para Dashboard e Mapa. O SQL real e o teste responsivo com respostas
  controladas têm evidências próprias. A contagem geral usa ocorrências
  distintas. A série e o mapa excluem dimensões ausentes conforme o contrato.
- [Backup](../backup-recuperacao-postgresql-local.md) e
  [implantação](../guia-implantacao-sprint-04.md) já descrevem o restore
  lógico histórico, a guarda de ambiente e a separação entre local e hospedado.
- Próxima atividade deste marco: ampliar o pipeline existente para promover
  grupos sintéticos elegíveis e testar os invariantes no cluster descartável.

## PCDF, Central e relatório agregado — 18/11/2026

O ensaio SQL do pipeline registrou sete etapas aprovadas, incluindo
10.000 linhas, repetição idempotente, rollback e promoção. No lote de
promoção, duas linhas entraram na mesma ocorrência e quatro permaneceram
pendentes por falta de regra ou conflito. Chave reapresentada em outra
entrega permaneceu pendente. O cluster parou sem conexão operacional.
Recibo `pcdf-staging.json`, execução `944d33db-42e2-4cfc-a54c-4aa8a0663b6a`.

O primeiro ensaio Next.js completo produziu 15 grupos aprovados e confirmou
dois arquivos preservados byte a byte, uma decisão do Administrador, dois
vínculos de origem e uma promoção. Recibo `mutation-completion.json`,
execução `c75d0e01-9d74-49be-a615-ce6dac667ec5`, SHA-256
`1d14b7429179c1f214c14a5d9bc717d2cd3db5a24aeccf24058104f9589c425a`.

O relatório agregado do projeto irmão contém as 41 descrições e as 19
categorias PCDF. Cada distribuição soma 369.660 associações. O inventário
preserva as 20 categorias previstas e dois exemplos explícitos do grupo
`05_ESTUPRO`. A seção de exemplos de registros do relatório ficou fora
do artefato. A matriz conjunta de classificações continua pendente.
[Inventário validado](../catalogos/pcdf-inventario-v1.json)

## Backup — 18/11/2026

O SHA-256 do backup pré-RA conferiu. O restore requalificou as 19 tabelas
em PostgreSQL novo, sem divergência de schema ou dados. A tentativa sobre
o schema já presente foi revertida e a origem recebeu zero conexões.
O comando de restore mediu 2,063 s no ensaio, sem incluir o tempo de
provisionamento do cluster. A bateria de recuperação passou 14 testes.
Recibo `restore-requalification.json`, execução
`8ff2fbba-a986-40fa-b352-9021c94bdcc8`. RPO/RTO do estado atual exigem
um novo teste autorizado. [Procedimento](../backup-recuperacao-postgresql-local.md)

## Homologação integrada final do PCDF e analytics

Em Next.js 16.4.6 e PostgreSQL 17.11/PostGIS 3.6.2, as suites de
cadastro e mutações passaram 45 e 48 verificações. O Next.js e o navegador
passaram 16 grupos. O recibo registrou dois uploads com bytes preservados,
decisão individual do Administrador, promoção atribuída ao Operador e
duas associações para a mesma ocorrência. A hora corrigida chegou à
ocorrência e o valor original no CSV permaneceu vazio. A listagem exibiu
o mesmo registro. Dashboard e Mapa leram o mesmo total, com duas naturezas,
uma contagem na categoria, um mês e nenhum ponto sem CRS confirmado.

Recibo `mutation-completion.json`, execução
`1eb99e9a-a997-4435-b129-1c3bd6b4a111`, SHA-256
`00db64b6aa5f17cc3fa7f929e3b5f1e3495083a05b30b67e9ae9eb4ddab2114c`.
O controlador registrou zero conexões operacionais e estado `STOPPED`.
Em iterações anteriores foram corrigidas uma referência ambígua de
policy, a codificação de fixtures Windows, o hash de um artefato SQL
já homologado, a validação OpenAPI do CSV e a espera da linha renderizada.

## Dependências e preparação de publicação

A auditoria inicial retornou 15 alertas, incluindo dois críticos. O Next.js,
o SWC WASM e o preset ESLint passaram de 16.3.6 para 16.4.6. A atualização do
lockfile também resolveu `source-map-js` 1.2.2 e a dependência
`minimatch` 11.0.9 pela cadeia `typescript-eslint` 8.73.0. O
`pnpm install --frozen-lockfile` com pnpm 10.34.3 e a auditoria
final passaram. O registro retornou zero alertas conhecidos no lockfile.
[Advisory do Next.js](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw)

## Qualidade

Passaram 241 testes Node no lockfile final, com zero falhas e zero
ignorados. Passaram 11 testes SQL/HBA e 14 testes de recuperação.
TypeScript, ESLint, PostCSS/Tailwind, contratos e OpenAPI, verificação
de nove páginas planejadas e build de produção também passaram.
O OpenAPI contém 18 caminhos e 21 operações, incluindo as propostas.
O build registrou as quatro novas rotas API e a página da Central.
A regressão responsiva de ocorrências e segurança HTTP acrescentou
235 verificações aprovadas com respostas contratuais. Ela usou um servidor
loopback e tem recibo separado da homologação PostgreSQL, identificado por
`a5ec47bb-8c22-4f55-848a-01611080a037`. O `git diff --check` passou.

## Parecer por módulo

| Módulo | Pontos | Estado |
| --- | ---: | --- |
| CRUD persistente | 3/5 | 5/5 no laboratório. A escrita operacional exige autorização e identidade vinculada. |
| Catálogos | 4/5 | RAs e inventário reconciliados. A matriz criminal conjunta e a carga aprovada estão pendentes. |
| Importação PCDF | 4/5 | Fluxo integrado sintético. A carga real e o reprocessamento versionado dependem das regras aprovadas. |
| Central de Revisão | 4/5 | Fila de staging, decisões e história integradas. A cobertura de outros campos e a correção pós-consolidação estão pendentes. |
| Dashboard | 4/5 | Leitura e contagem distintas no navegador com PostgreSQL. Falta aceite com a reader do destino. |
| Mapa Criminal | 4/5 | Fluxo PostgreSQL e cartografia preservados. Falta qualificar referências espaciais dos dados reais. |
| Segurança | 4/5 | Sessões, permissões, auditoria, RLS isolada e dependências verificadas. Auth e RLS hospedados exigem fase própria. |
| Preparação de publicação | 3/5 | Build, guia, guardas e restore histórico verificados. Faltam staging hospedado e deploy autorizado. |
| Sprint 4 | 30/40 | 75% pela régua de [critérios](plano-conclusao-sentinela.md#critérios-de-progresso). |

## Arquivos desta execução

| Módulo | Criados e modificados |
| --- | --- |
| Banco e importação PCDF | `database/local/pcdf-sandbox/analytics.sql`, `catalog-fixtures.sql`, `consolidate.sql`, `workspace.sql`, `workspace.py`, `pipeline.py` e `qualify.py`. |
| Homologação e segurança SQL | `database/local/write-sandbox/run-mutations.py`, `database/local/write-sandbox/qualify-next.mjs` e `database/local/tests/test_static.py`. |
| Rotas Next.js | `src/app/api/v1/importacoes/pcdf/route.ts`, `src/app/api/v1/importacoes/pcdf/[id]/consolidacao/route.ts`, `src/app/api/v1/central-revisao/route.ts`, `src/app/api/v1/central-revisao/[id]/route.ts` e `src/app/api/v1/analytics/persistente/route.ts`. |
| Serviços, contexto e permissões | `src/lib/db/pcdf-workspace.ts`, `isolated-write-mode.ts`, `isolated-occurrence-read.ts`, `analytics-query.ts` em `src/lib/db`, `src/lib/auth/policy.ts` e `src/proxy.ts`. |
| Páginas, navegação e interfaces | `src/app/(sistema)/central-revisao/page.tsx`, `src/app/(sistema)/importar/page.tsx`, `src/app/(sistema)/layout.tsx`, `src/components/Sidebar.tsx`, `src/components/SystemSidebar.tsx`, `src/features/import/PersistentPcdf.tsx`, `PcdfReview.tsx`, `pcdf-client.ts` em `src/features/import`, `src/features/occurrences/IsolatedList.tsx`, `src/features/occurrences/IsolatedCreate.tsx` e `src/features/Dashboard.tsx`. |
| Analytics e contratos | `src/components/analytics/useAnalyticsSource.ts`, `src/components/analytics/usePersistentAnalytics.ts`, `src/contracts/pcdf-workspace.ts`, `src/contracts/persistent-analytics.ts`, `src/contracts/openapi.ts` e `docs/contratos/openapi-v0.1.0.json`. |
| Verificações | `scripts/check-routes.mjs`, `scripts/hosted-env.mjs`, `scripts/validate-contracts.mjs`, `scripts/validate-api-contracts.mjs`, `tests/api-contracts.test.mjs`, `tests/planned-occurrence-writes.test.mjs`, `tests/hosted-env.test.mjs` e `next.config.ts`. |
| Dependências | `package.json` e `pnpm-lock.yaml`. Next.js, SWC WASM e o preset ESLint atualizados juntos com pnpm 10.34.3. |
| Continuidade e guias | `docs/desenvolvimento/plano-conclusao-sentinela.md`, `progresso-conclusao.md` e `pendencias-conclusao.md` no mesmo diretório, `docs/catalogos/pcdf-inventario-v1.json`, `docs/analytics-postgresql-local.md`, `docs/catalogos-persistentes.md`, `docs/guia-implantacao-sprint-04.md`, `docs/importacao-pcdf-sandbox.md`, `docs/contratos/api-v0.1.0.md`, `docs/permissoes-locais.md` e `sprints/sprint-04.md`. |

## Organização da entrega

Sequência proposta para revisão, mantendo os arquivos preexistentes em seus
grupos de trabalho. Primeiro, colocar o inventário agregado e a validação
do catálogo em um PR de dados. Em seguida, separar a camada SQL e o
pipeline PCDF com seus ensaios. O PR seguinte integra importação, Central,
permissões e OpenAPI. Um PR dependente integra a listagem, Dashboard e
Mapa. Isolar a atualização de dependências e a guarda de publicação para
revisão de segurança. Vincular estes documentos e os recibos só ao PR
que contiver as respectivas verificações.

A revisão do importador identificou um componente legado sem referência no
repositório. Ele foi preservado para manter o escopo das alterações.
Os scripts, o GeoJSON fixado, as migrations de baseline e seus recibos
seguem disponíveis para revisão. Git permanece sem commit, push ou merge.

## Preparação para homologação privada

Na entrada desta etapa, a branch `feat/sprint4-auth-local-mapas` estava
em `fe874f68e4d6e36f9661fb00b683ecddad4c3ea9`, com 76 arquivos rastreados
modificados e 162 não rastreados. Foram conferidos os arquivos de migration
local (`0001_read_only` e `0002_ra_official_catalog`), a etapa de Auth
`0006_auth_vinculo_acesso`, os cinco endpoints PCDF/Central, o CRUD,
as consultas PostgreSQL e o runner integrado. A revisão preserva os
recibos da leitura das 37 RAs e a homologação do CRUD.

| Entrega | Alterações e alcance |
| --- | --- |
| Catálogos | `docs/catalogos/pcdf-correspondencias-v1.json` e `scripts/validate-contracts.mjs`. IDs internos, hash do relatório, 2 relações documentadas, 39 pendentes e nenhuma regra aprovada. |
| Identidade | `install.sql`, `consolidate.sql` e `qualify.py` no sandbox PCDF. Serialização entre staging, promoção e revisão. Colisão de candidato entre lotes bloqueia promoção, inclusive quando há espaços nas extremidades. Originais, zeros à esquerda e vínculos por linha continuam preservados. |
| Central | `workspace.sql`, contrato Zod e OpenAPI, `PcdfReview.tsx` e os dois runners de mutações. Flagrante desconhecido pode ser corrigido antes da promoção. O detalhe posterior inclui UUID da ocorrência. Permissões, versão, justificativa e trilha de antes/depois continuam exigidas. |
| Destino e recuperação | `database/release/preflight.psql`, `database/release/README.md` e `qualify_restore.py`. Preflight somente leitura e comparação do inventário depois de rollback. O roteiro separa executor, login de aplicação e reader. |
| Cartografia | Contrato PCDF atualizado após conferência do relatório agregado, exportação IDE/DF, regras territoriais e RFC 7946. Dados geográficos reais exigem confirmação do CRS pelo produtor. |
| Continuidade | Plano, progresso, pendências, relatório Sprint 4 e hash do SQL qualificado no teste estático. |

O avanço local melhora a evidência de critérios já pontuados. Pela mesma
régua, CRUD operacional 3/5, Catálogos 4/5, Importação 4/5, Central 4/5,
Dashboard 4/5, Mapa 4/5, Segurança 4/5 e Publicação 3/5 mantêm a Sprint em
30/40. A [lista de pendências](pendencias-conclusao.md) distingue as
dependências externas da implementação que depende dessas decisões.

### Verificações desta etapa

- O ensaio PCDF SQL passou oito grupos, incluindo staging de 10.000
  linhas e os novos conflitos antes da primeira promoção. O cluster
  descartável encerrou com zero conexões operacionais. Recibo
  `931aee45-8587-4a2a-bf1c-898a16cc8bca` e SHA-256
  `50be318de3a375788072556f8fbc3d4cd9e25f4205598e37a73b550416dd38f3`.
- No Next.js, 45 verificações SQL/serviço de cadastro, 48 de mutação e
  16 grupos HTTP/navegador passaram. Flagrante inválido retornou 422.
  A decisão do Administrador chegou ao caso promovido pelo Operador,
  com dois vínculos originais e dois valores corrigidos sem alterar
  origem. O Analista visualizou o vínculo após a promoção. Recibo
  `d8e34499-f6c7-4527-ad79-03ac910b7bcb` e SHA-256
  `e6874652bc4ca8b662fc71f184fcb723e5421f9f728e678f8cb4f9734814f742`.
- Passaram 241 testes Node, 11 SQL/HBA, 14 testes de recuperação,
  TypeScript, ESLint, OpenAPI, contratos, rotas e build. O hash da
  exportação das RAs conferiu com a referência.
- O restore histórico conferiu as 19 tabelas e os hashes dos dados.
  O preflight recusou o identificador divergente. A reconciliação
  repetida após rollback devolveu o mesmo inventário. O cluster
  encerrou com zero conexões à origem. Recibo
  `e674518b-5973-483d-ae43-9470814751c0`.
- A regressão geográfica passou cinco etapas, com paridade TypeScript
  e PostGIS, geometria oficial preservada, pares ausentes preservados,
  escrita sintética e rollback. Recibo
  `ba572182-acbd-46ca-9916-5ce1269c17c5`.

## Pacote final de homologação privada

Inventário anterior às alterações desta etapa em
[`sprint-04-inventario-homologacao-privada.txt`](../../sprints/sprint-04-inventario-homologacao-privada.txt).
A branch é `feat/sprint4-auth-local-mapas` no HEAD
`fe874f68e4d6e36f9661fb00b683ecddad4c3ea9`. A entrada tinha 77
arquivos rastreados modificados e 165 não rastreados.

| Classe | Revisão proposta |
| --- | --- |
| Código funcional | APIs em `src/app/api/v1`, serviços em `src/lib/db`, telas em `src/features` e controles em `src/proxy.ts` e `src/lib/auth`. Preservar em PRs próprios de Auth/CRUD, PCDF e visualização. |
| SQL e migrations | Revisar baseline e versões já registradas separadamente de `database/local/pcdf-sandbox` e `database/local/write-sandbox`. A promoção operacional exige migrations próprias após aprovações. |
| Testes e contratos | Agrupar testes SQL/HBA, regressões de navegador e OpenAPI com os respectivos fluxos. |
| Documentação e evidências | Incluir em PR de entrega o inventário, as decisões PCDF, o roteiro e os hashes/recibos resumidos. Preservar os recibos completos no armazenamento privado. |
| Temporários e sensíveis | Excluir `tmp/`, builds locais, dumps, logs, arquivos de sessão, contas de ensaio, chaves e `.env.local` das entregas. O inventário de nomes confirmou o arquivo local ignorado. A inspeção por padrões conhecidos encontrou duas URIs de exemplo em testes/documentação, com valores de fixture ou placeholder. |

Divida a revisão em commits de guarda de publicação, infraestrutura de
laboratório, suíte integrada e documentação. Isole as alterações
preexistentes nos PRs funcionais correspondentes. O novo executor
`database/release/qualify-private.ps1` encadeia quatro ensaios já
atestados. Os runners `qualify-next.mjs` e `run-mutations.py` verificam
o estado vazio, a sequência de promoção e CRUD, os atributos do cookie,
a recusa de origem divergente e a matriz de grants efetivos. A guarda
testada em `scripts/hosted-env.mjs` e `tests/hosted-env.test.mjs` passou
a rejeitar `SUPABASE_SECRET_KEY` e `PGPASSFILE`. `.gitignore` e
`.vercelignore` excluem mais tipos de arquivos privados.

A primeira rodada integrada, recibo
`8b0ed32b-834a-4b0c-be95-0f1896c14d84`, encontrou SQLSTATE 42501 sob
concorrência no cadastro manual. A trigger de associações pode planejar a verificação de
proveniência mesmo quando o vínculo é nulo. `setup.sql` e `mutations.sql`
agora concedem somente as colunas de vínculo exigidas pelas verificações
às roles técnicas do sandbox. A baseline e as policies continuam com
RLS forçada. Os logins de aplicação continuam sem escrita direta. A
regressão consulta ambas as tabelas de origem sob as roles manuais e
exige que fiquem invisíveis, inclusive depois da importação PCDF.

O [roteiro de release](../../database/release/README.md) lista a ordem
de instalação, os recursos locais, o restore e os critérios do Preview.
As [decisões de dados](pendencias-conclusao.md#decisões-de-dados-a-solicitar-ao-produtor)
registram fonte necessária, risco, alternativas, aceite e efeito na
importação. A régua de progresso segue em 30/40, com os marcos de
homologação persistente e operação dependentes de autorização.

### Evidências do pacote final

- Restore, preflight e reconciliação aprovados para 19 tabelas, com
  zero conexões à origem. Recibo `017c9939-66ab-4704-bb81-60c7597940b5`.
- Cinco etapas PostGIS e oito grupos PCDF aprovados. Recibos
  `19dbc215-c5e0-4c19-887b-70314de18cc7` e
  `eba5b825-641f-47fd-a716-1042e6dacfc1`. O segundo inclui staging de
  10.000 linhas e bloqueio de colisões entre meses e extrações.
- A segunda execução do roteiro completo passou com 45 verificações de
  cadastro, 48 de mutações e 17 grupos HTTP e navegador. O PostgreSQL
  confirmou os grants efetivos dos três perfis, a separação da reader
  e a invisibilidade da linhagem PCDF para as duas roles técnicas
  de escrita manual. O recibo `0acadcec-9856-488c-9923-62639c490eed`,
  SHA-256 `f42ff05351315b9d2b0e927f1cdefa8f5358b705c0c90cbe82b7fb9d64c5b8a3`,
  registra zero conexões operacionais e estado `STOPPED`. As portas de
  ensaio ficaram livres.
- Passaram a suíte Node com 241 testes e zero falhas ou ignorados,
  11 testes SQL/HBA, 14 testes de recuperação, TypeScript, ESLint,
  contratos/OpenAPI, rotas, build de produção e `git diff --check`.

### Início da homologação persistente local — 19/11/2026

A baseline PostgreSQL/PostGIS foi instalada em cluster privado de homologação
e preservou o inventário após reinicialização. O backup estrutural foi
restaurado em banco separado no mesmo cluster. A integração com aplicação,
a carga das 37 RAs, os perfis e a prova de persistência funcional seguem
pendentes. A Sprint 4 permanece em 30/40 (75%).
[Registro da rodada](../../sprints/sprint-04.md#homologação-persistente-local--19112026)

### Primeira leitura com Next.js no ambiente persistente — 19/11/2026

O cluster privado agora contém as 37 RAs verificadas contra o GeoJSON e
os vínculos aprovados. As migrations `homolog-persist-0001` e
`homolog-persist-0002` provisionaram três logins técnicos de leitura e
atestação do destino sem elevação. Os três perfis autenticados consultaram
o catálogo e as ocorrências vazias antes e depois do reinício de
PostgreSQL e Next.js. Durante a parada do banco, a consulta retornou
`503`.

A régua técnica da homologação passa de 1/10 para **3/10 (30%)**. A Sprint 4
permanece em **30/40 (75%)**. A escrita e a autoria sintética de cada ação
ainda precisam ser qualificadas para Administrador e Operador, com negação
ao Analista e correção administrativa restrita ao Administrador.
[Evidências e roteiro](../../database/local/persistent-homologation/README.md)

### Homologação funcional sintética no cluster persistente — 19/11/2026

CRUD, CSV sintético, revisão de horário e promoção autorizada foram
verificados em fluxo integrado com PostgreSQL, Next.js e navegador.
Listagem, Dashboard e Mapa reconciliaram os totais. Os UUIDs, o
histórico, os vínculos PCDF e o catálogo foram preservados após o reinício.
O backup funcional reconciliou o conteúdo de 30 tabelas em banco separado.

A homologação persistente chegou a **8/10 (80%)**. A Sprint 4 permanece
em **30/40 (75%)**. O relatório indica XLSX, casos adicionais da Central
e validação exaustiva das telas entre as pendências.
[Relatório funcional](relatorio-homologacao-funcional.md)

### Finalização local com XLSX e Central de Revisão — 19/11/2026

`homolog-persist-0006` habilitou XLSX de 34 colunas com original
arquivado e o mesmo staging do CSV. A Central ganhou busca, filtros
combinados, ordenação, paginação e detalhe com lote e histórico.
A regressão confirmou correção exclusiva do Administrador, conflitos
versionados, rollback, replay entre formatos e persistência após
reiniciar PostgreSQL e Next.js. O backup final restaurou e reconciliou
31 tabelas com RLS forçada.

A homologação persistente chegou a **10/10 (100%)** no cenário local
sintético admitido. A Sprint 4 permanece em **30/40 (75%)**. Identidade,
classificação e reprocessamento entre extrações, além das demais regras
de correção PCDF, dependem de decisão institucional. A versão foi
classificada como **APTA PARA USO LOCAL SINTÉTICO**. [Relatório funcional](relatorio-homologacao-funcional.md#finalização-do-xlsx-e-da-central--19112026) ·
[Inventário para redesign](inventario-telas-redesign.md)
