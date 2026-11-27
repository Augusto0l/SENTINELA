# SENTINELA — Finalização técnica e pré-homologação do PCDF v2

23 de novembro de 2026 · `feat/redesign-interface` · HEAD `3e1b3adb8b597c393a3bb3fe0d18c38f1166c9f0`

## Parecer

A pré-homologação técnica sintética foi aprovada. O SENTINELA tem evidência para solicitar autorização condicionada de um piloto de staging de janeiro/2021. A execução desse piloto depende da aprovação institucional da fonte, da qualificação do destino dedicado e da comprovação de backup e recuperação nesse destino.

A gravação v2 segue bloqueada no backend fora do modo sintético. O estado do PostgreSQL operacional, das migrations instaladas e de seu backup atual permanece **não verificado**. O piloto real de janeiro/2021 foi usado para leitura e prévia locais. As escritas, migrações e restaurações desta etapa usaram fixtures em clusters descartáveis de loopback.

## Estado anterior e diagnóstico

O SENTINELA estava na branch e no HEAD esperados, com alterações locais rastreadas e arquivos novos, incluindo a migration sintética, o receptor e a prévia v2. O SENTINELA-DADOS estava em `main`, sem commit inicial. O trabalho partiu dessas árvores e preservou as alterações preexistentes. Os dois relatórios obrigatórios, os contratos v1/v2, a integração do produtor e a validação de janeiro estavam disponíveis. [Auditoria](auditoria-persistencia-idempotencia-pcdf-v2-2026-11-23.md) · [Implementação anterior](implementacao-persistencia-pcdf-v2-sintetica-2026-11-23.md) · [Contrato v1](../contratos/importacao-pcdf-v1.0.md) · [Contrato v2](../../../SENTINELA-DADOS/docs/contratos/importacao-pcdf-v2.0.md) · [Validação de janeiro](../../../SENTINELA-DADOS/docs/relatorios/validacao-piloto-pcdf-v2-2021-01.md)

| Problema e causa | Impacto | Correção e verificação |
| --- | --- | --- |
| Prévia aceitava anexos omitidos e usava uma verificação parcial do inventário. | Um pacote incompleto podia aparecer como conferido. | O Worker e o receptor usam a validação dos seis artefatos. Os testes removem e alteram anexos e conferem a mensagem na interface. |
| Parte da reconciliação e o estado geográfico v1 na proveniência não eram recalculados. | Um manifesto internamente inconsistente podia passar após recomposição dos hashes. | Comparação dos totais por chave, rótulos, diagnósticos, pares e transições de coordenadas. Casos adversos usam checksums coerentes com o conteúdo alterado. |
| JSON permitia Unicode incompatível com PostgreSQL e repetições de campo em diagnósticos. | Dados inconsistentes podiam falhar tardiamente ou repetir pendências. | Rejeição de NUL, surrogate isolado e diagnóstico com campos repetidos. A regressão de chaves duplicadas foi mantida. |
| Um v1 com CSV já custodiado e envelope diferente podia cair no replay do caminho legado. | O histórico podia atribuir ao reenvio uma custódia diferente da primeira aceitação. | Decisão sob o lock do staging. Envelope sem a aprovação correspondente recebe 409 se o CSV já tem custódia aprovada. Um envelope v2 aprovado com o mesmo CSV e outro vínculo entra em revisão. |
| O isolamento dependia do padrão da sessão e a evidência do aprovador não era explícita. | Uma sessão com snapshot antigo podia tomar decisão inadequada após obter o lock. | Transações HTTP em `READ COMMITTED`, guarda SQL do isolamento, registro do aprovador e do horário, RLS conferida no receptor e resultado de auditoria v2 único por requisição. |

## Arquivos e migrations

| Arquivo | Ajuste |
| --- | --- |
| [src/data/pcdfV2.ts](../../src/data/pcdfV2.ts) | Validação do pacote completo, resumo de validação, reconciliação e controles de proveniência. |
| [src/features/import/PcdfV2Preview.tsx](../../src/features/import/PcdfV2Preview.tsx) | Seleção explícita dos anexos, feedback de integridade e condição de autorização para gravar. |
| [src/lib/db/pcdf-v2-delivery.ts](../../src/lib/db/pcdf-v2-delivery.ts) | Reuso da validação compartilhada e contagem de quarentena na projeção aprovada. |
| [src/lib/db/pcdf-direct.ts](../../src/lib/db/pcdf-direct.ts) | Isolamento explícito no início das transações de confirmação. |
| [database/local/pcdf-sandbox/0001_pcdf_v2_synthetic.sql](../../database/local/pcdf-sandbox/0001_pcdf_v2_synthetic.sql) | Revisão da instalação sintética com limite para espera de lock, metadados de aprovação, guarda de isolamento e RLS, unicidade de resultados e proteção do envelope v1 custodiado. |
| [tests/fixtures/pcdf-v2-package.mjs](../../tests/fixtures/pcdf-v2-package.mjs), [tests/pcdf-v2-preview.test.mjs](../../tests/pcdf-v2-preview.test.mjs) e [tests/pcdf-v2-persistence.test.mjs](../../tests/pcdf-v2-persistence.test.mjs) | Fixtures completas e regressões de validação, perfis, dissociação entre pacote e autorização, concorrência e recuperação. |
| [Integração SENTINELA-DADOS](../../../SENTINELA-DADOS/docs/INTEGRACAO_SENTINELA_V2.md) | Transporte completo e estado atual da prévia e do bloqueio. |

A ordem qualificada partiu do PostgreSQL 17.11 e PostGIS 3.6.2 em `extensions`, com o baseline congelado, o receptor v1 e a revisão v2. Usar o baseline ou as migrations-base conforme o perfil de instalação. O baseline já contém a cadeia 0001–0005. A revisão v2 exige o banco de qualificação, o listener IPv4 local na porta 55488 e a identidade do cluster. A reaplicação da instalação foi recusada com a transação revertida e o estado comparado ao anterior. Na revisão foram examinados chaves, FKs, constraints, unicidade, índices, triggers, privilégios e policies de RLS. Em outro cluster, dois registros v1 recebidos antes da migration mantiveram os originais, os snapshots e o lote após aplicação e replay. [Baseline](../../database/supabase/baseline/0001_modelo_inicial.sql) · [Receptor v1](../../database/local/pcdf-sandbox/direct.sql) · [Modelagem de origem e lotes](../../database/migrations/0002_origem_importacoes.sql) · [Proteções de staging](../../database/migrations/0004_integridade_protecao.sql)

## Custódia, proveniência e idempotência

- O CSV de 26 colunas é recebido com `manifesto.json`, `proveniencia.jsonl`, `pendencias_temporais.jsonl`, `validacao.md` e `sha256sums.txt`. O validador confere cabeçalho, versão, competência, tamanhos, hashes, manifesto e vínculo por ID e posição. O literal civil original, a fonte PCDF, a aba NATUREZAS e a versão do tratamento acompanham a entrega.
- O digest versionado do pacote inclui nomes ordenados, tamanhos e hashes dos seis artefatos. A aprovação sintética exige também o SHA-256 do XML e o hash da projeção validada, com autor e data registrados. A projeção v2 agora inclui a contagem da quarentena. A revisão do validador exige gerar nova evidência de aprovação para a projeção vigente. SHA-256 atesta consistência dos bytes. A comprovação institucional do XML e a autorização precisam de evidência independente.
- O SQL compara a fonte e a extração por SHA do XML, o ID técnico recalculado, a aba, a posição e os 18 textos originais. Reenvios idênticos retornam o mesmo recibo. A segunda versão pode preservar outro snapshot para a mesma origem, identificado como reenvio. Posições distintas permanecem como associações distintas. Natureza repetida para a mesma candidata recebe pendência.
- Divergência em originais, colisão com legado avulso e troca de envelope para o mesmo CSV entram em revisão quando o envelope foi aprovado. A decisão preserva evidência em custódia e impede staging naquela entrega. O caminho legado atende CSVs v1 sem aprovação sintética independente quando o mesmo CSV ainda não tem custódia aprovada. Candidatas entre XMLs diferentes exigem política institucional de correspondência.
- A quarentena temporal é validada e mantida em seu JSONL integral, com contagem na auditoria. Ela permanece fora dos totais de staging. Classificação e geografia recebem pendências próprias, preservando textos e diagnósticos. O pipeline termina em staging com zero ocorrências e associações consolidadas.

## Transações e autorização

O PostgreSQL serializa as confirmações v1 e v2 sob o mesmo lock transacional para que os concorrentes vejam o lote confirmado. Para v2, custódia, extração, staging, pendências, recibo e auditoria de sucesso são atômicos. A tentativa v1 mantém o registro prévio ao staging. A confirmação ou falha que encerra essa tentativa segue o tratamento do receptor v1. A falha de auditoria injetada no ensaio v2 reverteu todas as escritas do pacote. O reenvio após retirar a falha confirmou uma única execução.

Administrador e Operador confirmaram pelo handler com identidades sintéticas e papéis SQL separados. O Analista recebeu bloqueio HTTP e SQL. O papel de aplicação teve leitura e registro direto de aprovações e leitura de artefatos privados negados. O SQL conferiu RLS das tabelas de custódia e aprovação, e o ensaio verificou que o dono das funções segue restrito. A prévia v2 roda no navegador. O backend exige modo sintético explícito, credencial, sessão local e atestação do banco. [Gate do receptor](../../src/lib/db/pcdf-direct-mode.ts) · [Atestação](../../src/lib/db/local-import-db.ts)

## Homologação sintética e qualidade

| Cenários | Esperado | Observado |
| --- | --- | --- |
| v1 e v2 válidos, aprovados para teste | Novo recibo e staging conforme contrato. | HTTP 201, vínculo técnico e snapshots por versão. O parser v1 manteve as 34 colunas. |
| Pacote alterado, manifesto v1 com CSV v2, proveniência inconsistente, ID repetido e pacote incompleto | Recusa do envelope antes da gravação. | HTTP 422. Totais de custódia, origens, lotes, staging e auditoria inalterados. |
| Envelope íntegro sem aprovação ou digest trocado após a prévia | Bloqueio de persistência. | HTTP 403 para falta de aprovação e 409 para digest divergente. |
| Naturezas múltiplas, nova associação e natureza repetida por chave | Preservar a origem e distinguir associação e candidata. | A prévia contou duas associações e uma candidata. O staging reutilizou origem onde aplicável e registrou a repetição de natureza como pendência. |
| GEO inválida, classificação pendente e quarentena | Preservar literal, diagnóstico, bytes e contagens. | Latitude sintética `-91` mantida com diagnóstico de domínio. Duas classificações pendentes em staging e um registro separado na quarentena auditada. |
| Replay v1, replay v2, v1→v2 e v2→v1 | Reusar a origem, manter a trilha por versão e retornar o mesmo recibo no reenvio do pacote. | Os dois sentidos reutilizaram os UUIDs. Em corrida de dois reenvios v2, HTTP 200/201 para o mesmo UUID de execução. |
| Confirmações cruzadas concorrentes | A decisão posterior vê o estado confirmado sob o lock. | Dois snapshots por versão para duas origens únicas, com reutilização contabilizada. SQL recusou confirmação fora de `READ COMMITTED`. |
| Divergência e custódia legada | Manter evidência e abrir revisão. | HTTP 409 com resultado auditado de revisão, sem alteração dos originais ou das execuções aceitas. |
| Falha de auditoria | Rollback e possibilidade de nova confirmação. | HTTP 503, contagens inalteradas e reenvio bem-sucedido. |
| Administrador, Operador, Analista e RLS | Acesso por papel e proteção da custódia. | Os dois perfis autorizados confirmaram. O Analista e o acesso direto a dados privados foram bloqueados. |
| Reinício e restauração | Preservar dados, custódia e garantias da instalação. | Os dados sobreviveram ao reinício. A restauração integral preservou os fingerprints das linhas, a custódia e a estrutura. Uma segunda restauração falhou com reversão integral. |

| Verificação | Resultado |
| --- | --- |
| Linha de base com isolamento padrão do Node | 271 aprovados, zero falhas e integração PostgreSQL omitida nessa execução. |
| Suíte completa do SENTINELA | 273 aprovados, zero falhas e uma omissão esperada da integração de banco, que passou na execução dedicada. |
| Regressões focadas de prévia, CSV/XLSX, Worker e importação geral | 49 aprovadas. |
| Parser/manifesto Python do receptor v1 | 14 aprovados. |
| XLSX institucional legado | 3 aprovados na suíte completa. |
| Suíte Python do SENTINELA-DADOS | 20 aprovados. |
| Integração HTTP/PostgreSQL | 10 itens TAP aprovados em execução dedicada. O handler real recebeu `Request`; a identidade local era uma fixture. |
| Contratos JSON/OpenAPI e checagem estática de rotas | Aprovados. A checagem resolveu 649 imports locais. |
| TypeScript e ESLint | Aprovados. ESLint com limite de zero avisos. |
| Build de produção | Aprovado na revisão final com Next.js 16.4.6 e Webpack em cópia isolada sem configuração operacional. Foram geradas 20 páginas na etapa estática. |
| Navegador | Aprovado no Edge headless. PCDF v1/v2 no modo integrado com sessão local de Operador em 1366 e 390 px. Pacote incompleto e adulterado, revisão, bloqueio autenticado e anônimo, com contagens de staging, auditoria e custódia intactas. CSV/XLSX genérico aprovado no modo de demonstração, com cenários responsivos a 1366, 768, 390 e 320 px. |
| `git diff --check` e arquivos novos | Aprovados. A checagem de whitespace incluiu arquivos novos e rastreados. |

A execução restrita inicial retornou `spawn EPERM` antes dos testes por arquivo. O executor com subprocessos permitidos executou a suíte com o isolamento padrão por arquivo do Node. As 25 falhas históricas da auditoria, incluindo a preparação de fixtures, não reapareceram na linha de base atual. Os testes de sessão, permissões e XLSX do receptor foram executados na suíte. [Diagnóstico histórico](auditoria-persistencia-idempotencia-pcdf-v2-2026-11-23.md#diagnóstico-das-25-falhas-na-suíte-completa)

A reprodução do teste de persistência usa o cluster novo e a variável `SENTINELA_PCDF_V2_FIXTURE_ROOT` prevista na documentação de implementação. O comando é `node --experimental-transform-types --test tests/pcdf-v2-persistence.test.mjs`. A linha final da suíte Node foi registrada em `%TEMP%/sentinela-pcdf-v2-final-0a920349fbfc4525ac99b638de0e4d6a.tap`.

As primeiras execuções de navegador encontraram espera de compilação e recargas do modo de desenvolvimento. A execução final precompilou as rotas integradas, aguardou a hidratação e manteve o canal de recarga separado. O roteiro genérico preservou todas as asserções e gravou evidências fora da árvore observada pelo Next.js. Os processos Next.js e PostgreSQL da qualificação foram encerrados ao final.

## Backup, restauração e aplicação futura

O ensaio de backup e restauração desta revisão usou dois clusters descartáveis com as mesmas versões PostgreSQL/PostGIS. O dump lógico sintético teve SHA-256 `a0b3586d16b55e80e6a5b219a9169be40e689638222c5dc5c1aa997233f45c78` e foi restaurado com `pg_restore --exit-on-error --single-transaction`. O ensaio comparou fingerprints de 11 tabelas de origem, staging, custódia, revisão, auditoria e domínio, além da estrutura dos dois schemas. A comparação de privilégios considerou o nome do papel, a permissão efetiva e o direito de concessão, inclusive quando a ACL padrão aparecia como nula no clone. Os roles foram preparados separadamente e os acessos privados permaneceram negados. O clone também recusou a migration pela guarda de porta. O relatório operacional de 13/11/2026 registra um backup lógico anterior ao PCDF v2 e sua restauração isolada em outras condições. A revisão acrescenta tabelas, funções e dados de custódia. A qualificação de recuperação do destino pretendido deve incluir essa revisão, a origem XML sob custódia institucional e seu repositório. [Procedimento de backup anterior](../backup-recuperacao-postgresql-local.md)

| Etapa | Conferências obrigatórias |
| --- | --- |
| Antes do backup | Confirmar autorização, identidade do destino, versões PostgreSQL/PostGIS, permissões, política de custódia, espaço para dump/WAL, janela e responsável pela restauração. |
| Backup | Obter snapshot lógico consistente, preservar owners, ACL e metadados de versão, calcular SHA-256 do dump e da custódia externa, guardar em local privado e atestar a leitura integral e a retenção do XML. |
| Restauração de prova | Criar destino novo e atestado. Preparar os roles e a versão das extensões e restaurar com parada ao primeiro erro e transação única. Comparar fingerprints, RLS, policies, ACL efetivas, funções, triggers, constraints, índices e bytes da custódia. |
| Aplicação de migration | Fixar SHA da revisão avaliada para o destino dedicado. Confirmar ledger, baseline e preflight, manter escrita v2 bloqueada, aplicar em transação com timeout e verificar saída e locks. A migration atual é de qualificação sintética e tem guarda de destino. |
| Integridade posterior | Conferir FKs e unicidades, policies e privilégios dos três perfis, contagens anteriores, correspondência de auditoria e custódia, e zero promoção. Repetir ensaio de reenvio e recuperação no destino de homologação. |
| Rollback | Manter o bloqueio de v2. Em erro pré-commit, reverter a transação e reconciliar contagens. Após commit, suspender a aplicação, preservar recibos e auditar a decisão. Restaurar em destino separado se a integridade exigir, reconciliar dados e fazer a troca somente com autorização. |
| Interrupção | Interromper diante de fonte sem aprovação, pacote corrompido, idempotência incerta, auditoria ou rollback divergente, migration sem homologação, recuperação sem prova, duplicação, divergência não tratada ou autorização operacional ausente. |

## Checklist de prontidão

| Estado | Itens |
| --- | --- |
| Concluído | Contratos v1/v2, prévia local, custódia dos seis artefatos, idempotência por origem, reenvios e concorrência no ambiente sintético, staging e trilha de auditoria, proteção por papéis e bloqueio operacional. |
| Pendente | Qualificar a aplicação da instalação no destino dedicado, definir a leitura v2 no histórico e na revisão operacional, dimensionar custódia e WAL com volume sintético representativo, validar guarda e recuperação institucional do XML e inventariar legado avulso. |
| Bloqueado por autorização | Aprovação institucional da fonte e da regra de vínculo, inspeção do destino operacional, backup e recuperação operacionais e execução do piloto real. Ampliação a outras competências e consolidação exigem decisão própria. |

As migrations, o backup, o restore e o handler com escrita só foram ensaiados em PostgreSQL sintético. A evidência sintética usa um lock compartilhado, com serialização das confirmações. A capacidade e o impacto de volume sobre WAL e retenção devem ser medidos antes da janela operacional. A identidade entre XMLs distintos, a classificação analítica e a validação de CRS, datum e coordenadas permanecem dependentes de regras aprovadas. O histórico integrado atual apresenta o fluxo v1. As evidências v2 foram consultadas diretamente na custódia e na auditoria do cluster de ensaio.

## Piloto controlado de janeiro/2021

Após autorização específica, limitar a execução a staging em destino dedicado. Validar a origem institucional e a recuperação dos bytes antes do envio. Conferir por ID e posição os 18 textos originais em cada uma das **6.393 associações** e os snapshots do CSV de 26 colunas. Exigir **6.091 chaves candidatas**, **34 naturezas originais**, **293 chaves com múltiplas naturezas**, zero pendências temporais e dois candidatos a revisão UTM sem GEO. Verificar 6.393 classificações pendentes, somas e recibo auditado. Reenviar o mesmo pacote e exigir o mesmo lote e execução, sem duplicação de origem ou pendências equivalentes. Conferir zero gravações no domínio de ocorrências e associações consolidadas. Formalizar a reconciliação e o encerramento da janela antes de considerar outra competência. [Validação de janeiro](../../../SENTINELA-DADOS/docs/relatorios/validacao-piloto-pcdf-v2-2021-01.md)
