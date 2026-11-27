# Catálogo de RAs — carga idempotente e prontidão operacional

Atualização 2.17.6: [contrato consolidado](revisao-oficial-catalogo-ras.md) define
UUID persistente, código IDE literal em `codigo_interno`, `codigo_oficial` NULL,
nome administrativo separado do nome de origem e metadados jurídicos desconhecidos.
Propõe uma coluna JSONB com CHECKs estritos, sem alterar a baseline nesta etapa.
A policy atual só aceita o marcador sintético: **a carga real seria invisível**.
Uma policy SELECT adicional por versão pública foi proposta documentalmente,
sem aplicação ou homologação SQL. Novo payload, evolução mínima e ensaio reader
real em sandbox são bloqueios antes da primeira autorização operacional.
O SQL antigo e suas evidências permanecem preservados; não estão aprovados para
esta futura versão com nomes/metadados e visibilidade diferentes.


Etapa 2.17.2, 13/11/2026. **Procedimento operacional futuro: não executado.**
O executor disponível recusa o banco operacional e só prepara clusters novos,
privados e atestados em `127.0.0.1:55432/sentinela_rls_sandbox`.

Atualização 2.17.3: a [auditoria pré-operacional](ra-preoperacional-auditoria.md)
classificou a execução real como **BLOQUEADA** por credencial reader indisponível,
backup/restauração local pendentes e ausência de executor/ACLs operacionais
qualificados. A prontidão anterior para revisão de sandbox não é liberação de carga.
O relatório contém runbook, comandos seguros e checklist com pendências explícitas.

Requalificação posterior: o snapshot autenticado fornecido pelo responsável foi
reconhecido e os 14 grupos estruturais passaram offline. A indisponibilidade da
credencial não é mais a pendência dessa evidência. Ledger 42501, contagem global
sob RLS, backup/restauração e preparação/autorização operacional seguem bloqueando
a carga; consulte a seção final do relatório pré-operacional.

## Catálogo canônico adotado para o ensaio

Referência: snapshot IDE/DF da camada `Publico/LIMITES/FeatureServer/1`, cujo
metadado a identifica como “Regiões Administrativas”, display field `ra_codigo`.
São 37 feições, códigos, nomes e ObjectIDs distintos. A geometria é Polygon ou
MultiPolygon em EPSG:4326, sem reparos. São 37 referências administrativas
distintas **nesta publicação**, não prova independente de situação jurídica,
autonomia administrativa, vigência histórica ou completude de um cadastro legal.

O documento da camada não fornece descrição, copyright ou vigência legal. O campo
`ra_cira` existe, mas não tem dicionário suficiente para promovê-lo a identificador
administrativo normativo. Os links `ra_path` não substituem essa comprovação.
Fonte, metadados, geometrias e hashes estão em [ra-bindings.md](ra-bindings.md).
Não foi alterado o código literal `XXXVII` nem normalizado nome para obter vínculo.

| Conceito | Destino no ensaio | Regra |
| --- | --- | --- |
| Identidade interna | `regioes_administrativas.id` | UUID aleatório gerado pelo DEFAULT SQL na primeira inserção |
| Código de referência | `codigo_interno`, `codigo_oficial` | Literal `ra_codigo`; “oficial” refere-se à fonte cartográfica, não a cadastro legal independente |
| Nome | `nome` | Literal `ra_nome`; divergência é conflito, não motivo de substituição |
| Identificador da feição | vínculo `source_object_id` | Literal `objectid`, dependente do snapshot |
| Origem | evidência espacial + versão do vínculo | URL e SHA-256 fixados, sem inferir origem pelo nome |
| Versão inicial | `versao_cartografia` + versão/hash do vínculo | Sem sobrescrever a versão anterior |
| Limite inicial | `limite` | MultiPolygon, SRID 4326; preservado pela imutabilidade da baseline |
| Geometrias históricas | `catalog_geometries(version, ra_id)` | Acrescentadas por versão; imutáveis e referenciadas por FK ao vínculo |
| Ativo | Não há campo correspondente | Nenhum estado ativo foi inventado |
| Vigência | `vigencia` não nulo na baseline | Range técnico ilimitado no sandbox; **não comprova vigência jurídica** |

O range técnico existe para satisfazer o contrato SQL original do ensaio. Não é
autorização para validar datas históricas. A futura revisão operacional deve
documentar esse significado ou propor migration separando disponibilidade técnica
e vigência jurídica desconhecida. Não preencher datas de validade por suposição.

## Arquitetura e identidade

`catalog.sql` adiciona somente estruturas privadas do sandbox e uma função
`SECURITY INVOKER`, sem EXECUTE público e sem acesso das roles runtime. Ela exige
executor postgres, destino literal do sandbox e fonte de hash exato. O instalador
atesta também UUID, system identifier, caminho de dados, PID e HBA antes do SQL.
O preflight confere baseline/ledger, UUID, PostGIS e RLS forçado nas 19 tabelas.
Referências de colunas, tipos, índices e constraints são as da baseline íntegra
instalada pelo controlador. Incompatibilidades abortam; o SQL original não é editado.

A função recebe os bytes originais decodificados como UTF-8. O PostgreSQL verifica
SHA-256 antes de interpretar o GeoJSON. Python verifica o arquivo antes de criar
o cluster; o helper Node faz a mesma verificação na qualificação. Não há download
durante a carga. Arquivo com espaços adicionais, código ou nome alterado é outra
fonte e é recusado até revisão explícita.

O algoritmo serializa as tabelas envolvidas, verifica a unicidade dos códigos e:

1. Procura identidade por código, nunca somente pelo nome.
2. Se houver mais de um registro, aborta por ambiguidade.
3. Se houver um registro, preserva seu UUID e exige metadados/limite compatíveis.
4. Se não houver registro, insere usando o DEFAULT `gen_random_uuid()`.
5. Cria apenas geometrias, versões e vínculos ausentes; compara os existentes.
6. Registra recibo técnico com executor SQL, hash, quantidades e horário.

Não usa DELETE + INSERT, UPDATE de RA nem ON CONFLICT para sobrescrever uma
identidade. Não copia os UUIDs determinísticos das fixtures de interface.
UUIDs gerados neste cluster são persistentes **no sandbox**, nunca operacionais.
UUIDs já existentes no operacional continuam ausentes na leitura realizada.

Nome, código, limite, versão, evidência, UUID ou vínculo divergente causam erro e
rollback integral da chamada/transação. Nenhuma alteração parcial é aceita.
O conflito é descrito em erro sanitizado; o executor preserva evidências privadas.
Recibos de sucesso são transacionais e não sobrevivem a uma carga fracassada.
As revisões cartográficas são acrescentadas, não sobrescritas. A aprovação de um
novo hash exige nova revisão do carregador/classificador; hash desconhecido não
é aprovado automaticamente. A estrutura histórica permite manter ambas as versões.

## GET, formulários e privilégios

O GET `{id, nome}` não mudou. A qualificação autentica diretamente como a role
de leitura do **novo cluster** e executa `catalogSql("regioes")`, o mesmo SQL do
backend, validando o retorno com o mesmo Zod. Os 37 UUIDs retornados precisam
coincidir com os persistidos e exportados para o classificador TypeScript.

A policy adicional `sandbox_canonical_catalog` existe somente no sandbox e
permite ler o catálogo marcado pela evidência específica da carga. As seis
policies originais são preservadas; não se altera RLS/grants operacionais.
Continuam 48 grants SELECT por coluna. A fixture ampla `SBX-ONLY` não aparece no
GET da role restrita. O campo espacial e os vínculos internos não são expostos.
INSERT/UPDATE/DELETE e chamada do carregador por essa role são recusados.

Os formulários continuam demonstrativos. O mapa operacional de vínculos continua
vazio e o GET operacional continua vazio. O cenário sintético explícito usa suas
fixtures homologadas; isso não promove UUIDs de teste a oficiais. A cópia de GET
com UUID do novo sandbox preserva esse UUID, mas permanece `reference_pending`
no escopo operacional. Não há fallback oculto nem endpoint de escrita.

## Execução reproduzível — somente sandbox

```powershell
python -B database/local/write-sandbox/run-geography.py --execute --bindings --catalog
```

Esse comando cria um cluster novo, instala a baseline original, prepara o SQL
experimental, executa os cenários e encerra apenas esse cluster. Não reutiliza
credenciais operacionais nem sandboxes históricos. As credenciais efêmeras são
privadas; não devem ser copiadas para o chat ou para comandos.

`catalog-checks.sql` executa carga vazia com rollback, falha após cinco registros,
conflito de nome, carga com um UUID preexistente, reexecução, adulteração de fonte
e conflito de vínculo. Fixtures de conflito são inseridas em subtransações e
revertidas; nenhum trigger de imutabilidade é desabilitado.

Além das 194 verificações anteriores, há 11 cenários registrados da carga e quatro
grupos nativos de GET/segurança. Código inválido e duplicado na fonte são recusados
na fronteira SHA-256; os testes Node exercitam também a detecção estrutural dessas
duplicidades, independentemente do hash. Não apresentar isso como aceitação de
uma fonte nova não revisada. Os grupos contêm múltiplas asserções.

## Procedimento operacional futuro — ponto de autorização

**Não executar o SQL do sandbox em 5432 nem remover seus guards.** Uma aprovação
posterior deve autorizar destino, revisão dos artefatos e catálogo exatos.

1. Revisar a semântica do catálogo e da vigência desconhecida. Confirmar se o
   literal cartográfico pode ocupar `codigo_oficial` ou se deve permanecer nulo.
   A escolha no ensaio não é decisão institucional de cadastro administrativo.
2. Conferir branch, hashes do snapshot/metadados e revisão aprovada do procedimento.
3. Reconfirmar por READ ONLY servidor, porta, banco, executor, versão, extensão,
   schema, constraints, triggers, políticas, grants, ledger e registros existentes.
4. Produzir backup recuperável apropriado ao banco local, registrar hash/inventário
   e ensaiar restauração em destino separado. O backup Supabase antigo não cobre
   automaticamente o estado deste banco operacional local.
5. Aprovar migration incremental para versões/vínculos/geometrias/recibos caso
   necessária. Manter a baseline e migrations oficiais anteriores intactas.
   Não copiar SECURITY DEFINER de outros ensaios como atalho para privilégios.
6. Aprovar separadamente a leitura do catálogo pela role operacional. A policy
   atual só vê marcador sintético; carregar dados não garante que o GET os verá.
   Não reetiquetar catálogo real como teste para contornar RLS.
7. Preparar executor administrativo pontual com allowlist exata do destino e
   atestação, sem colocá-lo na aplicação. Fazer dry-run READ ONLY de conflitos.
8. Após autorização explícita, executar uma única transação integral, com
   `ON_ERROR_STOP=1`, lock e timeout definidos, verificações antes do COMMIT e
   somente inserções aprovadas. Preservar UUIDs existentes; abortar diante de
   divergência. Não aplicar versões individuais da baseline nem a migration 0006.
9. Validar 37 referências aprovadas ou a quantidade explicitamente revisada,
   unicidade, UUIDs, vínculos/feições/hash, ausência de órfãos, RLS e ACLs mínimas.
   Comparar estrutura, ledger e dados fora do catálogo com o estado inicial.
10. Exportar do banco a matriz operacional homologada, sem gerar UUID em JSON;
    revisar antes de disponibilizar aos formulários. Testar GET autenticado e
    paridade territorial com esses UUIDs reais. Só então declarar homologação
    operacional, sem habilitar escrita de ocorrências automaticamente.

Falha antes do COMMIT: ROLLBACK integral e inspeção READ ONLY. Conexão perdida
perto do COMMIT: resultado desconhecido; consultar recibos, UUIDs e catálogos antes
de qualquer nova execução. Não repetir automaticamente.

Divergência após COMMIT: suspender o consumo do catálogo afetado, preservar
evidências e analisar dependências. As RAs são imutáveis; não propor DELETE,
CASCADE ou UPDATE como reversão padrão. Uma revisão corretiva/histórica exige
plano e autorização próprios. Restauração de backup deve ser ensaiada primeiro
em banco isolado, sem sobrescrever automaticamente bancos existentes.

## Critérios de liberação

Infraestrutura de sandbox pode ficar pronta para revisão operacional; a aplicação
real depende de aprovação semântica, backup atual, migration/ACL próprias quando
necessárias e autorização de carga. Permanecem fora desta etapa: dados PCDF,
contas humanas, autenticação definitiva, Supabase e escrita de ocorrências.
Vigência legal, cobertura territorial independente e pequenas sobreposições
continuam limitações explícitas. Não se confunde geometria consistente com
aprovação administrativa ou validade histórica do fato.
# Qualificação do backup e estado global — Etapa 2.17.4

Em 13/11/2026, a leitura global autorizada como `postgres` confirmou zero RAs,
zero códigos distintos e zero grupos duplicados, além do ledger `0001`–`0005`
e `local-read-0001`. A role reader não recebeu privilégios adicionais.

O backup lógico atual e sua restauração real em cluster novo foram homologados
para o estado inventariado, com comparação estrutural e de dados das 19 tabelas.
Veja [evidências e limitações](backup-recuperacao-postgresql-local.md). Isto
resolve os gates históricos de backup/restore e verificação global para esse
snapshot, sem substituir a aprovação semântica nem autorizar a carga operacional.

**Não executar carga nesta etapa.** Permanecem necessárias autorização específica,
decisões sobre códigos/UUIDs/vigência e revisão de policies/ACLs próprias. A reader
atual só consulta o marcador sintético aprovado; não utilizá-lo em catálogo real
como atalho de autorização. Nenhum recibo ou manifesto histórico foi reescrito.

# Revisão administrativa atual — Etapa 2.17.5

Em 13/11/2026, foram classificadas as 37 identidades: 35 APROVADAS e duas
APROVADAS COM RESSALVA (grafia da RA XXXII e código IDE de Ponte Alta).
As leis 7.917/2026 e 7.918/2026 confirmam as duas criações recentes, incluindo
XXXVII e XXXVI nos anexos. Não foi excluída ou acrescentada feição.

Consulte o [dossiê oficial e decisões pendentes](revisao-oficial-catalogo-ras.md)
e a [matriz por entrada](catalogos/ras-revisao-2026-11-13-v1/matrix.md).
O dossiê é uma nova versão documental; nenhum SQL/payload anterior foi alterado
ou reensaiado. `codigo_oficial`, vigência e ACLs operacionais ainda precisam de
decisão explícita. **Carga operacional não autorizada.**

# Pacote operacional preparado para revisão

## Aplicação operacional — 18/11/2026

### Verificação HTTP independente e credencial pendente

A configuração carregada pelo Next.js em desenvolvimento seleciona o provedor
local e aponta para um arquivo de contas existente. A
`SENTINELA_LOCAL_READER_URL` está ausente dessa configuração e o mecanismo
local de credenciais não tem entrada para a reader no destino atestado. Sem a
URL, o pool recusa o acesso. A role continua sendo
`sentinela_local_reader` em `127.0.0.1:5432/sentinela_dev_operacional`.

O ensaio real sem sessão usa somente loopback e força a ausência de credencial
de banco. Ele passou em 11 requisições HTTP e na atestação do listener, incluindo `401` para os dois
GETs de catálogo com cookie ausente ou inválido. O servidor do ensaio foi
encerrado. Nenhuma conta de teste foi criada. O recibo local sanitizado é
`d54213a0-a5da-4b90-85ec-b3b94368aa6a`.

```powershell
node --conditions=react-server --experimental-strip-types scripts/homologate-local-reader.mjs --no-session-only
```

Para concluir com **as contas demonstrativas já existentes**, o responsável
deve fornecer a senha existente da reader pela entrada oculta a seguir.
O comando passa a URL somente ao processo local e restaura o ambiente ao sair.
Manter disponível a configuração privada de contas existente.

```powershell
.\scripts\test-local-reader.ps1 -ApplicationOnly
```

Em `http://127.0.0.1:3000`, autenticar sucessivamente os perfis Administrador,
Operador e Analista pelas contas existentes. Em cada sessão, conferir
`GET /api/v1/catalogos/regioes-administrativas` com `200`, exatamente 37
pares `{id,nome}` iguais ao arquivo de vínculos e `Cache-Control: no-store`.
O código da RA é conferido pelo UUID no vínculo já auditado. O GET expõe apenas
UUID e nome por contrato. Conferir `400` para um parâmetro como `?page=1` com
sessão válida e `401` após logout. Registrar estados HTTP e contagens com
cookies, senhas e strings de conexão omitidos.

As validações de login da reader, sessão com as contas existentes, comparação
dos 37 registros pela API e rejeição autenticada de parâmetros continuam
pendentes. O verificador automatizado com conexão PostgreSQL também passou a
exigir exatamente os 37 UUIDs e nomes dos vínculos já persistidos.

Uma única tentativa com o executor homologado retornou `COMMITTED`,
`inserted=37` e `reused=0`. O destino atestado foi
`127.0.0.1:5432/sentinela_dev_operacional`, system identifier
`7702156035351602692`, PostgreSQL 17.11 e PostGIS 3.6.2. Antes da escrita,
o auditor de backup retornou `PASS` para as 19 tabelas, com zero divergências,
catálogo vazio e ledger original. A inspeção de concorrência encontrou zero
outras sessões, transações ou locks conflitantes. O executor usou os locks
previstos e revalidou o estado antes da migration e da carga.

- Manifesto homologado SHA-256 `798ab31229f2c1ab9ddf019dc6aa1370364b7df146d96a4ba4f43049315dfe54`.
- Recibo do backup SHA-256 `382a2caca55a32d8e4b359241705c3277b19d6b6e6dc8da663157dcf6a2beefe`.
- Sessões novas confirmaram `PERSISTED`, 37 RAs, 37 códigos distintos,
  37 UUIDs distintos, correspondência integral ao pacote e uma única entrada
  `local-ra-0002`. O reconciliador comparou as geometrias por EWKB.
- O SHA-256 dos dados do catálogo foi
  `10dba6a63939583c76dd3d8e0aba6d6dc2d2ba9ac2b126d157db8aab6787f376`.
  Os pares código/UUID ordenados produziram
  `fa386d6acb5bca2a6114f2b33ea8528e97243173b4456fa045b6d987edc2f8f0`.
  Os fingerprints de dados das outras 17 tabelas coincidiram com o backup.
- A comparação estrutural encontrou uma coluna, dois CHECKs e duas policies
  adicionais. O schema `sentinela` ficou com 165 constraints, 8 policies, 19
  tabelas com RLS forçada e 48 grants SELECT por coluna. `SET LOCAL ROLE` em
  leitura mostrou exatamente 37 identificadores e nomes, sem privilégio de
  ler geometria, metadados ou ledger.
- Os [vínculos operacionais](../public/data/cartography/ra-bindings.json)
  foram gerados com os UUIDs persistidos e conferidos contra o GeoJSON oficial.
  O SHA-256 do arquivo é
  `972603d7359e4c053ebc60e9b3cf4931a661dfc2300d2a0bc0d29ac03e53538b`.
- Os GETs operacionais continuam pendentes. A credencial de login da reader
  está ausente na configuração disponível da aplicação. A verificação SQL
  via role cobre RLS, sem testar login nativo nem as sessões HTTP dos três perfis.
- A suíte executou 232 testes, todos aprovados. TypeScript, ESLint,
  contratos/OpenAPI, rotas estáticas, build de produção e
  `git diff --check` também passaram.

O roteiro abaixo preserva o procedimento de liberação usado nesta carga inicial.

## Roteiro de liberação do pacote revisado

### 1. Atestação, inventário e backup

O único destino operacional previsto é `127.0.0.1:5432`, base
`sentinela_dev_operacional`, system identifier `7702156035351602692`.
O procedimento administrativo requer a conta de manutenção local existente
`postgres`, já autorizada para a atividade específica. A reader
`sentinela_local_reader` continua restrita ao GET e sujeita a RLS forçada.
Nunca configurar a conta administrativa no Next.js.

Depois de revisar o manifesto, o recibo de restauração e os SHA-256 independentes
dos artefatos, executar em PowerShell com as variáveis preenchidas a partir
dos recibos aprovados. `$releaseSha` é o digest do manifesto do executor.
`$backupDir`, `$reportSha`, `$metadataSha` e `$dataSha` apontam para o
diretório privado e para os hashes de `report.json`, `source-metadata.json`
e `source-data-hashes.json`, respectivamente.

```powershell
node database/local/ra-operational/execute.mjs --verify
python -B database/local/ra-operational/audit_backup.py $backupDir $reportSha $metadataSha $dataSha
```

Confirmar `VERIFIED_OFFLINE` com o digest revisado e `ARTIFACTS_VERIFIED`.
Após autorização vigente para auditoria global, executar o preflight em leitura:

```powershell
python -B database/local/ra-operational/audit_backup.py $backupDir $reportSha $metadataSha $dataSha --authorized-read postgres
```

O preflight reutiliza a sessão de recuperação com proteção
`default_transaction_read_only` e snapshot `REPEATABLE READ READ ONLY`. Exige
identidade correta, inventário das 19 tabelas, estrutura e fingerprints sem
diferenças, ledger original e zero registros, códigos e duplicatas. Exigir
`PASS` antes da primeira carga. Se retornar `DRIFT` ou `FAIL`, interromper.
Backup desatualizado requer nova autorização de backup/restore e a execução
do [procedimento qualificado](backup-recuperacao-postgresql-local.md#repetição-autorizada-e-recuperação).
Conservar o backup original e revisar os novos hashes e o recibo do restore.

### 2. Aplicação e cancelamento

Após autorização **específica de aplicação**, reservar uma janela sem mudanças
concorrentes no catálogo/ledger. Fornecer a credencial por mecanismo privado na
variável de processo `SENTINELA_RA_MAINTENANCE_PASSWORD`. Preservar o JSON
sanitizado da execução.

```powershell
node database/local/ra-operational/execute.mjs --apply $releaseSha $reportSha $backupDir
```

O executor valida manifesto, backup, destino, baseline, constraints e RLS.
Adquire o advisory lock `(743204,23)` e bloqueios `ACCESS EXCLUSIVE` no
ledger e na tabela de RAs, com `lock_timeout` de cinco segundos. Falha de
identidade, integridade, lock, ledger, contagem ou conteúdo cancela a execução.
Antes do COMMIT, o rollback abrange schema, catálogo e ledger. Após COMMIT
confirmado, uma reversão operacional requer procedimento e autorização próprios.

### 3. Reconciliação e conferência

Se a confirmação do COMMIT se perder, guardar o JSON da tentativa e abrir uma
nova conexão **autorizada em leitura** com os mesmos hashes:

```powershell
node database/local/ra-operational/execute.mjs --reconcile $releaseSha $reportSha $backupDir
```

O reconciliador atesta o destino, tenta adquirir o mesmo advisory lock e inicia
um snapshot consistente em leitura. Ele compara schema, ledger, catálogo,
metadados e EWKB. O resultado descreve o estado final do pacote:

- `NOT_PERSISTED`: baseline vazio, sem a migration. Após novo preflight e
  validação da autorização vigente, o responsável pode decidir sobre nova execução.
- `PERSISTED`: 37 referências exatas e ledger completo. Seguir para a conferência
  pós-COMMIT. Em reexecução idempotente, esse estado pode ser de uma aplicação anterior.
- `DIVERGENT_OR_INCONCLUSIVE`: divergência, lock em uso ou falha de consulta.
  Interromper e encaminhar para análise. Desconexão isolada nunca prova rollback.

O executor não repete a aplicação automaticamente. Mesmo com COMMIT confirmado,
rodar a conferência em leitura e validar os GETs com sessões dos três perfis.
Confirmar 37 UUIDs distintos com os nomes aprovados, natureza conforme o
catálogo existente e ausência de metadados internos nas respostas.

### 4. Vínculos após a carga

Somente após o pacote aparecer integralmente persistido, colher do PostgreSQL,
em sessão global autorizada e `READ ONLY`, o `id`, `codigo_interno`, `nome` e
`referencia_cartografica` das 37 linhas da versão
`SENTINELA_RA_PUBLICO_2026_11_13_V1`. Usar a sessão já atestada após
`PERSISTED`, com saída em diretório privado:

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT id, codigo_interno, nome, referencia_cartografica
FROM sentinela.regioes_administrativas
WHERE versao_catalogo = 'SENTINELA_RA_PUBLICO_2026_11_13_V1'
ORDER BY codigo_interno COLLATE "C";
ROLLBACK;
```

Comparar código, objectid, nome, versão
e hash da fonte contra o payload revisado e o snapshot GeoJSON. Conferir que
cada UUID coincide com o GET. Preparar `public/data/cartography/ra-bindings.json`
com os UUIDs persistidos, sem inventar vigência. Validar pelo
[contrato de vínculos](ra-bindings.md) e repetir os testes `ra-bindings` e de
validação territorial antes de disponibilizar o arquivo.

## Registro da homologação

O pacote v2 e a variante operacional passaram em PostgreSQL/PostGIS real
em ensaios isolados distintos. Esses ensaios precederam a aplicação operacional.
[Relatório da variante operacional](homologacao-ra-operacional-sprint-04.md)

Para verificar o pacote sem conectar ao banco, execute:

```powershell
node database/local/ra-operational/execute.mjs --verify
```

Com autorização operacional própria, o modo de aplicação recebe
`--apply <sha256-do-manifesto-revisado> <sha256-do-relatório-de-backup> <diretório-privado-do-backup>`.
A credencial da conta local de manutenção vem de
`SENTINELA_RA_MAINTENANCE_PASSWORD`, fornecida ao processo por mecanismo privado.
O executor usa o destino local atestado e emite um JSON com etapa, resultado,
hashes e contagens. Em falhas, emite apenas códigos sanitizados e o estado da
transação. O SQL da migration é um corpo transacional renderizado pelo executor.

### Pré-condições de liberação

- [x] Homologar a variante em cluster isolado com primeira carga, reexecução,
  rejeição de divergências, rollback, RLS e HTTP.
- [x] Revisar migration, executor, hashes e diferenças para o v2.
- [x] Obter autorização específica para migration e carga. Atestar a conta de
  manutenção, o destino local e a janela para locks exclusivos sobre RA e ledger.
- [x] Reconfirmar o inventário global em leitura, o ledger, os privilégios e a
  compatibilidade do backup com o estado atual. Verificar o relatório de restore
  isolado e a retenção dos artefatos. O executor verifica os hashes e o escopo
  declarado, mas a comparação integral dos fingerprints atuais é uma verificação
  prévia do responsável pela operação.
- [x] Para a primeira execução, confirmar catálogo global vazio. A reexecução
  aceita somente a migration registrada com as 37 linhas exatamente iguais
  ao pacote. Estados parciais, versões adicionais e divergências exigem análise.
- [x] Após commit confirmado, validar os UUIDs persistidos e gerar vínculos
  operacionais a partir do próprio banco.
- [ ] Validar os GETs autenticados quando a credencial de login da reader estiver
  configurada para a aplicação.

A migration, seu registro no ledger e a carga têm um único commit. Se o cliente
perder a confirmação, seguir o comando `--reconcile` do roteiro acima antes de
decidir sobre nova execução.
