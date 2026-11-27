# ADR — Leitura PostgreSQL local e homologação isolada

## Título

Persistência local somente de leitura, com privilégios mínimos e sandbox independente.

## Status

Proposto para avaliação institucional. Documenta a solução local implementada e os resultados registrados; não constitui aprovação formal do ADR, autorização de escrita ou arquitetura hospedada definitiva.

## Data

2026-11-11 — registro complementar às decisões anteriores de [baselines](adr-baselines-local-supabase.md), [Auth fechado](adr-auth-inicial-acesso-fechado.md) e [contratos](adr-contratos-executaveis-api.md). Esses registros permanecem históricos, sem reescrita.

## Contexto

A prioridade passou a ser a consulta persistente de ocorrências no desenvolvimento local, preservando o Supabase Auth para homologação definitiva. Uma identidade local não pode justificar o uso de postgres, service_role ou conexão administrativa no backend. Banco operacional vazio também não comprova filtragem RLS positiva e negativa.

O perfil operacional homologado é PostgreSQL 17.11/PostGIS 3.6.2, em `127.0.0.1:5432/sentinela_dev_operacional`. Diferentemente da entrada local original descrita no ADR de 29/10, esse perfil usa PostGIS em `extensions` e a baseline consolidada `database/supabase/baseline/0001_modelo_inicial.sql`, sem dependência Auth para instalação. O nome do diretório não transforma o destino em Supabase. Esse uso local complementar não autoriza reaplicar as migrations originais, modificar a baseline nem executar a 0006.

## Decisão

### Privilégios e RLS

- Role técnica `sentinela_local_reader`, sem SUPERUSER, BYPASSRLS, CREATEDB, CREATEROLE, REPLICATION, INHERIT, memberships ou propriedade de tabelas; limite de cinco conexões.
- Script de criação inicialmente NOLOGIN e senha NULL. Senha SCRAM e LOGIN são operações privadas e separadas, somente após aprovação de isolamento. Não são criados pelo frontend ou automaticamente no início da aplicação.
- Seis policies SELECT e 48 grants por coluna em ocorrências, associações de naturezas, naturezas, categorias, mapeamentos e RAs. Preservar ENABLE/FORCE RLS nas 19 tabelas.
- Restringir leitura ao marcador sintético `SENTINELA_TESTE_LOCAL_V1` e às condições de visibilidade definidas na migration. Não usar uma consulta vazia como prova de filtragem de linhas.
- Não conceder escrita, DDL, TEMP, acesso a usuários, auditoria, staging ou históricos, nem privilégios automáticos sobre tabelas futuras.
- CONNECT/TEMPORARY de PUBLIC são revogados apenas no banco aprovado. Como PUBLIC pode continuar concedendo CONNECT em outros bancos, o isolamento depende também da ordem HBA: permitir somente a combinação aprovada em IPv4 loopback e rejeitar os demais destinos da role. Não alterar os acessos dos demais usuários ou bancos para contornar esse comportamento.

### Backend e interface

- Pool `pg` somente no servidor, máximo de três conexões, timeouts e transações `REPEATABLE READ READ ONLY`. Verificar identidade do servidor/banco/role, atributos e RLS; falhar fechado diante de divergência.
- Configuração privada `SENTINELA_LOCAL_READER_URL` aceita apenas host literal `127.0.0.1`, porta 5432, banco e role aprovados, sem parâmetros de redirecionamento. `SENTINELA_DATABASE_URL` permanece administrativa e não é fallback.
- Endpoint GET de listagem e GET de detalhe por UUID, contratos Zod/OpenAPI, consultas parametrizadas, limites de paginação, filtros e desempate determinístico. Não há endpoints POST/PATCH/DELETE persistentes.
- Exigir desenvolvimento local, sessão do [provedor local temporário](adr-auth-local-temporario.md), `principal.source=local` e permissão `analisar`. Administrador, Operador e Analista compartilham apenas esse escopo de leitura; a role SQL não é uma identidade humana.
- A tela `/ocorrencias` consulta somente as APIs. Dados vazios e falhas têm estados explícitos, sem fallback para mocks. Dashboard e Mapa continuam demonstrativos, identificados separadamente. Cadastro, edição e inativação persistentes permanecem indisponíveis.

### Ambiente de homologação

- Cluster independente em `127.0.0.1:55432`, banco `sentinela_rls_sandbox`, diretório de dados e credenciais próprios. Não compartilhar o diretório operacional nem reutilizar sua senha.
- Atestar UUID, system identifier, PID/processo, diretório, listener, HBA e hashes. Portas, identidades e destinos divergentes interrompem a operação.
- Reproduzir baseline e políticas, comparar definições completas, ACLs e ledger. A diferença LOGIN/NOLOGIN só pode ser normalizada na fase explicitamente aprovada, mantendo os demais controles.
- Inserir as 20 fixtures sintéticas e executar testes RLS positivos/negativos somente no sandbox autorizado. O banco operacional recebe apenas consultas de leitura para comparação; nenhuma fixture é criada nele.
- Gerenciar start, atestação, recuperação e parada com evidências privadas. Não presumir que falha de controlador significa servidor parado, não repetir operações parciais nem usar remoção de PID, DROP/CASCADE ou pg_resetwal como recuperação automática.

## Alternativas consideradas

- Consultar com postgres ou outra role administrativa: rejeitado, pois contorna o objetivo de RLS e privilégios mínimos.
- Usar identidade local para consultar/escrever no Supabase: rejeitado; os domínios de autenticação e as conexões são separados.
- Criar fixtures no operacional: rejeitado; sua ausência de dados precisa ser preservada e não substitui homologação isolada.
- Reaplicar as originais 0001–0005 sobre a baseline consolidada: rejeitado por duplicação e incompatibilidade da qualificação PostGIS.
- Exibir mocks quando PostgreSQL falhar: rejeitado por apresentar dados de demonstração como leitura persistente.
- Testar somente contagens ou com SET ROLE administrativo: insuficiente para comprovar autenticação real, definições equivalentes e conjuntos RLS por UUID.

## Consequências

Há uma primeira fatia funcional persistente, mas apenas de leitura e de dados sintéticos. A configuração é deliberadamente restritiva; mudanças de versão, destino, catálogo ou escopo precisam de nova revisão, não de ampliação automática de privilégios.

A homologação SQL no sandbox comprova seis policies com linhas visíveis/invisíveis. O ensaio HTTP real comprova leitura autenticada de base operacional vazia. Telas preenchidas e detalhes com múltiplas naturezas foram exercitados com respostas contratuais de teste, não com registros operacionais não vazios. Essas evidências não são intercambiáveis.

Scripts administrativos versionados exigem autorização explícita de execução. A role é global dentro de seu cluster, e uma intervenção administrativa continua capaz de ultrapassar controles da aplicação. O backup teve recuperação parcial documentada; exportação ou inventário válido não comprova restauração integral Supabase. A sobrevivência a encerramento de console/logoff ou políticas externas não é garantida por testes simulados.

Escrita persistente e hospedagem futura exigem novo desenho de autorização por operação, RLS por escopo, contratos, integridade, auditoria humana e testes com identidades definitivas. Este ADR não libera essas atividades nem concede privilégios adicionais.

## Links relacionados

- [Segurança e ordem de execução local](../../database/local/README.md).
- [Homologação SQL RLS](../../database/local/sandbox/HOMOLOGACAO.md).
- [Recuperação do sandbox](../../database/local/sandbox/RECOVERY.md).
- [APIs e evidência HTTP sanitizada](../postgresql-leitura-local.md).
- [Interface persistente](../ocorrencias-persistentes.md).
- [Relatório da Sprint 4](../../sprints/sprint-04.md).
- [#151 — Consultar ocorrências pela API](https://github.com/CAMPUSCEUB/Sentinela/issues/151).
- [#126 — Reprodutibilidade das migrações](https://github.com/CAMPUSCEUB/Sentinela/issues/126).
- [#146 — RLS conforme matriz](https://github.com/CAMPUSCEUB/Sentinela/issues/146).

Referências de escopo parcial; não encerram issues.
