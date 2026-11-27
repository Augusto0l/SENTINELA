# Etapa 2.8 ? homologacao RLS concluida em 11/11/2026

## Decisao e ambiente

Alternativa B: criar cluster novo, pois o antigo nao tinha esquema/fixtures e sua
recuperacao/senha acrescentariam complexidade sem beneficio para o teste RLS.
O sandbox a8aaa34d-98a0-43aa-9a15-ddbdf0dd375a foi preservado, sem recuperacao,
substituicao ou remocao. Manifesto e hashes de configuracoes continuaram identicos.

Cluster homologado: ec3d8148-6f97-4aef-bebc-0df6ae260648.
System identifier: 7706955341292677160. Endpoint: 127.0.0.1:55432/sentinela_rls_sandbox.
PostgreSQL 17.11, PostGIS 3.6.2/extensions. PID historico: 8804.
Estado final STOPPED, pg_control shut down, postmaster.pid ausente e porta livre.

Raiz privada: %USERPROFILE%/.sentinela-local/rls-sandboxes/rls-sandbox-ec3d8148-6f97-4aef-bebc-0df6ae260648.
Evidencias sob evidence nessa raiz: completion.json, qualification-report.json,
test-report.json, installed.json, observed-reader-uuid-sets.json, snapshots e
fingerprints operacionais antes/depois, eventos de start, log privado e backup.

## Implementacao e credenciais

complete_rls.py --execute e o ponto unico: referencia operacional READ ONLY,
prepare/create/start/atestacao, instalacao, comparacao NOLOGIN, role independente,
comparacao LOGIN, backup, fixtures, testes, verificacao operacional e parada.
Cria SEMPRE raiz nova e credenciais aleatorias exclusivas. Nao le .env.local.
initdb recebe arquivo bootstrap exclusivo sob DACL privada; arquivo removido em
finally. A role recebe verificador SCRAM por stdin, nunca por argv ou SQL em disco.
Demais clientes usam PGPASSWORD em memoria. Nada e emitido como senha/hash real.
Nao altera senha existente nem armazena credenciais no Git. Administrador local
malicioso ainda pode inspecionar memoria/ambiente; essa protecao nao e absoluta.
As credenciais geradas sao descartadas; repetir o comando cria OUTRO cluster.

## Estrutura e comparacao

Instalados banco de template0, PostGIS 3.6.2, baseline integral 0001?0005, role
sentinela_local_reader exclusiva deste cluster, seis policies e 48 grants por coluna.
Confirmados: 19 tabelas ENABLE/FORCE RLS, 19 PKs, 34 FKs, 77 indices validos/prontos,
55 triggers habilitados, 17 funcoes, dois CHECKs NOT VALID intencionais e ledger
0001?0005 + local-read-0001. Sem migration 0006, alteracao de baseline, desativacao
RLS/constraints/triggers ou dados reais.

Snapshot v2 comparou definicoes completas, ACLs, grants, ledger, locale libc
Portuguese_Brazil.1252/UTF8 e PostGIS. Comparacoes NOLOGIN e LOGIN, antes/depois dos
testes, passaram. Normalizados somente endpoints/identidades distintos, nome do
banco, timestamps do ledger e LOGIN/NOLOGIN na fase explicitamente permitida.
Nenhuma divergencia estrutural inesperada foi aceita.

## Fixtures e resultados reais

20 fixtures sinteticas atestadas por UUID e atributos. Leitor autenticado diretamente,
session_user=current_user, sem SET ROLE e sem privilegios administrativos.

| Tabela | Fixtures | Visiveis | Invisiveis |
|---|---:|---:|---:|
| regioes_administrativas | 2 | 1 | 1 |
| categorias_criminais | 3 | 1 | 2 |
| naturezas_criminais | 2 | 1 | 1 |
| mapeamentos_natureza | 5 | 1 | 4 |
| ocorrencias | 4 | 1 | 3 |
| ocorrencia_naturezas | 4 | 1 | 3 |

UUIDs visiveis: prefixos 10000000, 20000000, 30000000, 40000000, 50000000,
60000000, respectivamente, seguidos de -0000-4000-8000-000000000001.
Conjuntos completos observados em observed-reader-uuid-sets.json; negativos exatos
em qualification-report.json e expected.json. fixture_attestation.sql confirmou
atributos/relacionamentos; rls.sql verificou os seis conjuntos e o join completo.
Foram cobertos fonte/versao indevidas, categoria/mapeamento pendentes, natureza
invisivel, ocorrencia inativa/em revisao e associacoes de ocorrencias invisiveis.
A policy de associacoes filtra pela ocorrencia pai; nao se atribui a ela uma regra
adicional de visibilidade de natureza que nao existe.

Seis projecoes permitidas e 49 negativas aprovadas: colunas restritas, 18 DML sem
linhas, 13 tabelas internas e tres DDL/TEMP. Negativas encerradas por ROLLBACK.
Outro banco (postgres) rejeitado pelo HBA. IPv6 falhou e inventario nativo confirmou
zero listeners IPv6 e somente um IPv4 loopback. Role sem SUPERUSER/BYPASSRLS,
CREATEDB/CREATEROLE/REPLICATION/INHERIT, memberships ou propriedade; limite cinco.
Nenhuma consulta vazia foi considerada prova de filtragem RLS.

## Testes, correcoes e tentativas preservadas

142 testes offline PASS: 91 controlador, 15 plano, 19 runtime/copia, dez estaticos,
sete executor. SQLs analisados pelos testes estaticos existentes; sem instalacao de
dependencias. git diff --check aprovado.
Sete grupos reais PASS: estrutura antes, atributos das fixtures, seis policies e
relacionamentos, permissoes, outro banco, IPv6, estrutura depois. Criacao, instalacao,
comparacoes NOLOGIN/LOGIN, backup e parada tambem passaram em completion.json.

Uma primeira tentativa falhou no fornecimento ao initdb e foi preservada. Corrigido
para arquivo privado conforme mecanismo suportado. Duas execucoes posteriores
passaram RLS/permissoes mas encontraram defeitos no verificador IPv6: exigir HBA sem
listener e interpretar WSAEWOULDBLOCK 10035 isoladamente. Corrigido para exigir falha
de conexao corroborada por observacao nativa de listeners. Ambas as instancias
foram encerradas ordenadamente, sem exclusao. A ultima execucao repetiu tudo e
passou; resultados antigos FAIL nao foram substituidos por PASS.

## Preservacao e limites

Operacional recebeu somente transacoes READ ONLY. Snapshots completos iguais,
contagens/fingerprints das 19 tabelas iguais e quatro configuracoes operacionais
com hashes preservados. Servico/HBA/roles/dados operacionais nao foram alterados.
Nenhuma conexao ao Supabase. Sem commits, push, PR, descarte ou integracao Next.js.

Backup pre-fixture foi exportado, listado e lido integralmente, NAO restaurado.
Nao se alega recuperacao do cluster antigo, recuperacao WAL ou restaurabilidade
integral. Fixtures e evidencias permanecem no cluster parado; nada foi excluido.

CREATE_NO_WINDOW + grupo separado, close_fds e saida em arquivo regular evitam
anexo a console e drenagem de pipes. Start/atestacao/parada foram exercitados de
verdade; fechamento de console/logoff/Job Object nao foi homologado destrutivamente.
Nao se promete sobreviver a shutdown ou a politicas externas de encerramento.
Em falha, parada so ocorre apos nova atestacao autenticada; estado desconhecido
fica intacto. Nao ha retry automatico de operacao parcialmente concluida.

## Reproducao e proxima entrega

```powershell
python -B database/local/sandbox/complete_rls.py --execute
```

Exige porta 55432 livre, ferramentas instaladas e pgpass privado operacional para
referencia exclusivamente de leitura. Nao precisa de senha pelo chat ou dez comandos.
Cria novo cluster; nao reusa o encerrado e nao modifica o antigo.

Pode-se iniciar a proxima entrega do pool PostgreSQL somente no servidor e APIs
GET de ocorrencias, preservando conexao minima e isolamento remoto. A homologacao
cobre leitura de dados sinteticos; nao autoriza dados reais, escrita operacional,
novas policies ou integracao hospedada Supabase.
