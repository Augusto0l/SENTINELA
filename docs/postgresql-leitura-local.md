# Etapa 2.9 — APIs locais de leitura PostgreSQL

Implementados somente GET /api/v1/ocorrencias e GET /api/v1/ocorrencias/{id}.
As telas e os contratos demonstrativos permanecem separados. Nenhuma escrita,
migration, fixture, mudanca de role/RLS/grant ou conexao Supabase foi executada.

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
O modo completo ainda nao foi executado: falta a credencial operacional privada.
Para executar somente o teste antigo de repositorio: `-RepositoryOnly`.

O modo sem banco foi efetivamente executado com HTTP real:
`node --conditions=react-server --experimental-strip-types scripts/homologate-local-reader.mjs --security-only`.
Resultado: 136 verificacoes PASS, nenhuma FAIL, um grupo NOT_EXERCISED (dados nao
vazios e linha oculta por RLS). O relatorio indica databaseTested=false.
Consultas validas autenticadas retornaram 503 por configuracao ausente; isso NAO
comprova funcionamento SQL real. Parametros invalidos 400, sem sessao/invalida/
expirada/logout 401, metodos proibidos 403. Tres logins HTTP sinteticos PASS.
Servidor de teste encerrado, contas e sessoes removidas, evidencia preservada em
%USERPROFILE%/.sentinela-local/http-qualification/03ca0105-e71f-4144-abfa-8c1cb4306b30/report.json.

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

Proxima atividade: configurar a credencial e executar o teste real; depois integrar
listagem/detalhe nas telas, apresentando carregamento, erros e vazio sem mocks de
fallback. Somente dados sinteticos aprovados estao visiveis pelas policies atuais.

## Resultado da entrega

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

## Finalizacao da homologacao HTTP (sem senha operacional)

Foram executadas 136 verificacoes reais PASS, zero FAIL: 57 respostas 503 por
configuracao ausente, 48 respostas 400, 16 respostas 401 (incluindo bypass por
cabecalhos), nove bloqueios 403, tres logins, identidade do servidor isolado e duas
verificacoes de encerramento/limpeza. databaseTested=false. Um grupo nao exercitado
registra explicitamente dados nao vazios, multiplas naturezas e linha oculta RLS.
Nenhum valor secreto ou URI foi registrado nas evidencias.

A implementacao esta concluida; a Etapa 2.9 NAO esta homologada integralmente.
Falta executar o comando PowerShell com a senha operacional existente para comprovar
PostgreSQL e respostas HTTP 200/404. Nao houve tentativa de descobrir/reutilizar
senha administrativa, inserir fixtures ou contornar autenticacao. Nao houve conexao
ao banco ou Supabase nesta finalizacao. As telas nao foram modificadas.

O comando interativo verifica PostgreSQL 17.11/PostGIS 3.6.2/extensions, identidade
real e repositorio antes de iniciar a fase HTTP; se isso falhar, nao declara sucesso.
O relatorio informa databaseTested=true somente apos verificacoes reais aprovadas.
Testes positivos nao vazios continuam limitados pela ausencia de dados autorizados;
nao serao criados registros para preencher essa lacuna. Antes de integrar a tela,
concluir essa execucao de ponta a ponta.

## Etapa 2.10 — interface de consulta

O usuário informou a conclusão manual da homologação PostgreSQL/HTTP da Etapa
2.9 (135 verificações aprovadas). Isso é evidência informada, distinta da execução
sem credencial descrita acima.

A tela `/ocorrencias` agora consome somente os dois endpoints GET. Filtros,
ordenação e paginação são enviados ao backend; detalhes são lidos pelo UUID.
Não há fallback demonstrativo nem operações de escrita. Dashboard e Mapa mantêm
seu comportamento demonstrativo. Contratos, adaptações dos filtros, testes de
navegador e limitações estão em [ocorrencias-persistentes.md](ocorrencias-persistentes.md).

Para incluir a tela na homologação PostgreSQL real, executar em PowerShell:

```powershell
.\scripts\test-local-reader.ps1 -Interface
```

O procedimento solicita a senha existente com entrada oculta, sem alterar a
configuração do usuário. Sem essa credencial, `pnpm check:occurrences` exercita
segurança HTTP real e estados da interface com respostas contratuais de teste;
não comprova a consulta PostgreSQL desta tela.
