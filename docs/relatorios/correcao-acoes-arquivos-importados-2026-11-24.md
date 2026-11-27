# SENTINELA — Ações em arquivos importados

24 de novembro de 2026 · Rota `/ocorrencias` · Aba **Arquivos importados**

## Causa

A aba tinha dois caminhos de leitura. O histórico integrado reunia as tentativas de envio CSV, XLSX e PCDF e renderizava somente **Ver detalhes**. O catálogo usado na homologação sintética também renderizava somente **Ver detalhes**, com a inativação aninhada naquele diálogo. A correção administrativa PCDF já existia na aba **Registros importados**, sem acesso pela linha do lote e sem filtro por UUID do lote. Os recibos e o catálogo já forneciam UUIDs persistentes. As permissões e a restrição de ambiente estavam aplicadas no serviço de gestão.

## Implementação

- A coluna **Ações** dá acesso a **Ver detalhes**, **Editar registros** e **Excluir arquivo**. Em telas compactas, o botão **Ações** abre o menu da linha e aceita teclado. Administradores veem o motivo de bloqueio em ambientes sem gravação qualificada. Operadores mantêm a consulta aos arquivos dentro de suas permissões. Analistas mantêm o acesso às consultas autorizadas pelo perfil.
- O detalhe identifica competência, volumes e proveniência. No histórico de leitura, as tentativas disponíveis do mesmo lote aparecem juntas. Na homologação, o diálogo também consulta a auditoria persistida e os metadados de custódia.
- A edição usa a consulta de associações existente. O PostgreSQL aplica o UUID do lote antes da paginação. A busca encontra identificação policial, número da linha, natureza, RA, local e UUID da associação. A ação **Editar** abre o formulário PCDF existente para data, horário, natureza e local. A justificativa é obrigatória. Ao gravar, a transação confere o lote da associação e o serviço registra os valores anterior e corrigido. A consulta exibe o valor revisado após confirmar a persistência.
- **Excluir arquivo** abre diretamente a confirmação de inativação do lote. O diálogo mostra arquivo, competência, UUID, associações, candidatas, pendências, compartilhamentos e vínculos consolidados. Exige justificativa e o UUID integral. Vínculos consolidados exclusivos exigem revisão prévia. O pacote PCDF v2 é tratado como um lote com seis artefatos sob custódia. Lotes da mesma competência são gerenciados individualmente.
- A inativação registra a baixa lógica e a auditoria na mesma transação, com bloqueio transacional compartilhado com a importação e verificação da revisão do impacto. Uma repetição da baixa retorna conflito e conserva um único evento. Após a confirmação de gravação, a lista e os indicadores são consultados novamente. A situação **Inativada** permanece no histórico.

## Integração e permissões

| Fluxo | Serviço |
| --- | --- |
| Histórico em ambiente sem gestão | Endpoints existentes de importação geral e PCDF direta |
| Catálogo de lotes, detalhes e impacto na homologação | `GET /api/v1/ocorrencias/gestao` |
| Associações do lote, busca e paginação | `GET /api/v1/ocorrencias/consulta?view=importados&lote=<uuid>` |
| Correção e inativação | `POST /api/v1/ocorrencias/gestao` e função transacional `sentinela_gestao.mutar` |

O serviço de escrita exige ambiente sintético habilitado, sessão local, Host e Origin esperados, perfil autorizado e conexão atestada por banco, porta, UUID, identidade do cluster e horário de inicialização. A função de gestão restringe os logins e conserva a RLS. A conta de demonstração fica fora desse fluxo.

## Verificação

| Verificação | Cobertura |
| --- | --- |
| Suíte Node geral | 274 aprovados e 3 condicionados a fixtures. As duas suítes sintéticas foram executadas separadamente. A prévia com a fixture real ficou fora do ensaio |
| PostgreSQL 17.11 e PostGIS 3.6.2 descartáveis | 12 testes aprovados. Escopo do lote, busca, correção auditada, campos imutáveis, concorrência, rollback, inativação, vínculos, pendências, reenvio, perfis e RLS |
| Persistência PCDF v1/v2 em cluster descartável separado | 10 testes aprovados, incluindo custódia dos seis artefatos, deduplicação, concorrência, reenvio e rollback |
| Playwright com backend persistente | Fluxo em 1440 e 390 px com sessão local, Next.js e PostgreSQL sintéticos |
| Apresentação complementar no Edge | Histórico e lotes em 320, 390, 768, 1024 e 1440 px com leituras controladas. O servidor respondeu com 403 à tentativa de gravação no ambiente sem gestão |
| Verificações estáticas | TypeScript, ESLint, contratos OpenAPI, rotas e whitespace do diff |
| Build de produção | Next.js 16.4.6 com Turbopack aprovado. A leitura de arquivos temporários do projeto exigiu executar o build fora da sandbox |

O teste SQL compara as linhas de origem e confere byte a byte os seis artefatos custodiados antes e depois da correção, da inativação e do reenvio. A inativação de um lote com vínculo consolidado compartilhado preserva o vínculo. Quando o suporte é exclusivo, o servidor retorna conflito. A falha induzida na baixa reverte o evento de auditoria e o estado do lote.

A execução integrada usa `python -B database/local/pcdf-sandbox/qualify-management.py --browser`.

## Evidências do navegador

| Captura | Desktop 1440 px | Mobile 390 px |
| --- | --- | --- |
| Ações do arquivo | [Desktop](../evidencias/correcao-acoes-arquivos-importados-2026-11-24/arquivos-1440.png) | [Mobile](../evidencias/correcao-acoes-arquivos-importados-2026-11-24/arquivos-390.png) |
| Revisão PCDF | [Desktop](../evidencias/correcao-acoes-arquivos-importados-2026-11-24/pcdf-1440.png) | [Mobile](../evidencias/correcao-acoes-arquivos-importados-2026-11-24/pcdf-390.png) |
| Confirmação da inativação | [Desktop](../evidencias/correcao-acoes-arquivos-importados-2026-11-24/confirmacao-1440.png) | [Mobile](../evidencias/correcao-acoes-arquivos-importados-2026-11-24/confirmacao-390.png) |

O Playwright gravou duas revisões de local na mesma associação sintética, conferiu os recibos e releu a auditoria do banco. No mobile, confirmou a baixa do lote e verificou a situação **Inativada**, um único evento no histórico e a redução do indicador de associações ativas de 2 para 1. [Recibos e valores](../evidencias/correcao-acoes-arquivos-importados-2026-11-24/arquivos-importados.json), [lote inativado](../evidencias/correcao-acoes-arquivos-importados-2026-11-24/lote-inativado-390.png).

## Arquivos alterados

- Interface e ícones em `src/features/occurrences/OccurrenceManagement.tsx`, `src/features/import/ImportedFileActions.tsx`, `src/features/import/ImportHistory.tsx`, `src/features/import/ImportedFiles.module.css` e `src/components/NavigationIcon.tsx`.
- HTTP, contratos e banco em `src/proxy.ts`, `src/app/api/v1/ocorrencias/gestao/route.ts`, `src/contracts/local-occurrences.ts`, `src/contracts/occurrence-management.ts`, `src/lib/db/local-occurrences.ts`, `database/local/pcdf-sandbox/occurrences-read.sql` e `database/local/pcdf-sandbox/0002_occurrence_management_synthetic.sql`.
- Testes em `tests/occurrence-management.test.mjs`, `scripts/check-occurrence-management-browser.mjs` e `scripts/check-imported-files-presentation.mjs`.
- Documentação em `docs/contratos/openapi-v0.1.0.json` e `docs/contratos/consulta-ocorrencias-local.md`, mais este relatório e suas evidências.

## Ativação operacional

A autorização operacional permanece pendente. A ativação depende de aprovar o serviço de gestão, os privilégios e as políticas RLS de produção, o plano de banco e a homologação da trilha de auditoria no ambiente de destino. As verificações deste relatório usaram fixtures em loopback. O PostgreSQL operacional e o lote real de janeiro de 2021 ficaram fora do ensaio.
