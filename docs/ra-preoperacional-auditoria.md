# Etapa 2.17.3 — auditoria pré-operacional

Data: 13/11/2026. **Decisão: BLOQUEADO para carga operacional.**

**Atualização após auditoria autenticada:** a falta de evidência reader foi
resolvida pelo snapshot `7c1ec859-60ea-4950-aaa5-d842bf6bcbd8`. A qualificação
offline aprovou os 14 grupos estruturais, sem divergências não autorizadas.
Ledger e contagem global seguem NOT VERIFIED, e backup/restauração e preparação
operacional continuam bloqueando a carga. A seção final registra as novas provas;
as observações iniciais abaixo são preservadas como histórico da primeira tentativa.

A infraestrutura de sandbox foi qualificada anteriormente e reensaiada nesta etapa.
Isso não substitui a auditoria autenticada do estado atual do operacional, backup
local válido, restauração isolada e aprovação do executor operacional.

## Estado observado e limites da evidência

Branch `feat/sprint4-auth-local-mapas`, HEAD
`fe874f68e4d6e36f9661fb00b683ecddad4c3ea9`, sem alterações de histórico. Trabalho
anterior, untracked, Breadcrumb, fontes, credenciais e migrations preservados.

A inspeção sanitizada de configuração confirmou:

- `SENTINELA_LOCAL_READER_URL` ausente no ambiente carregado pelo Next.
- Provedor local selecionado; `SENTINELA_LOCAL_BIND` não configurado como
  `127.0.0.1` neste processo de auditoria. O servidor pode receber flags próprias;
  isso não foi inferido como falha do login do usuário.
- Uma tentativa não interativa com psql, usuário `sentinela_local_reader`, destino
  literal `127.0.0.1:5432/sentinela_dev_operacional`, não conseguiu autenticar.
  Detalhes privados omitidos. Não houve fallback para postgres.
- A auditoria Node interrompeu na configuração, antes de enviar consultas.
  Evidência: `tmp/ra-preoperational-eba172a9-f215-4476-9997-02d656051e52/audit.json`.

Portanto **não foram reconfirmados nesta etapa**: system identifier operacional,
versões atuais, tabelas, colunas/domains, owners/defaults, constraints, FKs, índices,
triggers/funções, RLS/policies/grants, ledger, contagem global de RAs e de vínculos,
dependências de ocorrências ou ausência de conflitos. O último levantamento da
2.17.2 registrou 17.11/3.6.2, zero RAs e ledger 0001–0005/local-read-0001;
esses dados são históricos, não evidência atual renovada.

Mesmo após autenticar, contagem sob RLS é **contagem visível**, não global. A
consulta do system identifier e do ledger pode ser recusada; cada recusa recebe
NOT VERIFIED, sem elevação automática. Informação imprescindível exige evidência
complementar produzida pelo responsável apropriado, em leitura autorizada.

## Auditoria preparada

`scripts/audit-ra-preoperational.mjs` usa configuração restrita ao loopback, porta,
banco e role reader; não aceita URI por argumento, elimina variáveis PG herdadas,
define transações READ ONLY e timeout e não imprime erros originais/credenciais.
Produz snapshot de metadados, ACLs, definições e contagens visíveis, SHA-256 e
checks separados. Consultas opcionais usam savepoints para recuperar a transação
após permission denied, sem alterar dados. Não consulta registros de usuários.
Corpos de funções ficam somente como SHA-256 da definição completa, evitando
registrar literais potencialmente sensíveis. `search_path` é fixado em pg_catalog.
Privilégios efetivos de INSERT/UPDATE/DELETE são consultados em metadados, sem
executar operações de escrita. Acesso interno inesperadamente permitido falha
mesmo que a consulta não retorne linhas.

Execução manual segura, na raiz do projeto:

```powershell
.\scripts\audit-ra-preoperational.ps1
```

O helper recebe **a senha já existente da role reader** por `Read-Host -AsSecureString`.
Configura somente variáveis do processo, codifica a senha uma vez, não grava arquivo
de autenticação, restaura o ambiente ao terminar e libera o BSTR. A senha passa em
memória para o processo Node; não fica em argumentos/histórico. Strings gerenciadas
e ambiente transitório não oferecem garantia de zeragem física total da memória.
Não enviar senha pelo chat. Não modifica `.env.local`, senha ou conta alguma.

O SQL fixo `preoperational-snapshot.sql` coleta tabela/domains, defaults, constraints,
índices, triggers, funções, RLS/policies, grants por coluna, schemas/owners/ACLs,
extensões, atributos/memberships da reader, dependências das RAs e estruturas de
vínculo conhecidas. Não usa SQL fornecido pelo cliente. O snapshot deve ficar fora
de commits; `tmp/` é o destino de evidência local, não documentação pública.

## Comparação de ambientes

| Item | Classificação atual | Evidência / condição |
| --- | --- | --- |
| Baseline original e UUID/default | Compatível na referência histórica | SHA e instalação controlada no sandbox; comparação operacional atual NOT VERIFIED |
| Colunas, domains/CHECKs, constraints, índices, triggers, funções | Não verificado no operacional atual | Comparador confronta definições completas, não apenas contagens |
| RLS e 48 grants mínimos | Qualificado no sandbox | Operacional atual NOT VERIFIED |
| LOGIN reader operacional × NOLOGIN na baseline do sandbox | Diferença esperada estrita | Só aceita sem atributos administrativos/memberships extras |
| Schemas de versão/vínculo/geometria/recibo | Preparação adicional | Estruturas experimentais não são migration operacional instalada |
| Policy do catálogo canônico | Incompatível como implantação direta | Sandbox usa marcador de teste; não copiar para dados reais |
| `codigo_oficial` e vigência ilimitada técnica | Decisão semântica pendente | Não promover convenção do ensaio a validade normativa |
| Executor `load_catalog` | Incompatível como implantação direta | Recusa 5432 e só aceita postgres no sandbox; não é role de carga mínima operacional |
| GET `{id,nome}` | Compatível no ensaio nativo | Mesmo SQL e Zod; HTTP operacional atual não revalidado |

Depois de obter o snapshot operacional autenticado, comparar com a **baseline do
sandbox anterior às alterações experimentais**, não com o estado final de mutações:

```powershell
node scripts/compare-ra-preoperational.mjs '<pasta-da-auditoria>\audit.json' '<evidencia-do-sandbox>\preoperational-baseline.json' --sandbox-sha256 '<hash-aprovado-da-baseline>'
```

São caminhos de evidências reais, não credenciais. Cada resultado novo fica em
`tmp/ra-preoperational-comparison-<uuid>/comparison.json`, com SHA-256 próprio.
O antigo `tmp/ra-preoperational-comparison.json` permanece histórico e não é sobrescrito.
Snapshot ausente, identidade errada,
coleção ausente, privilege drift, policy ou função diferente nunca viram PASS.
Mesmo PASS de estrutura não aprova dados globais, backup, loader ou autorização.

## Fonte e revisão do carregador

Snapshot e metadados continuam fixados pelos hashes publicados em
[ra-bindings.md](ra-bindings.md). São 37 códigos/nomes/ObjectIDs distintos, EPSG:4326,
109.368 vértices, extração 13/11/2026. Vigência legal desconhecida e nove pequenas
interseções preservadas. Não houve download substitutivo, reparo ou simplificação.

O carregador continua parametrizado por payload de fonte fixada, sem EXECUTE de
SQL dinâmico: hash antes de interpretar, lock, UUID gerado só na primeira inserção,
preservação de UUID existente, recusa de conflitos e recibo transacional. RAs da
baseline permanecem imutáveis. Versões/geometrias/vínculos anteriores não são
sobrescritos. Runtime não tem EXECUTE no carregador. Falha intermediária reverte
toda a chamada e seus recibos; a função não faz COMMIT independente.

**Não há executor operacional mínimo qualificado.** O uso de postgres no sandbox
não satisfaz esse critério para a aplicação real. Esse item permanece BLOCKED,
sem conceder novos privilégios para contornar a pendência.

## Backup atual e recuperação

Os diretórios observados em `D:\Backups\SENTINELA` correspondem às operações
Supabase de 06/11/2026 e seus ensaios. Não foi identificado/comprovado um backup
atual de `sentinela_dev_operacional`. Não foram reclassificados como backup local.
O script `backup-supabase.mjs` exige configuração remota/TLS própria e não deve
ser reutilizado alterando a conexão para o banco local.

**Backup local válido: BLOCKED. Recuperação desse backup: NOT VERIFIED.** Não
executamos dump com credencial administrativa como substituição automática da
reader indisponível. Nenhum backup ou evidência foi excluído/sobrescrito.

Após autorização específica e confirmação do executor de backup apropriado, os
comandos de ferramenta abaixo são exatos. O diretório novo deve ser privado,
fora do Git, com espaço e DACL aprovados. A senha vem do pgpass privado ou entrada
oculta do próprio cliente; nunca de argumento ou URI.

```powershell
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$backupDir = Join-Path 'D:\Backups\SENTINELA' ('LOCAL-PRE-RA-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid())
if (Test-Path -LiteralPath $backupDir) { throw 'Destino deve ser novo' }
# Somente após aprovar a criação privada/DACL deste diretório e o executor:
New-Item -ItemType Directory -Path $backupDir -ErrorAction Stop | Out-Null
$dumpFile = Join-Path $backupDir 'database.dump'
& "$pgBin\pg_dump.exe" -w -h 127.0.0.1 -p 5432 -U postgres -d sentinela_dev_operacional --format=custom --lock-wait-timeout=10000 --file $dumpFile
if ($LASTEXITCODE -ne 0) { throw 'Dump falhou; preservar parcial sem valida-lo' }
Get-FileHash -LiteralPath $dumpFile -Algorithm SHA256
& "$pgBin\pg_restore.exe" --list $dumpFile
if ($LASTEXITCODE -ne 0) { throw 'TOC ilegivel' }
& "$pgBin\pg_restore.exe" --file NUL $dumpFile
if ($LASTEXITCODE -ne 0) { throw 'Leitura integral falhou' }
```

Esses comandos **não foram executados**. Não liberar o dump sem conferir DACL;
`New-Item` isoladamente não garante privacidade. Stderr/TOC podem conter nomes
privados: capturar em evidência restrita, sem publicar registros ou erros brutos.
Registrar identidade autenticada, horário/ferramentas, código de saída, tamanho,
SHA-256, inventário e limitações em manifesto privado. Sem exclusões silenciosas.
Formato custom usa snapshot consistente do banco, mas não inclui roles globais,
senhas, HBA, configuração do cluster, arquivos externos ou binários PostGIS.
Guardar backup até encerramento formal da janela de recuperação, sem rotação
destrutiva automática. Integridade do arquivo não comprova restaurabilidade.

A restauração exige **novo cluster atestado e novo banco vazio**; nunca 5432 nem
banco existente. Confirmar PostgreSQL/PostGIS, roles técnicas, locale, identidade,
diretório e ACLs. Só depois usar `pg_restore --exit-on-error --single-transaction`
com destino explícito isolado, sem `--clean`. Preservar owners/ACLs quando as roles
forem reproduzidas; usar `--no-owner/--no-privileges` mudaria o escopo e não provaria
recuperação integral de segurança. Porta/UUID não podem ser inventados no runbook:
serão os emitidos pelo controlador do novo ensaio de recuperação.

Não houve restauração nesta etapa porque o backup local está pendente. Não criar
um teste de restauração fictício usando o dump antigo de outro banco.

## Runbook operacional futuro e gates de interrupção

Responsável: executor indicado pelo projeto, com registro escrito de autorização
contendo destino literal, revisão SQL, hashes, fonte, backup e janela de execução.
Revisor independente confere identidade, semântica, ACLs e plano de recuperação.

1. Executar a auditoria reader e obter evidência complementar de identificação,
   ledger e contagens globais que ela não puder verificar. Parar com qualquer
   NOT VERIFIED essencial; não usar contagem visível como contagem global.
2. Executar o comparador da baseline e revisar cada diferença. Conferir hashes
   da fonte com `Get-FileHash -Algorithm SHA256` e versão/temporariedade adotadas.
3. Produzir e validar o backup local conforme procedimento acima; comprovar
   restauração isolada e inventário/ACLs antes de liberar a carga.
4. Aprovar semântica de `codigo_oficial`, disponibilidade versus vigência jurídica,
   estrutura operacional versionada e policy mínima do GET. Não marcar catálogo
   real como `SENTINELA_TESTE_LOCAL_V1` ou `SENTINELA_WRITE_SANDBOX_V1`.
5. Preparar/revisar artefatos operacionais próprios e role de carga limitada,
   sem BYPASSRLS, sem privilégios administrativos na aplicação e sem propriedade
   ampla. Ensaiá-los em clone estrutural aprovado, incluindo recusa de privilégios
   indevidos. Nenhuma migration oficial existente deve ser editada.
6. Registrar hashes exatos dos **artefatos operacionais aprovados** e conferir
   se correspondem ao ensaio. Hoje eles não existem; **não há comando de escrita
   operacional liberável**. Não trocar 55432 por 5432 no SQL de sandbox.
7. Após resolver todos os gates e obter autorização posterior, o wrapper aprovado
   deve executar arquivo integral com `psql -X -w -v ON_ERROR_STOP=1`, destino
   literal validado, autenticação privada e transação própria. Registrar horário,
   identidade, source hash e ID da carga. Não encadear comandos externos de alteração.
8. Dentro da transação: lock/statement timeout, preflight final de dados/estrutura,
   estruturas aprovadas quando necessárias, carga idempotente e vínculos/recibo.
   Antes do COMMIT verificar 37 referências aprovadas (ou escopo revisado), UUIDs
   estáveis, ausência de duplicados/órfãos, hash/versão/temporalidade, contagens e
   preservação de dados fora do catálogo, constraints/triggers/RLS/ACLs.
9. Abortamento: identidade/hash divergente, conflito, timeout, privilégio faltante,
   quantidade inesperada ou qualquer verificação essencial pendente => erro e
   ROLLBACK. Nunca ampliar grants, editar dados ou repetir automaticamente.
10. Depois do COMMIT confirmado: auditar novamente em leitura e por autenticação
    nativa da reader, testar mesmo SQL/Zod/HTTP GET, exportar matriz real do banco,
    registrar hashes e preservar evidências. Não ativar escrita de ocorrências.

O item 6 é um bloqueio explícito de implementação/revisão futura, não um comando
fictício com nome de arquivo inexistente apresentado como pronto. Os comandos
executáveis hoje são a auditoria reader, comparação e ensaio de sandbox.

Falha antes/durante COMMIT com conexão válida: ROLLBACK e inspeção READ ONLY.
Perda de conexão perto do COMMIT: resultado desconhecido; consultar recibo,
catálogos e UUIDs antes de qualquer nova operação. Se o recibo não existir, isso
sozinho não autoriza repetir: confrontar todas as invariantes e locks/sessões.

Divergência após COMMIT: interromper consumo afetado, preservar evidência e mapa
de FKs/dependências. A RA é imutável e pode ser referenciada por ocorrências;
não excluir/recriar ou usar CASCADE. Preparar correção versionada autorizada.
Restauração operacional é último recurso com aprovação própria, janela, parada
controlada e backup ensaiado primeiro em destino isolado. Registrar incidente,
causa, decisão, hashes, resultado e validação pós-recuperação.

## Checklist de liberação

Este checklist registra a primeira execução, anterior ao snapshot autenticado;
consulte o checklist atualizado ao final para a situação vigente.

| Requisito | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| Fonte fixada/integridade | PASS | Snapshot IDE/DF, códigos/feições e hashes; sem vigência legal inferida |
| Aprovação semântica operacional da fonte/campos | BLOCKED | Código oficial/vigência precisam de decisão |
| Schema operacional atual compatível | NOT VERIFIED | Credencial reader indisponível |
| Scripts de carga em sandbox | PASS | Ensaios reais; não são executor operacional |
| Idempotência | PASS | Segunda carga 0 novas / 37 reutilizadas |
| UUIDs estáveis | PASS | UUID preexistente preservado e DEFAULT na primeira inserção |
| Vínculos corretos | PASS | 37 na versão canônica do sandbox; operacional NOT VERIFIED |
| Backup local válido | BLOCKED | Só backups Supabase anteriores identificados |
| Recuperação do backup local | NOT VERIFIED | Sem dump local qualificado |
| Privilégios mínimos runtime | PASS | Qualificados em sandbox; atuais operacionais NOT VERIFIED |
| Role/executor de carga operacional mínima | BLOCKED | Não implementado/aprovado; postgres de sandbox não satisfaz |
| RLS/triggers íntegros | PASS no sandbox | Operacional atual NOT VERIFIED |
| GET compatível | PASS no sandbox | SQL/Zod e role nativa; HTTP operacional atual NOT VERIFIED |
| Contagens esperadas | PASS no sandbox | 37 canônicas, sem órfãos; global operacional NOT VERIFIED |
| Ausência de riscos impeditivos | FAIL | Credencial, backup, recuperação, schema/ACL/executor pendentes |
| Autorização operacional | BLOCKED | Não concedida nesta etapa |

Não há indicação de corrupção ou falha operacional comprovada; FAIL acima significa
que o critério de liberação não foi satisfeito, não que dados tenham sido alterados.

## Ensaio final e evidências

Comando efetivamente executado, sem acesso operacional:

```powershell
python -B database/local/write-sandbox/run-geography.py --execute --bindings --catalog --preoperational
```

Sandbox final `47436ca6-7f55-49f8-a909-a3f2cfea0add`, system identifier
`7707663796932284316`, em `127.0.0.1:55432/sentinela_rls_sandbox`.
Estado final **STOPPED**, sem postmaster.pid. Identidade/HBA/listener foram
atestados pelo controlador e todos os manifestos anteriores preservados.

Antes das alterações experimentais, o snapshot da baseline registrou 19 tabelas,
77 índices, 55 triggers, 17 funções, dois domains com CHECKs, seis policies,
48 grants por coluna e ENABLE/FORCE RLS. Definições/owners/defaults/ACLs constam
da evidência; não se usa só a igualdade dessas contagens como prova de paridade.

Foram repetidas as 194 verificações geográficas/de regressão (incluindo 174 casos
de paridade), os 11 cenários de carga/idempotência/rollback e cinco grupos nativos
de GET/segurança. O quinto grupo executa o mesmo SQL de snapshot de metadados com
autenticação direta da reader. Não é validação da autenticação operacional.

Resultado canônico: 37 UUIDs/códigos/vínculos/geometrias históricas, zero órfãos.
Um UUID preexistente foi preservado, 36 inseridos; reexecução 0 inserções/37
reutilizações. Conflitos e fonte adulterada foram recusados, e falha intermediária
comprovou rollback. Privilégios de escrita/estruturas internas recusados ao runtime.

Pasta privada: `C:\Users\pedro\.sentinela-local\rls-sandboxes\rls-sandbox-47436ca6-7f55-49f8-a909-a3f2cfea0add\evidence`.

| Arquivo | SHA-256 |
| --- | --- |
| `geography-completion.json` | `024f1e6fd52cbc9b635968d5b1bf6bd064cb079e9201f3ebb8077b32c7693a83` |
| `preoperational-baseline.json` | `f18059720a3bc067dafd1d48efc640b1f86aa12e5634106043dd00da822136fc` |

`catalog-get-tests.json`, `bindings-tests.json`, `geography-tests.json` e
`catalog-bindings.json` preservam as demais verificações. O runner também compara
os hashes de todos os seus artefatos ao fim, para recusar drift durante o ensaio.

O comparador foi executado com o registro de auditoria interrompida e essa baseline:
retornou **NOT VERIFIED — Authenticated snapshots missing**. Evidência:
`tmp/ra-preoperational-comparison.json`. Isso comprova o gate de recusa, não uma
comparação estrutural operacional bem-sucedida.

## Alterações desta etapa

Criados: SQL de snapshot, comparador puro, scripts Node de auditoria/comparação,
helper PowerShell de senha oculta, política pura dos checks de leitura, testes
`ra-preoperational.test.mjs` e este relatório. Atualizados: runner opcional de
sandbox, qualificador nativo do GET e os três documentos de catálogo/cartografia.
Não houve necessidade de alterar o carregador já homologado, a aplicação, login,
API GET, fonte cartográfica, migrations oficiais ou contas existentes.

O próximo passo concreto é executar o helper de auditoria no PowerShell local
com a senha existente da reader, sem enviá-la pelo chat. Depois confrontar o
snapshot com a baseline preservada e obter as evidências globais ainda vedadas
à reader. Backup/recuperação, semântica dos campos, executor mínimo e autorização
operacional continuam gates independentes; resolver a senha não libera a carga.

## Qualidade final

| Verificação | Resultado |
| --- | --- |
| Testes automatizados | 207 aprovados; 201 anteriores preservados |
| Comparador | Rejeições de drift, identidade errada, memberships/admin e dados ausentes aprovadas |
| Negativas da auditoria | Acesso interno inesperado e privilégio de escrita nunca viram PASS |
| TypeScript principal/experimental | Aprovados |
| ESLint | Aprovado |
| Zod/OpenAPI | 35 schemas, 13 paths, 15 operações, 31 payloads |
| Rotas estáticas | Oito páginas, 351 imports locais |
| Build Next.js isolado | Aprovado |
| Helper PowerShell | Zero erros de parsing; senha real não solicitada/executada pelo agente |
| git diff --check | Aprovado; avisos LF/CRLF preexistentes |

Não houve novo ensaio visual, pois a aplicação não mudou e ele não foi requisito
desta etapa. As evidências visuais anteriores permanecem históricas.
Breadcrumb preservado: `3c4528e5e547f9df0d52f05eba86b7b43db5fa0fc43c57618db4a93f9ffc38a8`.
Cartografia integral, metadados e GeoJSON legado conservaram seus SHA-256.
Sem arquivos staged, commits, push, PR, alterações de login/credenciais, migrations
oficiais, dados operacionais ou Supabase. O servidor 5432 respondeu ao pg_isready;
isso comprova disponibilidade, não autenticação nem integridade global de dados.

## Requalificação offline do snapshot autenticado

### Causa comprovada da mensagem anterior

O comando anterior registrado nesta etapa selecionou
`tmp/ra-preoperational-eba172a9-f215-4476-9997-02d656051e52/audit.json`, com
`result: FAIL`, estágio `configuration` e sem `snapshot`. O comparador antigo
agrupava esse caso em `Authenticated snapshots missing`. Não houve rejeição do
novo snapshot autenticado: ele não foi a entrada daquela comparação.

O resultado antigo tem mtime UTC `2026-11-13T14:34:39.668Z`, anterior ao
`createdAt: 2026-11-13T14:38:44.962Z` do novo audit. A ordem é consistente com o
comando documentado; mtime é evidência de arquivo, não horário de COMMIT ou prova
independente de autenticação. O arquivo antigo foi preservado byte a byte.

### Fontes reconhecidas e integridade

| Evidência | SHA-256 verificado |
| --- | --- |
| `tmp/ra-preoperational-7c1ec859-60ea-4950-aaa5-d842bf6bcbd8/audit.json` | `9473545ce237f544e05e11f66f5fc60e23984f6e69b2d6c4f9a78a4f4c350734` |
| Baseline privada do sandbox `47436ca6-7f55-49f8-a909-a3f2cfea0add`, `evidence/preoperational-baseline.json` | `f18059720a3bc067dafd1d48efc640b1f86aa12e5634106043dd00da822136fc` |

O hash do audit foi calculado sobre os bytes originais e confrontado com
`sha256.txt`; o da baseline, com o valor aprovado no relatório anterior. Hash
comprova integridade relativa à referência, não assinatura digital/autorização.
O formato operacional é `{format:1,result,checks,snapshot,catalogTotal,...}`;
a baseline usa `{scope:'sandbox-baseline-only',snapshot}` e não exige um `result`
fictício. Ambos foram reconhecidos sem modificar os arquivos de entrada.

Reprodução offline, com seleção explícita:

```powershell
node scripts/compare-ra-preoperational.mjs 'tmp\ra-preoperational-7c1ec859-60ea-4950-aaa5-d842bf6bcbd8\audit.json' 'C:\Users\pedro\.sentinela-local\rls-sandboxes\rls-sandbox-47436ca6-7f55-49f8-a909-a3f2cfea0add\evidence\preoperational-baseline.json' --sandbox-sha256 f18059720a3bc067dafd1d48efc640b1f86aa12e5634106043dd00da822136fc
```

Nova evidência: `tmp/ra-preoperational-comparison-2726a913-4210-4d40-ac9c-680a5091bae4/comparison.json`.
SHA-256: `ffefbe28c84166dd42126c04a97a6277f07111dd18b3d75970fb5d4284310259`.
Resultado **PASS**, escopo `baseline-structure-only`, readiness **BLOCKED**.
O novo CLI registra paths resolvidos, hashes verificados, timestamp e gates
separados. Não escolhe silenciosamente o arquivo mais recente. Repetir o comando
cria outro diretório; não destrói a comparação anterior ou evidências antigas.

### Comparações executadas

Os 14 grupos passaram: domains/tipos, tabelas, colunas, constraints, índices,
triggers, hashes das definições completas de funções, policies, grants por coluna,
ACLs dos schemas, default privileges, dependências de RAs, versões/extensões e
atributos restritivos/memberships da reader.

A identidade difere conforme esperado: operacional reader em
`127.0.0.1:5432/sentinela_dev_operacional`; baseline de sandbox com postgres em
`127.0.0.1:55432/sentinela_rls_sandbox`. LOGIN operacional true × baseline false
é aceito estritamente, mantendo NOINHERIT, ausência de memberships, limite cinco
e ausência explícita de todos os atributos administrativos. Campo de segurança
ausente não é convertido em false. A ordem de chaves de objetos JSON não altera
o resultado; arrays/definições e privilégios não são descartados para obter PASS.

Nenhuma divergência estrutural inesperada foi encontrada. O operacional observado
tem PostgreSQL 17.11/PostGIS 3.6.2, 19 tabelas com ENABLE/FORCE RLS, 77 índices,
55 triggers, 17 funções, seis policies e 48 grants por coluna. O system identifier
registrado pela auditoria é `7702156035351602692`. As estruturas pesquisadas de
vínculo operacional não constam do snapshot (`binding_structures: []`); as
estruturas experimentais de carga não se tornam instaladas por essa comparação.

### Gates vigentes

| Verificação | Estado atual |
| --- | --- |
| Integridade dos dois snapshots | PASS |
| Autenticação reader / READ ONLY / identidade registrada | PASS no audit fornecido |
| Quatorze grupos de baseline | PASS |
| SELECT visível e projeção GET | PASS, zero linhas visíveis |
| Negativa de usuários internos e ausência de escrita | PASS no audit fornecido |
| Ledger | NOT VERIFIED, SQLSTATE 42501; nenhuma concessão realizada |
| Contagem global de RAs | NOT VERIFIED; a role está sujeita a RLS |
| Backup local atual válido | BLOCKED; nenhuma evidência nova fornecida |
| Restauração isolada desse backup | NOT VERIFIED |
| Executor/migration/ACLs operacionais e semântica dos campos | BLOCKED, revisão própria ainda necessária |
| Autorização para carga | BLOCKED, não concedida |

`result: PASS` do audit não transforma todos os seus checks em PASS. O novo recibo
de comparação preserva ledger 42501 e `catalogTotal` inconclusivo; aprovação de
metadados não libera a carga. Nenhum SQL, conexão, nova auditoria, backup ou
restauração foi executado nesta requalificação: somente leitura de arquivos locais.

### Verificação global futura — não executada

Foi preparado `database/local/audit/verify-ra-global-readonly.sql`. Deve ser
executado somente por responsável com autorização explícita para um acesso
privilegiado **já existente**, nunca elevando a reader. Uma role proprietária sem
BYPASSRLS não basta sob FORCE RLS. O script exige SUPERUSER ou BYPASSRLS já presente,
confirma `row_security_active=false`, ENABLE/FORCE preservado, destino literal e
o system identifier observado, em transação REPEATABLE READ READ ONLY. Não usa
SET ROLE nem desliga RLS. Colhe somente contagem global e versões do ledger.
Qualquer pré-requisito ausente aborta; não amplia privilégios para prosseguir.

Após autorização específica do executor apropriado, o responsável poderá usar
psql com `-X -w -v ON_ERROR_STOP=1`, conexão local explícita e autenticação privada
existente para esse arquivo, guardando saída e SHA-256 em evidência restrita.
Não foi fornecida senha, selecionada credencial administrativa ou executado esse
arquivo pelo agente. Até essa evidência existir, ambas as verificações continuam
NOT VERIFIED. Backup/restauração e autorização operacional permanecem gates
independentes mesmo depois de resolver a contagem global e o ledger.

### Testes e correções da qualificação

Foram aprovados 15 testes pertinentes: comparação estrita, formatos reais dos
wrappers, BOM/CRLF, hashes incorretos/arquivo adulterado, referências ausentes,
caminhos Windows com espaços/separadores, rejeição de UNC/URLs, segurança ausente,
RLS/ledger inconclusivos e preservação dos resultados históricos. ESLint dos
artefatos envolvidos e `git diff --check` passaram. Não foi necessário rebuild
Next.js ou ensaio em banco: a mudança afeta somente ferramentas offline.

Arquivos envolvidos: `scripts/ra-evidence.mjs`, `scripts/compare-ra-preoperational.mjs`,
`database/local/write-sandbox/compare-preoperational.mjs`,
`tests/ra-evidence.test.mjs`, o SQL futuro de leitura global e este relatório.
A alteração do comparador muda seu hash frente a manifestos históricos: nenhum
manifesto antigo foi atualizado ou reaprovado. Futuro ensaio deve usar revisão
explicitamente aprovada ou cluster novo; esta qualificação não reinicia sandboxes.

A conferência do manifesto preservado encontrou 41 artefatos registrados: 40
permanecem com SHA-256 idêntico. A única diferença é o comparador corrigido:
hash anterior `805fd0469a05c0bface9b8aeb8e85e05e3d33f5d70d47908ecc0842b07b6db08`,
atual `e72b89a04128bb6f90714aa744e2b7fd774973f1ccb77a95575424daacd5da3c`.
Esse drift é esperado pela edição autorizada, mas não constitui aprovação retroativa
do manifesto. O manifesto lido conserva SHA-256
`dd8fd6d7d7bfa107d88e7df6fca3aad6941a34661682822406b9bc5819ec2999`.
O arquivo de baseline usado na comparação conserva seu hash aprovado, independente
da revisão do código atual. Nenhum artefato SQL ou dado do cluster foi alterado.
# Atualização de qualificação — 13/11/2026, Etapa 2.17.4

As pendências históricas de contagem global, ledger, backup e restauração
isolada foram resolvidas para o estado inventariado. Consulte
[backup e recuperação local](backup-recuperacao-postgresql-local.md) para os
hashes, escopo, testes, limitações e evidências privadas. As seções anteriores
registram a situação histórica; não houve alteração dos recibos antigos.

A leitura global expressamente autorizada como `postgres`, em READ ONLY,
confirmou zero RAs, zero códigos distintos e zero grupos duplicados. O ledger
contém exatamente `0001`–`0005` e `local-read-0001`. Esses resultados não foram
inferidos da reader sujeita a RLS; seu bloqueio ao ledger permanece preservado.

O backup `LOCAL-PRE-RA-20261113T151626Z-04e9493eb5ba3846` foi restaurado em
cluster novo e isolado, com comparação de estrutura e fingerprints dos dados
das 19 tabelas aprovada. O relatório privado registra PASS e origem preservada;
o cluster de restauração terminou STOPPED. A comprovação cobre o banco lógico,
sem incluir recuperação física, senhas globais ou PITR.

**Carga operacional continua BLOQUEADA por ausência de autorização específica
e decisões próprias de catálogo/ACL/policies.** Esta qualificação não autoriza
carga, migração ou escrita de ocorrências, nem altera o resultado histórico
dos snapshots autenticados da reader.

# Revisão administrativa do catálogo — Etapa 2.17.5

Novo [dossiê oficial](revisao-oficial-catalogo-ras.md), com 37 entradas classificadas:
35 aprovadas e duas aprovadas com ressalvas. Identidades confirmadas não substituem
autorização de carga, decisões de namespace/vigência ou revisão de ACLs/policies.
Nenhuma conexão ou escrita operacional ocorreu nesta etapa. Backup/restore,
contagem global zero e ledger verificados em 2.17.4 permanecem evidências da data
daquele ensaio; não foram apresentados como nova consulta global.

A consolidação 2.17.6 identificou um gate adicional explícito: a policy atual
de RAs permite somente o marcador sintético. O catálogo real não ficará visível
automaticamente após carga. Consulte o [contrato e checklist consolidados](revisao-oficial-catalogo-ras.md).
A policy pública por versão e a evolução mínima de metadados são propostas
documentais ainda não implementadas/homologadas em sandbox. Nenhuma alteração
operacional foi autorizada ou executada nesta etapa.
