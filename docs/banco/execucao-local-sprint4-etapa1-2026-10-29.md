# Sprint 4 — Etapa 1: homologação local

29/10/2026 (America/Sao_Paulo). **Aprovada em PostgreSQL 17.11/PostGIS 3.6.2 local.**

## Destino e execução

Conexão não interativa com `psql -X -w -h localhost -p 5432 -U postgres -d sentinela_model_test -v ON_ERROR_STOP=1`: código 0. Servidor confirmou sentinela_model_test, postgres, ::1, porta 5432 e versões acima, com PostGIS em public. Antes da execução: zero relações de usuário fora das extensões e zero schemas adicionais; estado compatível com banco exclusivo de testes declarado pelo usuário.

A tentativa anterior nesta data falhou por autenticação, antes de qualquer migration. Após configuração externa pelo usuário, todas as verificações iniciais foram repetidas. pgpass.conf não foi lido, exibido ou registrado; nenhuma senha entrou em arquivos ou comandos.

Cada arquivo abaixo foi executado separadamente com as opções acima e -f, na ordem listada, com interrupção ao primeiro código diferente de zero. Nenhum SQL foi alterado.

| Arquivo | Resultado |
| --- | --- |
| 0001_base_catalogos.sql | Código 0, COMMIT |
| 0002_origem_importacoes.sql | Código 0, COMMIT |
| 0003_ocorrencias_revisao.sql | Código 0, COMMIT |
| 0004_integridade_protecao.sql | Código 0, COMMIT |
| 0005_integridade_revisao_seguranca.sql | Código 0, COMMIT |
| tests/consistencia.sql | Código 0, ROLLBACK |

0001 informou que PostGIS já existia. Ledger confirmou exatamente 0001–0005.

## Regressão

Os 43 comandos negativos passaram pelo helper esperar_erro, que exige falha e compara SQLSTATE; aceitação indevida ou código diferente interromperia a execução. Passaram leitura negada e INSERT rejeitado sob role NOLOGIN/NOSUPERUSER/NOBYPASSRLS com SELECT explicitamente concedido.

Passaram integridade referencial, vínculos cruzados, múltiplas naturezas, idempotência, identidade, localização/pertencimento territorial, proteção de originais e snapshots, pendências, atribuição administrativa, autoria histórica, histórico obrigatório, versão/valores, carimbos transacionais, auditoria e rejeição de UUID/GUC como autorização. Constraints diferidas foram forçadas por SET CONSTRAINTS ALL IMMEDIATE.

Triggers foram temporariamente desativados para fixtures apenas na transação prevista no teste. Saída terminou em ROLLBACK; inspeção posterior confirmou todos habilitados e ausência da role sentinela_teste_sem_acesso.

## Inspeção final real

| Item | Resultado |
| --- | --- |
| Tabelas / RLS ENABLE e FORCE | 19 / 19 |
| Policies | 0, baseline fechada |
| FKs | 34, todas validadas |
| PKs / UNIQUE | 19 / 20 |
| CHECKs | 86 |
| Constraints de triggers | 4 |
| Índices | 77 (38 explícitos + 39 de PK/UNIQUE), todos válidos e prontos |
| Triggers de usuário | 55, todos habilitados |
| Grants a terceiros/PUBLIC em tabelas, funções e schema sentinela | 0 |
| PostGIS | 3.6.2 |

Dois CHECKs permanecem NOT VALID por desenho de 0005: correcao_nova_transacao_ck e evento_novo_transacao_ck. São exigidos nas novas linhas, sem inventar transações históricas. Ambas as tabelas estão vazias. Não foram alteradas constraints nesta execução.

Contagens após rollback: schema_migrations=5, perfis=3, permissoes=6, perfil_permissoes=12. As outras 15 tabelas estão vazias: usuários, categorias, naturezas, mapeamentos, RAs, extrações, lotes, execuções, linhas originais, staging, ocorrências, associações, pendências, correções e eventos. Nenhuma fixture persistiu.

## Validador estrutural

Após a regressão, `python database/tests/validate_structure.py --parser-path tmp/sql-validation`: código 0. Cinco migrations e regressão aprovadas em sintaxe; 19 tabelas, 34 FKs, 38 índices explícitos, 21 corpos procedurais e sintaxe de 43 comandos negativos. A mensagem do parser sobre regressão não executada refere-se apenas à análise estática; execução real foi feita separadamente com psql.

## SHA-256 dos arquivos executados

| Arquivo | SHA-256 |
| --- | --- |
| 0001 | 6f5691ceeca8e7b3841f0aafb8a4e9d611443bf4eb6fd028e7f26bda0541e2e7 |
| 0002 | eda88c135800955f5a178e18a548749826e54eec890a06d7225d0d535064c188 |
| 0003 | d86e24128b0c2504a624a35ee71c27f8bb4cdeead2a93b2c03df0369e69d78f9 |
| 0004 | 21144f5dcfe448c3c3dc97f3e412f3439995e41bf56908e5983c6024edadc8d6 |
| 0005 | 152f2106b37ff1ebb19ce7458e856701a40b89d8111b347cc561f2502a9a78ce |
| consistencia.sql | f7ade8d6a6eea0a1ad6d1d12746ecd284fc6844e83bdf4c180a605ec963b2758 |

## Git e limites

Estado inicial: database/, docs/banco/, docs/contratos/importacao-pcdf-v1.0.md e docs/funcionalidades/ não rastreados; nenhum diff rastreado. SQLs e contratos preexistentes preservados. Somente database/ e docs/banco/ entram no commit da etapa. Documentos PCDF/Central preexistentes ficam fora dele.

Homologação limitada à baseline e regressão local nesta combinação de versões. Não certifica Auth/backend, telas, políticas futuras, desempenho, concorrência, restauração ou ingestão real. Frontend não alterado; build/testes do aplicativo não executados.

Sem acesso ao Supabase ou SENTINELA-DADOS, carga PCDF, recriação de banco, correção destrutiva, push, PR ou merge. Superusuário usado exclusivamente para homologação local.
