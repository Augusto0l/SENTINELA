# SENTINELA — Gestão de arquivos e ocorrências

Branch `feat/redesign-interface`. A implementação partiu da árvore de trabalho existente com alterações locais. A qualificação usou somente fixtures e PostgreSQL descartável em loopback.

## Auditoria do modelo

- Um lote tem identidade própria e pode ter várias execuções. Competência é um atributo de filtro. A mesma origem técnica pode aparecer em snapshots de lotes diferentes. Uma chave candidata agrupa associações para revisão e a consolidação continua a cargo do fluxo homologado.
- Os bytes custodiados do PCDF v2, as chaves técnicas, os originais e os snapshots estão em tabelas separadas dos vínculos consolidados. A consulta a pacotes usa os nomes e o digest dos seis artefatos custodiados. Nos formatos anteriores, a interface mostra os metadados que existem e o SHA-256 do CSV quando disponível. A aba consiste em consultas e detalhes, sem download.
- O histórico em `/importar` conta tentativas, falhas e reenvios. O catálogo de lotes em `/ocorrencias` usa as mesmas tabelas e auditorias. Falhas anteriores à criação de um lote continuam no histórico de tentativas. A marca de inativação complementa as tentativas com recibo, preservando seus estados originais.
- A consulta operacional de ocorrências, a Central de Revisão, o cadastro manual e os receptores PCDF e geral mantêm suas rotas. A extensão de gestão depende de instalação própria e habilitação sintética. O histórico existente serve como consulta de contingência para sessões de leitura local.

## O que foi implementado

| Área | Comportamento |
| --- | --- |
| Arquivos importados | Nova aba em `/ocorrencias`. Busca por nome ou UUID, competência, situação, intervalo de datas no horário do DF e 25 lotes por página. Lista e detalhes distinguem o total recebido das chaves candidatas e das pendências. |
| Detalhes do lote | Execuções, origem, hashes disponíveis, responsável registrado, histórico e custódia v2. Valores de novas associações e reutilização vêm da classificação técnica preservada no v2. Contratos históricos com métricas indisponíveis mostram o campo sem valor. |
| Inativação de lote | Ação administrativa com detalhes do impacto, justificativa e digitação do UUID. Uma marca de inativação transacional retira os snapshots daquele lote da consulta ativa, preservando os originais, a custódia, as pendências e o histórico. |
| Correção PCDF | O Administrador corrige data, horário, rótulo de natureza para revisão e local textual em uma associação elegível de staging. Os valores efetivos são projetados a partir da auditoria. O CSV original continua acessível nos detalhes. A correção preserva a situação das pendências e a classificação homologada. |
| Edição manual | Administrador e Operador podem corrigir data e horário do cadastro manual em revisão. A validação civil é compartilhada com o cadastro e o banco reconfirma a vigência da RA e a existência do ponto confirmado no território. Endereço, coordenadas e natureza ou naturezas permanecem preservados. |
| Inativação individual | Uma associação de staging é retirada individualmente, preservando as demais naturezas da candidata. A inativação de uma ocorrência manual ou consolidada preserva todas as naturezas e a trilha histórica. Ações de ocorrência exigem justificativa e digitação do UUID. |
| Indicadores | `/ocorrencias` atualiza os snapshots ativos, pendências com origem ainda visível, competências, ocorrência consolidada e opções de natureza e RA. Os totais históricos continuam nos detalhes do lote. Os leitores de Dashboard e Mapa mantêm seus critérios de atividade e qualificação. |

## Integridade e permissões

| Perfil | Direitos no ambiente de qualificação |
| --- | --- |
| Administrador | Consultar lotes e impacto. Corrigir e inativar associações PCDF elegíveis, inativar lotes e ocorrências consolidadas e gerenciar cadastros manuais. |
| Operador | Consultar lotes. Editar e inativar ocorrências manuais em revisão. |
| Analista | Consultar ocorrências conforme a política existente. Acesso à gestão de staging, edição, inativação ou lotes é recusado. |

O handler valida sessão, Host, Origin, perfil, corpo limitado, confirmação e chave de revisão. A conexão verifica banco, porta, sessão, UUID, sistema, horário de inicialização, configuração de leitura e RLS. A migration exige UUID atestado e a porta 55488. Os logins da aplicação recebem só a execução das funções permitidas. O proprietário técnico tem RLS, usa `search_path` fixo e só tem atualização de três colunas no domínio de ocorrências.

A mesma transação registra estado e auditoria. O evento guarda ID, operação, conta da sessão, login, justificativa, data e campos anteriores e posteriores. O gatilho diferido exige correspondência exata entre evento e atualização física da ocorrência após a edição manual ou inativação. As travas da base continuam aplicadas fora do escopo da função de gestão sintética.

O lock de gestão é compartilhado com a recepção PCDF. O servidor recalcula a revisão com as origens, os lotes que continuam sustentando vínculos e o estado consolidado. Com uma origem compartilhada, a cópia ativa continua disponível. Um lote ou snapshot que sustenta um vínculo exclusivo com uma ocorrência ativa recebe bloqueio até que o vínculo seja resolvido pelo fluxo pertinente. Quando um arquivo já inativado é recebido novamente com o mesmo envelope, o receptor devolve o recibo anterior e preserva a inativação. A gestão atual não oferece reativação.

## Arquivos alterados

- Rota, tela, diálogo, responsividade e cliente. [Página](../../src/app/(sistema)/ocorrencias/page.tsx) · [Consulta de ocorrências](../../src/features/occurrences/OccurrenceWorkspace.tsx) · [Arquivos e ações](../../src/features/occurrences/OccurrenceManagement.tsx) · [Estilos](../../src/features/occurrences/OccurrenceWorkspace.module.css) · [Cliente](../../src/features/occurrences/client.ts)
- Backend, permissões, contrato e proteção de logs. [Handler](../../src/app/api/v1/ocorrencias/gestao/route.ts) · [Modo sintético](../../src/lib/db/occurrence-management-mode.ts) · [Conexão atestada](../../src/lib/db/local-occurrences.ts) · [Proxy](../../src/proxy.ts) · [Configuração Next](../../next.config.ts) · [Contrato de gestão](../../src/contracts/occurrence-management.ts) · [Detalhe v1/v2](../../src/contracts/local-occurrences.ts) · [OpenAPI](../contratos/openapi-v0.1.0.json)
- Recepção e integração com o histórico. [Histórico na interface](../../src/features/import/ImportHistory.tsx) · [PCDF](../../src/lib/db/pcdf-direct.ts) · [CSV/XLSX](../../src/lib/db/pcdf-workspace.ts) · [Contrato PCDF](../../src/contracts/pcdf-direct.ts) · [Contrato geral](../../src/contracts/general-import.ts)
- Banco e verificação. [Migration sintética versionada](../../database/local/pcdf-sandbox/0002_occurrence_management_synthetic.sql) · [Provisionador de qualificação](../../database/local/pcdf-sandbox/qualify-management.py) · [Testes HTTP/SQL](../../tests/occurrence-management.test.mjs) · [Análise estática de SQL](../../database/local/tests/test_static.py) · [Playwright](../../scripts/check-occurrence-management-browser.mjs) · [Validação OpenAPI](../../scripts/validate-api-contracts.mjs) · [Teste de contratos](../../tests/api-contracts.test.mjs) · [Inventário de rotas de escrita](../../tests/planned-occurrence-writes.test.mjs)

## Homologação técnica

| Verificação | Evidência |
| --- | --- |
| Node dedicado com PostgreSQL 17.11 e PostGIS 3.6.2 | 9 itens TAP aprovados, incluindo leitura e custódia das seis partes v2, listagem, filtros, paginação, permissões, inativação com pendências, origens compartilhadas, reenvio v2, reenvio geral CSV/XLSX, concorrência, controle de versão, atualização dos indicadores, múltiplas naturezas e rollback de uma falha depois do evento de auditoria. |
| RLS e preservação | As consultas negaram operações diretas a Operador e Analista. Os snapshots PCDF foram comparados antes e depois. O teste verificou a reversão conjunta de evento e marca de inativação e confirmou que a baixa de uma associação mantém sua irmã. |
| SQL estático | 11 testes aprovados com pglast. A migration foi instalada do zero no destino descartável após o ajuste de permissão do gatilho diferido para serializar a geometria em commit. |
| Contratos e rotas | OpenAPI sincronizado com 21 caminhos e 26 operações. A verificação estática resolveu 679 imports. |
| Suíte Node completa | 274 aprovados, zero falhas e três omissões de dados/ambientes opcionais na execução padrão. A integração de gestão passou separadamente no provisionador versionado. |
| TypeScript, ESLint e `git diff --check` | Aprovados. |
| Build final | Aprovado com Next.js 16.4.6 e Webpack em saída de validação, com credenciais operacionais suprimidas. O build incluiu `/ocorrencias` e `/api/v1/ocorrencias/gestao` como rotas dinâmicas. |
| Playwright no Edge | Aprovado em desktop de 1366 px e mobile de 390 px. Busca por lote, detalhe, confirmação pelo identificador, baixa e atualização da situação. Em sessão de Operador, edição e inativação manual com atualização da lista. Em sessão de Analista, consulta de arquivos indisponível. |

As capturas usam lotes e contas sintéticas. [Lista desktop](../evidencias/gestao-ocorrencias-2026-11-24/arquivos-1366.png) · [Lista mobile](../evidencias/gestao-ocorrencias-2026-11-24/arquivos-390.png) · [Confirmação desktop](../evidencias/gestao-ocorrencias-2026-11-24/confirmacao-1366.png) · [Confirmação mobile](../evidencias/gestao-ocorrencias-2026-11-24/confirmacao-390.png)

```powershell
python -X utf8 -B database/local/pcdf-sandbox/qualify-management.py --browser
```

## Limitações e ativação futura

A edição manual nesta versão cobre data e horário. Mudanças de natureza, endereço ou ponto exigem um fluxo de revisão territorial e de vínculos próprio. Associações PCDF já consolidadas são protegidas da correção direta de staging. A Central de Revisão existente continua responsável pelas suas decisões. Os contadores de staging e a auditoria de gestão foram homologados no banco sintético. Dashboards e mapas apontados para destinos operacionais ficaram fora do ensaio.

Antes de ativar gravação real, a instituição deve aprovar a política de competências e vínculos consolidados, a autoridade de correção por perfil, a migration específica para o destino, a revisão de privilégios e RLS, backup e restauração e um piloto de auditoria e rollback. A migration entregue tem guarda sintética. A gravação operacional PCDF v2 continua bloqueada. Nenhuma operação real ou migration operacional foi executada.
