# Homologacao RLS em cluster descartavel — preparado, nao executado

## Estado e fronteiras

A Fase 1 teve 6 projecoes e 49 negativas aprovadas por execucao manual informada pelo responsavel. Isso nao certifica filtragem de linhas. Nenhum comando de criacao, inicio, instalacao, fixture ou descarte foi executado nesta preparacao.

Proposta: PostgreSQL 17.11, host literal 127.0.0.1, porta 55432, banco sentinela_dev_operacional. Role de mesmo nome sentinela_local_reader, mas objeto independente no novo cluster, com credencial nova e exclusiva. Nao copiar pg_authid, senha/verificador ou pgpass operacional. Nao registrar servico Windows. Nao usar a conexao .env.local.

Raiz futura: %USERPROFILE%\.sentinela-local\rls-sandbox-<UUID>. Criar exclusivamente um caminho inexistente, com manifest.json identificando UUID, caminho canonico, finalidade, estado do ciclo de vida e endpoint. Dados em data; evidencias e backups em diretorio irmao preservado. ACL privada para usuario atual e administracao essencial, sem SACL. Nao compartilhar diretorio de dados, tablespaces, configs, credenciais ou logs com o operacional.

## Ferramentas confirmadas

Em C:\Program Files\PostgreSQL\17\bin: postgres, initdb, pg_ctl, psql, pg_dump, pg_restore e pg_isready, todos 17.11. PostGIS control default_version=3.6.2, SQL de instalacao e DLL presentes. Isso nao comprova carregamento de todas as DLLs: CREATE EXTENSION no cluster futuro e consulta da versao serao requisitos de aceite. A verificacao atual nao encontrou listener TCP em 55432; reconfirmar imediatamente antes de iniciar.

## Instalacao futura, somente apos autorizacao

1. Registrar estado operacional por consultas administrativas READ ONLY: identidade/system identifier, configuracoes e respectivos hashes, role/ACLs, ledger, catalog_snapshot.sql e inventario/fingerprints deterministas das linhas das 19 tabelas sem exportar registros para logs. Registrar concorrencia; interromper em caso de mudancas externas que impecam comparacao.
2. Validar a raiz nova, ausencia de reparse points/junctions, disco disponivel, locale/encoding operacional e porta livre. Criar manifesto e permissoes privadas.
3. Inicializar com initdb --encoding=UTF8 -U postgres -W --auth=scram-sha-256 -D <data-exclusivo>, locale previamente conferido. Senha oculta exclusiva. Nao usar --pwfile com segredo em arquivo versionado. Nao iniciar enquanto o HBA novo e o bind nao estiverem aprovados.
4. Configurar somente os arquivos do novo cluster: bind literal 127.0.0.1, porta 55432, HBA SCRAM administrativo por loopback e bloco restrito da role antes das regras genericas. Sem trust; rejeicoes explicitas para outros bancos, IPv6 e replicacao. pg_ctl start apenas com -D exclusivo e log privado; nao registrar servico. Conferir PID, inicio do processo, data_directory, hba_file, system identifier distinto e endpoint antes de qualquer DDL.
5. Criar no novo cluster o banco sentinela_dev_operacional e schema extensions; instalar PostGIS 3.6.2 em extensions. Nao criar auth.users/auth.uid nem roles do Supabase.
6. Conferir SHA-256 normalizado da baseline: 01617b34fc5d2e90aaecf2060210f13b17bb9c63aac51fd7c0f5f8df97ba82bd. Aplicar arquivo integral, preservando BEGIN/COMMIT, psql -X -w -v ON_ERROR_STOP=1. Nao instalar 0006 ou repetir 0001-0005 individuais.
7. Criar a role restrita inicialmente NOLOGIN e senha NULL SOMENTE no cluster novo; aplicar grants e policies locais identicos. Usar artefatos separados para o sandbox, conforme pendencias abaixo. Configurar nova senha por entrada oculta, habilitar LOGIN apenas nesse cluster e testar autenticacao direta sem SET ROLE. Nunca desabilitar RLS/triggers/constraints.
8. Comparar definicoes completas com snapshot operacional: tabelas/colunas/defaults/tipos/domains, constraints e validacao/deferrability, indices e validade, funcoes/security/search_path, triggers, RLS, policies (nome, comando, roles, permissividade e expressao), grants de coluna/tabela/schema/funcao, privilegios de banco, defaults e memberships. ACLs devem ser normalizadas por nomes de roles, nao OIDs. Excluir apenas OIDs, identificadores fisicos e timestamps legitimamente distintos; nao ignorar expressoes/ACLs.
9. Exigir 19 tabelas, 34 FKs, 77 indices validos, 55 triggers habilitados, 17 funcoes, RLS ENABLE/FORCE nas 19, 6 policies SELECT, 48 grants por coluna, ledger 0001-0005 + local-read-0001 e os dois CHECKs NOT VALID intencionais. Registrar snapshot pos-instalacao/pre-fixtures e backup customizado do sandbox, sem dados operacionais.
10. Prevalidar UUIDs e marcadores em TODAS as seis tabelas e confirmar inexistencia de conflitos. Somente entao aplicar futura variante explicitamente revisada das fixtures com COMMIT, sempre no sandbox. Nao substituir ROLLBACK por COMMIT automaticamente no arquivo existente. SET CONSTRAINTS ALL IMMEDIATE antes do COMMIT; falha encerra a sequencia.
11. A conexao administrativa confirma por UUID e atributos a existencia dos 19 registros e os motivos de invisibilidade. Executar rls_isolated_manual.sql como reader real usando -X -W, host 127.0.0.1 e porta 55432. Conferir rls_expected.json, cadeia de joins e ausencia de escrita com suite propria do sandbox. Nao utilizar run_reader.py atual contra porta diferente por substituicao silenciosa.
12. Comparar novamente definicoes/ACLs e inventario sintetico. Preservar resultados sanitizados, hashes e codigos de saida. Banco vazio nao e evidencia positiva.

## Fixtures e cobertura

Os UUIDs seguem os prefixos 1 a 6 e constam integralmente em tests/rls_expected.json. As seis tabelas possuem exatamente um UUID visivel terminado em 000000000001.

- RAs: 2 linhas, marcador aprovado vs outra versao.
- Categorias: 3 linhas, homologada da versao aprovada vs pendente e outra versao.
- Naturezas: 2 linhas, fonte aprovada vs outra fonte.
- Mapeamentos: 4 linhas, homologado aprovado vs pendente, outra versao e categoria pendente.
- Ocorrencias: 4 linhas, consolidada ativa da fonte aprovada vs inativa, em revisao e outra fonte.
- Associacoes: 4 linhas, uma para cada ocorrencia; somente a associacao da ocorrencia visivel e esperada.

Dependencias: RAs/categorias/naturezas -> mapeamentos -> ocorrencias -> associacoes. Nenhum codigo oficial PCDF e declarado; nao ha geometria oficial fabricada. Ausencia intencional de coordenadas testa acesso, nao aceitacao cartografica/cadastro de producao. Constraints/triggers so serao validados em runtime no ambiente autorizado.

Cobertura basica: positivos e negativos para as seis policies. Limite: os 19 registros nao isolam todos os ramos da policy de mapeamentos. Incluir em extensao futura separada um mapeamento homologado de versao aprovada referindo natureza invisivel e outros casos de status/fonte/ativo combinados. Atualizar manifestos esperados e contagem explicitamente, sem afirmar que a suite de 19 cobre todas as combinacoes.

A policy de associacoes verifica ocorrencia visivel; nao exige natureza visivel. Uma associacao com ocorrencia visivel e natureza invisivel pode ser visivel, enquanto o join com natureza sera filtrado. Testar conforme definicao instalada; qualquer exigencia diferente demanda revisao de seguranca separada, nunca alterar policy para fazer teste passar.

## Artefatos prontos e pendentes

Prontos: baseline original, security-spec.json, catalog_snapshot.sql, fragmento HBA, fixtures_rollback.sql original, rls_expected.json e rls_isolated_manual.sql READ ONLY. Nove testes estaticos verificam sintaxe e invariantes existentes.

Implementacao futura necessaria antes de executar: controlador de ciclo de vida com manifesto/UUID/system identifier; bootstrap privado do sandbox; preflight de porta 55432 e raiz exclusiva; role/migration locais especificas que reutilizem o SQL funcional mas preservem preflight fail-closed; variante commitada de fixtures; suite de negativas no endpoint isolado; comparador de ACLs e catalogos; descarte validado.

Os arquivos atuais sql/preflight.sql, roles/0001_create_local_reader.sql, migrations/0001_read_only.sql, fixtures_rollback.sql, permissions_manual.sql e run_reader.py possuem destino 5432 fixo. Nao funcionam sem adaptacao deliberada para 55432. Nao afrouxar as guardas operacionais nem executar esses arquivos diretamente para contornar falhas. Gerar novos artefatos separados e revisar diffs: unica diferenca pretendida em guardas e endpoint; definicoes de policies/grants/estrutura devem continuar equivalentes.

## Recuperacao e descarte seguro

Nao fazer DELETE/TRUNCATE para limpeza: triggers de imutabilidade e auditoria sao parte da validacao. A estrategia primaria e descartar integralmente o cluster que foi criado exclusivamente para o ensaio; isso NAO equivale a restaurar o mesmo banco ao snapshot anterior.

Se for requisito demonstrar retorno do MESMO banco descartavel ao estado pre-fixtures, sera necessario ensaio de restauracao separado com seu backup e comparacao integral de dados/catalogos; nao declarar esse criterio cumprido apenas pelo descarte. O operacional deve permanecer identico durante todo o ensaio.

Antes de parar/remover: resolver caminho absoluto, validar marcador UUID/manifesto e system identifier, PG_VERSION=17, caminho exatamente igual ao criado, nao ancestral de pasta privada/repositorio/operacional, nenhum reparse point ou tablespace externo. Confirmar processo/PID com inicio e data directory para evitar PID reciclado. Se qualquer identidade divergir, nao parar nem remover nada.

Parar somente o cluster com pg_ctl -D <data-validado> stop -m fast; verificar encerramento desse PID e ausencia de listener 55432. Nao terminar processos genericamente nem tocar servico PostgreSQL operacional. Preservar evidencias fora da pasta data. Somente apos autorizacao de descarte, remover o caminho data previamente validado via PowerShell Remove-Item -LiteralPath; nao montar exclusao em outro shell e nao remover a raiz por padrao.

Apos descarte: confirmar ausencia do cluster/listener, nova conexao administrativa ao operacional e comparacao dos hashes/configs, ACLs/role, estrutura/ledger e fingerprints dos dados com estado inicial. Nao prometer equivalencia se terceiros modificarem o operacional no intervalo: registrar divergencia e interromper a conclusao.

## Proxima autorizacao

Autorizar primeiro a implementacao/revisao dos controladores e scripts EXCLUSIVOS do sandbox, sem execucao. Depois autorizar separadamente criar/iniciar o cluster 55432, instalar baseline/policies, criar role/credenciais exclusivas, confirmar fixtures sinteticas, executar testes e descartar apenas seu data directory validado. Nenhuma dessas operacoes e autorizada pela presente preparacao.
