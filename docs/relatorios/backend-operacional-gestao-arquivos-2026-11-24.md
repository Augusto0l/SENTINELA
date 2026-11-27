# Backend operacional de gestão de arquivos

## Instalação e delta

A porta 3000 usa PostgreSQL 17.11 com PostGIS 3.6.2, banco `sentinela_pcdf_local` em `127.0.0.1:55484`. O diagnóstico `READ ONLY` confirmou histórico PCDF v1, recibos da importação geral, 19 tabelas principais com RLS forçada e a compatibilidade dos três gatilhos adaptados. Faltavam o schema de gestão, o planejador, a exclusão, o comprovante e a autorização de escrita vinculada à pessoa. A migration permanece ausente do banco principal. A contagem do lote PCDF janeiro/2021 continua em 6.393 associações.

O endpoint `/api/v1/ocorrencias/gestao` e os diálogos existentes estão integrados ao delta `local-import-management-0001`. A integração preserva o rascunho e a prévia informativa em modo de consulta. O delta reaproveita as rotinas homologadas de projeção, revisão, planejamento, remoção e comprovante no recorte de PCDF v1 e importação geral. Cadastro manual e custódia PCDF v2 seguem suas migrações próprias.

- `sentinela_gestao.mutar(jsonb,text,uuid)` valida a pessoa, associação e revisão. Preserva o CSV e registra `ator_tipo='usuario'` e `usuario_id` institucional na auditoria. As consultas projetam a correção.
- `sentinela_exclusao.previa(uuid,uuid,text)` devolve impacto, bloqueios, revisão e estado de aprovação. `sentinela_exclusao.excluir(jsonb,text,uuid)` bloqueia as tabelas do plano, recalcula a revisão e consome a aprovação na mesma transação que remove os dados exclusivos. O comprovante contém apenas identificador, lote, pessoa, justificativa, momento e quantidades.
- `sentinela_gestao_autorizacao` começa fechada e verifica identidade do cluster, usuário ativo, perfil, identidade institucional cadastrada, conta local e prazo. A aprovação da exclusão é vinculada a UUID, revisão, pessoa, ato e prova de recuperação. A aplicação continua sem DML direto às tabelas.

A prévia de janeiro encontrou `execucoes_importacao`, `linhas_staging`, `pendencias_revisao`, `ocorrencia_naturezas`, `historico_correcoes` e `eventos_auditoria`. O inventário do escopo ampliado encontrou 13 FKs, incluindo as referências à extração feitas por `linhas_origem` e `lotes_importacao`. O plano confere nome, tabela, colunas, destino e regra de cada uma. Origem, pendência e extração compartilhadas são preservadas. O plano bloqueia FK divergente, consolidação sem apoio, origem sem lote, execução em andamento, metadados conflitantes e tentativas de titularidade incerta. A competência PCDF janeiro/2021 é protegida mesmo com aprovação cadastrada. A operação se restringe ao banco e preserva XMLs e CSVs no disco.

## Validação

O delta foi exercitado em PostgreSQL descartável na porta 55487, criado com uma linha de base fabricada de PCDF v1 e importação geral. A execução teve oito testes aprovados, incluindo o GET e o POST integrados às funções reais com uma sessão de fixture, recusa de identidade e definição divergentes, edição com autoria humana, conflitos concorrentes, preservação da origem, FK nova, bloqueio de janeiro, consumo de aprovação, remoção após nova conexão, recibos gerais e rollback tardio. Na porta 3000, Playwright confirmou detalhes, formulário, prévia informativa e bloqueio em 1440 e 390 px. O POST sem comando retornou 403. Não foi disponibilizado um clone autorizado com dados operacionais.

TypeScript, ESLint, build isolado, contratos e `git diff --check` passaram. Passaram 41 testes Node do recorte, 13 testes do lançador e 17 testes de regressão do PostgreSQL sintético original. Dois testes Node condicionados a fixtures foram pulados no recorte e exercitados nos comandos PostgreSQL próprios.

```powershell
python -B database/local/pcdf-sandbox/qualify-management.py --operational-delta
```

## Aplicação controlada

### 1. Aprovar destino e recuperação

Obter autorização para destino, pacote, janela e pessoa institucional. Usar o mecanismo privado de credenciais e guardar o dump, inventário de papéis e manifesto fora do repositório. Os exemplos usam variáveis preenchidas pelo responsável de manutenção. `$contaManutencao` é o login aprovado e `$arquivoBackup` é um caminho novo no diretório privado.

~~~powershell
pg_dump -h 127.0.0.1 -p 55484 -U $contaManutencao -d sentinela_pcdf_local --format=custom --file=$arquivoBackup
pg_restore --list $arquivoBackup
Get-FileHash -Algorithm SHA256 -LiteralPath $arquivoBackup
~~~

Guardar as definições dos papéis necessárias à restauração por mecanismo aprovado. Em clone autorizado, conferir o hash e usar `pg_restore --exit-on-error --single-transaction` no banco vazio com papéis e extensões verificados. O clone deve ter identidade própria e escutar na porta 55484 em host isolado para ensaiar o mesmo artefato. Comparar contagens, hashes de origem, papéis, RLS, histórico e FKs. Ensaiar escrita com lotes descartáveis criados para o teste. A janela precisa de evidência própria de recuperação. [Procedimento e evidência anterior de backup](../backup-recuperacao-postgresql-local.md)

#### Criar o clone após a aprovação da cópia

No host isolado aprovado, use o PostgreSQL 17.11 e disponibilize os binários e arquivos de extensão do PostGIS 3.6.2. Verifique a porta 55484 livre e use um diretório novo dentro da área privada aprovada. `$arquivoBackup` é a cópia autorizada cujo SHA-256 já foi confrontado com o registrado na origem. `$rolesCloneSql` contém somente as definições dos papéis necessários, revisadas pelo mantenedor para o clone, sem senhas da origem e sem recriar o login de bootstrap.

~~~powershell
$pgData = Join-Path $diretorioPrivado 'pgdata'
if (Test-Path -LiteralPath $pgData) { throw 'O diretório do clone deve ser novo.' }
$clusterUuid = [guid]::NewGuid().ToString()
initdb -D $pgData -U postgres -W --auth=scram-sha-256 --encoding=UTF8 --locale=C
if ($LASTEXITCODE) { throw 'Falha ao inicializar o clone.' }
Add-Content -LiteralPath (Join-Path $pgData 'postgresql.auto.conf') -Encoding ascii -Value @(
  "listen_addresses='127.0.0.1'", 'port=55484', "sentinela.sandbox_uuid='$clusterUuid'"
)
pg_ctl -D $pgData -l (Join-Path $diretorioPrivado 'postgres-clone.log') -w start
if ($LASTEXITCODE) { throw 'Falha ao iniciar o clone.' }
$clone = @('-h', '127.0.0.1', '-p', '55484', '-U', 'postgres')
psql @clone -X -v ON_ERROR_STOP=1 -d postgres -c "SELECT current_setting('sentinela.sandbox_uuid') = '$clusterUuid' AS uuid_confere, system_identifier FROM pg_control_system()"
~~~

Confronte `uuid_confere=t` e o novo system identifier com o manifesto do clone antes de continuar. Use autenticação privada do clone e confira o diretório de dados na sessão. Em seguida:

~~~powershell
psql @clone -X -v ON_ERROR_STOP=1 -d postgres -f $rolesCloneSql
if ($LASTEXITCODE) { throw 'Papéis do clone divergentes.' }
createdb @clone -T template0 -E UTF8 sentinela_pcdf_local
if ($LASTEXITCODE) { throw 'O banco do clone deve estar vazio e ter sido criado nesta etapa.' }
pg_restore @clone --exit-on-error --single-transaction -d sentinela_pcdf_local $arquivoBackup
if ($LASTEXITCODE) { throw 'Falha ao restaurar o backup no clone.' }
~~~

Registre o SHA-256 do dump, as identidades distintas, a comparação da origem e o resultado do restore. Execute o preflight abaixo com os identificadores do clone, aplique o delta e qualifique as funções com lotes de teste nesse destino. Verifique a recusa pelos perfis sem permissão, a autoria, a preservação da origem e dos dados compartilhados, a exclusão com rollback e a consulta após reconexão. Para comprovar recuperação após commit, restaure o backup em outro destino isolado ou mediante o procedimento de PITR aprovado para o clone. Encerrar o clone com `pg_ctl -D $pgData -m fast -w stop` depois de guardar a evidência privada.

### 2. Gerar e aplicar com a escrita fechada

Em sessão privada, registrar com `SET search_path=pg_catalog,pg_temp` a definição de `sentinela_ocorrencias_local.lista(text,jsonb,integer,text,text)` com `pg_get_functiondef` e seu `md5` em `$readerMd5`. Arquivar também a view `sentinela_ocorrencias_local.importados` e as definições de `sentinela.impedir_mutacao()`, `sentinela.bloquear_correcao_sem_backend()` e `sentinela.bloquear_autoria_manual_sem_auth()`. Usar em `$clusterUuid` e `$systemId` os valores atestados do manifesto privado. O delta já inclui o filtro exato de leitura por UUID.

~~~powershell
python -B database/release/render-operational-import-management.py --output tmp/operational-import-management.sql
Get-FileHash -Algorithm SHA256 -LiteralPath tmp/operational-import-management.sql
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55484 -d sentinela_pcdf_local -U $contaManutencao `
  -v "cluster_uuid=$clusterUuid" -v "system_id=$systemId" -v "reader_md5=$readerMd5" `
  -f tmp/operational-import-management.sql
~~~

Esse comando verifica em `READ ONLY` por padrão. Somente na janela autorizada, repita a invocação do `psql` incluindo `-v check_only=off` para aplicar. Um valor inválido é recusado. A aplicação usa uma única transação e um lock transacional da migration. A reaplicação confere a identidade, o hash registrado e as proteções, sem reabrir a janela. Conferir `versao='local-import-management-0001'` e `aberta=false` em `sentinela_gestao_autorizacao.release` após a primeira aplicação. Conferir RLS forçada, histórico, contagens e HTTP 403 antes da liberação.

### 3. Vincular a pessoa e abrir a janela

A pessoa deve existir em `sentinela.usuarios` com `ativo=true`, `perfil='Administrador'` e `auth_user_id` correspondente à identidade institucional verificada. Usar `usuarios.id` em `$usuarioId`. O script solicita as senhas diretamente no terminal. `-Reconfigure` substitui a configuração das três contas e invalida as sessões anteriores. Preservar o arquivo anterior em armazenamento privado se a janela exigir reversão.

~~~powershell
.\scripts\configure-local-auth.ps1 -Reconfigure -AdministratorSubject $usuarioId
~~~

Calcular a conta com o e-mail do Administrador pelo mesmo algoritmo da aplicação. O trecho recebe o e-mail pelo pipe e guarda apenas seu hash na variável.

~~~powershell
$codigoConta = @'
import { createHash } from 'node:crypto';
let email = '';
for await (const chunk of process.stdin) email += chunk;
const conta = JSON.stringify(['sentinela-local','Administrador',email.trim().toLowerCase()]);
console.log(createHash('sha256').update(conta).digest('hex'));
'@
$anterior = $OutputEncoding
try {
  $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $conta = (Read-Host "E-mail da conta institucional configurada") | node --input-type=module -e $codigoConta
} finally { $OutputEncoding = $anterior }
~~~

Em sessão de manutenção atestada, use variáveis `usuario`, `identidade`, `conta` e `validade`. `identidade` é `usuarios.auth_user_id`. Conferir que a instrução devolve uma linha com `aberta=true`.

~~~sql
WITH vinculo AS (
  INSERT INTO sentinela_gestao_autorizacao.atores(usuario,identidade,conta,validade)
  SELECT id,auth_user_id,:'conta',:'validade'::timestamptz
  FROM sentinela.usuarios
  WHERE id=:'usuario'::uuid AND auth_user_id=:'identidade'::uuid
    AND perfil='Administrador' AND ativo AND :'validade'::timestamptz>clock_timestamp()
  RETURNING usuario
)
UPDATE sentinela_gestao_autorizacao.release SET aberta=true
WHERE singleton AND EXISTS(SELECT FROM vinculo) RETURNING aberta;
~~~

Encerrar o lançador anterior normalmente e reiniciar a mesma aplicação:

~~~powershell
npm.cmd run dev:local -- --management
~~~

Se o PostgreSQL já estiver em execução e atestado, reiniciar apenas o Next.js com `npm.cmd run dev:local -- --next-only --management`. Entrar como a pessoa vinculada. Conferir `escrita=disponivel` na disponibilidade, revisão no detalhe e bloqueio da confirmação para lotes sem aprovação.

### 4. Autorizar a revisão do lote

Registrar pessoa, UUID, revisão da prévia sem bloqueios, ato aprovado, prova de recuperação e expiração. A sessão vinculada pode consultar a revisão em `GET /api/v1/ocorrencias/gestao?view=previa_exclusao&id=<uuid>`, campo `data.revisao`. Na sessão de manutenção atestada usar `lote`, `usuario`, `revisao`, `ato`, `prova` e `validade`:

~~~sql
INSERT INTO sentinela_gestao_autorizacao.exclusoes(lote,usuario,revisao,aprovacao,prova_restauracao,validade)
VALUES (:'lote'::uuid,:'usuario'::uuid,:'revisao',:'ato',:'prova',:'validade'::timestamptz);
~~~

Reconsultar a prévia antes da confirmação. Expiração ou mudança de revisão exige substituir a aprovação em manutenção. Após confirmação autorizada, verificar ausência das linhas exclusivas e do histórico, presença das origens compartilhadas e um único comprovante do lote. Janeiro/2021 segue inelegível.

### 5. Fechar ou reverter

Na sessão atestada, executar `UPDATE sentinela_gestao_autorizacao.release SET aberta=false WHERE singleton;`. Reiniciar sem `--management` quando conveniente. A leitura e os eventos persistidos permanecem disponíveis. Uma falha anterior ao commit reverte a transação. Depois de uma exclusão concluída, recuperar dados requer restauração ou PITR ensaiado. Para reverter o DDL antes de qualquer escrita, reinstalar em transação as definições capturadas e conferir privilégios e leitura. Se já houve escrita, preservar auditoria e comprovantes antes de decidir uma reversão estrutural.
