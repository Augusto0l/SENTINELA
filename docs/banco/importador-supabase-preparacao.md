# Importador — preparação para o Supabase PostgreSQL

Situação em 26/11/2026. As migrations `0009` e `0010` foram aplicadas em PostgreSQL 17 descartável com PostGIS e Auth sintético. O modo hospedado está implementado e depende das configurações abaixo. O projeto Supabase institucional segue sem aplicação destas migrations.

## Modo hospedado

| Variável | Valor no servidor |
| --- | --- |
| `SENTINELA_IMPORT_MODE` | `supabase` |
| `SENTINELA_AUTH_PROVIDER` | `supabase` |
| `SENTINELA_APP_ORIGIN` | Origem HTTPS canônica da aplicação, sem barra final |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | URL e chave publicável do projeto do Auth |
| `SENTINELA_SUPABASE_IMPORT_INSTALLATION` | UUID retornado por `sentinela_ambiente.instalacao()` no destino aprovado |
| `SENTINELA_SUPABASE_IMPORT_CA` | CA em PEM que valida o hostname PostgreSQL selecionado |
| `SENTINELA_SUPABASE_IMPORT_URL_sentinela_local_admin`, `SENTINELA_SUPABASE_IMPORT_URL_sentinela_local_operator` | URLs dos papéis da aplicação, com senha percent-encoded, banco `postgres` e porta explícita `5432`. No Supavisor em modo sessão, o nome de usuário é `<papel>.<ref-do-projeto>`. |
| `SENTINELA_SUPABASE_IMPORT_WRITE` | `1` após provisionar e aprovar a escrita. Em outro estado, permite consultas e prévias autorizadas. |

Use um servidor Node com Python 3 no PATH e os arquivos-fonte do parser PCDF v1 disponíveis. O processo aplica as mesmas regras de TLS para conexão direta e Supavisor em modo sessão. A conexão dura uma requisição, inclusive quando a auditoria exige mais de uma transação. Dimensione a concorrência do servidor e os limites de conexões do projeto para essa duração. Consulte [conexões PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres) e [limites do pooler](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits).

A escrita geral exige vínculo individual em `sentinela_general_accounts.individuals`. PCDF v2 e gestão de arquivos exigem o Administrador vinculado em `sentinela_gestao_autorizacao.atores`, dentro da janela aprovada e com a instalação registrada em `sentinela_gestao_autorizacao.release`. O PostgreSQL confere a sessão ativa do Auth, o perfil e a permissão institucional. O fluxo de exclusão excepcional do lote protegido continua dependendo do procedimento autorizado de backup.

O comando abaixo instala a baseline e as migrations a partir do checkout em um cluster PostgreSQL 17 novo, inicializado com o superusuário de teste `bootstrap`. As estruturas sintéticas de Auth ficam restritas ao cluster descartável. Para o teste de rotas, inicie esse mesmo cluster com TLS e um certificado de teste com SAN `db.sentinelafixture.supabase.co`. O ensaio grava arquivos sintéticos e exige um banco sem usuários institucionais ou lotes.

```powershell
python -B database/supabase/tests/run_import_local.py --psql <psql> --port <porta> --data-directory <dados>
node --experimental-transform-types database/supabase/tests/import_hosted.mjs <porta> <dados>
```

Este documento registra a homologação local, as adaptações do importador e o procedimento de implantação. Ele complementa a [baseline Supabase](../../database/supabase/README.md) e a [preparação da etapa 2.1](preparacao-baseline-supabase-etapa2-1.md).

## 1. Evidências da homologação local

Todos os testes de escrita foram feitos no clone descartável `clone-0e565e9ab12c42d1b18c643b6bc47240`, restaurado do backup íntegro do 55484 (SHA-256 `2e9bc059…af1fc1`, 36 tabelas, schema e dados conferidos). Depois dos testes, a releitura do 55484 em `READ ONLY` mostrou as 36 tabelas idênticas ao backup.

| Fluxo | Resultado no clone |
| --- | --- |
| CSV geral (4 registros: 2 válidos, 1 sem coordenadas, 1 inválido) | 201 · 4 persistidos em origem e staging · 9 pendências · recibo e histórico |
| XLSX geral (mesmo conteúdo) | 201 · lote próprio · mesmas contagens |
| Reenvio do mesmo arquivo | 200 · mesmo lote e execução (`replay`) · nada novo gravado |
| Duplicata no mesmo arquivo | 201 · pendência `duplicata` não bloqueante na linha repetida |
| PCDF v2 26 colunas (CSV sintético, 30 associações, 15 candidatas) | roteiro `scripts/check-pcdf-monthly-csv.mjs` aprovado: 403 para Operador e Analista, reversão total após falha parcial, prévia e confirmação pela interface (1440 e 390 px), 0 ocorrências consolidadas, reenvio 200, SHA divergente 409, mesma competência 409, consulta, edição auditada sem alterar o original e exclusão controlada com comprovante |
| Analista na importação geral | 403 |
| Ocorrências consolidadas | inalteradas em todos os fluxos (a importação grava apenas origem, staging, pendências e auditoria) |

## 2. Inventário anterior à adaptação hospedada

### Aplicação (`src/lib/db`)

| Dependência | Onde | Efeito no Supabase |
| --- | --- | --- |
| Host `127.0.0.1` e portas fixas 55484, 55486, 55487, 55488, 55432 | `pcdf-direct-mode.ts`, `local-import-db.ts`, `local-occurrences.ts`, `pcdf-workspace.ts` | O host e a porta passam a vir do projeto (conexão direta ou pooler) |
| Atestação do servidor: `sentinela.sandbox_uuid`, `pg_control_system()`, `pg_postmaster_start_time()` (±2 s), `server_version_num = 170011`, `inet_server_addr() = 127.0.0.1` | `local-import-db.ts:27-41`, `pcdf-workspace.ts`, `local-occurrences.ts`, `pool.ts` | **Incompatível.** Não há controle do identificador de sistema nem do horário de início, e a versão e o endereço diferem |
| Variáveis `SENTINELA_PCDF_LOCAL_ID`, `_SYSTEM_ID`, `_START` | `pcdf-direct-mode.ts:28-43` | Sem equivalente hospedado |
| Senhas por perfil em `SENTINELA_PCDF_LOCAL_PASSWORD_<papel>`, carregadas do DPAPI pelo lançador local | `local-import-db.ts:16-25`, `database/local/pcdf-sandbox/*.py` | Devem vir de segredos do ambiente de hospedagem; o DPAPI é exclusivo do Windows local |
| `ssl: false` | `local-import-db.ts`, `pool.ts` | O Supabase exige TLS |
| Opção de inicialização `-c default_transaction_read_only=on` | `local-import-db.ts:23` | Confirmar se é repassada pelo pooler; o caminho seguro é `BEGIN READ ONLY` explícito |
| Origem `http://localhost:3000` e clones em `127.0.0.1:3317/3318` | `pcdf-direct-mode.ts:3-8` | Precisa da origem pública da aplicação |

### Banco (`database/release`, `database/local/pcdf-sandbox`)

| Dependência | Onde | Efeito no Supabase |
| --- | --- | --- |
| `capacidade()` exige `current_database()='sentinela_pcdf_local'`, `inet_server_addr()='127.0.0.1'`, a porta da `release` e o `system_id` de `pg_control_system()` | `operational-import-authorization.psql:47-62` | **Incompatível** (o banco se chama `postgres`; endereço, porta e identificador diferem) |
| `GRANT EXECUTE ON pg_control_system()` para papéis da aplicação | `operational-import-authorization.psql:6` e outros | O `postgres` gerenciado não é superusuário; não é possível conceder funções de `pg_catalog` |
| Porta `55484` escrita em funções e políticas (`exigir_ambiente`, `impedir_mutacao`, `bloquear_correcao_sem_backend` e políticas de exclusão) | releases da gestão (ver `rebind_clone` em `qualify-january-purge.py`) | Precisa de uma ligação de ambiente não baseada em porta |
| Parâmetro `sentinela.sandbox_uuid` definido em `postgresql.auto.conf` | `operational_clone.py:233` | Não há acesso a esse arquivo; validar `ALTER DATABASE … SET` em projeto de teste |
| Papéis `sentinela_local_admin`, `_operator`, `_analyst`, `sentinela_gestao_autoridade` e outros | scripts de release | Recriar como papéis com login próprio e privilégio mínimo |
| Schemas do importador (`sentinela_pcdf_local`, `sentinela_import_local`, `sentinela_gestao_autorizacao`, `sentinela_exclusao`, `sentinela_ocorrencias_local` e afins) | 22 arquivos em `database/release/*.psql` e SQL de `pcdf-sandbox` | **Não estão na baseline Supabase** (que cobre só as locais 0001-0005 e as 0006-0008 de autenticação) |

### Inventário exato da instalação de produção

Extraído do `pg_dump --schema-only` do 55484 tirado no backup do clone de 26/11/2026 (9.538 linhas de DDL, sem dados):

| Item | Quantidade |
| --- | --- |
| Schemas próprios | 13: `sentinela`, `sentinela_pcdf_local`, `sentinela_pcdf_historico`, `sentinela_pcdf_revisao`, `sentinela_import_local`, `sentinela_general_accounts`, `sentinela_gestao`, `sentinela_gestao_autorizacao`, `sentinela_exclusao`, `sentinela_ocorrencias_local`, `sentinela_ocorrencias_manual`, `sentinela_ocorrencias_analytics`, `sentinela_pessoas` |
| Tabelas / views | 35 / 11 |
| Funções | cerca de 99 |
| Políticas RLS / gatilhos | 126 / 57 (5 deles de restrição) |
| Papéis próprios citados em GRANT | 18 (entre eles `sentinela_local_admin`, `_operator`, `_analyst`, `sentinela_pcdf_owner`, `sentinela_gestao_autoridade`, `sentinela_ocorrencias_reader`) |
| Referências a `55484` / `inet_server_port()` / `pg_control_system()` / `inet_server_addr()` / `sandbox_uuid` | 27 / 29 / 9 / 7 / 4 |
| PostGIS | já instalado no schema `extensions`; nenhuma referência a `public.st_*` ou `public.geometry` |

Conclusões:

- **Entrelaçamento:** o importador não é um bloco isolável. Staging, pendências e auditoria ficam em `sentinela`, e a gestão, a exclusão, as ocorrências manuais, as pessoas e o analytics dependem dos mesmos papéis e da mesma atestação. A migração precisa levar a instalação inteira, não só os schemas de importação.
- **Fonte da verdade:** a fonte mais fiel para as migrations do Supabase é essa DDL instalada, não a reaplicação dos 43 scripts locais, que fazem substituições de texto na instalação.
- **Sem modo de produção na aplicação:** a aplicação só ativa o importador com `NODE_ENV=development` (`directPcdfEnvironment` em `src/lib/db/pcdf-direct-mode.ts`). Não existe hoje caminho de produção, local ou hospedado. Criá-lo faz parte da adaptação da seção 4.

## 3. Decisões de integração (documentação atual do Supabase)

- **Conexão.** A aplicação Next.js fica em servidor persistente (Node). Usar conexão direta (IPv6, ou IPv4 com o add-on) ou o pooler compartilhado em modo sessão (porta 5432). O modo transação (porta 6543) não preserva estado de sessão (SET, travas de sessão) nem prepared statements, e o importador usa transações longas com `BEGIN … COMMIT` e configurações locais. Se a aplicação for implantada como funções serverless, homologar o modo transação à parte.
- **TLS.** Ligar `ssl` com verificação do certificado do projeto. O código atual fixa `ssl: false` para o banco local.
- **Papéis.** O `postgres` do Supabase não é superusuário, mas pode criar papéis com login e senha (`CREATE ROLE … WITH LOGIN PASSWORD`). Manter um papel por perfil, sem herdar privilégios do `postgres` nem dos papéis gerenciados (`anon`, `authenticated`, `service_role`), e revogar o que vier de `PUBLIC`. Usar senhas `scram-sha-256` e redefini-las depois de restaurações.
- **PostGIS.** Instalar no schema `extensions` (`create extension postgis with schema extensions`), como a baseline já espera. Nunca em `public`.
- **Autenticação.** Manter o Supabase Auth institucional. A conta do ator (`sha256(["sentinela-supabase", URL do projeto, auth_user_id])`) já é calculada para o Supabase e não muda.
- **Parâmetros.** Só uma parte dos parâmetros do servidor pode ser alterada pelo `postgres`. Não depender de parâmetros persistentes do servidor para a segurança sem testá-los num projeto de homologação.

## 4. Atestação do ambiente hospedado

No modelo local, a autorização é amarrada ao cluster físico (endereço, porta, identificador de sistema, horário de início e versão). No Supabase essas propriedades não estão disponíveis ou não são estáveis. **Remover essas verificações sem substituí-las enfraqueceria a segurança e não deve ser feito.**

1. A `0009` grava um UUID de instalação ligado ao OID do banco. O papel proprietário dedicado controla o registro com RLS forçada. A aplicação compara o UUID com o valor configurado e valida o certificado e o hostname do PostgreSQL.
2. A `0010` mantém em `capacidade()` as verificações de `session_user`, janela da `release`, identidade, conta, validade e perfil Administrador ativo. A função também confere a sessão institucional e a ligação do ambiente.
3. `SENTINELA_IMPORT_MODE=supabase` escolhe a atestação hospedada. O modo local continua usando a atestação física.
4. A regressão descartável confere ACLs, sessão ausente ou revogada, perfil divergente e escrita desativada. A validação com Auth e pooler gerenciados integra a homologação do projeto Supabase.

## 5. Procedimento de implantação verificável

Executar primeiro num **projeto Supabase de homologação**, nunca direto em produção.

1. **Preparar o projeto:** PostgreSQL 17, PostGIS no schema `extensions` e acesso por conexão direta ou pooler em modo sessão, com TLS.
2. **Modelo base:** aplicar só `database/supabase/baseline/0001_modelo_inicial.sql` e depois `database/supabase/migrations/0006` a `0008`, conforme o README da pasta. Rodar `validate_baseline.py`.
3. **Instalar o importador:** aplicar `0009` e `0010` no destino de homologação. Conferir o vínculo do ambiente, proprietários, RLS e ACLs no catálogo.
4. **Papéis e segredos:** criar os papéis de importação com login e privilégio mínimo. As senhas ficam nos segredos do ambiente de hospedagem, nunca no repositório.
5. **Catálogos e dados:** migrar os dados (`pg_dump`/`pg_restore` por conexão direta) para o projeto de homologação. Comparar contagens e hashes por tabela com o 55484, como em `operational_clone.py` (`FINGERPRINTS`).
6. **Configurar a aplicação:** URL e chave pública do Supabase, origem pública, credenciais dos papéis e modo de destino hospedado. Iniciar o Next.js apontando para o projeto de homologação.
7. **Qualificação:** repetir a seção 1 no projeto de homologação com os roteiros existentes (`scripts/check-pcdf-monthly-csv.mjs` e a importação geral CSV/XLSX), adaptados ao destino hospedado: perfis, reversão, reenvio, conflitos, duplicatas, consulta, edição e exclusão.
8. **Autorização institucional:** registrar o ator do Administrador com validade curta pelo procedimento de [gestão de arquivos](../relatorios/backend-operacional-gestao-arquivos-2026-11-24.md), adaptado. Abrir a janela só durante a operação e fechá-la ao final.
9. **Produção:** repetir os passos 1 a 8 no projeto definitivo, com backup e plano de reversão aprovados.

## 6. Pendências no serviço gerenciado

- Validar permissões efetivas, Auth institucional e conexão direta ou Supavisor em um projeto Supabase de homologação autorizado.
- Conferir o ambiente de execução do parser PCDF v1 e o limite de envio no servidor escolhido.
- Homologar o procedimento de migração de catálogos e dados com comparação de contagens e hashes, antes de autorizar qualquer execução institucional.

## Ensaio local no Edge

O [roteiro Playwright](../../scripts/check-hosted-import-browser.mjs) abre `/importar` no Edge em 1440 px e 390 px. O [ambiente do ensaio](../../scripts/hosted-import-browser-environment.mjs) inicia um cluster PostgreSQL descartável, exige SCRAM e TLS para os papéis de importação e executa a aplicação Next em HTTPS. O SDK de autenticação usa o transporte sintético do ensaio e a RPC de acesso com RLS no PostgreSQL local.

Em 26/11/2026, o Edge 158 confirmou CSV, XLSX, PCDF v1 e v2 nas duas larguras, com recibos, histórico, reenvio e revisão auditada. Os cinco lotes sintéticos geraram 29 pendências, uma correção auditada e zero ocorrências consolidadas. A verificação isolada do Analista mostrou a tela de acesso negado e HTTP 403 na API de importação. [Seleção desktop](../evidencias/importador-supabase-edge-2026-11-26/desktop-selecao.png) · [Confirmação PCDF v1](../evidencias/importador-supabase-edge-2026-11-26/desktop-confirmacao-pcdf-v1.png) · [Revisão auditada](../evidencias/importador-supabase-edge-2026-11-26/desktop-auditoria-pcdf-v2.png) · [Histórico mobile](../evidencias/importador-supabase-edge-2026-11-26/mobile-historico.png) · [Reenvio mobile](../evidencias/importador-supabase-edge-2026-11-26/mobile-reenvio-pcdf-v2.png)

Para repetir no Windows, use um terminal dedicado com as portas `3320` e `55498` livres, PostgreSQL 17 com PostGIS, Python 3, OpenSSL e Edge. Gere um build isolado com a configuração fictícia antes de rodar o roteiro.

```powershell
$env:SENTINELA_HTTP_VALIDATION_ID = [guid]::NewGuid().ToString()
$env:SENTINELA_APP_ORIGIN = "https://localhost:3320"
$env:SENTINELA_AUTH_PROVIDER = "supabase"
$env:SENTINELA_IMPORT_MODE = "supabase"
$env:SENTINELA_INTEGRATED_SUPABASE = "0"
$env:SENTINELA_LOCAL_DEMO = "0"
$env:NEXT_PUBLIC_SUPABASE_URL = "https://sentinelafixture.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_browser_fixture"
$id = $env:SENTINELA_HTTP_VALIDATION_ID
New-Item -ItemType Directory -Force tmp | Out-Null
@{ extends = "../tsconfig.json"
   include = @("../next-env.d.ts", "../src/**/*.ts", "../src/**/*.tsx", "../.next-http-validation-$id/types/**/*.ts")
   compilerOptions = @{ incremental = $false }
} | ConvertTo-Json | Set-Content -Encoding ascii "tmp/tsconfig-http-$id.json"
pnpm build --webpack
if ($LASTEXITCODE -eq 0) {
  node --experimental-transform-types scripts/check-hosted-import-browser.mjs "tmp/import-edge-$id"
}
```

## Checklist para homologação no Supabase gerenciado

A execução deste checklist exige um projeto de homologação autorizado. Comece com `SENTINELA_SUPABASE_IMPORT_WRITE` desativada e mantenha a janela de escrita do banco fechada.

- [ ] **Destino e reversão.** Conferir a referência do projeto, PostgreSQL 17, PostGIS em `extensions`, o ledger inicial e um backup com restauração verificada.
- [ ] **Migrations.** Em instalação nova, aplicar a baseline Supabase e depois `0006` a `0010` na ordem. Em banco já provisionado, conferir o ledger e aplicar somente as migrations pendentes, com parada no primeiro erro. Confirmar o UUID da instalação que será usado pelo servidor.
- [ ] **RLS e ACLs.** Conferir proprietários, RLS forçada, políticas e funções privilegiadas. Verificar que os papéis da aplicação não têm `BYPASSRLS` nem herdam papéis administrativos. Conferir os cinco privilégios autorizados de `sentinela_exclusao.comprovantes` e a revogação dos demais.
- [ ] **Auth real.** Testar login, cookies SSR, sessão expirada e sessão revogada com usuários institucionais de teste dos três perfis. Conferir o vínculo ativo e o resultado de `sentinela_api.meu_acesso`. Validar Administrador para PCDF v2 e gestão, Operador para CSV, XLSX e PCDF v1 e Analista sem acesso de importação.
- [ ] **TLS e conexão.** Usar conexão direta ou Supavisor em modo sessão. Validar a CA e o hostname do endpoint a partir do servidor da aplicação. Confirmar recusa de certificado inválido e de instalação divergente. Dimensionar conexões considerando a concorrência do servidor e do projeto. [Conexões PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres) · [Limites do pooler](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
- [ ] **Credenciais.** Provisionar segredos separados por papel no servidor e verificar que os bundles e diagnósticos do navegador carregam apenas a configuração publicável. Confirmar a disponibilidade de Python 3 e dos arquivos do parser PCDF v1 no ambiente de execução.
- [ ] **Autorização de escrita.** Com sessões reais, conferir leitura e prévia antes de habilitar escrita. Registrar os vínculos individuais da importação geral. Para PCDF v2 e gestão, autorizar o Administrador com validade e abrir a janela da instalação aprovada. Habilitar a chave da aplicação durante o ensaio e fechar a janela ao concluir.
- [ ] **Aceite no destino.** Importar arquivos sintéticos dos quatro formatos. Conferir recibos, histórico, pendências, reenvio, revisão auditada e zero consolidações automáticas. Registrar os resultados e decidir sobre a próxima etapa antes de importar dados operacionais.

## Implantação dos módulos operacionais no destino definitivo

Dashboard, Mapa Criminal, consulta e gestão manual de ocorrências e administração de usuários usam a mesma ligação ao projeto Auth, certificado TLS verificado e UUID de instalação do importador. A aplicação usa um login PostgreSQL sem herança por perfil. O banco confere a sessão ativa do Auth, o vínculo institucional, a permissão e o perfil no momento de atestar a conexão. Cadastro e edição manual conferem novamente a autoria e a liberação no banco. A gestão de usuários valida a sessão do Administrador e conserva o primeiro acesso, o controle de concorrência e a trilha de auditoria. A Central hospedada usa a migration incremental `0011`. O procedimento a seguir documenta a instalação dos módulos até `0010`. [Plano atual de implantação](pre-implantacao-supabase-institucional.md#aplicação-incremental-e-aceite)

### Pré-requisitos e execução incremental

1. **Verificar o destino em leitura.** Confirmar `hcmqsqfbrynpfjvmuqdb` no painel e no endpoint do projeto, a exposição de `sentinela_api` na Data API, PostgreSQL 17.11, PostGIS 3.3.7 em `extensions`, a baseline e o ledger `0001`–`0008`. Comparar também o histórico de migrations do Supabase. Verificar acesso do instalador a `auth.users` e `auth.sessions`, capacidade de criar papéis, delegar `SET ROLE` e conceder `USAGE` em `extensions` ao executor manual. Conferir colisões de schemas e papéis e as exigências de rede. Registrar a contagem e a correspondência dos vínculos Auth, o estado dos perfis, objetos de auditoria e dados existentes. Manter protegidos o inventário institucional e os identificadores de usuários. [Conexão de banco](https://supabase.com/docs/guides/database/connecting-to-postgres) · [Papéis no PostgreSQL gerenciado](https://supabase.com/docs/guides/database/postgres/roles-superuser)
2. **Preparar a recuperação antes da manutenção.** Gerar backups lógicos separados do destino e da origem, com schemas, dados, papéis personalizados, ACLs e ledgers. Conferir cobertura de `auth` e configurações de Auth, incluindo redirecionamento, provedores, SMTP, assinatura de tokens e secrets. Registrar as configurações gerenciadas fora do dump. Versionar os hashes dos artefatos, registrar contagens de referência e ensaiar a restauração em destino descartável autorizado. Conservar a origem operacional como ponto de retorno até o aceite. [Backups e recuperação](https://supabase.com/docs/guides/platform/backups) · [Restauração com a CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
3. **Aplicar somente após autorização da manutenção.** Fixar os SHA-256 dos dois arquivos abaixo. Usar um serviço do libpq preparado pelo responsável com conexão direta ou Supavisor em modo sessão, `sslmode=verify-full`, CA confirmada e segredo fora do comando. Conferir o projeto e o ledger em uma sessão somente leitura antes de autorizar a sessão instaladora. Cada arquivo abre e confirma sua própria transação. Aplicar um por vez com `ON_ERROR_STOP` e conferir o ledger após cada execução. Preservar o histórico existente e registrar o artefato aplicado no mecanismo institucional autorizado.

   ```powershell
   Get-FileHash -Algorithm SHA256 database/supabase/migrations/0009_importador_papeis_ambiente.sql,database/supabase/migrations/0010_importador_objetos.sql
   psql -X -w -v ON_ERROR_STOP=1 -d "service=sentinela-institucional-instalador" -f database/supabase/migrations/0009_importador_papeis_ambiente.sql
   if ($LASTEXITCODE -ne 0) { throw "A 0009 falhou. Interrompa e confira o ledger." }
   # Confirmar no ledger a 0009 e registrar o UUID de instalação antes de continuar.
   psql -X -w -v ON_ERROR_STOP=1 -d "service=sentinela-institucional-instalador" -f database/supabase/migrations/0010_importador_objetos.sql
   if ($LASTEXITCODE -ne 0) { throw "A 0010 falhou. Mantenha fechada a escrita da aplicação." }
   ```

4. **Validar a instalação antes de abrir a aplicação.** Conferir o ledger até `0010`, vinculação ao OID e UUID de instalação, PostGIS, RLS forçada, grants e proprietários. Conferir os três perfis, a integridade das FKs, as identidades Auth e o evento de auditoria preexistente. Confirmar que os logins da aplicação não consultam diretamente `auth.users`, não têm propriedade de objetos e não têm acesso de escrita a tabelas operacionais. Provisionar senhas distintas para `sentinela_local_admin`, `sentinela_local_operator` e `sentinela_local_analyst`, com rotação e armazenamento no cofre do servidor.
5. **Subir a aplicação com as escritas de negócio fechadas.** Configurar `SENTINELA_AUTH_PROVIDER=supabase`, `SENTINELA_IMPORT_MODE=supabase`, origem HTTPS canônica, URL e chave publicável do Auth, `SENTINELA_SUPABASE_IMPORT_INSTALLATION`, `SENTINELA_SUPABASE_IMPORT_CA` e `SENTINELA_SUPABASE_IMPORT_URL_<login>` para os três logins. Manter `SENTINELA_SUPABASE_IMPORT_WRITE` e `SENTINELA_SUPABASE_OPERATIONAL_WRITE` desligadas. A chave `SENTINELA_USERS_AUTH_KEY` é exclusiva do servidor, destinada ao provisionamento, primeiro acesso e exclusão via Auth Admin. Confirmar o runtime Node e o parser Python para PCDF v1. Implantar a configuração publicável correta no build.
6. **Homologar no serviço gerenciado.** Verificar TLS a partir da aplicação, os três perfis com Auth real, expiração e revogação, consultas do Dashboard/Mapa, filtros e detalhe de ocorrência e listagem administrativa. Anteceder qualquer teste de escrita de uma autorização que fixe destino, contas sintéticas, conjunto de comandos e retorno. Se aprovada, conferir liberação manual vinculada à instalação e ao projeto Auth, catálogos de RAs e naturezas autorizados, vínculos da importação geral e liberações de gestão. Ativar apenas a chave de escrita do fluxo sob ensaio. Validar cadastro, edição, idempotência, publicação, auditoria, transações, administração de usuários e os quatro formatos de importação. Fechar as chaves ao fim da janela. A exclusão excepcional do lote protegido de janeiro de 2021 exige procedimento específico e segue bloqueada em modo hospedado.
7. **Só então reconciliar e transferir os dados autorizados.** Inventariar origem e destino em leitura, por conjunto e chave referencial. Preparar correspondência entre os IDs dos usuários da origem e os vínculos Auth institucionais, sem sobrescrever identidades, perfil ou estado. Preservar IDs de domínio e auditoria, conferir colisões de UUID, associações, referências aos lotes e versões de catálogos. Ensaiar a ordem de carga em cópia descartável e registrar contagens e hashes por tabela e janela. Incluir revisões, cobertura histórica, geometria e regras de publicação no mapa. Na janela de corte autorizada, registrar o último ponto de escrita da origem e do destino, usar apenas a exportação aprovada, reconciliar diferenças e liberar tráfego após aceite.

### Recuperação

- Falha durante uma migration: preservar a saída, manter escrita e aplicação fechadas e conferir a transação e ambas as histórias. Se `0009` confirmou e `0010` falhou, validar o estado de `0009` antes de reaplicar somente a `0010` corrigida. Uma divergência fora do ledger exige reconciliação em cópia.
- Falha no aceite após o DDL: fechar as liberações, desligar as duas chaves e redirecionar o tráfego à implantação anterior após conferir a janela de alterações. Preservar evidências e registros existentes. Restaurar em ambiente descartável e comparar dados, papéis, Auth, auditoria e versões antes de qualquer recuperação no destino definitivo.
- A instalação é vinculada ao OID do banco. A restauração em outro banco exige reatestar a nova instalação, reprovisionar segredos e revisar as liberações dependentes do UUID. Autorizar essa intervenção separadamente e registrar a linhagem do backup. Confirmar a correspondência das identidades e o ponto de corte antes de reabrir tráfego.

### Reproduzir o ensaio local dos módulos operacionais

Use o mesmo preparo do build isolado do importador, com `NEXT_PUBLIC_SUPABASE_URL=https://sentinelafixture0000.supabase.co` e o comando `node --experimental-transform-types scripts/check-hosted-operations.mjs` após o build. O roteiro instala baseline e migrations no cluster descartável com PostgreSQL 17 e PostGIS, usa SCRAM/TLS com CA e hostname verificados e simula as respostas do Auth. A RPC de vínculo, as funções de negócio, a RLS, as gravações e o rollback passam pelo PostgreSQL do ensaio. As portas locais são `3320` e `55498`.

O ensaio passou no Edge com PostgreSQL 17.11 e PostGIS 3.6.2. A instalação incremental preservou as identidades, sessões, permissões e auditoria sintéticas inseridas antes da `0009`. Foram verificados leitura nos três perfis, cadastro idempotente, edição auditada, publicação e consulta no mapa, rollback, provisionamento e retomada de exclusão de usuário. O ambiente também recusou CA inválida, UUID de instalação divergente, sessão revogada e escritas sem liberação. O aceite gerenciado ainda precisa exercitar as credenciais, a conexão e o Auth reais e o PostGIS 3.3.7 do destino.

## Inventário somente leitura do destino definitivo

Em 26/11/2026, o projeto institucional `SENTINELA` (`hcmqsqfbrynpfjvmuqdb`, São Paulo) estava ativo no plano Free. As consultas SQL foram feitas em transações `READ ONLY`, com contagens agregadas para Auth e dados da aplicação.

| Área | Resultado verificado |
| --- | --- |
| Banco e conexão | PostgreSQL 17.11, UTF-8, PostGIS 3.3.7 em `extensions`. O catálogo contém o tipo `geometry`, `spatial_ref_sys` e os onze nomes de funções espaciais usados pela baseline e pela `0010`. O backend do conector negociou TLS 1.3. A validação de CA e hostname pela aplicação, no endpoint escolhido, integra a homologação. |
| Baseline e migrations | Schemas `sentinela`, `sentinela_api` e `sentinela_private`. As 19 tabelas e os 215 nomes de colunas correspondem à baseline e às migrations até `0008`, assim como os 24 corpos de função. O ledger da aplicação contém `0001` a `0008`. O histórico do Supabase registra `20261126163226 exclusao_institucional` e `20261126163836 corrigir_confirmacao_exclusao_institucional`. Preservar os dois históricos. |
| Identidades | Três usuários e três identidades Auth por e-mail, cada uma ligada a um perfil ativo da aplicação. Há um Administrador, um Operador e um Analista ativos e vinculados. Há ainda três registros institucionais inativos, sem vínculo com Auth, um por perfil. Duas linhas em `auth.sessions` satisfaziam a condição `not_after` na coleta e zero fatores MFA estavam cadastrados. A consulta de sessões não valida a vigência de um JWT. |
| RLS e acesso | As 19 tabelas têm RLS habilitada e forçada. A policy em `sentinela.usuarios` permite ao usuário autenticado consultar o próprio vínculo ativo, com leitura restrita a cinco colunas. A consulta como `authenticated` sem claims retornou zero usuários. O papel `anon` não tem acesso às tabelas da aplicação. Os dois gatilhos institucionais em `auth.users` estão habilitados e a FK de vínculo usa `ON DELETE RESTRICT`. O papel instalador `postgres` tem `CREATEROLE` e `BYPASSRLS`, sem superusuário. |
| Dados e serviços | Um evento de auditoria, três perfis, seis permissões e doze vínculos perfil–permissão. As tabelas de ocorrências, associações, importação, staging, pendências, correções e catálogos operacionais estão vazias. Zero buckets, objetos de Storage, entradas de Vault e funções Edge. Nenhuma tabela SENTINELA está em publicação Realtime. |
| Lacunas para operação | Faltam `0009` e `0010`, os schemas e papéis específicos de importação e as adaptações estruturais de `extracoes_origem`, `naturezas_criminais`, `ocorrencia_naturezas` e `regioes_administrativas`. O destino está no PostGIS 3.3.7 e o ensaio local usou 3.6.2. A compatibilidade de execução e a publicação geográfica precisam de ensaio com a versão de destino. |

O advisor informa 18 tabelas com RLS habilitada e sem policy, coerente com o fechamento da baseline, e alerta que a proteção contra senhas vazadas está desativada. O catálogo não apresentou a lista de schemas expostos pela Data API nesta sessão. Confirmar no painel a exposição de `sentinela_api`, as URLs de redirecionamento, os provedores de Auth, SMTP, assinaturas e ajustes de segurança antes da virada, com registro seguro das configurações. [Advisor de RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) · [Segurança de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

### Sequência para a virada definitiva

1. **Preservar a instalação institucional.** Capturar backup lógico restaurável do destino com schemas, dados, Auth, permissões, papéis personalizados e os dois históricos de migrations. Registrar as configurações gerenciadas separadamente e sem expor segredos. Gerar backup verificado também para a origem local. Ensaiar recuperação em ambiente descartável autorizado. No plano Free, a alternativa documentada é a exportação lógica. [Backups do Supabase](https://supabase.com/docs/guides/platform/backups) · [Restauração com a CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
2. **Homologar o destino técnico em isolamento.** Reproduzir em clone descartável o catálogo até `0008`, PostGIS 3.3.7 e as permissões do instalador. Exercitar as migrations e uma carga com fixtures sintéticas. Reservar a qualificação de Auth real e do pooler para ambiente gerenciado isolado e autorizado. O projeto institucional permanece como destino definitivo.
3. **Completar os caminhos hospedados da aplicação.** O modo hospedado atual cobre a importação e sua gestão. Dashboard, dados analíticos do Mapa, consulta e cadastro de ocorrências e administração de usuários ainda usam caminhos dependentes do PostgreSQL local. Validar a adaptação e a paridade desses fluxos por perfil antes de desativar o banco local. [Dashboard](../../src/lib/db/dashboard.ts) · [Dados do Mapa](../../src/app/api/v1/analytics/persistente/route.ts) · [Ocorrências](../../src/lib/db/local-occurrences.ts) · [Usuários](../../src/lib/db/institutional-users.ts)
4. **Planejar a transferência seletiva.** Reconciliar `sentinela.usuarios` e a autoria das FKs com os vínculos Auth do destino. Preservar as identidades, os perfis, o evento remoto de auditoria e os estados de revisão. Exportar só o conjunto de dados operacionais aprovado, com contagens e hashes da janela de corte. Carregar em ordem referencial, com o mapeamento de colisões ensaiado. Manter os catálogos e registros originais e preservar os critérios de publicação de pontos no Mapa.
5. **Executar a virada em janela autorizada.** Congelar escritas na origem, conferir novamente a referência institucional e os backups, aplicar as migrations pendentes e executar a carga explícita aprovada. Validar contagens, rastreabilidade, constraints, auditoria e equivalência funcional com o Supabase em leitura. Habilitar a escrita apenas após o aceite. Preservar a origem para reversão e evitar escrita simultânea nos dois bancos.
6. **Recuperar de acordo com o ponto da falha.** Antes da abertura de escrita, manter ou retornar o tráfego à origem e tratar o destino isoladamente. Após a abertura, congelar escritas e reconciliar as alterações feitas no Supabase antes de retornar à origem. Um rollback destrutivo ou restauração do destino requer autorização específica. [Migração de PostgreSQL para Supabase](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres)

## Plano de aplicação de 0009 e 0010 no destino gerenciado

Em 26/11/2026, a consulta de projetos retornou apenas `SENTINELA` com a referência `hcmqsqfbrynpfjvmuqdb`, que coincide com a configuração institucional do repositório. A consulta de branches retornou uma lista vazia. A homologação gerenciada aguarda a identificação de um destino separado.

A criação autorizada de `SENTINELA-HOMOLOGACAO` em São Paulo recebeu cotação de US$ 0 por mês. O Supabase recusou o provisionamento porque a cota de dois projetos gratuitos ativos de um administrador ou proprietário já estava atingida. A consulta posterior confirmou o plano Free e a ausência de um projeto novo. Os dois critérios gerenciados seguem pendentes.

1. **Identificar e inspecionar o destino em leitura.** Registrar a referência, a organização, o estado, a URL do Auth e o endpoint PostgreSQL. Confirmar o isolamento e usar uma conexão direta ou Supavisor em modo sessão com certificado e hostname verificados. Em transação somente leitura, conferir PostgreSQL 17, PostGIS em `extensions`, schemas, objetos de Auth e privilégios efetivos do papel instalador, sobretudo acesso às tabelas de Auth, criação de papéis e transferências de propriedade. Conferir o histórico do Supabase e o ledger `sentinela.schema_migrations` quando existir. Registrar apenas metadados e contagens agregadas. [Conexões PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres) · [Restrições do papel postgres gerenciado](https://supabase.com/docs/guides/database/postgres/roles-superuser)
2. **Estabelecer a recuperação.** Documentar o estado inicial do catálogo, os papéis, as permissões e o ledger do destino. Usar backup gerenciado quando disponível ou exportação lógica de schemas, dados de teste e papéis personalizados. Validar a restauração em destino descartável autorizado ou, para um projeto novo e vazio, registrar como recriar o estado inicial com os artefatos publicados. Guardar o material de recuperação fora do repositório e prever a redistribuição de senhas por meio seguro. [Backups do Supabase](https://supabase.com/docs/guides/platform/backups) · [Backup e restauração pela CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
3. **Pedir autorização com o alvo identificado.** Apresentar a referência e os arquivos SQL pendentes, a estratégia de recuperação e as escritas de teste previstas. Incluir o provisionamento de papéis e três contas sintéticas, os vínculos de autorização e a janela de escrita. Usar um ambiente exclusivo de homologação e fixtures sintéticas.
4. **Aplicar em ordem e validar após cada commit.** Em destino vazio e autorizado, preparar PostGIS em `extensions`, aplicar a baseline congelada e as migrations `0006` a `0008`. Em destino previamente instalado, validar a sequência existente no ledger e a presença dos objetos esperados. Aplicar `0009` depois de `0008` e conferir o vínculo, o proprietário do schema e os privilégios das funções. Aplicar `0010` depois de `0009` e conferir o ledger, proprietários, RLS, triggers e ACLs, incluindo `sentinela_exclusao.comprovantes`. Executar cada arquivo em sua transação, com parada no primeiro erro.
5. **Qualificar o serviço gerenciado.** Confirmar login, sessão ativa, expiração e revogação com Auth real dos três perfis. Confirmar bloqueios de RLS e de autorização de escrita. Durante a janela aprovada, importar fixtures CSV, XLSX, PCDF v1 e v2 e verificar persistência, revisão auditada, histórico, conflito, idempotência, reversão de falha e preservação dos originais. Encerrar a janela de escrita e guardar recibos, contagens, códigos HTTP e referências de auditoria com dados sintéticos.
6. **Interromper se o estado divergir.** Em falha de migration, conferir o rollback e o ledger antes de decidir como retomar. Como os arquivos têm commits independentes, uma falha em `0010` pode deixar `0009` instalada. Manter a escrita fechada, registrar a causa e pedir autorização específica para uma restauração destrutiva ou para mudanças fora do escopo aprovado.

## Referências

- [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres) e [Supavisor FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI)
- [Postgres Roles](https://supabase.com/docs/guides/database/postgres/roles) e [Roles, superuser access and unsupported operations](https://supabase.com/docs/guides/database/postgres/roles-superuser)
- [PostGIS](https://supabase.com/docs/guides/database/extensions/postgis)
- [Customizing Postgres configs](https://supabase.com/docs/guides/database/custom-postgres-config)
- [Migrate from Postgres to Supabase](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres) e [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
