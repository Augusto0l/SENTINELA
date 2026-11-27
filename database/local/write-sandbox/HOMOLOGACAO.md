# Homologação SQL real — sandbox experimental

## Etapa 2.15 — edição/inativação e regressão de cadastro

12/11/2026, execução entre 09h13 e 09h14 (America/Sao_Paulo).
**PASS somente no sandbox sintético; nenhuma escrita operacional habilitada.**

- Executor: `python -B database/local/write-sandbox/run-mutations.py --execute`.
- UUID: `70816e39-bbe0-4522-bcd1-dde592b2387c`.
- System identifier: `7707256925270769960`.
- Endpoint: `127.0.0.1:55432/sentinela_rls_sandbox`.
- PostgreSQL 17.11 / PostGIS 3.6.2, identidade/HBA/PID atestados pelo controlador.
- Estado final: STOPPED, encerramento identificado aprovado, postmaster.pid ausente.
- 47 grupos reais de mutações PASS; 45 grupos reais de cadastro novamente PASS.
- 13 ocorrências sintéticas, seis históricos técnicos e três retiradas lógicas;
  contexto vazio, zero usuários humanos e reader NOLOGIN/senha NULL.
- Nenhuma conexão ao operacional/Supabase pelo executor. Manifestos anteriores
  preservados; não se afirma monitoramento de alterações por terceiros.

Raiz privada: `%USERPROFILE%/.sentinela-local/rls-sandboxes/rls-sandbox-70816e39-bbe0-4522-bcd1-dde592b2387c`.
Evidências em `evidence/mutation-completion.json`, `mutation-tests.json`,
`create-regression.json`, `mutation-final-snapshot.json`; manifesto registra hashes
exatos dos artefatos executados, sem credenciais.

| Artefato | SHA-256 |
| --- | --- |
| `mutation-tests.json` privado | `52e7e25a4197152526b9f79b03b8978368de6d4bebad04372568657dd267f00e` |
| `create-regression.json` privado | `108f0d147eb12633a1c2cb1cddbdab59939e9f747573d7bc435d1d2ed15135d3` |
| `mutations.sql` | `f6bdac1140e371824d34e7fc326c3aec84b015acc90cbc45a42d183d04321f97` |
| `mutation-fixtures.sql` | `e6758d18f29ca3558bbe37bbd0513f2428ce159011fa6363fc9ce500b439cce5` |
| `qualify-mutations.mjs` | `0033e46b527c68e8e60702eda91e6221529571d649637b62c4d586dd3824442d` |
| `run-mutations.py` | `f306a4d383dd535637fbee0092705ad6e1c8de6eb62ffc66695f39f32a2db279` |
| `service.ts` | `1b0afea57a8ebd7668867df57e1db1c33a4d32de340420e58227eabca59a3861` |
| Referência estrutural privada da 2.14 | `7a58ecbb544924fc4627296b46ee5c7f059e3e2c6c0783b574510290dc0c63bc` |

Os 55 triggers permanecem ativos; tabelas, índices, constraints, domínios e RLS
originais preservados. Duas funções de trigger evoluídas explicitamente; demais
definições comparadas integralmente. Catálogos/ACLs permaneceram iguais durante os
testes. Auditoria é técnica, não humana. Veja [MUTACOES.md](MUTACOES.md).

Concorrência real: uma edição confirmada e um conflito entre duas chamadas com a
mesma versão. Rollback real: pai/vínculos/histórico preservados em falha de natureza,
falha injetada na auditoria e erro SQL do chamador após a função.

Tentativa anterior com erro 42702 preservada no cluster
`0c04f865-c0e8-433e-b6d3-2063e96883c1`, encerrado antes da nova execução.
Correção realizada no artefato, sem alterar o cluster anterior.

Validações gerais desta revisão, todas com código de saída zero:

| Verificação | Resultado |
| --- | --- |
| Testes Node completos | 174 aprovados |
| Testes SQL reais | 47 grupos de mutações + 45 de cadastro aprovados |
| TypeScript principal e experimental | Aprovados |
| ESLint | Aprovado, zero warnings |
| Zod/OpenAPI | 35 schemas, 13 paths, 15 operações, 31 payloads válidos |
| Rotas | Oito páginas planejadas e 326 imports resolvidos; análise estática |
| Build Next.js isolado | Aprovado |
| git diff --check | Aprovado; avisos LF/CRLF preexistentes |

Sem novos endpoints de escrita Next.js ou escrita na interface. HEAD preservado
`fe874f68e4d6e36f9661fb00b683ecddad4c3ea9`, sem commits. As alterações locais
anteriores e `Breadcrumb.tsx` foram preservados. Não houve instalação no banco
operacional, mudança de credenciais existentes ou acesso ao Supabase.

## Etapa 2.14 — evidência histórica de cadastro

Data: 11/11/2026. **PASS no ambiente sintético isolado; escrita operacional não habilitada.**

## Execução aprovada

- Comando: `python -B database/local/write-sandbox/run.py --execute`.
- UUID: `9fd0814b-92b4-4719-aa94-f5f7a45d78c7`.
- System identifier: `7707046432948192224`.
- Endpoint exclusivo: `127.0.0.1:55432/sentinela_rls_sandbox`.
- PostgreSQL 17.11 / PostGIS 3.6.2 em extensions.
- Estado final do manifesto: STOPPED; postmaster.pid ausente; parada identificada aprovada.
- Raiz privada: `%USERPROFILE%/.sentinela-local/rls-sandboxes/rls-sandbox-9fd0814b-92b4-4719-aa94-f5f7a45d78c7`.

Evidências privadas sob `evidence`: `write-completion.json`, `write-tests.json`,
`write-child-result.json`, snapshots/fingerprints operacionais antes/depois e
`sandbox-final.json`. Não copiar senhas, registros ou arquivos brutos ao Git.
SHA-256 de `write-tests.json`:
`108f0d147eb12633a1c2cb1cddbdab59939e9f747573d7bc435d1d2ed15135d3`.

## Resultados reais

**45 grupos PASS**, sem equivaler os testes offline à persistência SQL. O serviço
confirmou COMMIT e o instalador reconferiu as linhas por conexão administrativa
exclusiva do sandbox: **7 ocorrências, 14 associações e 7 eventos de auditoria**.
Não são linhas PCDF, usuários reais nem dados do operacional.

Cobertura: cadastro por Administrador/Operador; sessão ausente, adulterada ou
revogada; Analista recusado no serviço e no EXECUTE SQL; campos obrigatórios,
UUIDs/datas/horários/estados; coordenadas obrigatórias, limites numéricos e limite
territorial sintético; RA/natureza inexistentes; vínculo repetido; ator/perfil/ID
forjados; SQL injection como texto literal; idempotência e conflito; cinco
chamadas concorrentes com mesma chave produzindo uma única ocorrência.

Falha ao resolver a segunda natureza, depois do INSERT do pai e primeiro vínculo,
foi revertida integralmente. Comandos manuais distintos não foram fundidos por
semelhança. Um comando SQL válido com GUC de perfil forjado continuou auditado
como serviço Operador e foi encerrado com ROLLBACK, sem aumentar os totais finais.

As conexões técnicas foram autenticadas diretamente, sem SET ROLE como substituto.
Foram recusados DML direto, DDL/TEMP, acesso a usuários, auditoria e ledger privado,
além da tentativa de desligar a aplicação de RLS por setting da sessão. Roles
sem atributos administrativos, memberships ou propriedade de tabelas. Produção,
UUID de cluster divergente e credencial runtime postgres foram recusados.

Os registros ficaram `em_revisao` e `referencia_pendente`, com classificação
pendente e autoria `servico`; nenhuma localização/identidade humana foi homologada.
A fixture de território é explicitamente sintética, não limite oficial do DF.

## Preservação e tentativas anteriores

As definições originais de tabelas, colunas, constraints, índices, triggers,
funções e domínios coincidiram antes/depois no sandbox. RLS ENABLE/FORCE das
19 tabelas preservado. Há apenas os novos objetos/ACLs/policies de ensaio,
descritos no [README](README.md); nenhuma trava original foi retirada.

Snapshots completos e fingerprints das 19 tabelas operacionais coincidiram antes
e depois; os hashes de todos os manifestos anteriores permaneceram idênticos.
Nenhuma escrita do serviço usa 5432 ou credencial administrativa. Não houve
conexão ao Supabase, mudança em senha existente ou uso das contas locais de login.

As três tentativas anteriores foram preservadas e paradas, sem transformar FAIL
em PASS: `b96b9299-5844-4999-9c83-828b6f8c83aa`,
`1822317e-70b2-4fff-86d8-7eaccd50da85` e
`7c7c912c-1bd4-4c66-aa52-5c98e4811e77`.
A primeira detectou precedência incorreta na validação JSON SQL; as duas seguintes
gravaram corretamente mas o teste extra tentou ultrapassar CONNECTION LIMIT 3
(SQLSTATE 53300). Corrigidos o agrupamento JSON e a ordem de fechamento dos pools,
sem ampliar privilégios/limites. A execução final repetiu o ensaio em outro cluster.

## Limites e próxima etapa

Qualidade final: **167 testes automatizados PASS**, incluindo cinco novos grupos
offline de contrato/isolamento; typecheck da aplicação e typecheck separado do
serviço experimental aprovados. ESLint, parser SQL (44 statements de preparação),
contratos Zod/OpenAPI, rotas/imports, build Next.js isolado, links documentais e
`git diff --check` aprovados. Os 25 artefatos vinculados ao manifesto final
continuaram com os hashes registrados. Esses testes offline/build são evidências
separadas dos 45 grupos do ensaio com PostgreSQL real.

Não foram homologados usuário humano, Auth definitivo, cartografia DF, deduplicação
manual de negócio, importação PCDF, interrupção de rede no COMMIT, edição ou
inativação. Não existe endpoint POST na aplicação principal. Aprovação futura de
identidade/escopo e revisão da auditoria continuam obrigatórias antes de qualquer
conexão dessa escrita ao fluxo real. O próximo passo é revisar a evidência e o
contrato de cadastro no sandbox, sem promover automaticamente para o operacional.
