# Catálogos persistentes — Etapa 2.11

`/ocorrencias` carrega Regiões Administrativas e naturezas criminais originais
exclusivamente pelas duas rotas GET locais:

| Endpoint | Projeção PostgreSQL | Item da resposta |
| --- | --- | --- |
| `/api/v1/catalogos/regioes-administrativas` | `sentinela.regioes_administrativas.id, nome` | `{ id: UUID, nome: string }` |
| `/api/v1/catalogos/naturezas-criminais` | `sentinela.naturezas_criminais.id, descricao_original` | `{ id: UUID, descricao: string }` |

São os campos NOT NULL já permitidos pelos grants por coluna. Nenhuma geometria,
credencial, dado original sensível ou campo administrativo é retornado. A
ordenação usa texto em minúsculas, texto original e UUID como desempate, com
collation `C` explícita. Não há parâmetros, paginação nem truncamento silencioso
dos catálogos. Parâmetros inesperados retornam 400.

## Contratos e autorização

Os schemas Zod estritos estão em `src/contracts/persistent-catalogs.ts`. A resposta
segue `{ success: true, data: { items: [...] }, meta }`, com execução operacional
persistida. UUIDs duplicados, campos extras e valores nulos são rejeitados. Os
exemplos sintéticos do OpenAPI não são dados usados pela aplicação. A versão
legada de catálogo nos metadados identifica o contrato; não homologa cadastros.

Somente sessão local válida e permissão `analisar` permitem consultar. Os três
perfis atuais têm essa permissão. Proxy, handler e repositório preservam os
controles existentes de development, loopback literal e role operacional mínima.
O pool atesta identidade, atributos restritivos e as 19 tabelas com RLS forçado,
usando transações somente de leitura. Não usa conexão administrativa como fallback.
Respostas privadas não são armazenadas em cache. Somente os dois caminhos GET
exatos foram adicionados à lista permitida; não há novas rotas de escrita.

RAs são filtradas pela versão oficial e pelas referências aprovadas de
`local-ra-0002`. Naturezas continuam limitadas pela policy de fonte com
`SENTINELA_TESTE_LOCAL_V1`. O GET de naturezas aceita `q` (busca literal na
descrição original, de 1 a 120 caracteres úteis) e `direction=asc|desc` (padrão
ascendente). O resultado preserva a grafia original. Parâmetros desconhecidos,
repetidos ou inválidos recebem `400` após a validação da sessão. O GET de RAs
continua rejeitando parâmetros. As duas APIs preservam a projeção anterior.

## Natureza original e categoria padronizada

As 41 descrições originais, as 19 categorias originais PCDF e as 20 categorias
padronizadas previstas são conceitos distintos, conforme
[contrato de importação](contratos/importacao-pcdf-v1.0.md). O seletor consulta
somente `naturezas_criminais.descricao_original`. Não fabrica 41 opções, não usa
as oito naturezas demonstrativas e não inventa mapeamento com categorias.

A baseline já modela as três entidades e seus relacionamentos, com UUIDs,
FKs, unicidade versionada e evidência obrigatória para regras homologadas.
A seção 5.2 do contrato lista os 20 rótulos previstos e remete a um relatório
externo para as 41 descrições originais, categorias e frequências. O
[inventário agregado PCDF](catalogos/pcdf-inventario-v1.json) preserva a
seção de naturezas desse relatório. As frequências das 41 descrições e das
19 categorias somam, separadamente, 369.660 associações de origem. A
categoria PCDF `05_ESTUPRO` aparece em duas categorias SENTINELA previstas.
As duas correspondências explicitadas pelo relatório estão no inventário como
exemplos documentados. Frequências marginais não comprovam os pares das demais
descrições nem o seletor de tentativa. A carga e as regras oficiais dependem
da matriz conjunta homologada, vigência, evidência e autorização. A consolidação
isolada usa as regras sintéticas aprovadas para o ensaio.

A [matriz de correspondências PCDF](catalogos/pcdf-correspondencias-v1.json)
atribui IDs internos às 41 descrições do inventário e registra o hash da
fonte. As duas relações explícitas ficam documentadas com justificativa.
As demais mantêm a categoria pendente. Uma regra só pode entrar na carga
após confirmação de tentativa, vigência, evidência e aceite do responsável.

### Requalificação do Desenvolvimento Autônomo 01

Em PostgreSQL 17.11/PostGIS 3.6.2 descartável, o handler HTTP retornou 37 RAs
e duas naturezas sintéticas aos três principais de ensaio. A busca por `%_`
usou os caracteres literalmente, a ordenação reversa foi confirmada e a
fixture de outra fonte ficou invisível à reader. Listagem e detalhe de
ocorrências passaram com filtros combinados, paginação e `404` para uma fixture
invisível pela RLS. O cluster terminou parado. O harness fornece os principais
e chama os handlers em loopback. Login e cookies do Next.js com PostgreSQL
operacional permanecem fora desse resultado.
[Recibo local](../tmp/ra-operational-homologation/rls-sandbox-ee66aee2-be4c-42ae-b110-a62f11a56c56/evidence/ra-operational.json)

## Interface

Os seletores acessíveis mostram nomes e mantêm UUIDs como valores internos.
Aplicar combina RA/natureza com busca e datas, preserva ordenação e volta à
página 1. Limpar remove os filtros. Alterar um campo não dispara nova consulta;
os catálogos não são recarregados ao filtrar ou paginar ocorrências.

Cada catálogo tem carregamento, vazio e erro independentes. Se vazio, o seletor
fica desabilitado com mensagem explícita. HTTP 401 oferece novo login; 403 não
oferece repetição inútil; rede, contrato inválido e indisponibilidade permitem
nova tentativa. Opções antigas não permanecem disponíveis durante erros.
Cancelamento e validação após a resposta impedem aplicar consultas obsoletas.
Não há substituição por mocks em nenhum estado.

## Verificação reproduzível

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:contracts
pnpm check:routes
pnpm check:occurrences
node scripts/build-validation.mjs
```

O ensaio de navegador usa um servidor exclusivo em loopback na porta 3317 e
contas sintéticas. As opções preenchidas, erros e concorrência são exercitados
com respostas contratuais somente no teste. Verifica os dois temas em 1366, 768,
390 e 320 px. Sem credencial operacional, o HTTP real deve retornar 503 aos
autenticados e 401 aos não autenticados; isso não comprova consulta PostgreSQL.

Para homologar também os dois repositórios de catálogo, os endpoints com os três
perfis e a interface com PostgreSQL real, executar uma única entrada privada:

```powershell
.\scripts\test-local-reader.ps1 -Interface
```

O script solicita a senha operacional existente com entrada oculta e a mantém
somente na memória/ambiente dos processos. Não altera `.env.local`. As respostas
HTTP de catálogo são comparadas integralmente às consultas da mesma role, sem
assumir que estejam vazias. Evidências sanitizadas ficam fora do repositório em
`%USERPROFILE%\.sentinela-local\http-qualification\<UUID>`.

Um resultado vazio não comprova filtragem positiva/negativa de linhas. Essa
homologação RLS permanece a evidência separada do sandbox; não são inseridas
fixtures no operacional. A importação de catálogos reais ou qualquer mudança de
escopo das policies exige planejamento e autorização próprios.

## Arquivos desta entrega

- Backend: `src/app/api/v1/catalogos/regioes-administrativas/route.ts`,
  `src/app/api/v1/catalogos/naturezas-criminais/route.ts`,
  `src/lib/db/catalog-http.ts`, `src/lib/db/catalog-query.ts`,
  `src/lib/db/catalogs.ts`, `src/lib/db/http.ts` e `src/lib/auth/policy.ts`.
- Contratos: `src/contracts/persistent-catalogs.ts`, `src/contracts/examples.ts`,
  `src/contracts/openapi.ts`, `docs/contratos/openapi-v0.1.0.json` e
  `scripts/validate-api-contracts.mjs`.
- Interface: `src/features/Occurrences.tsx`, `src/features/Occurrences.module.css`,
  `src/features/occurrences/CatalogSelect.tsx` e
  `src/features/occurrences/client.ts`.
- Testes e homologação: `tests/persistent-catalogs.test.mjs`,
  `tests/fixtures/catalog-pool.mjs`, `tests/api-contracts.test.mjs`,
  `tests/persistent-occurrences.test.mjs`,
  `scripts/check-persistent-occurrences.mjs`,
  `scripts/homologate-local-reader.mjs` e `scripts/test-local-reader.mjs`.
- Documentação: este arquivo, `docs/autenticacao-local.md`,
  `docs/ocorrencias-persistentes.md` e `docs/postgresql-leitura-local.md`.

## Evidência de validação em 11/11/2026

A suíte Node aprovou 147 testes, incluindo nove novos grupos de catálogos.
Contratos/OpenAPI: 28 schemas, 13 paths, 15 operações e 31 payloads validados.
TypeScript, ESLint, build Next.js isolado e verificação estática das rotas também
passaram. O build incluiu os dois novos handlers dinâmicos de catálogo.

O relatório privado `6e17a45c-54fe-4210-bf3c-3b3b3272d03d` registra 220 PASS,
zero FAIL e zero UNKNOWN, incluindo encerramento do servidor próprio e remoção
de suas contas/sessões sintéticas. Os testes abrangem HTTP com sessões dos três
perfis e a interface com respostas contratuais, ambos os temas e quatro larguras.
O relatório declara `databaseTested=false`; um grupo de semântica PostgreSQL/RLS
não vazia ficou explicitamente `NOT_EXERCISED`. As execuções anteriores com
falhas no próprio ensaio foram preservadas; não substituem esse resultado final.

Consultas administrativas separadas, exclusivamente de metadados e em transação
READ ONLY, confirmaram as colunas/grants reais e o estado preservado do banco:
PostgreSQL 17.11, PostGIS 3.6.2, 19 tabelas com RLS ENABLE/FORCE, seis policies,
48 grants SELECT por coluna e ledger `0001`–`0005` mais `local-read-0001`.
Isso não substitui autenticação direta como `sentinela_local_reader`. A credencial
operacional não estava configurada no ambiente do executor; os novos GETs com
HTTP 200 e PostgreSQL real permanecem pendentes do comando interativo acima.
