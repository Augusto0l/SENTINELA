# Etapa 2.9 — APIs locais de leitura PostgreSQL

Implementados somente GET /api/v1/ocorrencias e GET /api/v1/ocorrencias/{id}.
As telas e os contratos demonstrativos permanecem separados. Nenhuma escrita,
migration, fixture, mudanca de role/RLS/grant ou conexao Supabase foi executada.

**Estado documental em 11/11/2026:** a execução completa com PostgreSQL real e tela
vazia foi confirmada por leitura do relatório privado: 166 PASS, zero falhas e 54
respostas HTTP 200. Os registros sem credencial abaixo são históricos. Consulte
[a evidência consolidada](#homologação-real-confirmada-em-11112026) para os limites
do aceite; dados operacionais não vazios não foram homologados via HTTP.

## Configuracao privada

O servidor precisa de SENTINELA_LOCAL_READER_URL, sem prefixo NEXT_PUBLIC_.
Formato (substituir o marcador; nao copiar como credencial funcional):

```text
postgresql://sentinela_local_reader:<senha-percent-encoded>@127.0.0.1:5432/sentinela_dev_operacional
```

Essa variavel e exclusiva da aplicacao; SENTINELA_DATABASE_URL continua reservada
para administracao/backup e nunca e usada como fallback. Host literal, porta, banco
e usuario sao fixos. Parametros extras, remotos, postgres e producao sao recusados.
Codificar a senha uma vez com [Uri]::EscapeDataString; nunca passar senha em argv.
Nao modificar SENTINELA_DATABASE_SSLROOTCERT. A conexao nova e TCP local, sem TLS
remoto, com SCRAM existente. .env.local nao foi modificado nesta entrega.

Para configurar a aplicacao, preencher a variavel privada no .env.local ignorado
pelo Git, com a senha EXISTENTE da role, e reiniciar seu servidor local depois.
Nao usar chave Supabase/service_role, senha postgres ou senha demonstrativa.

Para validar SEM escrever senha/URI em arquivos, executar no PowerShell:

```powershell
.\scripts\test-local-reader.ps1
```

O comando pede entrada oculta, codifica a senha uma vez, configura apenas o ambiente
do subprocesso e restaura variaveis anteriores ao terminar. Nao altera .env.local.
Agora encadeia teste real do pool/repositorio e homologacao HTTP dos dois endpoints
num Next separado em 127.0.0.1:3317. Exige porta livre; recusa reutilizar servidor
existente nessa porta. Usa tres contas sinteticas temporarias, sem alterar as contas
do usuario; senhas aleatorias, hashes com salts distintos e diretorio privado NTFS
fora do repositorio. Confirma processo/listener antes de enviar credenciais. Ao final
encerra apenas a arvore de processos comprovadamente criada e remove os arquivos
temporarios de contas/sessoes; relatorio sanitizado permanece privado. Sem fixtures,
escrita, migrations ou Supabase. A saida Next usa diretorio exclusivo por UUID.
Nao testa filtragem positiva RLS nem multiplas naturezas reais num banco vazio.
Na preparação inicial, o modo completo ainda não havia sido executado por ausência
da credencial no executor. Essa limitação histórica foi superada no ensaio privado
conferido em 11/11/2026; não repetir a execução somente para atualizar documentos.
Para executar somente o teste antigo de repositorio: `-RepositoryOnly`.

O modo sem banco foi efetivamente executado com HTTP real:
`node --conditions=react-server --experimental-strip-types scripts/homologate-local-reader.mjs --security-only`.
Resultado: 136 verificacoes PASS, nenhuma FAIL, um grupo NOT_EXERCISED (dados nao
vazios e linha oculta por RLS). O relatorio indica databaseTested=false.
Consultas validas autenticadas retornaram 503 por configuracao ausente; isso NAO
comprova funcionamento SQL real. Parametros invalidos 400, sem sessao/invalida/
expirada/logout 401, metodos proibidos 403. Tres logins HTTP sinteticos PASS.
Servidor de teste encerrado, contas e sessões removidas. Evidência privada do
ensaio sem banco: ID `03ca0105-e71f-4144-abfa-8c1cb4306b30`; não incluída no Git.

## Endpoints e contratos

Filtros opcionais: raId e naturezaId (UUIDs persistentes), startDate/endDate ISO
inclusivos, identificacao (substring de UUID/ano/unidade/numero), local (substring),
page (1..1000000), pageSize (1..100; padrao 25), sortBy
(data/horario/identificacao/local/ra) e direction (asc/desc; padrao desc).
identificacao ordena pelo numero_registro textual. Desempate por UUID ascendente;
nulos por ultimo. Parametros desconhecidos/repetidos e valores invalidos: 400.
As buscas sao literais, sem interpretar curingas SQL. Datas podem ser unilaterais.

Listagem retorna success/data.items/data.pagination/meta. Pagina alem do total
retorna items=[], preservando o numero solicitado. totalPages=0 quando total=0.
Detalhe exige UUID e nao aceita query string; inexistente e nao visivel retornam
o mesmo 404. Nao ha fallback para mocks. Falha de banco/configuracao: 503; erro
inesperado: 500; respostas genericas, sem SQL, credenciais ou detalhes PostgreSQL.

Saida persistente tem datas/horarios/RA/coordenadas anulaveis conforme banco, estados
originais de localizacao/consolidacao e versao bigint como string para preservar
precisao. As naturezas sao associacoes agregadas, ordenadas por UUID; natureza ou
categoria relacionadas nao visiveis podem ser null. Nenhum catalogo demonstrativo
e inventado para preencher campos ausentes. Geometria, evidencia, auditoria, staging,
usuarios e historicos nao sao projetados. Data/hora saem como texto civil, sem
conversao de fuso. created/updated mantem offset do PostgreSQL.

Reutiliza envelope comum. catalogVersion no meta identifica o contrato legado, nao
homologa versoes dos catalogos PostgreSQL; relacionamentos usam UUIDs reais.
OpenAPI atualizado distingue os dois GET locais das operacoes futuras. Exemplos
continuam sinteticos, nao comprovantes de leitura real.

## Seguranca e pool

Route handlers e proxy conferem sessao no servidor. Os tres perfis usam a permissao
analisar. Apenas as duas formas de GET recebem excecao no bloqueio local de APIs;
POST/PATCH/DELETE, outras APIs, sessoes ausentes/adulteradas/expiradas e perfis sem
permissao ficam bloqueados. Identidades Supabase nao usam a conexao local. O provedor
local exige development, selecao explicita e listener loopback do launcher existente.

pg 8.23.1 e @types/pg 8.23.1, adicionados com pnpm 10.34.3/Node 22. Pool server-only
reutilizavel com maximo tres conexoes, timeouts de conexao/query/statement/lock,
transacao REPEATABLE READ READ ONLY e rollback/descarte em falha. Credencial decodificada
uma vez e configuracao explicita, sem repassar connectionString/opcoes arbitrarias.
Cada checkout verifica host/porta/banco/session_user/current_user, PostgreSQL 17.11,
atributos restritivos, memberships/propriedade e 19 tabelas ENABLE/FORCE RLS antes
de executar a consulta. Listagem e total usam uma unica instrucao SQL/snapshot;
EXISTS filtra natureza e agregacao correlacionada preserva uma ocorrencia por item.

## Qualidade e limites

Testes unitarios usam driver simulado e contas/sessoes sinteticas em diretorios
temporarios: tres perfis, proxy, expiracao, adulteracao, logout, parametros/injecao,
multiplas naturezas, 400/401/403/404/500/503, pool e isolamento. Isso NAO e teste
real do banco. A homologacao RLS anterior nao comprova automaticamente este SQL novo.

Build de validacao: `node scripts/build-validation.mjs`. Executa o mesmo launcher
Next em .next-build-validation e tsconfig temporario separado, sem encerrar o dev;
restaura as referencias geradas next-env.d.ts quando reconhece sua propria saida.
Nao usar SENTINELA_VALIDATE_BUILD diretamente sem o wrapper que prepara o tsconfig.
ESLint ignora esse artefato e aplica regras JSX apenas a JSX/TSX; scripts .cjs
continuam CommonJS, sem modificar as ferramentas anteriores.

O plano inicial previa configurar a credencial, testar o banco e integrar as telas.
Essas atividades de leitura já possuem evidência nas Etapas 2.9/2.10 abaixo.
Somente dados sintéticos aprovados estão visíveis pelas policies atuais; escrita
continua fora do escopo.

## Registro histórico da implementação inicial

- 130 testes automatizados aprovados, zero falhas; incluem sessoes locais reais
  sinteticas e driver PostgreSQL simulado. Nenhum teste real de banco foi declarado.
- TypeScript, ESLint completo, contratos Zod/OpenAPI, verificacao estatica de rotas,
  parser PostgreSQL de duas consultas geradas e git diff --check aprovados.
- Build Next.js isolado aprovado com ambas as rotas GET dinamicas compiladas.
- Credencial operacional ausente: teste real pendente, sem uso de postgres como
  substituto. Nenhuma conexao PostgreSQL/Supabase foi realizada pela implementacao.

Arquivos de implementacao: src/lib/db/{config,pool,occurrence-query,occurrences,http}.ts;
src/app/api/v1/ocorrencias/route.ts e [id]/route.ts;
src/contracts/persistent-occurrences.ts; src/proxy.ts e src/lib/auth/policy.ts.
Contratos: src/contracts/{examples,openapi}.ts, docs/contratos/openapi-v0.1.0.json
e scripts/validate-api-contracts.mjs. Ferramentas: package.json/pnpm-lock.yaml,
next.config.ts, eslint.config.mjs, .gitignore, scripts/build-validation.mjs e
scripts/test-local-reader.{ps1,mjs}. Testes: tests/persistent-occurrences.test.mjs,
tests/reader-pool.test.mjs e tests/fixtures/reader-pool.mjs.
O Next adicionou automaticamente seu bloco de orientacoes ao AGENTS.md; preservado.
Artefatos anteriores database/local/, backup-local-supabase.md e backup-supabase.mjs
nao foram alterados nesta etapa.

## Registro histórico da homologação HTTP sem senha operacional

Foram executadas 136 verificacoes reais PASS, zero FAIL: 57 respostas 503 por
configuracao ausente, 48 respostas 400, 16 respostas 401 (incluindo bypass por
cabecalhos), nove bloqueios 403, tres logins, identidade do servidor isolado e duas
verificacoes de encerramento/limpeza. databaseTested=false. Um grupo nao exercitado
registra explicitamente dados nao vazios, multiplas naturezas e linha oculta RLS.
Nenhum valor secreto ou URI foi registrado nas evidencias.

Naquele ensaio, a implementação estava concluída, mas a Etapa 2.9 ainda dependia
da execução com a senha operacional para comprovar PostgreSQL e HTTP 200/404.
Não houve tentativa de descobrir/reutilizar senha administrativa, inserir fixtures
ou contornar autenticação. O ensaio sem banco não realizou conexão PostgreSQL ou
Supabase e não modificou as telas. O resultado posterior está consolidado abaixo.

O comando interativo verifica PostgreSQL 17.11/PostGIS 3.6.2/extensions, identidade
real e repositorio antes de iniciar a fase HTTP; se isso falhar, nao declara sucesso.
O relatorio informa databaseTested=true somente apos verificacoes reais aprovadas.
Testes positivos nao vazios continuam limitados pela ausencia de dados autorizados;
não serão criados registros operacionais para preencher essa lacuna. O teste
posterior com a interface continua separado da validação de linhas no sandbox.

## Etapa 2.10 — interface de consulta

O usuário informou a conclusão manual da homologação PostgreSQL/HTTP da Etapa
2.9 (135 verificações aprovadas). Isso é evidência informada, distinta da execução
sem credencial descrita acima.

A tela `/ocorrencias` agora consome somente os dois endpoints GET. Filtros,
ordenação e paginação são enviados ao backend; detalhes são lidos pelo UUID.
Não há fallback demonstrativo nem operações de escrita. Dashboard e Mapa mantêm
seu comportamento demonstrativo. Contratos, adaptações dos filtros, testes de
navegador e limitações estão em [ocorrencias-persistentes.md](ocorrencias-persistentes.md).

Para reproduzir a homologação PostgreSQL real com a tela, quando necessário e
autorizado, executar em PowerShell:

```powershell
.\scripts\test-local-reader.ps1 -Interface
```

O procedimento solicita a senha existente com entrada oculta, sem alterar a
configuração do usuário. Sem essa credencial, `pnpm check:occurrences` exercita
segurança HTTP real e estados da interface com respostas contratuais de teste;
não comprova a consulta PostgreSQL desta tela.

## Homologação real confirmada em 11/11/2026

Relatório privado original conferido exclusivamente por leitura nesta regularização:

- ID: `2fcf4784-a48e-4d46-abc4-4f53d248e472`.
- SHA-256: `007372fe265fad99f46194360f14c9e4aaf70e1a13f103ab7dffc3022de88a70`.
- Modo `HTTP_AND_REAL_POSTGRESQL`; `databaseTested=true`.
- **166 verificações PASS, zero FAIL/UNKNOWN e 54 respostas HTTP 200.**
- Identidade/repositório PostgreSQL real aprovados; tela operacional vazia aprovada
  para Administrador, Operador e Analista, sem fallback demonstrativo.
- Um grupo `NOT_EXERCISED`: respostas HTTP com dados persistentes não vazios,
  múltiplas naturezas e linha oculta por RLS. O operacional estava vazio e nenhuma
  fixture foi inserida para preencher essa lacuna.

O resumo não inclui senha, URI funcional, cookie, sessão ou caminho privado
completo. O relatório bruto e os screenshots permanecem fora do Git. Sua leitura
não executou conexão, testes SQL/HTTP, configuração ou alteração do banco.

### Classes de evidência e limites

| Classe | Evidência | O que não comprova |
|---|---|---|
| Unitários e simulados | 138 testes Node, dez estáticos PostgreSQL, 132 simulados do sandbox e 12 Windows descartáveis aprovados nas validações técnicas anteriores | Leitura de registros operacionais reais |
| SQL real no sandbox | [Homologação RLS](../database/local/sandbox/HOMOLOGACAO.md): 20 fixtures, seis policies, seis projeções permitidas e 49 negativas, com autenticação real e conjuntos por UUID | Dados não vazios respondidos pelo endpoint HTTP operacional |
| HTTP real operacional vazio | Relatório privado acima: PostgreSQL real, 166 PASS e tela vazia nos três perfis | Detalhes preenchidos, auditoria de escrita ou RLS não vazio via HTTP |
| Interface preenchida contratual | Respostas sintéticas de teste para filtros, paginação, nulos, múltiplas naturezas e detalhes, documentadas na [Etapa 2.10](ocorrencias-persistentes.md) | Persistência das linhas apresentadas pelo navegador de teste |

Os resultados anteriores de 130 testes de implementação e 136 verificações HTTP
sem banco permanecem como histórico. Não somar essas execuções sobrepostas como
se fossem uma única suíte independente. O ensaio de 165 PASS sem banco também é
distinto do ensaio de 166 PASS com PostgreSQL real.

A leitura persistente local está homologada no limite do banco vazio e das
policies sintéticas. Isso não conclui Auth hospedado, escrita, administração de
usuários ou recuperação integral Supabase. Os próximos passos são a revisão
institucional e o desenho autorizado das operações de escrita.

Decisões complementares: [provedor temporário](decisoes/adr-auth-local-temporario.md)
e [leitura local/homologação isolada](decisoes/adr-leitura-postgresql-local-homologacao-isolada.md),
ambas propostas para avaliação. Consolidação acadêmica: [Sprint 4](../sprints/sprint-04.md).
