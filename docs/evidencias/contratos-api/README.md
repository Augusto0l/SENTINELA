# Evidências — Sprint 3, Etapa 3

Validação em 28/10/2026. Branch exclusiva `feat/sprint3-contratos-api`, criada em `626ab00` a partir de `integracao-pedro`. Workspace inicialmente limpo. PR #219 estava aberto na criação da branch. Após a entrega, o usuário integrou esse PR: fetch confirmou `ceub/main` em `2739dbb`, contendo `626ab00`. O destino atual do futuro PR é **main institucional**. Nenhum commit, tag, push, merge, rebase, mudança de autoria ou alteração do PR #219 foi executado pelo agente.

## Resultados

Node 22.23.2, pnpm 10.34.3 (comandos invocados por `corepack pnpm@10.34.3`):

| Verificação | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | Aprovado; lockfile sincronizado |
| `pnpm typecheck` | Aprovado |
| `pnpm lint` | Aprovado, zero avisos |
| `pnpm test` | **83 aprovados**, zero falhas/ignorados; 21 novos testes |
| `pnpm build` | Aprovado; 12 páginas geradas; nenhuma rota `/api/v1` publicada |
| `pnpm generate:openapi` | Aprovado; artefato gerado dos schemas |
| `pnpm validate:contracts` | Catálogos, sincronização, OpenAPI e exemplos aprovados |
| `git diff --check` | Aprovado, sem erro de whitespace |

[Registro estruturado](validacao.json) contém resumo, versões, referência Git, ID do build e hash SHA-256 da especificação. São resultados observados na execução local, sem declaração de homologação institucional.

OpenAPI 3.1.1 validado com Swagger Parser 13.1.0. AJV 8.20.0 com ajv-formats 2.1.1 valida o JSON Schema dos **23 modelos**; Zod valida os mesmos exemplos e refinamentos. Há **11 caminhos**, **13 operações planejadas** e **29 exemplos de payloads** de operações/erros verificados, além dos exemplos dos modelos. O teste de sincronização impede manter o JSON gerado divergente do código.

Os 21 testes cobrem atributos obrigatórios/opcionais/anuláveis, datas/horários, pares de coordenadas e finitude, IDs e catálogos, múltiplas naturezas, atualização/inativação, paginação/ordenação e decodificação HTTP, filtros combinados, adaptadores sem perda de informação, arquivos e limite de 50 MB, mapeamento, CSV/XLSX interpretados pelo código da Etapa 1, linhas inválidas, contagens/duplicatas/pendências, resultados não persistidos, estados/falhas de lote, agregações e dados para pontos/calor/clusters, envelopes de erro e exemplos OpenAPI. A suíte completa inclui as regressões anteriores, inclusive os quatro fusos da Etapa 2 e os limites de 10 mil linhas da Etapa 1.

## Preservação e limites da validação

Não houve alteração em `src/features`, `src/components`, `src/data`, `src/app`, nos testes anteriores, nos catálogos, no GeoJSON ou nos arquivos PCDF. O endpoint real de geocodificação mantém o contrato anterior. As únicas dependências novas são validadores de desenvolvimento; Zod já existia. Foi escolhida ajv-formats 2.1.1 para respeitar o peer do resolver instalado.

O sandbox inicialmente bloqueou subprocessos do runner Node com `spawn EPERM`; a suíte completa foi executada com sucesso fora dessa restrição. A instalação congelada inicial sem o mesmo acesso ao store abortou antes de remover módulos por ausência de TTY; a execução com o mesmo acesso usado na instalação dos validadores passou. Não houve mudança de política Windows, SWC ou configuração Git.

Não foi feita nova homologação visual: não houve alteração de interfaces. As evidências visuais da Etapa 2 são históricas e não são apresentadas como nova rodada. Nenhuma chamada aos endpoints planejados, persistência ou transação é comprovada por estes testes. Os builders são demonstrativos; autorização e critérios operacionais ainda serão implementados.

A API do GitHub não autenticada retornou 404. A revisão automática rejeitou reutilizar a credencial do Git para consultar a API sem autorização específica; nenhuma credencial foi extraída. O fetch de `ceub` funcionou e a base foi escolhida com o histórico atualizado mais a confirmação do usuário. Critérios remotos das issues permanecem pendentes; a rastreabilidade usa os documentos locais, sem presumir aceite.

## Inventário completo

Modificados:

- `package.json`
- `pnpm-lock.yaml`
- `scripts/validate-contracts.mjs`
- `sprints/sprint-03.md`

Criados:

- `src/contracts/common.ts`
- `src/contracts/occurrences.ts`
- `src/contracts/imports.ts`
- `src/contracts/analytics.ts`
- `src/contracts/adapters.ts`
- `src/contracts/examples.ts`
- `src/contracts/openapi.ts`
- `scripts/contracts-runtime.mjs`
- `scripts/generate-openapi.mjs`
- `scripts/validate-api-contracts.mjs`
- `tests/api-contracts.test.mjs`
- `docs/contratos/api-v0.1.0.md`
- `docs/contratos/openapi-v0.1.0.json`
- `docs/decisoes/adr-contratos-executaveis-api.md`
- `docs/evidencias/contratos-api/README.md`
- `docs/evidencias/contratos-api/validacao.json`

## Parecer e próximo PR

**APTO para commit da Etapa 3**, no escopo de contratos propostos, aguardando a auditoria solicitada. Revisar limites técnicos propostos e pendências de homologação no [relatório técnico](../../contratos/api-v0.1.0.md). Não é conclusão integral da Sprint 3 ou do backend.

Após revisão e versionamento manual, abrir `feat/sprint3-contratos-api` → `main` no repositório institucional. Conferir que os commits/diff do PR sejam somente da Etapa 3 e associar as issues conforme critérios confirmados. O merge de #219 preservou `626ab00` como ancestral da main; não foi necessário integrar ou reescrever a branch local. Responsável planejado não equivale à autoria de commits: a configuração Git não foi alterada.
