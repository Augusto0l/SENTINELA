# Acesso de leitura PostgreSQL exclusivamente local

Status: artefatos preparados para revisao; **nenhuma instalacao autorizada por este documento**.
Nao existe runner de instalacao automatica. Nao executar comandos de escrita abaixo sem autorizacao especifica.

Destino unico: `127.0.0.1:5432/sentinela_dev_operacional`. PostgreSQL 17.11, PostGIS 3.6.2 em `extensions`.
A baseline permanece original, com ledger 0001-0005. Nao aplicar 0006, criar Auth falso, remover protecoes ou usar Supabase.

## Artefatos e limites

- `roles/0001_create_local_reader.sql`: operacao GLOBAL do cluster, transacional, cria somente `sentinela_local_reader` com NOLOGIN, senha NULL, limite cinco e nenhum membership/grant. Recusa role preexistente.
- `sql/preflight.sql`: verificacoes transacionais de destino, executor, versao, baseline, colunas/tipos/nulabilidade, constraints, RLS, indices, triggers e dependencias. Somente assertions; incluido pelos arquivos psql com `\ir` relativo ao proprio arquivo.
- `migrations/0001_read_only.sql`: operacao somente no banco aprovado; preflight exige role ainda NOLOGIN e sem dependencias. Revoga CONNECT/TEMPORARY de PUBLIC **apenas neste banco**, concede CONNECT/USAGE/SELECT por coluna e seis policies SELECT. Registra `local-read-0001`, nunca 0006.
- `security-spec.json`: allowlist e assinatura estrutural colhida por leitura da baseline local aprovada; nao contem dados, senha, URI ou ACL administrativa privada. Os hashes nao sao certificado de compatibilidade entre versoes diferentes do servidor.
- `hba/sentinela_local_reader.conf`: prefixo especifico da role, incluindo rejeicao de IPv6, outros bancos, socket e replicacao. Nao altera a regra de outros usuarios.
- `tools/prepare_hba.py`: gera backup, candidato e manifesto numa pasta NOVA externa ao diretorio de configuracao. Nunca aplica, sobrescreve HBA, altera listen_addresses ou faz reload. Preserva o original byte a byte como sufixo; rejeita BOM ou regras anteriores especificas da role para revisao manual.
- `tests/test_static.py`: AST SQL/PLpgSQL via pglast ja existente, permissoes, atributos, dependencias RLS, HBA sintetico e travas de opt-in.
- `tests/fixtures_rollback.sql`: fixtures sinteticas, transacao terminada em ROLLBACK. Nao desabilita protecoes, nao faz upsert nem limpeza. Nao equivale a aceite geoespacial/funcional.
- `tests/run_reader.py`: testes FUTUROS com login real da role; nenhuma criacao de role, migration ou carga de fixtures. Exige opt-in explicito. So usa loopback; nunca carrega .env.local ou a conexao de backup.
- `recovery/0001_suspend_reader.sql`: contencao futura mediante autorizacao, sem restauracao destrutiva, DROP/CASCADE ou exclusao de ledger.

## Permissoes e dependencias

As seis tabelas e colunas estao explicitadas em `security-spec.json` e na migration. Nao existe SELECT de tabela inteira, escrita, permissao de sequencias, EXECUTE de funcoes, acesso a usuarios/auditoria/historico/staging/originais ou default privileges para objetos futuros.

RLS mantem ocorrencias ativas, consolidadas e de fonte `SENTINELA_TESTE_LOCAL_V1`. Associacoes dependem de uma ocorrencia visivel. Naturezas usam a mesma fonte; categorias e RAs usam a versao sintetica; mapeamentos precisam dessa versao, status homologado e natureza/categoria visiveis. Nao ha recursao entre policies. Todos os campos necessarios as subconsultas possuem grants explicitos.

Os tres perfis compartilham a leitura autorizada; o banco nao recebe o perfil por parametro do navegador. Nao se deve fingir que essa role tecnica identifica individualmente o usuario. Escrita/auditoria humana permanecem bloqueadas.

Coordenadas sao numericas. A primeira consulta nao precisa de geometry, limites de RA ou funcoes PostGIS; portanto nao ha grants adicionais em `extensions`. O PostGIS e suas constraints existentes permanecem intactos. Tipos de dominio sao utilizados em colunas existentes; a role nao recebe CREATE/USAGE adicional para criar objetos com esses tipos.

`PUBLIC` possui CONNECT nos outros bancos locais e, no alvo, CONNECT/TEMPORARY. Privilegios sao aditivos: REVOKE da role nao neutraliza PUBLIC; NOINHERIT tambem nao. As ACLs dos demais bancos nao serao alteradas. A exclusividade de autenticacao exige o prefixo HBA antes das regras genericas, e os testes verificam rejeicao efetiva, nao apenas `has_database_privilege`.

## Validacao estatica: pode executar sem alterar banco

Na raiz do repositorio, usando o ambiente pglast existente (nenhuma instalacao automatica):

```powershell
python database/local/tests/test_static.py --parser-path tmp/sql-validation -v
python database/supabase/tests/validate_baseline.py --parser-path tmp/sql-validation
git diff --check
```

Os testes HBA usam somente pastas temporarias e regras sinteticas. O runner de runtime sem `--execute-security-tests` recusa a execucao antes de abrir conexao. Nao executar fixtures nem outros testes SQL nesta etapa de preparacao.

## Ordem futura exata: exige autorizacoes

1. Reconfirmar por leitura destino, ledger, baseline SHA-256 e role inexistente. Registrar ACL original do banco, inventario estrutural, memberships e HBA ativo em evidencia privada fora do Git. Conferir ausencia de mudancas concorrentes.
2. Preparar o candidato HBA **fora do diretorio ativo**, em pasta nova e privada, preservando as configuracoes originais. Exemplo de comando de preparacao, sem aplicacao:

   ```powershell
   python database/local/tools/prepare_hba.py --source 'C:\Program Files\PostgreSQL\17\data\pg_hba.conf' --output-dir 'CAMINHO_PRIVADO_NOVO_FORA_DO_REPOSITORIO'
   ```

   Conferir `manifest.json`, SHA-256 do original, prefixo em primeiro lugar e sufixo exatamente igual ao backup. O caminho ativo deve ser confirmado com `SHOW hba_file`, sem pressupor o exemplo. Nao registrar conteudo HBA em logs; outros ambientes podem conter opcoes sensiveis. Preservar ACLs do backup.
3. Com autorizacao GLOBAL especifica, executar somente a criacao NOLOGIN. Manter sessao administrativa aberta durante a mudanca futura do HBA:

   ```powershell
   $psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
   & $psql -X -w -h 127.0.0.1 -p 5432 -U postgres -d sentinela_dev_operacional -v ON_ERROR_STOP=1 -f database/local/roles/0001_create_local_reader.sql
   ```

4. Com autorizacao para grants/policies/ACL deste banco, executar a migration uma unica vez:

   ```powershell
   & $psql -X -w -h 127.0.0.1 -p 5432 -U postgres -d sentinela_dev_operacional -v ON_ERROR_STOP=1 -f database/local/migrations/0001_read_only.sql
   ```

   Se houver erro, encerrar e confirmar rollback/ledger por leitura. Nunca repetir automaticamente. Perto do COMMIT com perda de conexao, tratar resultado como desconhecido e inspecionar antes de qualquer acao.
5. Com autorizacao para configurar o cluster, comparar novamente o HBA ativo ao hash original do manifesto e instalar o candidato com procedimento administrativo revisado, preservando ACL e mantendo o backup. Nao executar Copy-Item cegamente nem alterar os demais arquivos. A role continua NOLOGIN e sem senha.
6. Conferir no servidor `pg_hba_file_rules` (SQL abaixo), ausencia de erros em TODAS as linhas e ordem do bloco. Comparar novamente os bytes originais preservados. So depois considerar reload quando aplicavel. Nao habilitar LOGIN se qualquer verificacao falhar.
7. Configurar uma senha forte exclusiva em terminal privado. Em sessao psql administrativa local, usar `\password sentinela_local_reader`, com entrada oculta; nunca SQL com senha literal, argv, historico, transcricao ou .env versionado. Configurar SCRAM e verificar apenas a existencia/formato da credencial, sem selecionar/exibir seu valor. Essa etapa nao esta automatizada nos arquivos.
8. Habilitar LOGIN somente com autorizacao especifica, apos confirmar atributos, ausencia de memberships/ownership, HBA, grants e credencial. `ALTER ROLE sentinela_local_reader LOGIN;` e um comando GLOBAL, nao uma etapa implicita da migration. Timeouts/read-only default podem ser revisados nessa etapa; nao substituem ACL/RLS.
9. Configurar credencial privada da role para o runner. Nao reutilizar a credencial administrativa. Ensaiar fixtures separadamente, conforme a secao seguinte, e somente depois executar os testes autenticados.
10. Aprovar o resultado antes de implementar pool Next.js ou APIs. Nenhum script deste diretorio altera a autenticacao da aplicacao, .env.local ou Supabase.

### HBA no Windows

No Windows, novas conexoes podem usar mudancas no arquivo imediatamente, sem reload. Portanto **nao existe garantia de que escrever o HBA ativo e esperar reload seja uma fase sem efeito**. A validacao offline cobre o prefixo suportado e sua ordem; nao substitui o parser do servidor para todo arquivo/Includes. `pg_hba_file_rules` le o arquivo configurado, nao um candidato arbitrario.

Se for exigida certificacao pelo parser do servidor antes de tocar no arquivo ativo, sera necessario ensaio em instancia descartavel separada, com autorizacao adicional. Nao criar essa instancia automaticamente. Manter NOLOGIN ate concluir a verificacao reduz o risco da role nova; nao dispensa backup e revisao do arquivo completo.

Consultas futuras de leitura, sempre na sessao administrativa local aprovada:

```sql
SHOW hba_file;
SELECT line_number,type,database,user_name,address,netmask,auth_method,error
FROM pg_hba_file_rules ORDER BY rule_number;
SELECT count(*) AS erros FROM pg_hba_file_rules WHERE error IS NOT NULL;
```

Referencia: https://www.postgresql.org/docs/17/auth-pg-hba-conf.html

## Fixtures e testes autenticados futuros

O arquivo de fixtures termina em ROLLBACK e pode ser ensaiado futuramente mediante autorizacao de escrita de teste. Nao confirma dados. Contem um registro visivel, tres ocorrencias negativas (inativa, em revisao, outra fonte), associacoes correspondentes e catalogos positivos/negativos.

As fixtures exercitam o estado permitido pela baseline, inclusive registro consolidado sem coordenadas. Isso e **limite do modelo atual**, nao aprovacao de cadastro manual concluido sem coordenadas. Nao ha cartografia fabricada ou dado PCDF real.

Uma conexao real da role nao enxerga inserts nao confirmados da sessao administrativa. Portanto os testes positivos de RLS requerem fixtures previamente confirmadas, mediante autorizacao separada, em ambiente exclusivo com estrategia de descarte/recuperacao aprovada. Nao trocar ROLLBACK por COMMIT silenciosamente. Nao usar SET ROLE do postgres como substituto de login real. Como a baseline preserva registros, nao existe cleanup automatico por DELETE; nao contornar triggers. Este ponto e uma pendencia explicita antes da homologacao runtime.

Depois dessa autorizacao e preparo, o comando do runner sera:

```powershell
python database/local/tests/run_reader.py --execute-security-tests
```

O runner usa pgpass externo, limpa variaveis PostgreSQL herdadas e nunca carrega a URI administrativa da aplicacao. Pode usar PGPASSFILE somente fora do repositorio. Todas as probes de permissao usam login real; postgres e usado separadamente apenas para atestar a estrutura por leitura. As tentativas negativas de DML/DDL ficam em transacao READ WRITE com ROLLBACK, para provar ACL em vez de depender de default_transaction_read_only. Sucesso inesperado falha o teste e reverte a transacao. Os testes esperam SQLSTATE 42501, nao erros de constraints ou ausencia de objetos.

O runner testa projecoes, colunas omitidas, seis tabelas, treze tabelas proibidas, todas as operacoes DML nas seis tabelas, TRUNCATE, schemas, DDL, TEMP, SET ROLE, funcao nao concedida, catalogos/associacoes RLS e preservacao estrutural. Tenta outros bancos somente no cluster loopback e exige rejeicao HBA, nao falha por senha ausente. Testa ::1 como caso negativo; nunca tenta endereco remoto.

## Reversao e contencao: nao executar automaticamente

- Antes de COMMIT: ROLLBACK; com ON_ERROR_STOP e encerramento da conexao, a transacao aberta e revertida. CREATE ROLE e migration possuem transacoes independentes: falha da segunda pode deixar a role NOLOGIN criada pela primeira.
- Depois de COMMIT: nao prometer rollback transacional. Parar a aplicacao e fechar o pool, preservar evidencias e, com autorizacao, executar `recovery/0001_suspend_reader.sql`. Ele aplica NOLOGIN e revoga CONNECT/USAGE; nao termina sessoes ou desfaz transacoes em andamento. Policies e ledger ficam preservados.

  ```powershell
  & $psql -X -w -h 127.0.0.1 -p 5432 -U postgres -d sentinela_dev_operacional -v ON_ERROR_STOP=1 -f database/local/recovery/0001_suspend_reader.sql
  ```

- HBA: so restaurar o backup cujo SHA-256 corresponde ao manifesto. Antes de substituir, exigir que o arquivo ativo ainda corresponda ao candidato instalado; se divergir, parar para nao apagar alteracao posterior de terceiros. Preservar ACLs. Apos restaurar, verificar `pg_hba_file_rules` e conexao administrativa; no Windows considerar efeito imediato. Nenhuma restauracao/reload e executada pela ferramenta de preparacao.
- ACLs PUBLIC do banco: restauracao exata depende da evidencia privada anterior e de revisao; nao conceder CONNECT/TEMPORARY genericamente por iniciativa propria.
- Nao excluir role, policies, ledger, banco ou dados automaticamente; nao usar DROP OWNED, CASCADE ou restauracao global.

## Separacao do Supabase e da aplicacao futura

Exclusivos locais: role LOGIN, HBA, marcador sintetico, versao `local-read-0001`, credencial operacional local. Nao executar estes scripts no Supabase.

Reutilizaveis: projecoes de colunas, joins, contratos sem perda, testes de grants/ausencia de escrita e invariantes de integridade. Nao copiar os hashes de catalogo como certificado entre servidores.

Redesenhar no hospedado: identidade real, vinculo ativo, escopo e predicates de RLS; nunca confiar em perfil/UUID/GUC enviado pelo navegador. Nao expor schemas nem usar service_role/backup como atalho.

O futuro modulo `server-only` de conexao devera aceitar apenas development, identidade local verificada e o destino literal aprovado, conferir current_user e atributos da role, ter pool/timeout limitados e recusar credencial administrativa. Os testes atuais nao certificam esse modulo, pois ele ainda nao existe. Sem fallback para mocks. Nao implementar APIs nesta entrega.

## Instalador atomico Windows: diagnostico e ensaio

`tools/atomic_replace.cjs` e o primitivo versionavel; `tools/install_hba.cjs` contem a orquestracao controlada. O antigo arquivo em `tmp/` e apenas uma entrada de compatibilidade. Importar o modulo nao instala configuracao.

No PowerShell 5.1 o terceiro argumento de File.Replace usa explicitamente `[System.Management.Automation.Language.NullString]::Value`. Nao usar `$null`, que pode ser convertido em caminho vazio. A operacao permanece File.Replace, com preservacao de metadados e sem ignorar erros de mesclagem.

Ensaio exclusivamente descartavel (Windows, Node 22, PowerShell 5.1):

```powershell
node --test database/local/tests/atomic_replace.test.cjs
python -B database/local/tests/test_static.py --parser-path tmp/sql-validation -v
```

Os testes Node criam diretorios `sentinela-atomic-test-*` no temporario do usuario. Evidencias sinteticas sao preservadas. Nao usam pgpass, .env, banco ou diretorio PostgreSQL. Cenarios de falha durante a operacao sao injetados na fronteira da chamada; nao simulam queda de energia nem certificam atomicidade do armazenamento.

O modulo registra etapa, tipo da excecao interna, HRESULT, codigo nativo quando fornecido pela excecao, status do processo e presenca de stderr. Mensagens brutas, argumentos e caminhos sao omitidos dos diagnosticos publicos. Caminhos dos temporarios ficam disponiveis apenas no objeto de evidencias interno para investigacao local. Os arquivos de configuracao nao devem conter credenciais.

Apos qualquer falha, backup e destino sao novamente inspecionados independentemente do retorno da substituicao. Recuperacao automatica exige backup integro, conteudo exatamente igual ao candidato conhecido e metadados originais preservados. Estado desconhecido ou concorrente interrompe sem sobrescrita. Temporarios relevantes nao sao apagados em falhas. Conteudo, DACL, proprietario, grupo, data de criacao e atributos sao conferidos apos recuperacao. LastWriteTime muda legitimamente com a nova configuracao; SACL nao e lida ou modificada explicitamente.

Nenhuma sequencia de verificacao por hash e chamada separada constitui compare-and-swap atomico contra terceiros. Antes de uma instalacao futura, exigir janela exclusiva de manutencao. O ensaio nao autoriza instalacao real.

Somente apos nova autorizacao e preflight integral, a entrada versionavel para instalar o candidato ja revisado sera:

```powershell
node database/local/tools/install_hba.cjs install '<diretorio-privado-do-manifesto-aprovado>'
```

Nao executar esse comando como parte dos testes. Nao recarrega nem reinicia o servico. Se falhar, preservar evidencias e verificar estado antes de qualquer nova tentativa.

## Fase 1 sem fixtures: execucao manual com senha oculta

O runner `run_reader.py` exige fixtures confirmadas e nao deve ser usado para certificar esta fase sem dados. Use, no terminal local, a conexao direta abaixo; nao envie a senha pelo chat e nao use SET ROLE:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -W -h 127.0.0.1 -p 5432 -U sentinela_local_reader -d sentinela_dev_operacional -v ON_ERROR_STOP=1 -f database/local/tests/permissions_manual.sql
```

O script valida identidade, seis projecoes, colunas restritas, todas as tabelas internas, DML sem linhas, DDL e TEMP. Cada probe negativa exige SQLSTATE 42501; erro diferente ou sucesso inesperado interrompe o teste. Usa subtransacoes e termina com ROLLBACK. Nao insere fixtures, nao chama funcoes de negocio nem consome defaults de INSERT. Retorna apenas um resumo, sem registros ou credenciais. Um PASS desse arquivo nao certifica filtragem RLS; requer ainda as probes HBA e a atestacao estrutural administrativa separadas.

Para RLS positivo/negativo, nao trocar ROLLBACK por COMMIT no banco operacional. As protecoes de imutabilidade tornam DELETE/TRUNCATE inadequados como limpeza. Um ensaio futuro requer autorizacao de cluster descartavel independente, snapshot de recuperacao e endpoint de teste explicitamente aprovado no runner: novo banco no cluster atual seria rejeitado pelo HBA. Nenhum cluster ou fixture e criado nesta preparacao.

## Controladores do sandbox RLS

A implementacao preparada esta em [sandbox/README.md](sandbox/README.md). O destino exclusivo foi atualizado para 127.0.0.1:55432/**sentinela_rls_sandbox**, recusando tambem o nome do banco operacional. O controlador separa preparacao, criacao, inicio, verificacao, instalacao, credenciais, snapshots, fixtures, testes, backup, parada e descarte. Nenhuma dessas fases foi executada na entrega dos controladores. As fixtures especificas do sandbox totalizam 20 (19 originais + mapeamento de natureza invisivel); os arquivos originais continuam intactos.
