# Homologação persistente local da Sprint 4

## Destino aprovado

O ambiente usa `127.0.0.1:55473/sentinela_sprint4_homologacao`, cluster
`sentinela-sprint4-homologacao`, system identifier `7709847064550752852`,
PostgreSQL 17.11 e PostGIS 3.6.2 em `extensions`. Os dados ficam no diretório
privado `.cache/sprint4-homologacao-persistente/data`. A pasta pai, ignorada
pelo Git, tem ACL restrita ao proprietário e guarda o backup da baseline,
a credencial de instalação e as credenciais de leitura geradas.

## Ordem e compatibilidade

1. Confirmar identidade, diretório, loopback, versões, ACL e backup anterior.
   O inventário inicial tem ledger `0001` a `0005`, 19 tabelas com RLS
   habilitada e forçada, zero policies de aplicação e catálogo e ocorrências
   vazios. As duas constraints `NOT VALID` de transação da baseline são
   intencionais e continuam a valer para novos registros.
2. Verificar offline o release cartográfico, o payload revisado, o GeoJSON e
   os vínculos existentes. A chave de associação é o código com confirmação
   do identificador e do nome na fonte. Os UUIDs públicos já aprovados vêm
   de `public/data/cartography/ra-bindings.json`. O arquivo mantém seu escopo
   original. A cópia do catálogo reproduz exatamente essas identidades e
   guarda a proveniência da extração de 13/11/2026. A vigência e a validade
   jurídica continuam desconhecidas.
3. Aplicar `homolog-persist-0001` para o catálogo e a leitura, seguida de
   `homolog-persist-0002` para a atestação sob o próprio login. Verificar
   catálogo e papéis em conexões novas após o commit. As migrations operacionais exigem
   o destino em 5432, a reader operacional e o ledger correspondente. Os
   executores de `ra-catalog-v2`, `write-sandbox` e `pcdf-sandbox` atestam
   cluster, banco, porta e papéis descartáveis. O instalador reaproveita
   somente o verificador offline do release. Essas migrations atendem
   exclusivamente ao destino persistente.

```powershell
node --experimental-strip-types database/local/persistent-homologation/install.mjs --apply
node --experimental-strip-types database/local/persistent-homologation/install.mjs --verify
```

O instalador recusa nova aplicação após as duas entradas no ledger e confere o
hash do backup da baseline antes do primeiro commit. O aplicativo usa três
logins técnicos de leitura distintos. O PostgreSQL concede a esses logins
execução da função nativa de identificação do cluster e a atestação é feita
sem elevação. O acesso padrão aos bancos de manutenção `postgres` e
`template1` foi revogado dentro do cluster de homologação. As policies
liberam somente o catálogo
cartográfico. As projeções de dados criminais permanecem fechadas por RLS e
retornam vazias nesta etapa. Escrita, importação e correção dependem de SQL
e autoria sintética revisadas e de logins de escrita separados. As permissões
demonstrativas das contas locais preservam a distinção entre os perfis.

## Conexão Next.js e teste de reinicialização

Execute na raiz do repositório com Node 22. O processo de ensaio usa
`127.0.0.1:3317`, que precisa estar livre. As contas de teste usam uma
pasta privada própria, `%USERPROFILE%\.sentinela-local\sprint4-homologacao-persistente`.
Crie-a com ACL de acesso exclusivo do usuário local antes de executar.
O roteiro cria três contas `@example.test` nessa pasta no primeiro uso,
com material de login e sessões separados das contas de outros ambientes.

```powershell
node --experimental-strip-types database/local/persistent-homologation/qualify.mjs --qualify
```

O ensaio atesta o cluster, verifica as credenciais de banco em conexões
reais e inicia o Next.js com ativação explícita. Somente as três credenciais
de leitura são repassadas ao processo Next. Os GET usam transação
somente leitura e atestam o destino antes de consultar dados. A sessão
local determina o login técnico. Host, Origin do login e cookies usam
as proteções do provedor local existente.

O roteiro testa os três logins, o catálogo, ocorrências vazias, detalhe
inexistente e indicadores vazios. Com o PostgreSQL parado, exige HTTP 503
na consulta de catálogo. Depois reinicia PostgreSQL e Next.js, confere
o catálogo e repete os GET com as sessões anteriores. O cluster fica
disponível ao final e o processo HTTP de ensaio é encerrado. O recibo
`http-<id>.json` e os logs ficam na pasta privada do cluster.

Para abrir a configuração local após a homologação, execute o mesmo
roteiro com `--serve` e acesse `http://127.0.0.1:3317/login`. Os
logins gerados ficam no arquivo privado `next-login-fixture.json`.
As credenciais do PostgreSQL e das contas de teste devem permanecer
nas respectivas pastas privadas.

## Evidências da execução em 19/11/2026

- Branch `feat/sprint4-homologacao-persistente`, HEAD `f98ec07` no início
  e no fim da rodada. Os apontamentos anteriores da Sprint e do progresso
  foram preservados.
- Ledger final com `0001`–`0005`, `homolog-persist-0001` e
  `homolog-persist-0002`. As 37 linhas foram reconciliadas integralmente
  com o GeoJSON e os vínculos aprovados. Os três logins autenticados são
  `sprint4_homolog_admin_read`, `sprint4_homolog_operator_read` e
  `sprint4_homolog_analyst_read`.
- Recibo HTTP final `http-c4f8c2a2-9961-4c8f-8159-ac190bf6bc11.json`,
  SHA-256 `1ffa0f17cc3bc95cad6cac4d9968c802ad94392409dd0b7735e7296fac69061a`.
  Os logs anteriores e o backup da baseline foram preservados.
- Regressão aprovada com 243 testes Node, 11 testes SQL/HBA, 14 testes
  de recuperação, typecheck, ESLint, contratos/OpenAPI, rotas e build.
  A primeira regressão SQL/HBA recusou a atestação privilegiada. A
  migration `homolog-persist-0002` corrigiu o banco já instalado sem
  recarregar o catálogo, e a qualificação HTTP foi repetida.

| Área | Arquivos desta rodada |
| --- | --- |
| Banco e homologação | Criados `0001_catalog_and_read.sql`, `0002_read_identity.sql`, `install.mjs`, `qualify.mjs` e este guia, no mesmo diretório. |
| Leitura e modo de execução | Criado `src/lib/db/persistent-read.ts`. Modificados `config.ts`, `catalogs.ts`, `occurrences.ts`, `isolated-write-mode.ts` no mesmo diretório, a rota `src/app/api/v1/analytics/persistente/route.ts`, `scripts/next-cli.mjs` e `scripts/hosted-env.mjs`. |
| Regressão e progresso | Criado `tests/persistent-homologation.test.mjs`. Atualizados `sprints/sprint-04.md` e `docs/desenvolvimento/progresso-conclusao.md`. |

## CRUD sintético local

As migrations `homolog-persist-0003` e `homolog-persist-0004` habilitam
o CRUD manual sintético. A primeira deriva SQL de quatro fontes
descartáveis com hashes verificados, aplica uma guarda própria e registra
o recibo SQL. A segunda concede leitura de metadados de referência
espacial aos dois escritores para a verificação diferida do histórico.
As funções de comando usam proprietários `NOLOGIN` sem bypass de RLS.
Os logins escritores executam apenas o comando autorizado e os
verificadores necessários. O Analista usa exclusivamente leitura.

O cadastro e a edição validam a coordenada declarada contra exatamente
uma das geometrias oficiais, com o UUID selecionado. Essa conferência
usa a cartografia aprovada para o ensaio e preserva a informação de
vigência jurídica desconhecida. As naturezas disponíveis para escrita
são as duas fixtures marcadas como sintéticas. O mesmo UUID de comando
por ator devolve o recibo anterior para entradas iguais. O histórico
registra endereço e versão, e as associações substituídas permanecem
rastreáveis. A consulta de ocorrências e o endpoint analítico aplicam
o recorte de registros ativos.

```powershell
node --experimental-strip-types database/local/persistent-homologation/qualify.mjs --serve-crud
```

O launcher verifica o diretório, a identidade e as configurações antes
de iniciar o PostgreSQL se estiver parado. Depois reconcilia a carga e
os papéis, confere o recibo de qualificação de escrita e inicia apenas
o Next.js de homologação em loopback. Abra `http://127.0.0.1:3317/login`
com uma das três contas sintéticas da pasta privada. Use Ctrl+C para
encerrar o Next.js. O cluster permanece disponível para a próxima sessão.

Para repetir o cenário integrado de CRUD e o backup reconciliado:

```powershell
node --experimental-strip-types database/local/persistent-homologation/qualify.mjs --qualify-crud
node --experimental-strip-types database/local/persistent-homologation/backup-verify.mjs --backup-restore
```

O ensaio cria ocorrências sintéticas rastreáveis, inclui uma inativação e
preserva uma ocorrência ativa para conferir o reinício. Cada backup
recebe um nome novo e o restore fica em um banco privado no mesmo
cluster. O recibo de restauração compara os hashes de conteúdo e o
inventário de RLS, constraints, triggers e policies das tabelas atestadas.

## PCDF sintético

A migration `homolog-persist-0005` reaproveita as funções verificadas
de staging, revisão e promoção com guarda própria e SHA do XML sintético
fixo. O parser aceita CSV UTF-8 de 34 colunas com `;`, com limite de
10.000 linhas e 16 MiB. Administrador e Operador podem enviar lotes.
Os três perfis consultam a Central. A correção autorizada pertence ao
Administrador, com identidade sintética vinculada à sessão.

A promoção exige aprovação prévia da identidade do grupo e do
mapeamento sintético. O ensaio registra essa aprovação somente para
o grupo fixture criado pelo roteiro, comprovado por hash de arquivo,
origem, lote, execução e duas associações. Coordenadas candidatas de
PCDF permanecem em staging. A ocorrência promovida sem localização
validada entra nos totais, sem ponto cartográfico.

```powershell
node --experimental-strip-types database/local/persistent-homologation/qualify.mjs --serve-functional
```

Para repetir o cenário CSV, use `--qualify-functional`. Para repetir a
qualificação XLSX e da Central paginada, use `--qualify-completion`.
O launcher exige os recibos SQL de CRUD e PCDF antes de expor os
endpoints no Next.js. As decisões administrativas suportadas mantêm
o valor original e o histórico.

Com `homolog-persist-0006` e seu recibo SQL, o mesmo comando de execução
habilita XLSX e a Central paginada. O XLSX deve ter uma aba visível com os
34 cabeçalhos na ordem contratada e os valores originais em células de
texto. Latitude, longitude e índice técnico da linha também aceitam
células numéricas decimais. Fórmulas são recusadas com indicação da
célula. Os limites são 10.000 linhas, 16 MiB de envio e de CSV convertido,
32 MiB por parte XML e 64 MiB no diretório compactado quando expandido.

O XLSX é convertido para a representação CSV do pipeline. A transação
grava o original binário em `sentinela_homolog_pcdf.xlsx_originals`,
vinculado ao lote e ao SHA-256. Conteúdo canônico idêntico na mesma
competência reaproveita o lote. O mesmo arquivo XLSX reaproveita
também o original arquivado. Identidade equivalente em outro lote
mantém as linhas em staging e passa pela verificação de conflitos
da promoção.

A Central persistente tem busca literal, filtros de tipo, prioridade
e situação, ordenação por prioridade ou data e controles de página.
A busca inclui ID da pendência, lote, campo, motivo e os valores original
e normalizado. O diálogo mostra lote, versão e histórico. Após conflito de
versão, reabra o detalhe atualizado antes de reenviar. Tipos com regra de
correção pendente ficam visíveis com a correção bloqueada.
