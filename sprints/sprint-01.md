## Período
* Data início: 21/09/2026
* Data Fim: 27/09/2026

## Objetivo
O foco e objetivo principal da sprint é o Setup Next.js 14, Tailwind, shadcn/ui, Design System e Mapeamento de Regras, estabelecendo a Fundação Web e Regras de Negócio do sistema

Revisão técnica e homologação final realizadas em 09/10/2026, sem alterar o período original. O requisito Next.js 14+ é atendido pela versão 16.3.6 existente; não houve downgrade. Esta sprint entrega fundação e contratos de um protótipo demonstrativo, não um sistema operacional.

## Milestone
* Épico 01: Fundação Front-end e Identidade Visual (EP01)
* Épico 05: Governança, Contratos e Qualidade (EP05)

## Itens planejados
* **ISSUE-01**: Setup inicial do projeto Web, Next.js 14+ e Design System.
* **ISSUE-02**: Páginas e Mocks do Layout Base.
* **ISSUE-03**: Padronização Visual, Responsividade e Feedbacks.
* **ISSUE-11**: Formalização de Catálogos, Regras e Perfis Supabase.

## Responsáveis
* **Pedro Augusto**:
  * **ISSUE-01**: Setup inicial do projeto Web, Next.js 14+ e Design System
  * **ISSUE-02**: Páginas e Mocks do Layout Base
  * **ISSUE-03**: Padronização Visual, Responsividade e Feedbacks
  * **ISSUE-11**: Formalização de Catálogos, Regras e Perfis Supabase

## Entregas
As cinco entregas abaixo pertencem ao planejamento original. A avaliação de execução aparece em seguida; esta lista não implica aprovação de todos os critérios.

* Repositório inicializado no GitHub, com Next.js 14+ (App Router), Tailwind CSS e componentes shadcn/ui configurados para o layout base (Sidebar + Topbar).
* Telas mockadas de Login, Dashboard, Mapa Criminal, Ocorrências, Importação e Usuários criadas com suporte a prototipação rápida.
* Interface ajustada para responsividade (resoluções de 1366x768 até 1920x1080) em Desktop, Notebook e Tablet, com componentes de loading (skeletons) e notificações (toasts).
* Documento/Arquivo JSON contendo a lista padronizada de RAs do DF e Naturezas criminais elaborado.
* Matriz de regras de deduplicação e matriz de permissões/políticas para os perfis Administrador, Operador e Analista definidas.

Entregas verificadas na revisão:

| Issue | Evidência implementada | Status final |
| --- | --- | --- |
| ISSUE-01 | App Router/TS/Tailwind preservados; `components.json`, componentes `src/components/ui`, `eslint.config.mjs`, scripts Next/Vercel e CI Linux | Concluída no escopo técnico: npm run build aprovado com fallback WASM/Webpack e, na rodada final, Turbopack/nativo. CI remota não executada |
| ISSUE-02 | Login demonstrativo e oito rotas presentes; contagens derivadas do mesmo mock; banner, feedbacks explícitos e navegação | Concluída: oito rotas HTTP 200, renderização e navegação homologadas no servidor de produção |
| ISSUE-03 | Grades adaptativas, Sidebar compacta, Topbar, foco, labels, diálogos Radix, menu em portal, skeletons e toasts | Concluída: cinco resoluções verificadas; paginação/KPI corrigidos; diálogos, foco, teclado, skeletons e toasts testados |
| ISSUE-11 | `docs/contratos/catalogos-v0.1.0.json` e `docs/contratos/deduplicacao-permissoes-v0.1.0.md` | Concluída no escopo documental: contratos versionados, pendências de homologação explícitas; nenhuma integração Supabase/RLS implementada |

Detalhamento das alterações e inventário completo de arquivos: `docs/finalizacao-sprint-01-2026-10-09.md`. Classificação dos quinze achados antes de alterações: `docs/sprint-01-escopo.md`.

## Issues concluídas

* **ISSUE-11**: concluída como proposta documental para implementação posterior. Catálogos usam IDs internos, fontes locais identificadas e validação oficial pendente; RA-S/Ponte Alta é explicitamente demonstrativa. Contrato cobre múltiplas naturezas, cobertura de dados agregados/individuais, preservação de originais, revisão de duplicidades, rastreabilidade e proposta RLS para os três perfis.
* **ISSUE-01, ISSUE-02 e ISSUE-03**: concluídas no escopo demonstrativo após homologação final. Build aprovado, 40 verificações HTTP/render e 13 funcionais aprovadas no Chrome. Isso não equivale a encerrar issues no GitHub; nenhuma alteração remota foi feita.

## Pull requests aceitos

Não foram comprovados pull requests aceitos para estas alterações. Nenhum PR, commit, push ou deploy foi criado nesta revisão. O HEAD inspecionado foi `e91aa80`; a migração Next.js já existia no histórico (`832e5f7`). As alterações da revisão permanecem no diretório de trabalho.

## Evidências

* `npm run typecheck`: aprovado após correção da tipagem da posição do tooltip em `src/components/map/MapaDF.tsx`.
* `npm run lint`: aprovado sem erros/avisos, incluindo regra de associação de labels. Pendências iniciais de refs durante renderização, callback de efeito, export anônimo e ícone sem uso foram corrigidas.
* `npm test`: quatro testes aprovados (intervalos, combinação de filtros, conservação de contagens e resultado vazio); execução fora do sandbox porque o runner inicialmente recebeu `spawn EPERM`.
* `npm run validate:contracts`: JSONs válidos; catálogo com 37 áreas internas, oito naturezas e IDs únicos; pendências institucionais explícitas.
* `npm run check:routes`: oito rotas presentes e 74 imports locais resolvidos. Verificação estática, sem comprovação HTTP.
* `npm run check:styles`: CSS processado por PostCSS/Tailwind, sem avisos; não substitui o build Next.js.
* `pnpm install --offline --frozen-lockfile`: aprovado fora do sandbox com pnpm 12.9.1 instalado no ambiente. Toolchain declarada permanece pnpm 10.34.3; ambos suportam `allowBuilds`. O hook opcional `unrs-resolver` foi explicitamente negado em `pnpm-workspace.yaml`, sem liberar execução geral de scripts.
* `npm run build`: aprovado na homologação final. Tentativas iniciais falharam por Code Integrity; Webpack/WASM foi validado sem alterar políticas. A compilação final também passou com Turbopack/nativo quando o mesmo binário voltou a carregar. Evidências em `docs/evidencias/sprint-01/swc-diagnostico.json`, `build.log` e `BUILD_ID.txt`.
* `npm run dev -- --port 3001`: tentativa histórica falhou por SWC; não foi reexecutada na homologação final. A execução final usou `npm run start -- --port 3001` sobre build de produção aprovado, com as oito rotas funcionando.
* `docs/auditoria-2026-10-09.md`: relatório histórico preservado integralmente.
* `.github/workflows/quality.yml`: verificações Linux preparadas; nenhuma execução remota foi confirmada.
* `node scripts/homologate-sprint1.mjs`: rodada final com 40 verificações HTTP/render (oito rotas × cinco resoluções) e 13 funcionais aprovadas. Chrome 154.0.8037.98, 49 capturas, zero erros JavaScript de página/console e zero respostas HTTP de erro. Uma requisição RSC foi cancelada com `net::ERR_ABORTED` durante navegação, sem falha dos testes; registro preservado.
* Homologação visual: 1920×1080, 1366×768, 768×1024, 1024×768 e 1200×800; inspeção das capturas e verificações DOM. Tabelas extensas usam rolagem própria. Foco preso, Escape, retorno de foco, skip link e seleção de RA por Enter aprovados.
* Contagens reais da base fictícia no navegador: dashboard, mapa e listagem com 790 registros; filtro Furto com 238.
* Índice de evidências: `docs/evidencias/sprint-01/README.md`; resultados finais: `docs/evidencias/sprint-01/final/resultados.json`.

## Impedimentos

Não permanecem impedimentos técnicos de build, HTTP ou responsividade para o encerramento do escopo da Sprint 1 nesta homologação.

* O bloqueio nativo inicial foi comprovado pelos eventos Code Integrity 3077/3033. O fallback oficial WASM/Webpack funcionou. Em rodada posterior o mesmo binário nativo voltou a carregar; hash e versão não mudaram e nenhuma política foi alterada pelo agente. A causa da mudança de comportamento não foi determinada; o fallback reproduzível foi mantido.
* CI remota, outros navegadores, certificação formal WCAG e testes de carga não foram executados; não são declarados aprovados.
* Homologação institucional dos catálogos, tolerâncias, escopos e inativação pelo Operador continua pendente no contrato para implementação posterior. A ISSUE-11 entrega a proposta documental, conforme o escopo.

## Retrospectiva

* A configuração histórica de Vite não representava o código atual em Next.js; instruções, scripts e documentação foram alinhados à arquitetura real.
* Mocks úteis para validação visual devem anunciar seus limites. Foram removidas confirmações de persistência inexistente e senhas pré-preenchidas, preservando os fluxos demonstrativos.
* Contagens derivadas da mesma base evitam divergência entre mapa, dashboard e listagem. Séries e variações herdadas continuam ilustrativas e identificadas.
* A matriz visual de perfis estava invertida para ações de escrita entre Analista e Operador; a prévia foi corrigida, sem implementar controle de acesso fora do escopo.
* Typecheck, lint, testes e CSS aprovados não substituem build, homologação visual ou autorização no servidor. A etapa final acrescentou build/HTTP/navegador, mantendo autorização real fora do escopo.
* A inspeção visual encontrou KPI com texto longo fora do card e paginação recortada; ambos foram corrigidos e retestados. O favicon ausente e a mensagem incorreta de aplicação automática de tema também foram corrigidos.
* As primeiras falhas de seletores do roteiro foram diferenciadas de defeitos da aplicação e preservadas nas evidências, sem contar testes não realizados como aprovados.

## Próximas ações
A Sprint 1 está tecnicamente apta ao encerramento no escopo demonstrativo. As evidências ficam disponíveis para revisão acadêmica/organizacional; nenhuma aprovação humana ou aceite de PR foi inventado.

* Executar a CI remota quando as alterações forem submetidas por ação autorizada.
* Obter homologação institucional dos catálogos e regras antes da implementação operacional.
* Preservar a identificação de demonstração e os contratos versionados na Sprint 2.

Preparação para a execução da Sprint 2 (Semana 2), focada nos Fluxos Operacionais e Geocodificação UI (EP02 e EP03):
* **ISSUE-04**: Implementação da consulta, pesquisa, ordenação e filtros de ocorrências (tabela paginada e modal de detalhamento).
* **ISSUE-05**: Construção dos formulários de cadastro, edição e inativação manual de ocorrências com validação de campos obrigatórios.
* **ISSUE-10**: Aplicação das restrições de navegação e ocultação de botões por perfil (Administrador, Operador e Analista).
* **ISSUE-06**: Desenvolvimento do componente de mapa interativo via Leaflet para obtenção de coordenadas e ajuste manual de marcadores.

Backlog adicional preservado: transformação de cliques SVG (A04); validação/sincronização de coordenadas e anexos (A10); pipeline real CSV/XLSX/deduplicação (A02); autenticação, autorização/RLS e auditoria (A08); segurança da conta/sessões e persistência de preferências (A09); análises históricas, relatórios e controles geográficos operacionais (A06/A13); revisão de HTML interpolado em mapas legados antes de dados externos (A15). Ver `docs/sprint-01-escopo.md`.

Parecer final: **a Sprint 1 está apta ao encerramento técnico conforme seu escopo original de fundação e contratos demonstrativos**. Build, oito rotas e layouts/fluxos nas resoluções planejadas foram homologados em 09/10/2026. Não há impedimento técnico remanescente identificado nesta execução. Aprovação acadêmica/organizacional não foi registrada automaticamente; a prontidão operacional permanece fora do escopo.
