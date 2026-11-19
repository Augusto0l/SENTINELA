# Sprint 4 · Homologação isolada da Etapa 2.17.6

## Checklist da verificação no servidor operacional local

**Encerrada em 100% (seis de seis marcos).** O ensaio independente com
`scripts/test-local-reader.ps1` registrou `HTTP_AND_REAL_POSTGRESQL` e
`databaseTested=true` no recibo privado
`a65dbd7f-7b70-4c48-b5d3-2ac93e989a58`. São 198 verificações anunciadas
e duas aprovações de limpeza registradas após a execução, sem falhas.
O responsável já havia informado login
com Administrador, Operador e Analista e observou HTTP 200 nos dois
catálogos, na listagem de ocorrências e no analytics após iniciar o
Next.js com `test-local-reader.ps1 -ApplicationOnly`.

- [x] Resposta direta do servidor existente em loopback. `/login`
  respondeu 200. Os quatro GETs retornaram 401 e `private, no-store`
  sem sessão.
- [x] Conferência offline. Os 37 pares UUID/nome do recibo pós-COMMIT
  coincidem com os vínculos. Há 37 UUIDs, códigos e identificadores de
  feição distintos. Os metadados do recibo coincidem com o payload
  aprovado e os códigos e identificadores coincidem com o GeoJSON.
- [x] Suíte direcionada aprovada em 32 testes. Contratos/OpenAPI aprovados.
- [x] HTTP 200 autenticado por perfil nos quatro GETs. Os corpos de RAs
  corresponderam à consulta independente da reader, que confirmou os 37
  pares UUID/nome dos vínculos.
- [x] Esquemas validados nas respostas da base observada. O catálogo de
  RAs aceitou somente UUID e nome por item. Geometria, ledger e metadados
  protegidos ficaram fora das respostas verificadas. Houve HTTP 400 para
  parâmetros inválidos e HTTP 401 sem sessão, com sessão inválida ou expirada
  e após logout dos três perfis.
- [x] Reader operacional atestada em PostgreSQL 17.11 e PostGIS 3.6.2.
  O pool executou transações `READ ONLY` e as tentativas de escrita HTTP
  foram recusadas. O ensaio não criou fixtures nem alterou dados operacionais.

O catálogo de naturezas e a listagem de ocorrências estavam vazios no escopo
visível da reader. O detalhe de UUID ausente retornou 404. O recibo marcou
como `NOT_EXERCISED` o cenário HTTP com múltiplas naturezas e linha oculta
por RLS em base preenchida. Essa cobertura permanece para a homologação
das ocorrências com dados de teste em cluster isolado.
[Procedimento operacional](catalogo-ras-carga.md#verificação-http-independente-e-credencial-pendente)

## Resultado operacional posterior

O Next.js também passou por uma execução independente em loopback, em modo
`--no-session-only`. Foram 11 requisições HTTP e a atestação do listener, com `401` nos dois GETs de
catálogo sem sessão e com cookie inválido. O recibo
`d54213a0-a5da-4b90-85ec-b3b94368aa6a` confirma o encerramento do servidor,
sem criação de contas ou conexão PostgreSQL. Os GETs autenticados e o login
com as contas existentes aguardam a credencial da reader.
[Procedimento de configuração](catalogo-ras-carga.md#verificação-http-independente-e-credencial-pendente)

Passaram 233 testes automatizados, sem falhas, cancelamentos ou ignorados.
Também passaram TypeScript, ESLint, contratos/OpenAPI, rotas estáticas,
build de produção isolado, parser PowerShell e `git diff --check`.

Em 18/11/2026, a aplicação autorizada confirmou COMMIT com as 37 RAs. O
reconciliador independente retornou `PERSISTED` e a conferência pós-COMMIT
confirmou 37 UUIDs distintos, 8 policies e fingerprints idênticos nas 17
tabelas fora da carga e do ledger. A reader verificou 37 registros por
`SET LOCAL ROLE`; os GETs operacionais ficaram pendentes por ausência da
credencial na configuração da aplicação.
[Recibo técnico de aplicação](catalogo-ras-carga.md#aplicação-operacional--18112026)

## Requalificação do executor com reconciliação

**Parecer: APROVADO COM RESSALVA para o escopo isolado.** Todos os seis cenários
passaram na variante com reconciliação. O HTTP usa as consultas, o handler e a
reader reais. O pool do Next.js exige a porta e a base operacionais, portanto
o harness usa uma conexão de laboratório e principais de teste. A cobertura
HTTP integrada com login, cookies e sessão reais permanece pendente.

O cluster descartável `d19ec83d-669d-4198-93a0-84304d3904ae`, system identifier
`7709488496701050112`, usou PostgreSQL 17.11, PostGIS 3.6.2 e
`Portuguese_Brazil.1252`. O estado final foi `STOPPED`.
[Recibo requalificado](../tmp/ra-operational-homologation/rls-sandbox-d19ec83d-669d-4198-93a0-84304d3904ae/evidence/ra-operational.json),
SHA-256 `db3e3d1d6c395b8f6c97ddd3b1fa551c15b73b6c6c7c0f7013845af1810bac6e`.
O digest do manifesto ensaiado foi
`798ab31229f2c1ab9ddf019dc6aa1370364b7df146d96a4ba4f43049315dfe54`.

| Cenário | Evidência da requalificação |
| --- | --- |
| A | 37 inserções a partir do baseline vazio. Referências exatas, geometrias comparadas por EWKB e sete entradas no ledger após `local-ra-0002`. |
| B | Zero inserções, zero duplicatas, 37 UUIDs preservados e ledger idêntico. |
| C | Erro nativo `22012` dentro da migration e, separadamente, após 37 inserts. Ambos preservaram schema, ledger e catálogo iniciais. Manifesto e hash adulterados, ledger incompatível, catálogo parcial e geometria divergente foram rejeitados. |
| D | Reader real com 37 RAs, duas fixtures ocultas e uma fixture oficial inválida recusada pelo CHECK. Permaneceram 19 tabelas com RLS forçada, 48 grants de coluna e 8 policies. Sete acessos indevidos foram rejeitados. |
| E | Uma nova conexão `READ ONLY` executou a reconciliação real. Com backend terminado antes do COMMIT, retornou `NOT_PERSISTED`. Após commit confirmado pelo servidor e confirmação suprimida para o executor, retornou `PERSISTED`. Com fixtures divergentes retornou `DIVERGENT_OR_INCONCLUSIVE`. Nenhuma tentativa automática. |
| F | 6 respostas 200, 2 respostas 401 e 1 resposta 400. Contratos estritos validaram os 37 pares UUID/nome das RAs e a lista vazia de naturezas. Um pedido de detalhe de RA retornou 404 no harness, consistente com a ausência de rota de detalhe para esse catálogo. |

O fingerprint dos pares código/UUID foi
`56f4a1b5b74bed648bd2ba65e8784bac0162d46f4814496c29baac636fcd2c88`.
O teste de perda de confirmação após o COMMIT usou uma reexecução idempotente
e um marcador descartável na própria transação para comprovar o commit dessa
tentativa. O resultado `PERSISTED` do reconciliador identifica o estado do pacote.

A auditoria dos artefatos do backup de 13/11 devolveu `ARTIFACTS_VERIFIED`
para as 19 tabelas. O confronto com o estado atual requer uma autorização
administrativa vigente. Não houve conexões ao banco operacional nem ao Supabase.

A suíte Node executou 232 testes, todos aprovados, com zero falhas, cancelamentos
ou ignorados. TypeScript, ESLint, build de produção isolado, contratos/OpenAPI,
rotas estáticas e `git diff --check` passaram.

A árvore avaliada estava em `feat/sprint4-auth-local-mapas`, HEAD
`fe874f68e4d6e36f9661fb00b683ecddad4c3ea9`, com alterações locais
preexistentes, inclusive os artefatos da preparação operacional. A migration
`0002_ra_official_catalog.sql` preservou o SHA-256 já homologado. A nova versão
do manifesto cobre as mudanças no executor e nas consultas de inspeção e
comparação. O arquivo de vínculos operacionais permaneceu com zero entradas.

## Homologação anterior

**Parecer em 18/11/2026: APROVADO COM RESSALVAS para o escopo isolado.**
Os seis cenários foram executados. A reconciliação de COMMIT incerto exige
consulta independente em leitura. O ensaio HTTP cobre o handler compartilhado,
com principais de teste, e a conexão real da reader.

## Ambiente e evidência

- PostgreSQL 17.11, PostGIS 3.6.2, locale `Portuguese_Brazil.1252`.
- Cluster descartável `24586753-09de-425d-a90f-c7a131c47d22`, system identifier
  `7709476315169859676`. O estado final foi `STOPPED`, sem `postmaster.pid`.
- SHA-256 do manifesto operacional `0141755fb66ca4f86278df852db2a97cea75094ae5e0d4111473e20b851a3ae9`.
- [Recibo final local](../tmp/ra-operational-homologation/rls-sandbox-24586753-09de-425d-a90f-c7a131c47d22/evidence/ra-operational.json),
  SHA-256 `e2ecb4744fdeeb78cb1bfab03c819edf1877f136157d3a33eba9321905a623dd`.
  Os recibos e logs dos clusters são artefatos locais privados.

## Resultados

| Cenário | Resultado observado |
| --- | --- |
| A · Carga inicial | Partiu de 0 RAs, inseriu 37 e reutilizou 0. Códigos, nomes e metadados coincidiram com o payload. O executor conferiu a geometria por EWKB e o ensaio verificou 37 UUIDs distintos. Uma coluna de referência e duas policies foram adicionadas. |
| B · Idempotência | Inseriu 0, reutilizou 37, encontrou 0 duplicatas e preservou todos os UUIDs, o conteúdo e o ledger. |
| C · Rollback | Uma divisão por zero real, SQLSTATE `22012`, ocorreu depois dos 37 inserts e antes do COMMIT. O rollback preservou 0 RAs, 6 policies e 6 entradas no ledger, sem a coluna ou o schema novos. O executor também rejeitou uma fixture de catálogo parcial e uma geometria divergente sob o mesmo código. |
| D · RLS | A reader real viu 37 registros e duas fixtures ficaram invisíveis, incluindo uma que seria admitida pela policy sintética anterior. Uma tentativa de inserir fixture na versão oficial sem referência aprovada foi rejeitada pelo CHECK. Permaneceram 19 tabelas com RLS forçada e 48 grants de coluna. Das 8 policies, as duas novas são permissiva e restritiva para SELECT. Sete acessos indevidos falharam com `42501`, incluindo geometria, metadados, ledger, usuários e escrita. |
| E · Confirmação incerta | Antes do COMMIT, o backend foi terminado e a leitura independente confirmou rollback. No outro caso, o COMMIT chegou ao servidor e o harness perdeu a confirmação na fronteira com o executor. A leitura de um marcador transacional descartável confirmou o commit. O executor sinalizou `unknown` nos dois casos e encerrou sem nova tentativa. O catálogo e os UUIDs foram preservados. |
| F · HTTP | Foram 6 respostas `200` nos dois GETs com Administrador, Operador e Analista, 2 respostas `401` sem sessão e 1 resposta `400` para query indevida. Os GETs retornaram 37 RAs e 0 naturezas no baseline, com validação estrita dos contratos e `Cache-Control: no-store`. |

O ledger inicial tinha `0001` a `0005` e `local-read-0001`. Após a carga e a
reexecução, continha essas seis versões mais `local-ra-0002`, com uma entrada
por versão. O fingerprint SHA-256 dos pares código/UUID ordenados foi
`406c7cfe53ff4e41da2eac51184c74b47c81bd3c294c17af3277095046c05762`.

## Validações e limitações

- Passaram 33 testes Node direcionados, TypeScript, ESLint, build Next.js
  isolado, validação dos contratos e verificação offline do backup.
- Houve três tentativas preservadas antes do PASS. A primeira falhou na
  consulta de locale, a segunda na atestação inicial e a terceira na consulta
  que conferia os UUIDs. Os quatro clusters terminaram parados. Na segunda
  tentativa, o encerramento exigiu conferência separada do diretório, PID e
  arquivo de controle do cluster descartável.
- O executor não tem acesso ao resultado do COMMIT quando perde a confirmação.
  Nessa condição, o responsável deve reconfirmar catálogo e ledger antes de
  decidir sobre nova execução. A comparação do backup com o estado atual, o
  preflight operacional e a autorização de carga continuam pendentes.
- Não houve conexões com o banco operacional ou Supabase, alteração de contas
  demonstrativas, geração de vínculos operacionais, commit ou push.

## Escopo e método

O [harness de inicialização](../database/local/ra-operational/homologate.py)
cria um diretório privado novo, atesta o cluster pelo PID, pelo system identifier,
pelo listener e pelo HBA e o encerra ao final. A conexão PostgreSQL é restrita a
`127.0.0.1:55432/sentinela_rls_sandbox`. O subprocesso recebe credenciais
descartáveis via stdin e ignora configurações PostgreSQL herdadas, URLs de banco
e variáveis Supabase. O servidor HTTP também escuta exclusivamente em loopback.

O [harness de cenários](../database/local/ra-operational/homologate.mjs) chama
`applyCatalog` com a migration, as consultas e o payload verificados pelo
manifesto da variante operacional. A consulta original de preflight é exercitada
contra o alvo de laboratório e precisa recusá-lo. O adaptador troca somente
banco, porta e system identifier na segunda consulta. O CLI operacional
`--apply` fica fora do ensaio, pois aponta exclusivamente para o destino
operacional. A verificação do backup documentado foi repetida offline.

O v2 homologava um loader instalado no banco, com proteção de sandbox,
injeção de falha no SQL e fixtures negativas no próprio pacote. A variante
operacional executa a carga pelo cliente, registra `local-ra-0002` no ledger
e inclui migration e dados na mesma transação. Ela exige metadados exatos,
geometria e referência fixas para linhas com a versão oficial. As falhas
desta homologação são injetadas pelo adaptador de laboratório e os scripts de
carga operacionais não foram modificados.

Os ensaios HTTP usam o handler, a política de aplicação, as consultas e os
contratos do projeto com uma reader PostgreSQL real. O harness fornece os
três principais de teste em memória e encaminha os pedidos ao handler por HTTP
local. Login, cookies da aplicação e o ciclo de sessões do Next.js ficam fora
do ensaio. Os três perfis compartilham a mesma role SQL.

Para reproduzir com um novo cluster descartável:

```powershell
python -B database/local/ra-operational/homologate.py --isolated-only
```
