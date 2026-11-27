# Banco local — Sprint 4, Etapa 1

Para a preparação da instalação inicial com PostGIS em `extensions`, consultar a [baseline Supabase separada](supabase/README.md) e seu [ADR](../docs/decisoes/adr-baselines-local-supabase.md). Escolher somente um caminho de instalação; não combinar com as migrations locais abaixo. Os arquivos 0001–0005 permanecem inalterados.

Baseline SQL **0001–0004** com correção incremental **0005**, de 29/10/2026. Modelo para revisão e execução local descartável, sem homologação de servidor, conexão Supabase, API, carga PCDF ou alteração do frontend. Leia a [modelagem](../docs/banco/modelagem-postgresql-postgis-v1.0.md), o [contrato PCDF](../docs/contratos/importacao-pcdf-v1.0.md) e a [Central](../docs/funcionalidades/central-revisao-ocorrencias-v1.0.md).

## Pré-requisitos e isolamento

Alvo técnico proposto: PostgreSQL **15 ou superior**, PostGIS **3.3 ou superior**, banco UTF-8 com collation determinística. A versão mínima PostgreSQL decorre de `UNIQUE NULLS NOT DISTINCT`. As funções usadas existem nessa linha PostGIS, mas a combinação do ambiente escolhido ainda deve passar pela regressão real. O parser estático não certifica compatibilidade de servidor/extensão.

Usar somente instância **local descartável**, base vazia `sentinela_model_test` ou `sentinela_model_test_<sufixo>`. Não usar uma base existente da equipe, URL Supabase ou variável `DATABASE_URL`. As migrations não possuem trava de hostname: o operador deve conferir o destino antes de executá-las. O teste SQL tem trava adicional de nome do banco, endereço local e superusuário.

A extensão PostGIS precisa estar instalada no servidor. `0001` cria a extensão se ausente e exige instalação no schema `public`, sem mover extensão existente. Esse posicionamento é decisão técnica desta baseline local; futura integração com schemas de extensões Supabase exige adaptação explícita. Não conectar ao Supabase para validar esta etapa.

## Aplicação manual futura, somente local

Estes comandos são roteiro de reprodução, **não evidência de execução** nesta entrega. Com PostgreSQL/PostGIS já provisionados e credenciais locais disponíveis, conferir primeiro:

```powershell
psql -X -h 127.0.0.1 -p 5432 -U postgres -d sentinela_model_test -v ON_ERROR_STOP=1 -c "SELECT current_database(), inet_server_addr(), version();"
```

Se a base não for local, vazia e descartável, interromper. Não colocar senha na linha de comando ou no Git. Aplicar cada arquivo na ordem, parando ao primeiro erro:

```powershell
psql -X -h 127.0.0.1 -p 5432 -U postgres -d sentinela_model_test -v ON_ERROR_STOP=1 -f database/migrations/0001_base_catalogos.sql
psql -X -h 127.0.0.1 -p 5432 -U postgres -d sentinela_model_test -v ON_ERROR_STOP=1 -f database/migrations/0002_origem_importacoes.sql
psql -X -h 127.0.0.1 -p 5432 -U postgres -d sentinela_model_test -v ON_ERROR_STOP=1 -f database/migrations/0003_ocorrencias_revisao.sql
psql -X -h 127.0.0.1 -p 5432 -U postgres -d sentinela_model_test -v ON_ERROR_STOP=1 -f database/migrations/0004_integridade_protecao.sql
psql -X -h 127.0.0.1 -p 5432 -U postgres -d sentinela_model_test -v ON_ERROR_STOP=1 -f database/migrations/0005_integridade_revisao_seguranca.sql
psql -X -h 127.0.0.1 -p 5432 -U postgres -d sentinela_model_test -v ON_ERROR_STOP=1 -f database/tests/consistencia.sql
```

Cada migration abre sua própria transação e registra a versão em `sentinela.schema_migrations`; não envolver os cinco arquivos em uma transação externa nem executar novamente arquivos já aplicados. O conjunto não é atomicamente único: falha em 0003 preserva 0001–0002, e a reprodução local deve recomeçar em outra base vazia ou retomar apenas a migration que falhou após diagnóstico. Para aplicar 0005 depois de 0004 com FORCE RLS, usar o superusuário da instância local descartável; não criar policy permissiva para o migrador nem usar essa identidade na aplicação.

Não há runner, reversão destrutiva automática nem `DROP SCHEMA ... CASCADE`. As quatro migrations originais foram preservadas; 0005 aplica as correções de integridade e segurança. Futuras mudanças seguem em **0006+**, sem reescrever versões aplicadas. Registrar hashes SHA-256 dos arquivos junto à evidência de aplicação para detectar drift, pois o ledger registra versão/descrição/data, não calcula checksum de arquivo. Exemplos de conferência somente leitura:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath database/migrations/0001_base_catalogos.sql,database/migrations/0002_origem_importacoes.sql,database/migrations/0003_ocorrencias_revisao.sql,database/migrations/0004_integridade_protecao.sql,database/migrations/0005_integridade_revisao_seguranca.sql
```

## Validação estática disponível

`tests/validate_structure.py` usa AST PostgreSQL via **pglast**, sem acessar rede ou banco. A ferramenta não integra dependências Node do aplicativo. Preparação opcional em diretório ignorado pelo Git:

```powershell
python -m pip install --target tmp/sql-validation pglast==8.7
python database/tests/validate_structure.py --parser-path tmp/sql-validation
```

O validador confere sintaxe SQL e PL/pgSQL, transações, nomes de colunas de índices, existência/tipos/chaves únicas das FKs e ausência de cascatas destrutivas. Confere ainda ordem de funções/triggers, declarações de auditoria diferida e travas por statement, sem grants/policies/SECURITY DEFINER. Analisa a sintaxe do teste SQL e exige ROLLBACK final. Não valida resolução de funções PostGIS, DDL dinâmico, planos, concorrência, privilégios ou execução de triggers/constraints. pglast 8.7 usa gramática PostgreSQL 18; sucesso no parser não garante execução PostgreSQL 15.

`tests/consistencia.sql` é a regressão de execução: usa fixtures explicitamente sintéticas em transação com **ROLLBACK**, testa idempotência, multiplicidade, preservação, localização, atribuição administrativa e ausência de leitura por role sem BYPASSRLS. Não importa PCDF e não cria fixtures permanentes. Se houver erro e `psql` sair por ON_ERROR_STOP, a conexão encerrada reverte a transação. A role de teste também é transacional e não permanece.

A regressão ampliada testa identidade, transferência de associação, vínculos cruzados, revisores desativados/reclassificados, histórico obrigatório, valores/versão, carimbo transacional e rejeição de UUID/GUC como autorização. O superusuário desabilita explicitamente alguns triggers **somente na transação de fixtures**, reabilitando-os para testar a proteção; isso não é um caminho de negócio. Não existe parâmetro, função ou role da aplicação que desative a trava. A conferência diferida é forçada por `SET CONSTRAINTS ALL IMMEDIATE`, pois ROLLBACK sozinho não executa verificações adiadas.

0005 bloqueia UPDATE/DELETE de ocorrências, associações, staging e pendências, INSERT de correções e autoria humana de auditoria/decisão inicial de pendências. Essa proteção se aplica inclusive a DML de superusuário enquanto os triggers estiverem habilitados. Os INSERTs técnicos iniciais continuam sujeitos a privilégios/RLS fechado. O proprietário/superusuário ainda pode alterar DDL: não usar essa conta na aplicação. A liberação depende de migration futura com Auth real, escopo, correção transacional e reavaliação; informar o UUID de um Administrador não libera a escrita.

## Estado da preparação estática (histórico)

Atualização de 29/10/2026: migrations 0001–0005 e regressão executadas e aprovadas em PostgreSQL 17.11/PostGIS 3.6.2 local. Os itens abaixo registram a preparação anterior. Consulte o [relatório de execução](../docs/banco/execucao-local-sprint4-etapa1-2026-10-29.md) para evidências e limites atuais.

- Sintaxe das cinco migrations e do teste SQL aprovada pelo parser; conferência estrutural: **19 tabelas, 34 FKs e 38 índices explícitos**, além dos índices implícitos de PK/UNIQUE.
- Corpos procedurais analisados: **21** nas migrations, contando redefinições. Regressão SQL ampliada analisada, **não executada**.
- Não foram encontrados `psql`, `postgres`, `initdb`, `pg_ctl` ou Docker no PATH, nem instalação PostgreSQL nos caminhos usuais consultados. Nenhum servidor foi iniciado ou instalado. Não há evidência de aplicação das migrations em PostgreSQL/PostGIS nesta entrega.
- Nenhum teste de carga dos 369.660 registros foi executado. Não há homologação de RLS, restauração, concorrência ou desempenho em servidor.
- Somente os três perfis e sua matriz de capacidades são inseridos pelas migrations. Catálogos criminais, mapeamentos, RAs, usuários e ocorrências permanecem vazios. Nenhum dado real ou mock foi promovido a dado PCDF.
- Arquivos documentais PCDF/Central já existentes no início da etapa foram preservados. Não houve alteração de contratos TypeScript/OpenAPI, dependências, scripts do aplicativo ou frontend.

0005 não corrige dados preexistentes silenciosamente. Vínculos incompletos/conflitantes reprovam as novas constraints, e referências incompatíveis de correções antigas reprovam a verificação de destino, revertendo a migration. `transacao_id` de históricos anteriores permanece NULL; constraints NOT VALID exigem carimbo nas novas inserções sem inventar a transação do passado. Revisar incompatibilidades antes de repetir a migration, preservando origem/histórico. A etapa continua **não homologada** até executar migrations e regressão em PostgreSQL/PostGIS real.
