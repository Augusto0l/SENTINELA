# Pré-implantação do SENTINELA no Supabase institucional

**Estado atual do banco.** A carga operacional e as migrations `0009`–`0011` foram confirmadas em uma única transação. Consulte a seção **Execução confirmada da carga operacional** para o estado posterior. Os inventários iniciais deste documento registram o ponto de partida.

Destino `hcmqsqfbrynpfjvmuqdb`, região São Paulo. Levantamento de 26/11/2026. Consultas SQL ao destino executadas em transações `READ ONLY`, com resultados de Auth agregados. Servem de referência o [ensaio anterior no Edge](importador-supabase-preparacao.md#reproduzir-o-ensaio-local-dos-módulos-operacionais) e a [homologação dos quatro formatos](importador-supabase-preparacao.md#checklist-para-homologação-no-supabase-gerenciado).

## Inventário confirmado

| Verificação | Resultado observado |
| --- | --- |
| Projeto e versões | `ACTIVE_HEALTHY`, PostgreSQL 17.11, imagem gerenciada `17.11.0.003`, UTF-8, PostGIS 3.3.7 em `extensions`. O conector negociou TLS 1.3. A CA e o hostname da conexão da aplicação ainda precisam ser homologados. |
| Históricos | Ledger `sentinela.schema_migrations` de `0001` a `0008`. O histórico Supabase tem duas entradas, `20261126163226` e `20261126163836`, relativas à exclusão institucional e à correção da confirmação. Preservar ambos. As etapas incrementais `0009`, `0010` e `0011` estão pendentes no destino. |
| Auth | Três contas com primeiro acesso concluído e vínculo ativo, uma por perfil. Há ainda três registros institucionais inativos sem vínculo. A FK para `auth.users` e os dois gatilhos de provisionamento estão presentes. `meu_acesso()` é executável por `authenticated`. Os dois RPCs administrativos são executáveis por `service_role`. |
| RLS e permissões | As 19 tabelas de `sentinela` têm RLS habilitada e forçada, com proprietário `postgres`. A política existente limita `authenticated` ao próprio vínculo ativo. Há 12 vínculos de permissões para os três perfis. `postgres` pode ler as duas tabelas Auth necessárias, criar papéis e conceder `USAGE` em `extensions`. Os papéis e schemas de `0009` e `0010` ainda não existem. |
| Dados e serviços | Um evento de auditoria. Zero ocorrências, lotes, extrações, linhas de staging, pendências, correções, RAs, naturezas, buckets, objetos em Storage e entradas no Vault. |
| Configuração gerenciada | A exposição de `sentinela_api`, os ajustes Auth e a disponibilidade efetiva de backup e sua retenção precisam ser conferidos no painel. A leitura SQL não expôs a configuração da Data API. |

## Ensaio de DDL e recuperação

No destino, uma consulta em `READ ONLY` executou as funções espaciais sobre um ponto e um polígono sintéticos. O PostGIS 3.3.7 confirmou SRID 4326, validade do polígono, `ST_Contains`, `ST_Covers`, coordenadas e serialização EWKB. O ensaio de DDL na versão exata continua pendente. O PostgreSQL Windows local recusou a instalação de `3.3.7` por falta de script de instalação ou caminho de atualização, e o arquivo oficial de binários Windows para PostgreSQL 17 começa na versão 3.5.0. [Arquivo Windows do PostGIS para PostgreSQL 17](https://ftp2.osuosl.org/pub/osgeo/download/postgis/windows/pg17/archive/)

O [roteiro local](../../database/supabase/tests/rehearse_predeployment.py) cria dois clusters novos em loopback nas portas `55524` e `55525`. Verifica o diretório, o usuário e as versões do PostgreSQL e da biblioteca PostGIS. Instala a baseline e `0006`–`0008`, semeia somente identidades e dados sintéticos e gera a cópia de retorno. Aplica `0009`–`0011`, gera a segunda cópia e restaura cada estado em um banco novo do segundo cluster. Compara o ledger, hashes dos dados, geometria EWKB, índices GiST, papéis, associações, políticas, ACLs, proprietários e funções. Atesta a recusa da instalação restaurada em outro OID e a exclusividade da decisão da Central para o Administrador.

Os ensaios passaram em PostgreSQL 17.11 e PostGIS 3.6.2. As cópias pré-`0009`, pós-`0010` e pós-`0011` preservaram as três contas e vínculos, sessões, matriz de permissões, um evento de auditoria, geometria, gatilhos e constraints do conjunto sintético. A recuperação preservou os grantors das associações de papéis e confirmou a recusa do vínculo de instalação em outro OID. O ensaio pós-`0011` confirmou dois índices GiST válidos e a ACL de decisão da Central. A verificação de grantors deve ser repetida na recuperação gerenciada, onde a plataforma provisiona os papéis de sistema. Os manifestos contêm metadados, contagens e checksums. [Ensaio até 0010](../evidencias/pre-implantacao-supabase-recuperacao-sintetica-2026-11-26.json) · [Ensaio até 0011](../evidencias/pre-implantacao-supabase-recuperacao-sintetica-0011-2026-11-26.json)

```powershell
python -B database/supabase/tests/rehearse_predeployment.py --pg-bin "C:/Program Files/PostgreSQL/17/bin" --output-root tmp/pre-implantacao --postgis 3.3.7
```

Para repetir com a distribuição Windows disponível, selecione `--postgis 3.6.2`. A equivalência exata exige `postgis_lib_version() = '3.3.7'` e `pg_extension.extversion = '3.3.7'`. Em Linux isolado já autorizado é possível usar a imagem oficial Supabase PostgreSQL `17.11.0.003` após verificar o digest e a biblioteca efetivamente instalada. O teste requer uma instalação descartável com os utilitários PostgreSQL disponíveis ao runner. [Documentação PostGIS 3.3.7](https://postgis.net/stuff/postgis-3.3.7.pdf) · [Distribuição Supabase PostgreSQL](https://github.com/supabase/postgres)

### Ensaio exato pendente

- Disponibilizar um runtime Linux isolado e utilizar a [release 17.11.0.003 do Supabase](https://github.com/supabase/postgres/releases/tag/17.11.0.003) fixada por digest, ou binários PostgreSQL 17.11 e PostGIS 3.3.7 de origem verificada. Registrar plataforma, digest, biblioteca GEOS/PROJ e resultado de `server_version_num`, `postgis_lib_version()` e `pg_extension.extversion`. Exigir apenas loopback, contas e fixtures sintéticas.
- Repetir o replay e restauração `--postgis 3.3.7`. Verificar `extensions.geometry`, as funções usadas pelo código, índices espaciais GiST válidos, SRID 4326, geometria válida e limites territoriais. Com fixture representativa, conferir o plano de consulta espacial com `EXPLAIN`, os resultados de `ST_Contains`, `ST_Covers` e `ST_Transform`, e a projeção publicada no Mapa.
- Reutilizar o build isolado descrito no [ensaio anterior](importador-supabase-preparacao.md#reproduzir-o-ensaio-local-dos-módulos-operacionais). Configurar `SENTINELA_BROWSER_PG_BIN`, `SENTINELA_BROWSER_OPENSSL` e `SENTINELA_BROWSER_POSTGIS_VERSION=3.3.7` para os roteiros `node --experimental-transform-types scripts/check-hosted-operations.mjs` e `node --experimental-transform-types scripts/check-hosted-review.mjs`. O provisionamento recusa qualquer outra combinação de PostgreSQL, versão SQL da extensão e biblioteca PostGIS. O segundo roteiro aplica também a `0011`.
- O host Windows atual tem PostgreSQL 17.11 com biblioteca PostGIS 3.6.2 e carece de runtime Docker/Podman ou WSL funcional para executar a imagem Linux. A execução espacial somente leitura já registrada no institucional é uma evidência parcial da versão de destino.

## Backup institucional e configurações

1. Conferir plano, retenção, ponto disponível e escopo em Database Backups. O inventário anterior registrou plano Free. Usar exportação lógica se o plano atual não oferecer um ponto de restauração utilizável. Definir janela, RPO e RTO com o responsável. Guardar uma cópia criptografada da origem e outra do destino em cofre separado do repositório. [Backups do Supabase](https://supabase.com/docs/guides/platform/backups)
2. Sob autorização de extração, preparar uma conexão libpq direta ou Supavisor sessão, porta `5432`, com `sslmode=verify-full`, CA do destino e senha armazenada fora do comando. Registrar horário UTC, ref, versões, hashes e tamanho dos arquivos. Ensaiar os comandos da versão local do CLI com `supabase db dump --help`. Usar o procedimento oficial para exportar papéis personalizados, schema, dados, e separadamente schema e dados do ledger `supabase_migrations`. Inspecionar o índice do backup e comprovar cobertura de `sentinela*`, Auth e customizações de `auth.users`. O ledger lógico `sentinela.schema_migrations` deve estar no backup da aplicação. Guardar as credenciais dos papéis personalizados por rotação no cofre. [Backup e restauração via CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) · [Conexões PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)
3. Registrar separadamente, com o responsável pelo painel, Data API e schemas expostos, URLs Site e redirect, provedores Auth, SMTP, políticas de senha, e-mail, MFA, parâmetros de JWT e rotação das chaves, restrições de rede, TLS, runtime, secrets e integrações. Guardar referências de segredos no cofre, com acesso aprovado e trilha de auditoria. Registrar configurações de Storage, Realtime e Edge mesmo quando vazios. Dados, usuários e gatilhos de um dump não recuperam configurações da plataforma, chaves nem objetos do Storage. [Escopo do backup](https://supabase.com/docs/guides/platform/backups) · [Configurações gerenciadas fora do dump](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
4. Restaurar somente em destino isolado autorizado primeiro. Conferir checksums, UUID dos três usuários e vínculos, permissões, Auth, gatilhos, RLS forçada, histórico, objetos e contagens. Verificar criptografia e acesso aos backups, testar a reprodução das configurações gerenciadas e documentar tempo real de restauração. Preservar a instância institucional e manter o ponto de retorno até o aceite. Para uma restauração pós-`0010` em outro OID, reatestar a instalação e revalidar as liberações e os segredos antes de permitir consultas e gravações.

### Pacote institucional a autorizar

| Artefato | Escopo e verificação |
| --- | --- |
| Papéis e esquema lógico | Escopo enumerado por schema, objetos SENTINELA, gatilhos institucionais em Auth, donos, grants e associações de papéis. Excluir material de senhas dos papéis. Conferir a lista de objetos do arquivo e os grantors na restauração. |
| Dados aprovados | Registrar contagens e hashes por tabela em snapshot consistente, incluindo vínculos institucionais e auditoria. Definir separadamente a extração protegida de tabelas Auth indispensáveis à recuperação. O backup pode conter hashes de senha e outros dados sensíveis. Guardá-lo com chave e permissão aprovadas. |
| Históricos | Preservar os ledgers `sentinela.schema_migrations` e `supabase_migrations`, com versão, nome, ordem e hash dos artefatos correspondentes. |
| Configurações gerenciadas | Capturar metadados pelo painel e referências dos segredos no cofre. O inventário deve distinguir uma configuração ausente de uma que ainda precisa ser conferida. |
| Manifesto e retorno | Registrar ref, endpoint, data UTC, versões, escopo, operador, tamanhos e SHA-256. Verificar os hashes antes da restauração, comparar objetos, dados e permissões, conferir Auth/TLS e registrar RPO/RTO observado. |

A sessão de exportação aprovada deve iniciar com `default_transaction_read_only=on`. O operador confere a ref `hcmqsqfbrynpfjvmuqdb`, CA, hostname, ledger e versão em leitura antes de executar o dump com as credenciais recebidas pelo cofre. O arquivo de serviço libpq e o arquivo de senha ficam fora do repositório, com ACL restrita. A referência à credencial e a CA podem constar no manifesto, preservando o segredo apenas no cofre. Validar `pg_restore --list` em arquivos custom e a cobertura da lista autorizada. Na restauração isolada usar `--exit-on-error` e transação única quando aplicável, com comparação de versões, donos, políticas e contagens antes de expor a aplicação. [Backup e restauração via CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

## Central de Revisão e paridade

| Operação | Situação no modo hospedado |
| --- | --- |
| Prévia, histórico e pendências ligadas ao lote | Disponíveis no importador e detalhe de registros. Evidência anterior cobre CSV, XLSX, PCDF v1/v2. |
| Edição auditada de associação importada | Disponível no escopo de gestão liberado para Administrador. Atualiza a projeção revisada de campos da associação e registra a decisão de edição. |
| Fila global por tipo, prioridade, situação, origem e busca | Implementada na `0011`, com o componente e os endpoints existentes. Os três perfis consultam conforme `consultar_central`, com dados do diagnóstico, origem, lote e linha quando disponíveis. Os contadores refletem o recorte sem restringir pela situação selecionada. |
| Decisão pelo UUID da pendência | Implementada na `0011`, exclusiva de Administrador com sessão viva e liberação de escrita operacional. Usa versão esperada, justificativa e auditoria com autoria e snapshots. Resolução altera o valor efetivo permitido e preserva o original. Encerramento preserva o valor efetivo. |

A Central reutiliza os campos aceitos na bancada: local e horário na importação geral, e horário, local e flagrante nos diagnósticos PCDF previstos. Associações consolidadas, com cópias múltiplas em staging ou com edição de gestão sobreposta podem ter a pendência encerrada com justificativa. A revisão atualiza situação do diagnóstico, valor efetivo de staging e contadores da Central. Os recibos mantêm a contagem de detecções da importação e a publicação continua sujeita ao fluxo aprovado. A exclusão excepcional do lote protegido de janeiro/2021 depende de procedimento de backup próprio.

O ensaio passou no Edge em 1440 e 390 px com PostgreSQL 17.11, PostGIS 3.6.2, TLS e Auth sintético. O roteiro [check-hosted-review.mjs](../../scripts/check-hosted-review.mjs) usa os fluxos de ingestão existentes para criar a massa sintética da Central. Verificou origens Geral, PCDF e Manual, filtros, permissões HTTP e SQL, autoria, versão, concorrência, recarregamento, contadores, escrita fechada, sessão revogada e rollback com injeção de falha após a atualização.

## Aplicação incremental e aceite

1. Usar o [procedimento de aplicação](importador-supabase-preparacao.md#pré-requisitos-e-execução-incremental). Fixar os hashes dos arquivos aprovados, validar o ensaio com PostGIS 3.3.7, conferir backup institucional e retorno, e reservar janela de manutenção. Confirmar ref e endpoint, identidade do instalador, ledger exato, PostGIS em `extensions`, ausência de colisões e os privilégios do pré-voo em leitura. Conferir o hash do inventário institucional antes e depois. Preservar as entradas históricas do Supabase. Registrar externamente a execução direta pelo libpq junto do hash e do ledger lógico, usando o histórico Supabase adicional somente se for autorizado como etapa distinta.
2. Autorizar a aplicação dos arquivos individualmente por `psql -X -w -v ON_ERROR_STOP=1`. Confirmar `0009`, papéis e UUID de instalação antes de executar `0010`. Após `0010`, comparar tabelas, políticas, ACLs de colunas, triggers Auth, identidades, FKs, auditoria, views espaciais, ausência de grants para acesso direto e o novo ledger. Confirmar os hashes anteriores e aplicar `0011_central_revisao_hospedada.sql` na mesma conexão atestada em etapa própria. Verificar o executor sem login, RLS, ausência de acesso direto e de permissão de decisão para Operador e Analista. Configurar os três logins PostgreSQL de menor privilégio e manter as chaves de escrita fechadas.
3. Com autorização para login real, os titulares das três contas autenticam pela interface. Registrar só horário, perfil, ação esperada, resultado e código HTTP. Confirmar `meu_acesso()`, correspondência de UUID e sessão, cookie SSR seguro, acesso somente ao próprio vínculo e recusa de token expirada ou revogada usando apenas uma sessão de ensaio aprovada. Confirmar leitura do Dashboard, Mapa e ocorrências nos três perfis. Validar unidade de rastreio com CA e hostname do destino a partir do aplicativo. Operador e Administrador podem abrir o importador. Analista recebe 403. A listagem de usuários é exclusiva do Administrador.
4. Em etapa separada, autorizar escrita usando as contas reais apenas como autoras e registros sintéticos aprovados. Conferir liberação e logs. Exercitar cadastro, edição, idempotência, conflito de versão, publicação, negação de Analista e tentativas sem liberação. Para CSV/XLSX/PCDF v1/v2 usar exclusivamente artefatos sintéticos. Verificar recebimento, reenvio, revisão auditada, rollback e comportamento do histórico. O teste de criação ou exclusão via Auth Admin exige autorização própria para identidades exclusivamente sintéticas, com os três vínculos atuais preservados. Desligar chaves de escrita e conferir a ação residual ao fim da janela.

### Matriz de aceite da Central com Auth real

| Cenário | Resultado esperado |
| --- | --- |
| Três titulares usam a sessão SSR pelo endereço autorizado | Fila e filtros respondem para os três perfis. A identidade UUID de cada titular corresponde ao vínculo institucional existente. HTTP 401 na sessão ausente ou revogada. |
| Operador e Analista submetem uma mutação sintética | HTTP 403 mesmo por chamada direta ao endpoint. Versão, valor, estado e auditoria permanecem como antes. |
| Administrador com escrita operacional fechada | HTTP 403 e leitura disponível. O ensaio também confirma recusa com Origin divergente. |
| Administrador com escrita autorizada | Resolve um diagnóstico permitido e encerra outro com justificativa. O banco vincula auditoria ao autor, grava o antes/depois e altera a fila. Um segundo envio da mesma versão retorna 409. O original e os indicadores já consolidados permanecem. |
| Falha durante a transação em ambiente de ensaio autorizado | O lote sintético mostra que status, valor efetivo e histórico são revertidos juntos. Em produção, validar o caminho de erro aprovado sem instalar gatilhos de injeção de falha. |

Registrar apenas perfil, UTC, resultado funcional e código HTTP. Para sessão revogada, usar somente a sessão aberta para o ensaio e aprovada pelo titular. Nenhuma etapa depende da recriação das três contas. Confirmar conexão da aplicação com `verify-full`, CA e hostname corretos, bloqueio de certificado inválido e UUID da instalação esperado.

## Transferência dos dados e retorno

1. Produzir inventários somente leitura da origem e do destino. Delimitar tabelas, período, composição de cópia, dependências FK, duplicatas e hashes por tabela, mês e lote. Vincular a autoria de origem ao UUID institucional mapeado no destino, conservar IDs de domínio, créditos de auditoria, referências e versão de catálogos. Interromper se houver conflito ou autoria sem mapeamento aprovado.
2. Ensaiar a carga seletiva em uma restauração isolada. Carregar catálogos autorizados, proveniência, lotes e execuções, linhas e staging, ocorrências e associações, revisões e audit trails em ordem derivada das FKs. Validar chaves, constraints e as dependências que exigem transações controladas. Preservar os bytes originais, o histórico de revisão, a classificação, a cobertura mensal e os critérios de visibilidade geográfica. Excluir ambientes técnicos, senhas, usuários do Auth de origem e artefatos não autorizados do pacote de transferência.
3. Fixar a janela de corte, congelar escritores nos dois lados e registrar último ponto consistente e hashes. Aplicar o pacote autorizado e reconciliar contagens, amostras, referências, estados de revisão, geometrias EWKB e agregados de Dashboard/Mapa. Liberar tráfego só após aceite institucional. Os 67 arquivos mensais restantes permanecem fora da transferência.
4. Em caso de falha durante o DDL, interromper, recolher evidências, conferir o rollback e o ledger. Cada arquivo é transacional e as etapas anteriores confirmadas permanecem instaladas. Investigar e ensaiar o arquivo que falhou antes de qualquer nova tentativa. Se a falha ocorrer após o corte, fechar escritas, redirecionar o tráfego à implantação anterior e manter a origem operacional. Reconciliar eventuais gravações novas antes de escolher restauração ou correção. Restauração do destino e reabertura são decisões separadas. Recuperações em OID novo exigem reatestado e revalidação de liberações.

Autorização específica é necessária para extrair dados ou segredos institucionais para backup, aplicar o DDL e configurar papéis, executar login e revogação de sessão no serviço real, cadastrar ou excluir identidades sintéticas, abrir escrita para homologação, transferir dados, efetuar corte ou restaurar o banco institucional.

## Critérios para liberar o corte

- Aprovar a Central localmente com evidência de bloqueio, autoria, concorrência, persistência, valores originais e rollback.
- Reproduzir o DDL de `0009` a `0011` e a integração espacial em PostgreSQL 17.11 e PostGIS 3.3.7.
- Gerar e verificar o backup institucional autorizado e ensaiar a recuperação correspondente, incluindo o inventário das configurações gerenciadas.
- Homologar o serviço gerenciado com TLS da aplicação, Auth real e os três perfis, RLS e escrita sintética autorizada.
- Aprovar a reconciliação da carga e demonstrar o retorno. Congelar escritores e confirmar o ponto de corte antes de transferir dados.

## Conferência da janela de implantação de 26/11/2026

- O projeto `hcmqsqfbrynpfjvmuqdb` estava ativo em São Paulo. A consulta em `READ ONLY` confirmou ledger `0001`–`0008`, 19 tabelas com RLS habilitada e forçada, três vínculos ativos (um por perfil), um evento de auditoria e zero ocorrências, associações e lotes. A sessão do conector negociou TLS 1.3. Os testes de sessão real e de TLS da aplicação com CA e hostname seguem pendentes.
- No PostGIS 3.3.7, os 11 símbolos de função consultados estavam disponíveis nas assinaturas esperadas. O tipo `geometry`, o catálogo de SRIDs, duas classes GiST e o operador `&&` estavam disponíveis. Validade, contenção, cobertura e ida e volta entre SRIDs 4326 e 31983 passaram com geometria sintética. Ainda falta executar o DDL e testar os planos espaciais resultantes nessa versão.
- Os SHA-256 dos arquivos `0009`, `0010` e `0011` conferiram com os aprovados. O teste isolado do inventário de rotas de escrita em `/api/v1`, que inclui `/api/v1/usuarios`, passou. Foi executado sem isolamento de processo porque o ambiente retornou `spawn EPERM` na tentativa com subprocesso. Os resultados da suíte, do build e do Edge permanecem os do ensaio anterior.
- `127.0.0.1:55484` respondeu ao `pg_isready`. O snapshot autorizado confirmou 6.091 ocorrências e 6.393 associações, incluindo uma ocorrência manual com uma associação e ponto válido no SRID 4326. A origem da importação contém 6.090 ocorrências, 6.392 associações e zero geometrias publicáveis nesse inventário. A verificação subsequente encontrou zero chaves estrangeiras pendentes de validação. As 19 tabelas originais mantêm RLS forçada.
- `pg_dump`, `pg_restore` e `psql` 17.11 estão disponíveis e a unidade `D:` tinha 458 GB livres. Os artefatos foram gravados em subdiretório com ACL restrita após cifra AES-256-GCM em memória. As chaves foram protegidas pelo DPAPI do Windows. A consulta ao BitLocker exigiu privilégios indisponíveis e o EFS foi recusado. Para a restauração real, fornecer um volume com criptografia confirmada para os diretórios dos bancos descartáveis.
- O `vercel.json` configura um build Next.js. O PCDF v1 executa `python` como subprocesso do Node e usa o parser incluído no repositório. A homologação do runtime precisa verificar ambos no mesmo ambiente de execução. O upload direto aceita até 16 MiB por CSV e até 1 MiB de manifesto v1. Vercel Functions documenta 4,5 MB por padrão e um beta de 20 MiB para requisições com configuração específica. Confirmar a infraestrutura aprovada com upload sintético de tamanho representativo antes de publicar. [Runtimes da Vercel](https://vercel.com/docs/functions/runtimes) · [Limites de payload](https://vercel.com/docs/functions/limitations) · [Beta de 20 MiB](https://vercel.com/changelog/vercel-functions-now-support-request-bodies-up-to-20mib)

### Backups reais autorizados

Os dois snapshots foram coletados em `READ ONLY` às 22h23 de 26/11 (01h23 UTC de 27/11). Os manifestos em `D:/Backups/SENTINELA/CUTOVER-20261126-221929-1814f641` registram arquivos, tamanhos, contagens e SHA-256. `pg_restore --list` e a leitura integral sem aplicar SQL passaram para os três arquivos de banco. O manifesto `backup-table-fingerprints.json` registra os totais e hashes derivados do `COPY` de 36 tabelas locais, 21 tabelas do arquivo institucional principal e três tabelas do arquivo Auth. Os arquivos de papéis foram decifrados e conferidos, sem senhas de papéis. Um arquivo complementar preserva as concessões do banco operacional e da função de atestação. O leitor do formato fica junto aos arquivos. A chave DPAPI foi testada sob o usuário Windows que gerou a cópia. Recuperação fora desse contexto precisa de mecanismo aprovado de custódia da chave.

O backup do Supabase conferiu CA e hostname pelo Supavisor em modo sessão com `sslmode=verify-full`. Abrange os schemas SENTINELA e o ledger gerenciado, além do schema Auth e dos dados de `auth.users`, `auth.identities` e `auth.schema_migrations`. As três contas, as três identidades e os três vínculos ativos constam no inventário. Sessões e tokens voláteis ficaram fora. A consulta complementar retornou zero instâncias extras de Auth, fatores MFA, provedores SSO, buckets, objetos Storage e publicações Realtime com tabelas da aplicação. As configurações de Auth e Data API no painel ainda exigem conferência.

Na recuperação institucional isolada, usar PostgreSQL 17.11 e PostGIS 3.3.7. Atestar que o destino é descartável, tem loopback e criptografia em repouso. Conferir os hashes e a autenticação dos arquivos antes de usar o leitor. Provisionar os papéis exigidos no cluster descartável. Restaurar `pre-data` do arquivo principal, aplicar o arquivo de dados Auth, restaurar os demais dados e aplicar `post-data` com `--exit-on-error`. Essa ordem deixa as FKs para o final, depois de estarem presentes as identidades e seus vínculos institucionais. Reconciliar os dois ledgers, os três vínculos, RLS, grants e o evento de auditoria. Para a origem, restaurar no PostgreSQL 17.11 e PostGIS 3.6.2, incluindo as ACLs complementares, e comparar as contagens por origem, a associação e o ponto manual e os hashes por tabela. Registrar tempo e resultado de cada recuperação. O corte depende de ambas as restaurações reais.

### Volume virtual para recuperação no Windows

O host executa Windows 11 Home Single Language. O responsável confirmou que `C:` e `D:` estão descriptografados. `fsutil` confirmou paginação sem cifra e a consulta do sistema identificou o arquivo ativo em `C:`. Hibernação, Inicialização Rápida e minidumps estão habilitados. Os seis arquivos cifrados passaram por nova conferência de tamanho e SHA-256. O manifesto de fingerprints preservou o SHA-256 `8751aff49366743e41c6342d4b0fd086f5950b8721ea9a1d432c890cc1788aa6`.

A ativação manual do BitLocker para um VHD exige uma edição compatível. Neste host, o caminho gratuito proposto é VeraCrypt portátil com driver temporário, um contêiner NTFS de 4 GiB para o ensaio Windows e a pasta interna `SENTINELA-RESTORE`. Usar uma release oficial com assinatura verificada, inicializar somente um arquivo novo em `D:/Backups/SENTINELA`, com ACL restrita, e usar a interface do VeraCrypt para entrada da senha. Desativar cache de senha e montagem automática. O carregamento do driver exige UAC. [Edições com BitLocker](https://learn.microsoft.com/en-us/windows/security/operating-system-security/data-protection/bitlocker/) · [VeraCrypt portátil](https://veracrypt.io/en/Portable%20Mode.html) · [Assinaturas VeraCrypt](https://veracrypt.io/en/Digital%20Signatures.html)

1. Sob autorização específica, registrar os valores anteriores, ativar a cifra do arquivo de paginação e desativar temporariamente hibernação, Inicialização Rápida, dumps de sistema, dumps completos de kernel ao vivo e coleta WER. Conferir que não há configuração de `LocalDumps` fora do volume. Agendar o reinício para aplicar a cifra da paginação. Restringir o ensaio a uma sessão local ativa. [Cifra do arquivo de paginação](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/fsutil-behavior) · [Paginação em volumes VeraCrypt](https://veracrypt.io/en/Paging%20File.html) · [Configuração WER](https://learn.microsoft.com/en-us/windows/win32/wer/wer-settings)
2. Confirmar a assinatura dos binários, o contêiner e a cifra na tela de propriedades do VeraCrypt. Com dados sintéticos, criar um marcador, desmontar, confirmar que o dispositivo desapareceu, remontar e conferir o marcador. Confirmar a ACL explícita da pasta interna para a conta Windows que gerou os backups, SYSTEM e administradores. Executar `powershell.exe -NoProfile -File database/local/backup/check-restoration-volume.ps1 -VolumeLetter R`. O verificador consulta o dispositivo Windows, o rótulo do NTFS, a ACL e a configuração de persistência de memória. Qualquer verificação falha impede iniciar a recuperação. A montagem e o reinício requerem evidência própria.
3. Fazer um ensaio de posicionamento com dados sintéticos. Usar a pasta privada do volume como diretório corrente, definir `TEMP` e `TMP` nela e redirecionar toda saída de processos filhos para logs no volume. Criar `PGDATA` e WAL dentro da mesma pasta com `initdb --data-checksums`, sem `--waldir` externo. Usar somente stderr para logs, desabilitar arquivamento WAL, remover parâmetros libpq herdados e fixar a conexão a `127.0.0.1` em uma porta reservada do ensaio. Conferir identidade do cluster, caminho real de dados e WAL, ausência de pontos de redirecionamento em seus diretórios e ausência de tablespaces externos. Configurar `temp_tablespaces` vazio e usar `pg_restore --no-tablespaces`. Antes da restauração real, verificar essas condições no cluster e confirmar que os processos filhos preservam o diretório dos temporários. [Layout do PostgreSQL](https://www.postgresql.org/docs/17/storage-file-layout.html) · [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)
4. Dentro da área atestada, usar o leitor fornecido com os arquivos e a chave protegida pelo DPAPI do usuário original para autenticar o AES-GCM. Encaminhar a saída decifrada por pipe ou usar arquivos temporários dentro do contêiner. Executar `pg_restore` com parada no primeiro erro. Conferir ledger, políticas, grants, índices, FKs e contagens. Comparar os hashes de `COPY` a partir das mesmas listas de colunas do manifesto. Para o backup institucional, parear o cluster descartável com PostgreSQL 17.11 e PostGIS 3.3.7, preparar as dependências Auth no próprio cluster e conferir os três vínculos sem exibir identificadores pessoais ou hashes de senha. O PostgreSQL 17 do Windows atual tem PostGIS 3.6.2 e o host não tem WSL instalado. A área de recuperação para o ambiente da versão exata também precisa atender à proteção de armazenamento e memória.
5. Exportar somente resultados agregados do ensaio. Encerrar os clusters e clientes e confirmar que as portas de teste liberaram antes de desmontar o volume. Confirmar que a letra deixou de existir e restaurar as configurações temporárias do Windows conforme o estado registrado. Manter os backups originais e o leitor sob a ACL existente.

O verificador foi executado neste host sem dados reais. Retornou código `2` com volume ausente e proteções do sistema pendentes, como esperado. As restaurações reais aguardam a autorização para preparar e comprovar a área protegida.

#### Preparação portátil e reversão da janela Windows

O pacote portátil VeraCrypt 1.26.31 foi baixado pela release oficial. O SHA-256 `05712c10d0e27b88a2e16ae62b807a77afd2d11c48847fccb2e51d004bd4252b` conferiu com a publicação. Authenticode retornou `Valid` para IDRIX SARL, com carimbo de tempo. O OpenPGP foi confirmado com fingerprint `5069A233D55A0EEB174A5FC3821ACD02680D16DE`. Os executáveis x64 de montagem e criação e o driver e catálogo x64 extraídos também têm assinatura válida. A pasta dedicada `D:/Backups/SENTINELA/RESTORE-VERACRYPT` foi criada com três ACEs explícitas, para o usuário atual, SYSTEM e Administradores, sem herança ou redirecionamento. Os binários conferidos ficam em `portable-1.26.31` nessa pasta. O assistente carregou o driver temporariamente, que foi descarregado após fechar. O contêiner `sentinela-restauracao.hc`, padrão, AES, 4 GiB fixos, NTFS, ainda precisa ser criado. A senha entra na interface do VeraCrypt e fica sob custódia do titular. [Release oficial](https://github.com/veracrypt/VeraCrypt/releases/tag/VeraCrypt_1.26.31) · [Assinaturas](https://veracrypt.io/en/Digital%20Signatures.html)

O manifesto local `tmp/pre-implantacao/veracrypt-1.26.31-download/windows-restoration-baseline.json` guarda os valores exatos, tipos, presença das entradas e horário de boot anterior. SHA-256 `ff83b006c51181b29255a8a0b38207c344e67565f38480d9d27ec68252c355eb`. Paginação ativa em `C:` com 1.530 MiB.

| Controle | Valor inicial | Valor durante o ensaio |
| --- | --- | --- |
| `fsutil behavior … encryptpagingfile` | `0` | `1` |
| `ClearPageFileAtShutdown` | `0` | `1` até o reinício final |
| Hibernação | Disponível, `HibernateEnabled` ausente, `HibernateEnabledDefault=1`, `HiberFileType` ausente, `HiberFileSizePercent=0` | `powercfg /hibernate off` e verificação posterior |
| `HiberbootEnabled` | `1` | `0` |
| `CrashDumpEnabled` | `3` (minidumps) | `0` |
| `FullLiveKernelReports\FullLiveReportsMax` | Chave ausente | `0` |
| Política WER `Disabled` | Chave ausente, sem `LocalDumps` globais em 32 e 64 bits | `1` |

Aplicar os controles só na janela autorizada. Reiniciar normalmente e conferir que o boot é posterior ao manifesto, que `fsutil` retorna cifra ativa e que o verificador do volume passa. Antes de abrir os backups, fixar o rótulo `SENTINELA-RESTORE`, confirmar o mapeamento do dispositivo VeraCrypt e a ACL do diretório interno, e atestar o mesmo contêiner com um marcador sintético após desmontagem e remontagem. No retorno, encerrar os clusters, desmontar e comprovar que a letra desapareceu. Com a sessão anterior ainda cifrada, programar o retorno de `encryptpagingfile` a `0`, mantendo os dumps e a hibernação suspensos e `ClearPageFileAtShutdown=1`. Fazer o segundo reinício normal. Depois do boot, repor os valores e a ausência das entradas registradas, incluindo o modo de hibernação e a Inicialização Rápida, e verificar o estado final. A limpeza pode ampliar o tempo de desligamento. A janela interrompe temporariamente os serviços locais. [Cifra da paginação](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/fsutil-behavior) · [Limpeza da paginação](https://learn.microsoft.com/en-us/windows/security/threat-protection/security-policy-settings/shutdown-clear-virtual-memory-pagefile) · [Configurações WER](https://learn.microsoft.com/en-us/windows/win32/wer/wer-settings)

### Pré-voo da instalação institucional de `0009`–`0011`

O destino `hcmqsqfbrynpfjvmuqdb` está `ACTIVE_HEALTHY` em `sa-east-1`. A conexão SQL validou CA e hostname no Supavisor em modo sessão. O instalador `postgres` tem `CREATEROLE`, `CREATE` no banco, acesso de leitura a `auth.users` e `auth.sessions`, delegação de `USAGE` em `extensions` e `INSERT` no histórico gerenciado. A sessão executou em `READ ONLY`.

- O ledger lógico permanece `0001`–`0008`. O histórico gerenciado contém somente `20261126163226 exclusao_institucional` e `20261126163836 corrigir_confirmacao_exclusao_institucional`. `version` é a chave primária desse histórico. A tabela aceita `version`, `name` e `statements` separadamente do ledger lógico.
- Permanecem as 19 tabelas centrais com RLS forçada, três usuários Auth, três identidades e três vínculos ativos, um de cada perfil. A FK validada para `auth.users`, os dois triggers do Auth e o acesso autenticado a `meu_acesso()` estão presentes. O evento de auditoria preexistente foi confirmado. Os 11 símbolos PostGIS referenciados em `0010` existem com as assinaturas esperadas no PostGIS 3.3.7. O catálogo não tem índices centrais inválidos. `correcao_nova_transacao_ck` e `evento_novo_transacao_ck` já estão `NOT VALID` no estado anterior, conforme inventário do pré-voo.
- Os três hashes conferem com o ensaio. A instalação de `0009` insere a vinculação técnica e a entrada no ledger. `0010` e `0011` inserem suas entradas no ledger e alteram definições, políticas e concessões. Alguns endpoints implementam mutações futuras e ficam sujeitos à sessão, ao perfil e à configuração de escrita. As migrations não executam exclusões, truncamentos ou atualizações de registros institucionais na instalação, não fazem DDL sobre `auth.users` ou seus triggers e não desativam RLS. `0010` substitui cinco funções de trigger centrais e `0011` atualiza duas delas.
- O Security Advisor registrou 18 informativos `rls_enabled_no_policy` e um aviso `auth_leaked_password_protection`. São resultados anteriores à instalação. As políticas e o Auth ficam preservados nesta etapa. O inventário gerenciado de backups respondeu com zero pontos disponíveis, nenhuma janela física recuperável anunciada e PITR desativado, embora `archive_mode` esteja ativo. [Security Advisor](https://supabase.com/docs/reference/api/v1-get-security-advisors) · [Inventário de backups](https://supabase.com/docs/reference/api/v1-list-all-backups)

**Execução condicionada à recuperação comprovada.** Preservar os arquivos SQL originais. Alocar três versões de implantação em UTC posteriores ao maior `version` gerenciado no começo da janela. Para cada arquivo em ordem, preparar uma cópia de execução trocando apenas a borda transacional: extrair o corpo entre o `BEGIN` e o `COMMIT` originais e acrescentar validações do catálogo e uma inserção nova em `supabase_migrations.schema_migrations`, com versão alocada, nome do arquivo e corpo aplicado. Usar `psql -X -w --single-transaction -v ON_ERROR_STOP=1 -f <cópia>` para que o DDL, o ledger lógico interno, o histórico gerenciado e as validações sejam confirmados juntos. Manter `lock_timeout` de 5 segundos e registrar o SHA-256 original no relatório. Interromper a sequência por colisão ou erro. O histórico anterior permanece intacto. [Transação única do psql](https://www.postgresql.org/docs/17/app-psql.html) · [Ledger de implantação do Supabase](https://supabase.com/docs/guides/deployment/database-migrations)

| Fase | Conferência antes do commit e na leitura posterior |
| --- | --- |
| `0009` | Ledger avança apenas para `0009`. A instalação corresponde ao OID atual. Os três logins e os papéis proprietários conservam `NOINHERIT` e `NOBYPASSRLS`. A tabela da instalação mantém RLS forçada e as funções de ambiente recusam os papéis públicos. |
| `0010` | Schemas, índices, triggers, vínculos e ACLs conferem com o catálogo aprovado. As 19 tabelas originais mantêm RLS forçada e os novos objetos conservam os proprietários esperados. O owner de `sentinela_exclusao.comprovantes` tem `SELECT`, `INSERT`, `REFERENCES`, `TRIGGER` e `MAINTAIN`, sem `UPDATE`, `DELETE`, `TRUNCATE` ou `UPDATE` de coluna. |
| `0011` | Listagem da Central concedida aos três perfis. A decisão é concedida só ao Administrador e requer sessão viva e vínculo ativo. O proprietário executor é sem login. Conferir políticas de revisão, trilha de auditoria, ausência de execução pública nas funções privilegiadas e o `search_path` fixado. |

O [verificador de catálogo](../../database/supabase/tests/check_institutional_installation.sql) roda na transação de aplicação depois do registro no histórico gerenciado. Passe `-v sentinela_phase=9`, `10` ou `11` para selecionar a fase. Rode novamente em uma transação de leitura após o commit. No institucional, a execução com `sentinela_phase=8` passou e a execução com `sentinela_phase=9` rejeitou o ledger atual. Num cluster sintético com PostgreSQL 17.11 e PostGIS 3.6.2, as três fases passaram na transação e na releitura posterior. Um erro de validação provocado antes do commit de `0010` reverteu seus objetos e as duas entradas de histórico. O verificador cobre as invariantes da janela e complementa a comparação dos catálogos e dos vínculos.

Se houver falha antes do commit, a transação do arquivo é revertida pelo PostgreSQL. Se houver perda de conexão na confirmação, consultar os dois ledgers e o catálogo antes de qualquer nova tentativa. Fases anteriores já confirmadas ficam preservadas. Qualquer restauração do destino exige janela própria, reconciliação das gravações posteriores ao backup e autorização. Enquanto a recuperação estiver pendente, preservar `0001`–`0008` como estado instalado e adiar a homologação com Auth real e escrita sintética.

### Caminho reduzido para liberar a instalação

Para esta janela, a recuperação lógica do backup institucional pode ser demonstrada em PostgreSQL 17.11 e PostGIS 3.6.2 em uma área protegida. O `pg_restore` recompõe dados e DDL em um banco novo. A versão da extensão fica explicitamente registrada. Validar a cobertura do arquivo, os dois ledgers, hashes de dados das tabelas institucionais e Auth, três identidades e vínculos, 19 RLS forçadas, ACLs, triggers e o evento de auditoria. Comparar a quantidade de geometrias com a captura e testar EWKB, SRIDs e GiST com uma amostra sintética. Qualquer adaptação necessária de objetos gerenciados ou do catálogo `spatial_ref_sys` deve ser registrada e reconciliada antes do aceite. [Restauração lógica do PostGIS](https://postgis.net/docs/manual-3.6/en/postgis_administration.html)

Complementar a prova com a validação em leitura no PostGIS 3.3.7 do destino. Foram observados dois índices GiST válidos, o plano com `regioes_limite_gist` quando `enable_seqscan=off`, round-trip de EWKB e SRID 31983↔4326 e distinção entre contenção e cobertura no limite do polígono. O inventário atual retornou zero geometrias de ocorrências e zero limites territoriais. O replay de DDL na versão 3.3.7, diferenças de GEOS/PROJ em geometrias de produção e restauração física gerenciada permanecem sem prova. A janela autorizada deve validar novamente as assinaturas, os índices e a geometria sintética antes do commit de cada fase pertinente. A diferença de versão na bancada não autoriza atualizar a extensão institucional.

A recuperação real continua condicionada a uma área protegida. A alternativa local usa o PostgreSQL e PostGIS já instalados, em contêiner VeraCrypt com proteção da paginação, hibernação e dumps conforme o procedimento acima. Um ambiente institucional protegido já disponível também pode ser usado mediante autorização do destino e proteção da chave DPAPI na transferência. Os seis arquivos cifrados e o manifesto de fingerprints foram reconferidos sem decifragem.

O [gerador offline](../../database/supabase/prepare_institutional_installation.py) verifica os três SHA-256 e produz três arquivos com transação própria, guardas de fase antes e depois, registro do corpo aplicado no histórico gerenciado e parada no primeiro erro. O teste local conferiu que os corpos aprovados foram preservados e que versões antigas e a sobrescrita de diretório são recusadas. Na janela autorizada, alocar versões a partir da UTC corrente e usar um diretório novo. Confirmar o endpoint com `verify-full` e a ref antes de cada execução `psql -X -w -v ON_ERROR_STOP=1 -f <arquivo-gerado>`. Estes arquivos gerados já contêm `BEGIN` e `COMMIT`. Revalidar após cada commit e interromper se o estado do projeto, os hashes, as ACLs, a RLS, a identidade do Auth, as geometrias ou os históricos divergirem. A geração offline é uma preparação e não executa a instalação.

### Carga seletiva da origem `55484` no projeto institucional

Pré-voo em `REPEATABLE READ READ ONLY`. A origem tem 35 tabelas em schemas da aplicação. O destino tem 19 antes das migrations. Foram mapeadas 14 tabelas de carga, além de duas relações privadas propostas para preservar o histórico. O manifesto local `tmp/pre-implantacao/transfer-readonly-inventory.json` contém a estrutura e contagens, sem linhas de negócio. Os seis SHA-256 dos dois backups e o manifesto de fingerprints conferiram. A recuperação real dos arquivos ainda não foi ensaiada e não há backup gerenciado ou PITR no projeto conforme a última consulta oficial.

| Ordem | Relação | Linhas esperadas |
| --- | --- | ---: |
| 1 | `sentinela.regioes_administrativas` | 37 |
| 2 | `sentinela.naturezas_criminais` | 41 |
| 3 | `sentinela_ocorrencias_manual.naturezas_uso_local` | 41 |
| 4 | `sentinela.extracoes_origem` | 1 |
| 5 | `sentinela.lotes_importacao` | 1 |
| 6 | `sentinela.execucoes_importacao` | 1 |
| 7 | `sentinela.linhas_origem` | 6.393 |
| 8 | `sentinela.ocorrencias` | 6.091 |
| 9 | `sentinela.ocorrencia_naturezas` | 6.393 |
| 10 | `sentinela.linhas_staging` | 6.393 |
| 11 | `sentinela.pendencias_revisao` | 26.714 abertas |
| 12 | `sentinela_ocorrencias_manual.cadastros` | 1 |
| 13 | `sentinela_ocorrencias_analytics.pcdf_pontos` | 5.460 |
| 14 | `sentinela_pcdf_historico.arquivos` | 1, apenas a competência já presente |

O autor referenciado em lote, execução e auditoria tem o mesmo UUID institucional e o mesmo UUID Auth de um Administrador ativo do destino. Os três usuários ativos do destino têm correspondência exata pelos dois UUIDs e pelo perfil na origem. A chave de idempotência do cadastro manual corresponde à identidade esperada no modo hospedado. Preservar os seis registros institucionais do destino, incluindo os três ativos com vínculo Auth e os três inativos. Excluir da carga usuários, identidades, perfis, permissões, ledgers locais, contatos, exclusões de usuários e chaves ou liberações vinculadas à instalação física. O SQL de `0009`–`0011` registra apenas suas próprias entradas nos dois históricos. Conservar todos os UUIDs de domínio, chaves e associações referenciadas.

O `BEFORE INSERT` de `sentinela.eventos_auditoria` redefine horário e `xid8` e exige autorização viva para entradas humanas. Importar `xid8` de outro cluster como transação atual também pode conflitar com as verificações de autoria. Proposta sujeita à confirmação única de escrita: preservar os 21 eventos da origem e um comprovante histórico em `sentinela_migracao.auditoria_origem` e `sentinela_migracao.comprovantes_origem`, com UUIDs e campos originais, RLS habilitada e forçada, sem grants da aplicação e com bloqueio de alteração e exclusão. O comprovante arquivado não concede capacidade de exclusão no destino. Registrar um único evento técnico de transferência anexado à auditoria viva, com contagens, hashes e referência à cópia histórica. Preservar integralmente o evento institucional já gravado. O histórico original continuará consultável sob autorização no schema privado. Esse desenho preserva os metadados originais e os controles dos novos eventos.

Execução proposta após autorização: atestar novamente endpoint, `verify-full`, ambos os ledgers, três vínculos, evento institucional e a ausência de dados no destino. Fixar um snapshot consistente de leitura da origem. Aplicar `0009` → `0010` → `0011` com o verificador de catálogo após cada fase, antes de dados. Usar uma única transação no destino para incluir instalação e carga, mantendo os ledgers e as verificações no mesmo ponto de confirmação. `prepare_institutional_installation.py --transfer-prefix` gera a parte inicial com um `BEGIN`, seis verificações de fase, três registros de histórico e restauração dos parâmetros afetados entre fases. O teste offline confirmou a ausência de `COMMIT` nessa parte. Carregar na mesma sessão PostgreSQL por fluxo em memória via TLS e tabelas temporárias com colunas explícitas. Inserir nas tabelas finais em ordem referencial com triggers e RLS instalados. Nenhuma carga usa `session_replication_role`, desativação de trigger ou `ON CONFLICT DO NOTHING` para suprimir divergências. Encerrar com comparação de hashes por tabela no mesmo snapshot, PK/unique/FKs, validação dos dois históricos e teste do evento técnico.

Interromper antes de `COMMIT` por diferença de projeto, de inventário ou de autoria, chave duplicada, formato divergente, dependência ou política inesperada, alteração dos três vínculos, ou erro de assinatura, trigger ou constraint. A origem tem 37 limites territoriais válidos, 5.460 pontos derivados com UUID e versão da ocorrência correspondentes, sem órfãos, e uma ocorrência com geometria própria no SRID 4326. Esta última não atende atualmente à regra de publicação manual. Comparar EWKB e visibilidade efetiva por papel. O retorno antes de `COMMIT` é `ROLLBACK`, com a origem preservada. Após `COMMIT`, manter tráfego no ambiente atual. A ausência de um restore real ensaiado limita a recuperação do projeto e torna necessária uma decisão independente para correção posterior. O backup lógico íntegro é a última cópia de retorno disponível. O carregamento não inclui os outros 67 arquivos mensais.

O modo hospedado já existe nos módulos. Após a carga, configurar a versão local da aplicação com o UUID de instalação, CA e credenciais distintas dos três papéis SQL. As variáveis de conexão por papel e a liberação de escrita ainda não estão configuradas. Fazer a primeira verificação com escrita fechada e sessões Auth institucionais existentes. Para homologar mutações no destino, exigir sessão viva, autorizações da instalação atual e ensaios sintéticos cujo impacto esteja no escopo autorizado. A produção e a publicação permanecem fora desta janela.

#### Classificação das 35 tabelas da origem antes da transação

As 14 tabelas da carga estão enumeradas na seção anterior. As demais 21 foram classificadas abaixo. Os totais desta conferência da origem em modo somente leitura foram 6.091 ocorrências, 6.393 associações, 37 limites territoriais, 5.460 pontos derivados, 21 eventos e um comprovante. O destino estava em `0008`, com três contas Auth, três vínculos ativos, 19 tabelas centrais com RLS forçada, um evento e zero ocorrências ou associações.

O manifesto `tmp/pre-implantacao/operational-transfer-readonly-fingerprints.json` registra contagens e SHA-256 de 16 relações ou recortes da origem e oito conjuntos protegidos do destino, calculados no servidor em snapshots somente leitura. SHA-256 do manifesto `fd760363e1f02e7b049d12a1ff37981cd20ae2ff8b0a7d38eae35b91e980546e`. Recalcular no snapshot efetivo da transferência e confirmar as mesmas linhas do evento institucional antes de anexar o recibo técnico.

| Relação | Destino ou motivo para não copiar diretamente |
| --- | --- |
| `sentinela.eventos_auditoria` | Arquivo privado autorizado para os 21 eventos, preservando o horário, o autor, o `xid8` original e os dados. A tabela viva preserva o evento institucional e recebe o recibo técnico. |
| `sentinela_exclusao.comprovantes` | Arquivo privado autorizado para o comprovante histórico. Não concede capacidade de exclusão na instalação nova. |
| `sentinela.categorias_criminais` | Vazia na origem e já presente no destino. |
| `sentinela.historico_correcoes` | Vazia na origem e já presente no destino. |
| `sentinela.mapeamentos_natureza` | Vazia na origem e já presente no destino. |
| `sentinela_gestao_autorizacao.exclusoes` | Vazia na origem, criada na `0010`. |
| `sentinela_import_local.requests` | Vazia na origem, criada na `0010`. |
| `sentinela_ocorrencias_manual.naturezas_retiradas` | Vazia na origem, criada na `0010`. |
| `sentinela.perfis` | Preservar catálogo institucional. |
| `sentinela.permissoes` | Preservar catálogo institucional. |
| `sentinela.perfil_permissoes` | Preservar a matriz institucional de 12 vínculos. |
| `sentinela.usuarios` | Preservar os usuários do destino. Três correspondências por UUID institucional, UUID Auth e perfil. |
| `sentinela.schema_migrations` | Preservar o ledger institucional. Os registros técnicos da instalação local ficam na origem. |
| `sentinela_general_accounts.individuals` | Dois registros locais, nenhum para os três vínculos ativos do destino. A ativação do importador exige concessões institucionais próprias. |
| `sentinela_gestao_autorizacao.atores` | Autorização de gestão da origem. A ativação no destino exige janela e autor aprovados. |
| `sentinela_gestao_autorizacao.release` | Liberação vinculada à instalação local, sem portabilidade para a ligação por OID do Supabase. |
| `sentinela_import_local.local_revision` | Metadado do instalador local. No Supabase, a versão oficial vem de `sentinela.schema_migrations`. |
| `sentinela_ocorrencias_manual.definicoes_originais` | Cópias de definições SQL usadas no retorno da instalação local. O histórico de código do destino vem das migrations aprovadas. |
| `sentinela_ocorrencias_manual.liberacao` | Liberação local atrelada à porta, UUID e identificador do cluster. A escrita hospedada depende da liberação da instalação nova. |
| `sentinela_pessoas.contatos` | **Bloqueio de escopo.** Cinco registros na origem. Dois correspondem a contas ativas do destino por UUID institucional e UUID Auth. Ambos têm órgão e e-mail igual ao do Auth no destino. `sentinela_pessoas.registros` lê a tabela para a administração de usuários e inclui esses campos no cálculo da versão. A carga original de 14 tabelas omite esses dados necessários. Proposta de incluir exclusivamente os dois contatos por vínculo reconciliado, sem alterar Auth. |
| `sentinela_pessoas.exclusoes` | Três registros locais concluídos, com zero pendentes e zero referentes aos vínculos ativos do destino. Manter a exclusão institucional ativa na baseline e preservar o material local na origem. |

Resultado desta conferência: a condição de não omitir dados necessários falhou antes de iniciar qualquer escrita, por causa dos dois contatos da administração de usuários. A autorização das 14 tabelas permanece condicionada e nenhuma transação de escrita foi iniciada. Uma ampliação explícita para esses dois registros permite retomar a preparação da carga e as verificações atômicas, com as mesmas regras de preservação de contas e de rollback.

### Execução confirmada da carga operacional

A autorização posterior incluiu `sentinela_pessoas.contatos` como 15ª tabela, restrita a dois registros reconciliados por UUID institucional, UUID Auth, perfil e e-mail. A sessão de origem confirmou em `READ ONLY` os nomes e contagens das 35 tabelas classificadas. O [carregador](../../database/supabase/transfer_operational_data.py) abriu uma transação no projeto `hcmqsqfbrynpfjvmuqdb` pela conexão de sessão com `verify-full`. Instalou `0009`, `0010` e `0011`, preservou os dois registros gerenciados anteriores, carregou 15 tabelas de negócio e duas relações históricas e validou todas as contagens e hashes antes do único `COMMIT`. O PostgreSQL confirmou o commit e a conexão de verificação em leitura confirmou a persistência.

| Verificação | Antes no Supabase | Depois |
| --- | ---: | ---: |
| Ocorrências | 0 | 6.091 |
| Associações | 0 | 6.393 |
| Limites territoriais válidos em SRID 4326 | 0 | 37 |
| Pontos derivados e relacionados à versão da ocorrência | 0 | 5.460 |
| Ocorrências com geometria própria válida em SRID 4326 | 0 | 1 |
| Contatos institucionais próprios da aplicação | 0 | 2 |
| Vínculos Auth ativos | 3 | 3 |
| Eventos na auditoria viva | 1 | 2. O original e um recibo técnico |
| Eventos históricos exatos e comprovante | 0 | 21 e 1, em tabelas privadas |

O ledger lógico agora vai de `0001` a `0011`. O histórico gerenciado acrescentou `20261127023114`, `20261127023115` e `20261127023116`, correspondentes a `0009`, `0010` e `0011`. A releitura confirmou os 17 hashes do recibo, os oito grupos institucionais protegidos intactos e os 16 fingerprints da origem idênticos ao pré-voo. Foram verificadas 19 tabelas centrais e duas históricas com RLS forçada e zero FKs pendentes de validação. O manifesto agregado de confirmação está em `tmp/pre-implantacao/operational-transfer-committed-evidence.json`.

A origem `55484` permanece disponível. O PostgreSQL hospedado contém os dados, e a conexão do aplicativo com os papéis SQL específicos e a liberação de escrita da instalação permanecem como etapas distintas. A janela concluída cobriu a competência já presente da PCDF e o cadastro manual existente. Nenhum corte ou publicação foi executado.

### Conexão local da aplicação ao banco institucional

Os três papéis SQL existentes estavam sem senha. Foi feito o primeiro provisionamento SCRAM-SHA-256, sem alterar memberships, RLS, vínculos Auth ou liberações. Os segredos ficaram no cofre DPAPI em `D:/Backups/SENTINELA/SUPABASE-SERVIDOR-LOCAL`, com ACL restrita e fora do Git. O lançamento usa o destino e hash da CA selados localmente, verifica a instalação e entrega as URLs PostgreSQL e a CA apenas ao processo do servidor. O reinício usa exclusivamente os três logins restritos. A configuração local habitual em `.env.local` foi preservada. No Supavisor em modo sessão, porta `5432`, os três logins passaram com validação de CA e hostname. O driver `pg` também rejeitou uma CA divergente. [Conexões do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)

O ensaio utiliza `https://localhost:3321`, com servidor restrito a loopback. O certificado HTTPS efêmero é usado apenas no ensaio e o Edge recebe o pin de sua chave pública. As flags `SENTINELA_SUPABASE_IMPORT_WRITE` e `SENTINELA_SUPABASE_OPERATIONAL_WRITE` ficam em `0`. O servidor de ensaio aceita GET e HEAD, além do POST do formulário de login na origem exata. Cadastro, edição, importação, revisão e alterações de usuários permanecem bloqueados.

Com o build de produção da validação disponível, o comando `python -E -B tmp/pre-implantacao/connect-managed-runtime.py serve` inicia a sessão em leitura sob o titular do cofre DPAPI. O comando `verify` no mesmo lançador confere os três logins sem iniciar o servidor. O certificado local de `localhost` deve estar dentro da validade. Para a inspeção assistida no Edge, `node tmp/pre-implantacao/check-managed-edge.mjs` abre contextos separados e limita a exceção de TLS à chave pública do certificado local. Interromper o processo de ensaio permite retornar ao modo habitual do projeto.

As verificações SQL usaram sessões Auth existentes dos três perfis, em transações somente leitura. A consulta usada no Dashboard e no Mapa retornou 6.090 ocorrências consolidadas, 5.460 pontos e 37 regiões. A ocorrência manual em revisão integra o total físico de 6.091. Todos os papéis consultaram as 26.714 pendências. Administrador e Operador consultaram a competência importada. Apenas o Administrador consultou os três usuários. A leitura de conferência confirmou 6.393 associações, três vínculos, os dois eventos de auditoria viva, os 21 históricos e o comprovante. Indicadores de RLS e bloqueios de escrita permaneceram no estado previsto.

Cinco endpoints de consulta devolveram `401` sem sessão. Seis pedidos de mutação foram recusados com `403` no servidor local, antes de avançar para o Supabase. A inspeção de 90 artefatos estáticos do build encontrou zero credenciais SQL. TypeScript, ESLint, contratos (36 schemas, 22 caminhos e 28 operações), 50 testes pertinentes e o build de produção passaram. A tela de login no Edge coube em 1440 e 390 px. O registro de login, perfil, resposta das APIs e responsividade tem evidência independente das consultas SQL.

Para uma futura janela autorizada, registrar os módulos, perfis, horário de encerramento e dados sintéticos aprovados. Validar TLS, RLS, sessão Auth e UUID/OID da instalação e capturar o estado anterior das liberações e os totais da auditoria.

| Operação | Habilitação para a janela |
| --- | --- |
| Cadastro e edição | Vincular `sentinela_ocorrencias_manual.liberacao` à instalação atestada. Usar `SENTINELA_SUPABASE_OPERATIONAL_WRITE` somente com o escopo aprovado. |
| CSV, XLSX e importação PCDF | Ativar `SENTINELA_SUPABASE_IMPORT_WRITE` apenas na janela aprovada. Conceder os vínculos individuais exigidos em `sentinela_general_accounts.individuals`. Para PCDF v2 e gestão de arquivos, conferir também o Administrador autorizado em `sentinela_gestao_autorizacao.atores` e os limites de `sentinela_gestao_autorizacao.release`. |
| Central de Revisão | `SENTINELA_SUPABASE_OPERATIONAL_WRITE` habilita a rota de decisão. O vínculo da instalação, a sessão e a permissão de Administrador são conferidos no servidor e no banco. |

Antes de abrir o tráfego de escrita, confirmar os bloqueios de Operador na decisão da Central e de Analista em todas as mutações. Usar apenas gravações sintéticas explicitamente autorizadas e verificar autoria, versão, idempotência e auditoria. Interromper se houver autoria divergente, efeito fora do escopo, contagem inesperada, ou alteração de RLS. Para encerrar ou conter a janela, fechar as flags e as liberações registradas e retornar ao lançador somente leitura. Essa ação bloqueia novas mutações. Qualquer reparação dos dados já gravados segue o procedimento institucional de recuperação e auditoria. As flags e liberações permanecem fechadas nesta etapa.

### Homologação da aplicação em 27/11/2026

O total físico de 6.091 ocorrências está correto: 6.090 consolidadas e 1 manual em revisão. A diferença em relação às consultas do Dashboard, do Mapa e de Ocorrências é esperada.

O Administrador entrou com Supabase Auth real no Edge e percorreu Dashboard, Mapa, Ocorrências, Central de Revisão, Importar e Usuários, com resposta 200, em 1440 e 390 px. Evidência: `tmp/pre-implantacao/managed-edge-roles-admin-evidence.json`. O Operador e o Analista foram validados pelas sessões Auth existentes nas consultas SQL dos perfis. A homologação deles no navegador não foi repetida, por decisão do titular.

O histórico mensal PCDF deixou de retornar `503` e passou a retornar `200`, com 1 competência cadastrada e `canApprove: false`. O contrato hospedado aceita inventário parcial (até 67 competências) apenas com aprovação bloqueada. Competências ausentes não são exibidas.

A competência `2021-01` aparece como `conflict` porque `sentinela_pcdf_historico.status()` consulta apenas `sentinela.eventos_auditoria`. O evento original de revisão foi preservado em `sentinela_migracao.auditoria_origem`. A correção proposta está em `database/supabase/pendentes/0012_pcdf_historico_auditoria_arquivada.sql` e não foi aplicada. Ela permite que apenas `sentinela_pcdf_historico_owner` leia eventos `pcdf.revisao_independente` no arquivo, por uma policy de leitura. O modelo é o mesmo de `historico_audit_read`. O RLS permanece forçado e os papéis da aplicação continuam sem acesso a `sentinela_migracao`. Nenhum evento é inserido ou alterado. Pré-condições e pós-condições abortam a transação se o estado divergir. A aplicação exige a confirmação de escrita no projeto institucional e um registro de versão em `supabase_migrations.schema_migrations`, conforme o procedimento das migrations `0009`–`0011`. O instalador aprovado não foi alterado.

O componente `src/features/import/PcdfHistoricalQueue.tsx` não está ligado a nenhuma tela. A fila mensal é consultável pela API, mas não aparece na interface de Importar.

#### Ensaio e pacote da `0012`

A proposta fica em `database/supabase/pendentes/`, fora de `migrations/`, para que os instaladores e ensaios existentes não a apliquem. `sentinela.schema_migrations` é imutável. Por isso, a reversão é a migration compensatória `0013_reverte_0012.sql`, que restaura a definição de `status()` da `0010` e remove a policy e os grants. As duas migrations são registradas nos dois históricos.

O ensaio `database/supabase/tests/rehearse_0012.py` rodou em um cluster descartável PostgreSQL 17.11 com PostGIS 3.6.2 local. A `0012` não usa PostGIS. Com fixtures sintéticas equivalentes ao estado institucional, as 21 verificações passaram:

- A execução com `ROLLBACK` não deixou efeito, e a guarda recusou um histórico físico divergente.
- A competência `2021-01` passou de `conflict` para `done`.
- A auditoria ativa, a arquivada e os comprovantes ficaram idênticos em contagem e SHA-256. A RLS forçada foi mantida.
- Os papéis da aplicação continuaram sem acesso ao arquivo, e o `EXECUTE` de `status()` não mudou. O Analista continua sem acesso.
- A reaplicação foi recusada, e a `0013` restaurou o catálogo completo.

O ensaio corrigiu dois defeitos da primeira versão:

- O instalador tem `SET` sem `INHERIT` no papel dono e precisa de `CREATE` temporário no schema.
- O instalador não tem `EXECUTE` em `status()`, então a conferência roda como o papel dono.

O pré-voo remoto, somente leitura (`tmp/pre-implantacao/check-0012-preflight.py`), confirmou:

- `status()` é idêntica à da `0010`, com md5 `b8d92572f805af25a07ad1522da427fa`.
- O arquivo de auditoria pertence a `postgres`, que tem `BYPASSRLS`.
- Há exatamente um evento arquivado correspondente e nenhum evento ativo.
- O histórico lógico está em `0011` e o físico termina em `20261127023116`.

SHA-256 da `0012`: `106bd39deb97c206090483423b6d1d18e6680225250d6209f0da62ec637cc3cb`.

#### Roteiro da homologação controlada com o Administrador

1. Abrir a liberação de cadastro e edição com `tmp/pre-implantacao/janela-escrita-admin-abrir.sql`. O script registra a linha de base e recusa se a gestão de arquivos ou a importação estiverem abertas.
2. Iniciar `tmp/pre-implantacao/launch-write-window.py`. Ele usa o mesmo cofre, o mesmo `verify-full` e o mesmo atestado da instalação, com `SENTINELA_SUPABASE_OPERATIONAL_WRITE=1` e importação em `0`. O servidor aceita apenas `POST /api/v1/ocorrencias/manuais`, `PATCH /api/v1/ocorrencias/gestao` e `PATCH /api/v1/central-revisao/{id}`.
3. Com o Administrador, cadastrar uma ocorrência sintética identificada como homologação e editá-la. Conferir autoria, versão, idempotência e eventos `ocorrencia.manual.*`.
4. Na Central de Revisão, decidir somente a pendência previamente escolhida pelo titular. As pendências vêm dos dados migrados: a decisão altera um registro institucional real e gera o evento `pendencia.revisada`.
5. Fechar com `tmp/pre-implantacao/janela-escrita-admin-fechar.sql`, retornar ao lançador somente leitura e comparar as contagens. Os registros gravados permanecem auditados. A ocorrência sintética pode ser inativada pelo fluxo da aplicação, mas não apagada.
