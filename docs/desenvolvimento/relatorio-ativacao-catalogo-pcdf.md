# Ativação operacional do catálogo PCDF

A ativação foi concluída em 24/11/2026 no PostgreSQL `127.0.0.1:55484/sentinela_pcdf_local`. A migração `local-pcdf-naturezas-0001` instalou as 41 descrições literais e retirou da consulta funcional as 6.393 pendências artificiais do lote `84908630-bd04-4a03-923d-616649c8de74`. A revisão conferida antes da execução foi `634f7f20897453028d0551c68d26778e69a7a772bdf2485fad39ba2ffff3600b`.

## Autorização e manutenção

A mensagem **SENTINELA — EXECUTAR AGORA A ATIVAÇÃO OPERACIONAL AUTORIZADA**, nesta conversa, foi registrada como autorização local. Ela cobre instalação, reprocessamento, suspensão temporária e reabertura. O aprovador `29e7ec39-192b-4790-9180-3df950969bfc` foi conferido no PostgreSQL como Augusto, Administrador ativo com vínculo ao Supabase Auth. O executor técnico foi `postgres`.

| Etapa | Horário de Brasília |
| --- | --- |
| Primeira janela, encerrada com rollback pré-commit | 22:14:33 a 22:14:43 |
| Início da execução concluída | 22:16:18 |
| Limite registrado da janela | 22:46:18 |
| Registro do evento na transação | 22:16:24 |
| Commit confirmado | 22:16:27 |
| Reabilitação das escritas | 22:16:38 |
| Encerramento após os testes | 22:17:00 |

Na primeira tentativa, o `psql` no Windows rejeitou os acentos no argumento da referência de auditoria. Os 27 fingerprints coincidiram com o backup após o rollback, a versão e o evento de ativação estavam ausentes e os dois papéis de escrita voltaram a aceitar conexão. A segunda execução usou uma referência em ASCII para o mesmo tipo de registro privado, que conserva o título original da autorização. O artefato homologado manteve o mesmo SHA-256. Após suspender novas conexões dos dois papéis de escrita, a segunda execução encontrou zero sessões incompatíveis, transações preparadas e locks de escrita concorrentes.

## Integridade e auditoria

| Indicador | Antes | Depois |
| --- | ---: | ---: |
| Naturezas originais no catálogo PCDF | 0 | 41 |
| Associações em staging | 6.393 | 6.393 |
| Chaves candidatas distintas | 6.091 | 6.091 |
| Pendências funcionais | 26.714 | 20.321 |
| Pendências históricas | 26.714 | 26.714 |
| Ocorrências consolidadas | 0 | 0 |
| Tabelas com RLS forçada | 19 | 19 |
| Eventos na auditoria | 4 | 5 |

O evento `catalogo.pcdf.pendencias_reavaliadas`, UUID `ebd0471f-eb86-44ca-97c2-d35d73d7781d`, transação `788`, registra o aprovador, a referência local e os 6.393 UUIDs reavaliados. O hash do conjunto é `732459aac962625f96d17d826f513b2502b6779b37d87d06a4384eff4ea566c9`.

Somente `sentinela.naturezas_criminais`, `sentinela.schema_migrations` e `sentinela.eventos_auditoria` tiveram alteração de conteúdo. As outras 24 tabelas conservaram os fingerprints, incluindo origem, staging, recibos, pendências históricas e vínculos. Foram confirmadas 41 descrições distintas, a correspondência literal com o catálogo e a validação das chaves estrangeiras. Permaneceram em aberto 18.625 pendências de coordenadas, 1.695 de endereço ou RA e uma de identidade. [DDL e políticas aplicadas](../../database/release/pcdf-original-natures-operational.psql).

## Backups e evidências

| Material conferido | SHA-256 |
| --- | --- |
| SQL operacional `local-pcdf-naturezas-operacional-v1` | `bca256fa1bd3c0b1371a164f2fad5355ed7086500d0a6fa909507d59f4453245` |
| Backup privado de 24/11/2026 às 21:26:11 | `1036fe5ac7edf682a9b31e922321b1c3d3a1322a79d1c7c459c3c41e136927ff` |
| Backup privado de 24/11/2026 às 21:47:41 | `a4d88392a6dab98034d7ded2316c84f3a89c79835636aaef18fdb1443dd5d091` |

Os dois backups tinham evidência de restauração independente e 27 fingerprints coincidentes com o operacional antes da alteração. A aprovação e os horários efetivos constam de `autorizacao-local.json` e `execucao-pcdf.jsonl` no diretório privado `%USERPROFILE%\.sentinela-local\homologacao-clone\clone-69f77530ab644b908594310c7da7553e`. A primeira janela tem registro separado em `clone-6f3df080fa394b2ebff5a5d59ced7940`. [Plano homologado](plano-ativacao-catalogo-pcdf.md).

## Testes e estado final

- Administrador, Operador e Analista foram validados no PostgreSQL operacional, com identidade, catálogo e restrições de leitura conferidos. Após a reabertura, os três conseguiram conectar e executar consultas. O Analista permaneceu sem acesso aos dados de staging.
- Em `localhost:3000`, a sessão real de Augusto foi validada com entrada manual da senha. As APIs de indicadores, ocorrências, disponibilidade de gestão e histórico de importações responderam. As APIs protegidas retornaram `401` para sessões anônimas. A gestão do Administrador apresentou `disponivel` após a reabertura.
- O Dashboard exibiu zero ocorrências e o catálogo de 41 naturezas. A navegação foi verificada em 1440 e 390 px. Operador e Analista foram testados por HTTP no clone homologado e por PostgreSQL no ambiente operacional. A sessão Supabase testada por HTTP no ambiente operacional foi a do Administrador.
- Os dois papéis de escrita tiveram `LOGIN` restaurado. A interface e a configuração do Supabase hospedado foram preservadas. A operação manteve os CSVs e as ocorrências consolidadas no estado anterior.
