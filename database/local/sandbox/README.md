# Sandbox RLS: homologacao local executada

Conclusao em 11/11/2026: novo cluster ec3d8148-6f97-4aef-bebc-0df6ae260648,
system identifier 7706955341292677160, porta 55432; estado final STOPPED.
Seis policies e 20 fixtures homologadas por autenticacao real. O cluster antigo
permaneceu intacto. Consulte [HOMOLOGACAO.md](HOMOLOGACAO.md).
O executor complete_rls.py --execute cria OUTRO cluster; nao retoma o concluido.
As secoes abaixo preservam o procedimento original e suas autorizacoes historicas.

Endpoint unico do controlador: **127.0.0.1:55432/sentinela_rls_sandbox**. O nome difere deliberadamente de sentinela_dev_operacional. Nao ha parametro de host/porta/banco. O controlador nao conecta a 5432, nao le .env.local nem reutiliza pgpass/PGSERVICE/PGPASSWORD herdados. Nada e criado ao importar, pedir --help ou executar testes unitarios.

## Artefatos

- control.py: prepare, create, start, verify, install, configure-reader, snapshot, compare, fixtures, test, backup, verify-backup, stop, discard, approve-controller e approve-artifacts.
- sql/guard.sql e guard_bootstrap.sql: attestacao por identidade real do servidor e marcador interno.
- sql/create_database.sql, postgis.sql e baseline.sql: criacao exclusiva do banco teste, extensao 3.6.2 e inclusao integral da baseline original sem alteracoes.
- sql/preflight.sql, role.sql e read_only.sql: versoes especificas com porta/banco separados; SQL funcional de policies/grants equivalente ao original. Role criada NOLOGIN, sem senha e atributos administrativos.
- sql/configure_reader.sql: psql \password com entrada oculta, verificador SCRAM e LOGIN somente na role independente do sandbox. Nunca reutilizar as senhas operacionais ou demonstrativas.
- sql/fixtures.sql: variante COMMIT explicitamente separada, 19 linhas originais mais 1 negativo transitive nature mapping; SQL original de rollback permanece intacto.
- sql/fixture_attestation.sql: existencia e atributos fornecidos de todas as 20 linhas, conjuntos UUID exatos.
- sql/rls.sql: autenticao reader real, seis conjuntos UUID visiveis exatos, negativos por exclusao do conjunto e cadeia de relacionamentos.
- sql/permissions.sql: projecoes e negativas de colunas, tabelas internas, DML sem linhas, DDL e TEMP com ROLLBACK. Nao usa credenciais administrativas nem SET ROLE.
- sql/snapshot_extra.sql: somente leitura, complementa catalog_snapshot.sql com grants por coluna, schema/default ACLs, collation, roles, memberships, database ACL e ledger.
- expected.json e test_control.py: expectativas e testes exclusivamente simulados.

## Identidade e estados

prepare cria somente raiz privada NOVA em %USERPROFILE%\.sentinela-local\rls-sandboxes\rls-sandbox-UUID e manifesto. Usa DACL exclusiva do usuario atual, SYSTEM e Administradores, sem SACL. data deve ser inexistente. Evidencias ficam em evidence, fora de data.

create e a unica etapa que chama initdb; nao inicia servidor. Usa initdb -W para senha administrativa nova sem echo e autenticacao SCRAM, nunca trust. Configura bind exclusivo IPv4 loopback e HBA novo. Registra system identifier via pg_controldata, hashes de artefatos/configs e marcador dentro do data directory.

start confere porta livre e configs antes de pg_ctl; verifica PID, instante de criacao do processo Windows, executavel, postmaster.pid, data_directory, hba_file, listener efetivo, ausencia de trust/erros HBA, marcador lido pelo servidor, pg_control_system e UUID. Nao registra servico Windows. Cada instalacao/fixture/teste exige attestacao administrativa anterior; leitor e sempre autenticado diretamente e verifica UUID/start do postmaster no servidor. Falha nao provoca repeticao ou limpeza automatica.

Estados normais: PREPARED -> CREATED -> RUNNING -> INSTALLED -> FIXTURES -> TESTED -> STOPPED -> DISCARDED. Falhas de criacao/start/install/fixtures resultam em FAILED com dados preservados. Uma falha parcial pode impedir stop automatico por ausencia de identidade suficiente: revisar manualmente, nunca matar processos genericamente. Ctrl+C pode deixar resultado desconhecido; inspecionar antes de repetir.

## Comparacao e referencia operacional

O controlador compara **dois snapshots completos** no formato:

```json
{"catalog": {}, "extra": {}}
```

Os objetos devem ser preenchidos, respectivamente, pelo JSON de database/supabase/tests/catalog_snapshot.sql e sql/snapshot_extra.sql. Um arquivo vazio/incompleto e recusado. O snapshot de referencia operacional deve ser exportado em tarefa de leitura separadamente autorizada; este controlador nao o exporta, pois jamais conecta ao operacional. Salvar em arquivo UTF-8 privado, sem registros de negocio, senhas ou verificadores. Registrar SHA-256, data/hora, origem e aprovacao da referencia fora do repositorio. Informar locale correspondente ao lc_collate/lc_ctype da referencia na preparacao; caso eles difiram, interromper e projetar initdb por categoria antes de executar.

A comparacao exige todas as secoes: tabelas, colunas/tipos/null/defaults, constraints/FKs/NOT VALID, indices, triggers, funcoes/security/search_path, domains, RLS/policies/comandos/roles/expressoes, ACLs, grants por coluna, defaults, collation, atributos/memberships e ledger. OIDs nao sao usados para grants (nomes de roles); timestamps de instalacao do ledger e o nome distinto do banco sao normalizados explicitamente; identidades distintas sao validadas antes de normalizar. A unica excecao de role exige o modo installation-nologin e manifesto INSTALLED identificado, conforme contrato v2 abaixo. Demais diferencas sao falhas. Exige 19 tabelas protegidas, 34 FKs, 77 indices, 55 triggers, 17 funcoes, 6 policies, 48 grants e ledger 0001-0005 + local-read-0001.

As guardas dos scripts operacionais existentes nao foram afrouxadas. O teste estatico compara ASTs de policies/grants das duas migrations, normalizando somente o nome do banco. Sem 0006 ou objetos Auth artificiais.

## Comandos futuros, nao executados nesta entrega

Usar terminal Windows interativo comum, sem transcript/debugger que capture segredos. Nao executar como Administrador. Credenciais existem somente em memoria e no ambiente do subprocesso; nao sao argumentos ou arquivos. Um administrador do Windows ainda pode inspecionar memoria/ambiente: esse risco local nao e eliminado. Os logs do servidor sao privados; statement logging e logging de statement em erro sao desativados no cluster de teste para reduzir risco com provisionamento de senha.

```powershell
# Somente testes offline, podem ser repetidos agora:
python -B database/local/sandbox/test_control.py -v
python -B database/local/tests/test_static.py --parser-path tmp/sql-validation -v

# Daqui em diante: requer autorizacao futura de cada fase.
python -B database/local/sandbox/control.py prepare --execute --locale '<locale-conferido-na-referencia>'
# O comando anterior fornece o caminho exato de manifest.json.
$manifestoSandbox = '<manifesto-privado-gerado>'
$referenciaSandbox = '<snapshot-operacional-completo-aprovado.json>'
python -B database/local/sandbox/control.py create --execute --manifest $manifestoSandbox
python -B database/local/sandbox/control.py start --execute --manifest $manifestoSandbox
python -B database/local/sandbox/control.py verify --execute --manifest $manifestoSandbox
python -B database/local/sandbox/control.py install --execute --manifest $manifestoSandbox
python -B database/local/sandbox/control.py configure-reader --execute --manifest $manifestoSandbox
python -B database/local/sandbox/control.py snapshot --execute --manifest $manifestoSandbox
# compare e offline: --manifest aqui identifica o arquivo snapshot, nao o manifesto do ciclo de vida.
python -B database/local/sandbox/control.py compare --manifest '<snapshot-sandbox.json>' --reference $referenciaSandbox
python -B database/local/sandbox/control.py backup --execute --manifest $manifestoSandbox
python -B database/local/sandbox/control.py fixtures --execute --manifest $manifestoSandbox --reference $referenciaSandbox
python -B database/local/sandbox/control.py test --execute --manifest $manifestoSandbox --reference $referenciaSandbox
python -B database/local/sandbox/control.py stop --execute --manifest $manifestoSandbox
python -B database/local/sandbox/control.py discard --execute --manifest $manifestoSandbox --authorize '<UUID-exato-do-manifesto>'
```

Nenhum comando individual instala tudo automaticamente. O runner para na primeira divergencia e grava evidence/test-report.json com PASS/FAIL por cenario e conclusao. Nao repetir um comando que sofreu falha sem examinar identidade e fase; instalacoes parcialmente concluidas nao sao idempotentes.

## Cobertura de fixtures

Total **20 = 19 originais + 1 ampliacao solicitada**: 2 RAs, 3 categorias, 2 naturezas, 5 mapeamentos, 4 ocorrencias e 4 associacoes. O mapeamento adicional 40000000-0000-4000-8000-000000000005 referencia a natureza invisivel 30000000-0000-4000-8000-000000000002, mas usa versao aprovada, categoria homologada e status homologado; deve continuar invisivel pela subconsulta RLS da natureza. Todos os demais dados sao sinteticos e os IDs visiveis terminam em 000000000001.

As seis policies possuem positivo e negativos: fonte, versao, status, ativo/consolidacao, ocorrencia pai, categoria e natureza referenciadas. A policy de associacoes filtra pela ocorrencia pai, nao exige natureza visivel: nao inventar requisito diferente. Nenhum poligono oficial ou dado PCDF real e criado. As fixtures validam acesso, nao aceitacao cartografica. Integridade referencial, triggers e SET CONSTRAINTS ALL IMMEDIATE so terao comprovacao runtime apos autorizacao.

## Backup, recuperacao e descarte

backup exporta somente o banco sandbox, formato customizado, em evidence. Confere codigo de saida, SHA-256, tamanho, listagem e leitura dos blocos com pg_restore para dispositivo nulo. verify-backup exige o registro JSON ao lado do dump, caminho sob evidence e hash/tamanho correspondentes:

```powershell
python -B database/local/sandbox/control.py verify-backup --execute --manifest $manifestoSandbox --backup-record '<registro-privado-backup.json>'
```

Isso comprova integridade, nao restaurabilidade. Nao ha restauracao automatica. Um ensaio de recuperacao separado requer **outro cluster novo e isolado**, novo manifesto/system identifier, porta exclusiva adicional com controlador revisado (este recusa porta diferente de 55432), roles exclusivas apropriadas e banco vazio. So apos nova autorizacao: pg_restore --exit-on-error --single-transaction, sem --clean, sem destino existente; comparar todas as definicoes/dados esperados. Erro interrompe, preserva log privado e dump. Nunca usar restauracao global no operacional.

stop atesta o processo e usa pg_ctl somente no data exclusivo; confirma ausencia do PID file e porta liberada. discard exige primeiro STOPPED e autorizacao UUID literal. Recarrega manifesto, confere caminhos canonicos/UUID, marcador, PG_VERSION, system identifier e ausencia de processo, junctions/symlinks/reparse points e tablespaces externos. So entao remove **data**; raiz, manifesto, dumps e evidencias ficam preservados. Caminho/estado desconhecido interrompe sem remocao. Em FAILED sem attestacao suficiente, nao remover automaticamente.

O descarte NAO demonstra restaurar o mesmo banco ao estado pre-fixtures. Essa prova requer o ensaio de recuperacao separado. Antes/depois do ensaio, a referencia operacional e seus fingerprints de dados/configuracao devem ser reconferidos por procedimento de leitura separado; o controlador nao conecta ao operacional para isso. Nao declarar preservacao observada sem essa evidencia, especialmente se houver outros usuarios concorrentes.

## Limitacoes desta entrega e proxima autorizacao

Os testes de controladores sao simulados, com subprocessos reais bloqueados. Nenhum initdb/start/SQL real foi executado. Carregamento das DLLs PostGIS, DACL Windows em raiz real, prompts interativos, locale, inicializacao e recuperacao real ainda nao estao homologados. Ha janelas inevitaveis entre verificar caminho/PID/porta e agir: usar janela exclusiva, ACL privada e nao editar manifesto/configs durante o ensaio. Nao ha defesa contra administrador local malicioso.

Proxima autorizacao recomendada: somente prepare/create/start/verify, com locale e referencia aprovados, para validar identidade/isolamento sem instalar esquema. Depois autorizar separadamente instalacao/configuracao de role e, apos comparacao integral, fixtures/testes. O descarte requer UUID explicito. Nao executar fases futuras apenas porque os testes offline passaram.


## Revisao do start: saida, prazos e interrupcao

O pg_ctl agora usa Popen com stdout/stderr em arquivo temporario regular, stdin nulo e close_fds=True. Nao usa PIPE/communicate, nem aguarda EOF dos descendentes; aguarda somente o processo pg_ctl por ate 45 segundos. No Windows usa CREATE_NEW_PROCESS_GROUP (sem nova janela), reduzindo propagacao de Ctrl+C do terminal ao daemon. O pg_ctl start recebe -t 30; a verificacao TCP posterior tem prazo de 15 segundos. pg_controldata tem 10 segundos e psql 20. O prazo nao inclui o tempo da entrada oculta da senha. Nenhum password e transmitido ao pg_ctl.

Ha mensagens imediatas e sanitizadas para senha recebida, execucao do pg_ctl, retorno, disponibilidade, identidade, HBA, manifesto e conclusao. O arquivo privado evidence/start-UUID.json registra somente eventos, horarios e observacoes, nunca senha, argv, ambiente ou erro bruto. A captura temporaria do pg_ctl nao e um log persistente; server.log permanece privado e independente.

Uma falha de disponibilidade resulta em START_FAILED; falha posterior de identidade/HBA em ATTESTATION_FAILED; Ctrl+C em START_UNKNOWN. O campo last_start diferencia STOPPED_OBSERVED, PROCESS_PRESENT_UNATTESTED e UNKNOWN. Observacao por porta/PID nao equivale a atestacao autenticada. Nenhuma dessas falhas executa stop, kill, terminate, cleanup ou nova tentativa. Uma interrupcao pode ter sido propagada pelo proprio terminal antes de qualquer tratamento Python; sempre observar estado real. O manifesto so recebe RUNNING depois de toda a atestacao. Uma falha de escrita pode impedir atualizar manifesto/evidencias e exige revisao manual.

A causa historica do aparente travamento nao foi comprovada. O fluxo anterior tinha captura por pipes e pouca observabilidade; CPython no Windows volta a drenar os pipes apos timeout, o que pode prolongar a espera se descendentes mantiverem descritores. Os novos testes simulam descritor herdado, timeout, Ctrl+C e atestacao falha sem iniciar PostgreSQL real.

### Manifesto anterior a revisao: aprovacao obrigatoria

Nao contornar artifacts(), nao alterar hashes automaticamente e nao recriar o cluster para atualizar codigo. Um manifesto que fixa o hash antigo continuara recusando start com o controlador novo. O comando separado approve-controller so pode ser executado com nova autorizacao explicita de alteracao do manifesto. Ele exige UUID e hashes anterior/revisado exatos, cluster parado, PID ausente, porta livre, system identifier correto e demais hashes intactos. Registra evidencia e altera somente a aprovacao do controlador, mantendo fase/configuracoes/identidade.

```powershell
# FUTURO: nao executar sem autorizacao de atualizar a aprovacao do controlador.
$manifestoSandbox = 'C:\Users\pedro\.sentinela-local\rls-sandboxes\rls-sandbox-a8aaa34d-98a0-43aa-9a15-ddbdf0dd375a\manifest.json'
python -B database/local/sandbox/control.py approve-controller --execute --manifest $manifestoSandbox --authorize 'a8aaa34d-98a0-43aa-9a15-ddbdf0dd375a' --previous-sha256 '78a1bd92c6d66cbe89a9f0f8a9cf2987faaaf4b9414645df262106c249729b10' --reviewed-sha256 '<SHA-256-da-revisao-efetivamente-revisada>'
# Somente apos aprovacao e novo preflight, em terminal Windows interativo:
python -B database/local/sandbox/control.py start --execute --manifest $manifestoSandbox
python -B database/local/sandbox/control.py verify --execute --manifest $manifestoSandbox
```

Nao executar verify se o start falhar como forma de repetir inicializacao: primeiro observar PID/listener/log e registrar diagnostico. verify e apenas atestacao e nao inicia servidor nem atualiza fase. Nao executar initdb novamente; o cluster criado permanece reutilizavel.


## Revisao estrutural v2: locale e NOLOGIN de instalacao

snapshot_extra.sql agora produz snapshot_version=2, locale como objeto com datcollate/datctype/datlocprovider/datlocale e encoding obtido com pg_encoding_to_char(pg_database.encoding). O banco e selecionado por current_database(). Nao utiliza current_setting('lc_collate') ou current_setting('lc_ctype'), removidos como GUC neste servidor PostgreSQL 17. A coleta v2 foi validada somente por leitura no operacional, sem erro 42704. Provider c exige datlocale nulo; providers i/b exigem locale especifico, que continua sendo comparado. Snapshots antigos/incompletos sao recusados; regenerar referencia e snapshot, nao adaptar silenciosamente JSON legado.

identity registra valores do servidor: host/porta, system identifier via pg_control_system, UUID configurado, data_directory, versao e executor. A referencia esquerda deve ser o banco operacional em 127.0.0.1:5432; a direita deve ser sentinela_rls_sandbox em 127.0.0.1:55432. Os clusters precisam ser distintos e o UUID do sandbox canonico. Portas/identidades nao sao ignoradas: sao verificadas antes de normalizar para comparacao de definicoes. Nenhuma funcao de comparacao conecta automaticamente ao operacional.

Modo padrao strict exige LOGIN em ambas as roles. Para validar estrutura imediatamente apos instalar, SEM habilitar LOGIN no sandbox, usar explicitamente:

```powershell
# Futuro: somente depois da aprovacao dos artefatos e instalacao autorizada.
python -B database/local/sandbox/control.py compare --reference '<referencia-operacional-v2.json>' --manifest '<snapshot-sandbox-v2.json>' --role-mode installation-nologin --sandbox-manifest $manifestoSandbox
```

A excecao exige: manifesto em INSTALLED, nome da role sentinela_local_reader, UUID/system identifier/data_directory do snapshot iguais ao manifesto, endpoint aprovado, referencia com LOGIN e sandbox com NOLOGIN. Apenas esse booleano e normalizado. Em ambos: NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOINHERIT, limite 5, rolconfig nulo, zero memberships e projecao exata das 48 colunas. Grants de escrita, tabela inteira, funcoes, schemas adicionais ou defaults para objetos futuros nao sao aceitos como excecao. As roles nunca sao modificadas pelo comparador.

O comparador preserva a comparacao completa e os limites estruturais: 19 tabelas com RLS ENABLE/FORCE, 19 PKs, 34 FKs validadas, 77 indices validos/prontos, 55 triggers habilitados, 17 funcoes invoker, dois CHECKs NOT VALID intencionais, seis policies SELECT para a role, ledger e ACLs. Definicoes e expressoes tambem precisam coincidir; contagens nao bastam.

### Aprovacao restrita de dois artefatos com cluster RUNNING

approve-controller continua limitado ao controlador e a cluster parado. Nao suporta esta revisao de dois arquivos no cluster RUNNING. A extensao separada approve-artifacts aceita somente:

- database/local/sandbox/control.py
- database/local/sandbox/sql/snapshot_extra.sql

Exige plano JSON com schema exato (uuid, system_id, manifest_sha256, changes), SHA-256 aprovado do proprio plano, UUID explicito, hashes anterior/novo de cada arquivo e manifesto RUNNING identico ao planejado. Rejeita duplicatas, caminhos alternativos, arquivos fora da allowlist, revisoes nao listadas, manifestos desatualizados e outros artefatos/configs alterados. Faz atestacao autenticada somente de leitura do cluster em postgres, antes de registrar. Reconfere plano, manifesto e hashes antes da escrita; preserva fase, PID, identidade e configs, atualizando apenas hashes listados e artifact_approvals, com evidencia privada old/new/UTC/plano/manifesto. Nao instala SQL, modifica roles, reinicia ou para servidores. Nenhuma aprovacao foi executada na entrega desta revisao.

revision-plan.json e uma proposta, nao autorizacao. O manifesto real permanece com os hashes antigos e continuara bloqueando install. Os testes e a documentacao nao sao artefatos fixados no manifesto; seus hashes constam em revision-checksums.json para revisao. Se qualquer arquivo ou manifesto mudar depois de preparar o plano, nao editar hashes automaticamente: gerar e revisar outro plano.

```powershell
# FUTURO: exige autorizacao especifica de aprovar o plano, em terminal interativo.
$manifestoSandbox = 'C:\Users\pedro\.sentinela-local\rls-sandboxes\rls-sandbox-a8aaa34d-98a0-43aa-9a15-ddbdf0dd375a\manifest.json'
python -B database/local/sandbox/control.py approve-artifacts --execute --manifest $manifestoSandbox --authorize 'a8aaa34d-98a0-43aa-9a15-ddbdf0dd375a' --revision-plan database/local/sandbox/revision-plan.json --plan-sha256 '<SHA-256-do-plano-revisado>'
```

A senha administrativa do sandbox e solicitada com entrada oculta para a atestacao; nunca fornecer pelo chat. Esta aprovacao nao autoriza install. Depois, nova etapa autorizada pode instalar e gerar snapshot v2; a comparacao de instalacao usa o modo NOLOGIN acima. Fixtures/testes autenticados posteriores usam strict, somente apos autorizacao separada para a credencial propria da role.
