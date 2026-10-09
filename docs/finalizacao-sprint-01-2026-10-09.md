# Revisão de finalização da Sprint 1 — SENTINELA

Revisão e homologação final: 09/10/2026. Período planejado preservado: 21/09/2026 a 27/09/2026. Épicos EP01 e EP05. Esta revisão não atesta entregas realizadas dentro do período original. Nenhum commit, push, PR ou deploy foi executado.

## A. Resumo geral

Foram lidos integralmente a auditoria e o planejamento da Sprint 1; foram inspecionados App Router, TS/Tailwind, dependências/lockfile, rotas e wrappers sem SSR, telas, componentes compartilhados/mapas, requisitos e arquitetura. Os quinze achados foram classificados antes das alterações em `docs/sprint-01-escopo.md`.

Correções: instruções reais de Next.js; publicação manual Vercel sem saída Vite; shadcn/ui configurado manualmente com componentes locais no padrão Radix; lint e CI; login demonstrativo; identificação permanente de dados fictícios; feedbacks sem promessa de gravação; base única de contagens e filtros demonstrativos; fonte temporal identificada; alinhamento visual do canvas ao SVG com observação de tamanho; layouts adaptativos; rótulos/foco; diálogos e menu sem recorte pela tabela; skeletons/toasts; prévia consistente de permissões; contratos versionados da ISSUE-11.

Preservados: versão Next.js 16.3.6, estrutura funcional das telas, dados/fontes/cartografia existentes e implementações legadas. Dependências d3/Leaflet/Recharts foram mantidas porque são utilizadas por componentes existentes, mesmo quando alguns são legados. Nenhum banco, autenticação, RLS ou processamento definitivo foi implementado.

Resultado da etapa final: build, oito rotas HTTP/renderizadas e cinco resoluções homologados. Foram corrigidos somente defeitos confirmados (KPI, paginação, favicon e texto de tema) e acrescentada uma alternativa reproduzível de compilação para o bloqueio nativo. CI remota, outros navegadores e certificação formal WCAG não foram executados. Homologação institucional de catálogos/regras segue como etapa posterior. Séries e variações herdadas continuam ilustrativas; o sistema permanece um protótipo.

## B. Resultado por issue

| Issue | Critérios atendidos e principais arquivos | Evidência/validação | Status |
| --- | --- | --- | --- |
| ISSUE-01 | Next/App Router, TS estrito e Tailwind preservados; aliases, `components.json`, `src/components/ui`, `src/lib/utils.ts`; layout compartilhado; scripts Next/Vercel; lint/CI; AGENTS/README atuais | Typecheck, lint, instalação congelada e build aprovados; fallback WASM/Webpack testado e build final Turbopack/nativo aprovado. Workflow não executado remotamente | Concluída no escopo técnico |
| ISSUE-02 | `/login` criado; oito rotas presentes; Sidebar/Topbar consistentes; carregamentos e erro; banner global; `demoAnalytics.ts`/`demoStats.ts`; contagens compartilhadas e filtros fictícios; confirmações honestas nas telas | 40 verificações HTTP/render (oito rotas em cinco resoluções), navegação e contagens coerentes aprovadas; quatro testes unitários aprovados | Concluída |
| ISSUE-03 | `src/index.css` com breakpoints, foco e texto secundário legível; telas com grades adaptativas; labels; diálogo/drawer Radix; seleção de RA e prioridade por teclado; toast/skeleton; menu em portal | 49 capturas finais e verificações de layout/foco/teclado; correções confirmadas retestadas. Não é certificação formal WCAG | Concluída no escopo de homologação |
| ISSUE-11 | JSON com 37 áreas internas e oito naturezas, IDs/versionamento/fontes/pendências; contrato de deduplicação, originais, múltiplas naturezas, cobertura, revisão, importação e perfis/RLS propostos; prévia de perfis corrigida | `validate:contracts` aprovado; inspeção documental. RA-S é demonstrativa, códigos oficiais não inventados; homologação futura explicitada | Concluída no escopo documental |

As quatro issues atendem ao escopo técnico/documental da Sprint 1 após a homologação final. A ISSUE-11 não significa homologação oficial dos catálogos nem implementação de RLS. O estado remoto das issues do GitHub não foi alterado.

## C. Arquivos modificados

O inventário da revisão inicial aparece ao fim deste documento; as alterações adicionais e artefatos da homologação estão discriminados na seção G. Nenhum arquivo de produto ou documento histórico foi excluído. Scripts temporários usados para aplicar/verificar alterações foram removidos do workspace e não são entregas. `docs/auditoria-2026-10-09.md` já estava não commitado antes desta tarefa e foi preservado integralmente.

## D. Testes e resultados reais

| Comando | Resultado final | Limite/observação |
| --- | --- | --- |
| `pnpm install --offline --frozen-lockfile` | Aprovado fora do sandbox, lockfile atualizado e dependências presentes | pnpm local 12.9.1; ferramenta declarada 10.34.3 não foi executada nesta máquina |
| `npm run typecheck` | Aprovado | Checagem final após alterações de UI |
| `npm run lint` | Aprovado, zero erros/avisos | Config Next/TS com associação de labels; não certifica WCAG |
| `npm test` | Quatro testes aprovados | Reexecutado fora do sandbox por `spawn EPERM`; filtros e agregações, sem teste de navegador |
| `npm run validate:contracts` | Aprovado | JSONs e invariantes de catálogo; não valida autoridade institucional |
| `npm run check:routes` | Aprovado: oito rotas, 74 imports locais | Inspeção estática; não prova execução das rotas |
| `npm run check:styles` | Aprovado: PostCSS/Tailwind, zero avisos | Não substitui build, renderização ou contraste medido |
| `git diff --check` | Aprovado | Git avisou normalização LF/CRLF do lockfile, sem erro de whitespace |
| `npm run build` | Aprovado | Rejeição inicial comprovada; fallback oficial Webpack/WASM aprovado; compilação final também aprovada com Turbopack/nativo |
| `npm run dev -- --port 3001` | Falhou | Fora do sandbox chegou a anunciar disponibilidade, mas encerrou por SWC; não foi tratado como sucesso |
| `npm run start -- --port 3001` e HTTP | Aprovados | Servidor de produção; todas as oito rotas HTTP 200 e renderizadas |
| Homologação em navegador | Aprovada no escopo testado | Chrome 154.0.8037.98; cinco resoluções; 40 verificações de rota/render e 13 funcionais |
| CI GitHub Actions | Preparada, não executada nesta revisão | Não houve push/PR; nenhum status remoto inventado |

Falhas corrigidas durante a revisão:

- `MapaDF.tsx`: ESLint detectou leitura de refs durante renderização de tooltip. A largura passou a ser capturada no evento, e a tipagem foi ajustada. Uma atribuição inicial sem `width` foi detectada pelo TypeScript e corrigida; typecheck final passou.
- `RALayer.tsx`: dependência `onSelectRA` ausente em efeito; adicionada sem remover a implementação legada.
- `postcss.config.mjs`: export anônimo sinalizado; configuração agora nomeada.
- `ImportarDados.tsx`: ícone não utilizado; removida apenas a definição sem uso, preservando o ícone exibido no upload.
- Instalações iniciais: acesso ao registro npm falhou no sandbox; foram repetidas fora dele. Instalação de lint baixou dependências, mas reportou hook não revisado de `unrs-resolver`; o hook opcional foi explicitamente negado em `pnpm-workspace.yaml`, e instalação offline congelada passou. Essa configuração não libera scripts globalmente. pnpm também avisou depreciação do ESLint 9; o lint funciona com a configuração instalada, mas atualizar o tooling deverá ser considerado em manutenção.
- `npm test` e `next dev`: criação de processos inicialmente bloqueada por `spawn EPERM`; repetição escalada permitiu testes, mas o servidor continuou impedido por SWC.

Nenhuma proteção do Windows foi desativada ou modificada. A aprovação final de build foi obtida pela execução real de `npm run build`, além das verificações estáticas. Não foi concluída auditoria de vulnerabilidades de dependências nesta tarefa.

## E. Backlog preservado

| Achados/área | Entrega posterior |
| --- | --- |
| A01/A10 — cadastro e dados | Persistência, edição/inativação, validação completa, anexos, sincronização pin/coordenadas, aproximação versus endereço confirmado; ISSUE-05 |
| A04 — transformação de cliques | Corrigir conversão pela matriz SVG e homologar localização/limites; ISSUE-06 |
| A02 — importação | Parser real CSV/XLSX, validação estrutural/servidor, mapeamento aplicado, revisão, deduplicação/idempotência e transações |
| A08 — acesso e auditoria | Supabase Auth, autorização no servidor, RLS e logs reais; ocultação/navegação por perfil na ISSUE-10 |
| A09 — conta/preferências | Senha, MFA, sessões, persistência e aplicação real de preferências; telas atuais são ilustrações |
| A06/A13 — análises/controles | Histórico e comparação por fonte/período, relatórios/exportação, zoom/localização e exploração de clusters; métricas fictícias não valem como análise real |
| A15 — componentes legados | Escape/DOM seguro nos popups e revisão do uso de estatísticas antes de integrar dados externos |
| Listagem | Ordenação, detalhe e fluxo completo de consulta/edição; ISSUE-04 |
| Infraestrutura | CI real/build, publicação autorizada, monitoramento, backup/recuperação e escala |
| Contratos | Homologar fontes, catálogos, natureza principal, escopos, tolerâncias, cobertura entre fontes e retenção |

Os controles não implementados apresentam aviso ilustrativo ou indisponibilidade; isso não é registrado como resolução da funcionalidade operacional. A05/A11/A12 receberam homologação de renderização, layout e fluxos de teclado no Chrome nas resoluções registradas. Não há certificação formal WCAG nem teste em todos os navegadores. Densidade de rótulos e funcionalidades geográficas operacionais continuam limitações do protótipo, sem impedir os fluxos de fundação testados.

## F. Parecer

**A Sprint 1 está apta ao encerramento técnico no escopo original de fundação web e contratos demonstrativos.** ISSUE-01/02/03 tiveram build, HTTP e interface homologados; ISSUE-11 foi entregue como proposta documental versionada. O documento original preserva período, responsáveis e estrutura. Não foi inventada aprovação acadêmica/organizacional, aceite de PR ou mudança de estado remoto.

Não há impedimento técnico remanescente identificado pelos testes executados. CI remota, homologação institucional de catálogos e funcionalidades operacionais futuras continuam explicitamente fora da aprovação desta execução. O SENTINELA permanece um protótipo, sem autenticação, persistência ou processamento definitivo.

## G. Homologação final — evidências verificáveis

### Diagnóstico e solução do SWC

Mensagem exata inicial: `Uma política de Controle de Aplicativo bloqueou este arquivo.` Código `ERR_DLOPEN_FAILED`, arquivo `next-swc.win32-x64-msvc.node`. Eventos Windows Code Integrity **3077/3033** indicaram requisitos de assinatura Enterprise/política de integridade. O addon estava instalado como versão 16.3.6, Windows x64, correspondente ao Next 16.3.6 e ao Node 22.23.2 (mínimo do Next: >=20.9.0). O arquivo não tinha assinatura Authenticode e foi observado apenas o stream `$DATA`, sem `Zone.Identifier`; não foi executado Unblock-File nem alteração de política.

O cache de download do fallback (`next/wasm/@next/swc-wasm-nodejs`) existia vazio. O Next não repetia a extração ao encontrar essa pasta. Foi instalada a dependência oficial **@next/swc-wasm-nodejs 16.3.6**, preenchido o cache com os arquivos dessa mesma versão e validado `next build --webpack`. Não foi editado código de dependências nem alterado o binário bloqueado. `scripts/next-cli.mjs` torna o reparo de arquivos ausentes reproduzível e escolhe Webpack/WASM apenas se o addon nativo falhar com `ERR_DLOPEN_FAILED` no Windows; nos demais casos mantém o compilador nativo/Turbopack.

O build com fallback terminou com sucesso. Em rodada posterior, `npm run build` também passou com Turbopack/nativo e o carregamento direto do mesmo addon passou. **O hash permaneceu 7a9c553cb7efe1fd2529aa8c18e17d02cd80dfdb49a6b99ddfc75ef1e888d8dc. A causa da mudança de comportamento do Windows não foi determinada.** Nenhuma alteração de arquivo nativo, assinatura, proteção ou política foi feita pelo agente; não atribuir o resultado a desbloqueio manual. O fallback aprovado foi mantido para lidar com eventual repetição da rejeição.

Diagnóstico completo: `docs/evidencias/sprint-01/swc-diagnostico.json`. Log da compilação WASM: `docs/evidencias/sprint-01/build.log`. Compilação final homologada: **BUILD_ID SxGPL1dyeD6AaN9ogP5ZK**, registrada em `BUILD_ID.txt`.

### HTTP, renderização e responsividade

Servidor usado: `npm run start -- --port 3001`, sobre build de produção aprovado. Navegador: **Chrome 154.0.8037.98**, headless com sandbox ativo, locale pt-BR e fuso America/Sao_Paulo. Nenhum navegador foi baixado; utilizou-se o Chrome instalado com Playwright Core.

| Rota | HTTP/renderização | Resoluções verificadas |
| --- | --- | --- |
| `/login` | 200; aprovado | Todas as cinco |
| `/dashboard` | 200; aprovado | Todas as cinco |
| `/mapa-criminal` | 200; aprovado | Todas as cinco |
| `/ocorrencias` | 200; aprovado | Todas as cinco |
| `/ocorrencias/nova` | 200; aprovado | Todas as cinco |
| `/importar` | 200; aprovado | Todas as cinco |
| `/usuarios` | 200; aprovado | Todas as cinco |
| `/configuracoes` | 200; aprovado | Todas as cinco |

Resoluções: **1920×1080, 1366×768, 768×1024, 1024×768 e 1200×800**. Foram 40 verificações de rota/renderização, sem falha; 49 capturas finais, inspeção visual e métricas DOM. Grades/painéis, Sidebar, Topbar, formulários e tabelas foram verificados; tabelas extensas conservam rolagem própria. A verificação não é uma certificação formal WCAG nem homologação de Firefox/Safari/Edge.

### Fluxos funcionais executados

**13 verificações aprovadas**, registradas em `docs/evidencias/sprint-01/final/resultados.json`:

1. Login e toast explícito de demonstração.
2. Navegação por todos os destinos da Sidebar.
3. Contagens iguais: **790** no dashboard, mapa e listagem.
4. Filtros e estado vazio; **238** ocorrências fictícias ao filtrar Furto.
5. Paginação visível e funcional; avanço de DEMO-000001 para DEMO-000026; KPI contido no card.
6. Diálogo no notebook: Tab, foco preso, Escape e retorno de foco.
7. Mesmo fluxo no tablet, com diálogo dentro do viewport.
8. Usuário fictício e aviso de que nenhuma conta real foi criada.
9. Menu em portal e drawer por teclado.
10. Skip link, foco visível e seleção de RA com Enter.
11. Importação/configurações explicitamente simuladas, senhas vazias e prévia de tema.
12. Validação visual, descarte e conclusão de cadastro sem gravação.
13. Skeleton observado com atraso controlado de 350 ms nas respostas JS.

Resultado final: zero erros JavaScript de página, zero erros de console e zero respostas HTTP de erro. **Uma requisição RSC de `/mapa-criminal` foi cancelada com `net::ERR_ABORTED` durante a sequência de navegação.** O registro foi preservado; a página renderizou nas cinco resoluções, a navegação e os testes passaram. O cancelamento não foi omitido nem contado como falha crítica de renderização.

### Erros confirmados e correções desta etapa

| Problema | Correção | Evidência |
| --- | --- | --- |
| KPI Sudoeste/Octogonal ultrapassava o card no notebook/tablet | Quebra de texto na grade de KPI, preservando os valores | Capturas inicial/final; largura de conteúdo = largura do card (206 px no notebook) |
| Tabela recortava a paginação | Card flexível, tabela com rolagem interna e rodapé sem encolhimento | Rodapé em y=689,75, altura 16,5 no viewport 768; avanço de página testado |
| Favicon ausente produzia 404 | SVG local e referência em Metadata | Nenhuma resposta HTTP de erro na rodada final |
| Configurações afirmavam aplicar tema automaticamente | Texto alterado para prévia demonstrativa sem aplicação global | Seleção Claro e mensagem verificadas no navegador |
| Roteiro inicial tinha seletores inadequados | Seletores ajustados para ícones nos nomes acessíveis e alerta específico | Rodadas inicial, reteste e final preservadas; falhas iniciais não contabilizadas como aprovações |

Arquivos ajustados/criados nesta etapa: `package.json`, `pnpm-lock.yaml`, `scripts/next-cli.mjs`, `scripts/homologate-sprint1.mjs`, `src/features/Occurrences.tsx`, `src/index.css`, `src/features/Configuracoes.tsx`, `src/app/layout.tsx`, `public/icons/sentinela.svg`, `README.md`, `sprints/sprint-01.md`, este relatório e os artefatos sob `docs/evidencias/sprint-01`. Os JSONs de resultados enumeram as capturas exatas; o índice de evidências descreve cada execução.

Validações finais adicionais: `npm run lint` e `npm run typecheck` aprovados; `npm test` com quatro testes aprovados; `pnpm install --offline --frozen-lockfile` aprovado; contratos JSON e imports verificados. A CI remota não foi executada. A auditoria original foi preservada com SHA-256 **810A65A61FBFE48EBD5D3F0618108C6784846389FF24D4D7468A3B564CDB4530**.

Referências primárias: [Next.js — fallback WASM e Webpack](https://nextjs.org/docs/app/api-reference/turbopack#supported-platforms), [diagnóstico de SWC](https://nextjs.org/docs/messages/failed-loading-swc) e [Playwright — navegadores instalados](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge).

## Referências técnicas consultadas

Os componentes foram configurados manualmente segundo a [documentação shadcn/ui](https://ui.shadcn.com/docs/installation/manual), com adaptações locais. O lint segue a [configuração Next.js/ESLint](https://nextjs.org/docs/app/api-reference/config/eslint). A publicação planejada usa [Next.js na Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs). O bloqueio explícito do hook opcional segue o suporte a `allowBuilds` descrito em [pnpm Build Settings](https://pnpm.io/settings/build).

## Inventário da implementação anterior

O inventário abaixo corresponde à revisão de implementação anterior: 36 arquivos alterados e 24 criados. Os ajustes e as evidências adicionais da homologação estão na seção G. Nenhum arquivo de produto excluído.

| Estado | Arquivo | Finalidade |
| --- | --- | --- |
| Alterado | `.figma/make/dev.json` | Comentários de HMR alinhados a Next.js; observar configuração pnpm para reinstalação. |
| Alterado | `.figma/make/site.json` | Descrição do projeto corrigida para SENTINELA e estado demonstrativo. |
| Alterado | `.figma/make/deploy` | Publicação manual de produção com CLI Vercel, sem dist/Vite. |
| Alterado | `.figma/make/deploy-preview` | Publicação manual de preview Vercel, sem argumento --mode do Vite. |
| Criado | `.github/workflows/quality.yml` | Pipeline Linux de verificações e build; não executado remotamente nesta revisão. |
| Alterado | `AGENTS.md` | Instruções alinhadas a Next.js, demonstração e contratos atuais. |
| Alterado | `README.md` | Instalação, verificações, deploy, estado demonstrativo e três perfis oficiais do projeto. |
| Criado | `components.json` | Configuração manual shadcn/ui, aliases e CSS Tailwind v4. |
| Criado | `docs/contratos/catalogos-v0.1.0.json` | Catálogo interno versionado, fontes e homologação pendente. |
| Criado | `docs/contratos/deduplicacao-permissoes-v0.1.0.md` | Contrato documental de deduplicação, três perfis e proposta Supabase/RLS. |
| Criado | `docs/design-system.md` | Tokens, componentes, breakpoints, fontes técnicas e limites de homologação. |
| Criado | `docs/finalizacao-sprint-01-2026-10-09.md` | Relatório A–F, resultados reais, pendências e inventário completo. |
| Criado | `docs/sprint-01-escopo.md` | Classificação inicial dos quinze achados entre sprint atual e backlog. |
| Criado | `eslint.config.mjs` | Regras Next/TypeScript e associação de labels, com exclusão de artefatos. |
| Alterado | `package.json` | Dependências mínimas dos componentes acessíveis e scripts de qualidade/validação. |
| Alterado | `pnpm-lock.yaml` | Versões resolvidas dos novos componentes e tooling; Next/React preservados. |
| Criado | `pnpm-workspace.yaml` | Negação explícita do hook opcional unrs-resolver, mantendo as demais restrições. |
| Alterado | `postcss.config.mjs` | Export nomeado para lint; plugin Tailwind preservado. |
| Criado | `scripts/check-routes.mjs` | Verificação estática de rotas e imports locais. |
| Criado | `scripts/check-styles.mjs` | Processamento CSS com PostCSS/Tailwind, sem depender do SWC. |
| Criado | `scripts/validate-contracts.mjs` | Validação sintática dos JSONs e invariantes do catálogo. |
| Alterado | `sprints/sprint-01.md` | Estrutura original preservada, entregas, evidências e parecer factual atualizados. |
| Criado | `src/app/(sistema)/error.tsx` | Estado de erro recuperável com ação de tentar novamente. |
| Alterado | `src/app/(sistema)/layout.tsx` | Banner permanente, skip link, foco do conteúdo e altura dinâmica. |
| Criado | `src/app/(sistema)/loading.tsx` | Loading do App Router com skeleton compartilhado. |
| Alterado | `src/app/layout.tsx` | Provedor global de avisos demonstrativos. |
| Criado | `src/app/login/page.tsx` | Login ilustrativo sem verificação, transmissão ou persistência de credenciais. |
| Alterado | `src/app/page.tsx` | Entrada pelo login demonstrativo. |
| Alterado | `src/components/AnalyticsCard.tsx` | Texto secundário alinhado ao token compartilhado; lógica existente preservada. |
| Alterado | `src/components/Breadcrumb.tsx` | Texto secundário alinhado ao token compartilhado; lógica existente preservada. |
| Criado | `src/components/DemoProvider.tsx` | Toasts com região viva e fechamento; feedback de simulações. |
| Alterado | `src/components/DonutChart.tsx` | Legenda completa, total das categorias identificável e divisão segura. |
| Alterado | `src/components/FilterBar.tsx` | Texto secundário alinhado ao token compartilhado; lógica existente preservada. |
| Alterado | `src/components/Header.tsx` | Navegação de perfil/aparência, avisos ilustrativos e adaptação da Topbar. |
| Alterado | `src/components/KpiCard.tsx` | Texto secundário alinhado ao token compartilhado; lógica existente preservada. |
| Criado | `src/components/PageSkeleton.tsx` | Carregamento compartilhado das telas dinâmicas. |
| Alterado | `src/components/RankingList.tsx` | Texto secundário alinhado ao token compartilhado; lógica existente preservada. |
| Alterado | `src/components/SentinelaLogo.tsx` | Identidade preservada, texto secundário e logo compacto adaptável. |
| Alterado | `src/components/Sidebar.tsx` | Nomes acessíveis, rota ativa, controle de recolhimento e retorno ao login. |
| Alterado | `src/components/SystemSidebar.tsx` | Mapeamento do retorno ao login demonstrativo. |
| Alterado | `src/components/map/MapaDF.tsx` | Alinhamento canvas/SVG responsivo, teclado para RAs e tooltip sem refs durante render. |
| Alterado | `src/components/map/RALayer.tsx` | Dependência de callback no efeito corrigida; componente legado preservado. |
| Criado | `src/components/ui/button.tsx` | Primitiva reutilizável de botão com variantes e Slot. |
| Criado | `src/components/ui/dialog.tsx` | Shell Radix com semântica, Escape, foco preso e restauração de foco. |
| Criado | `src/components/ui/skeleton.tsx` | Primitiva de skeleton e indicação decorativa acessível. |
| Criado | `src/data/demoAnalytics.ts` | Filtros e agregação pura da base fictícia, com referência temporal explícita. |
| Criado | `src/data/demoStats.ts` | Estatísticas derivadas da mesma amostra usada por mapa/listagem. |
| Alterado | `src/features/Configuracoes.tsx` | Senhas vazias, labels/switches nomeados, feedbacks honestos e grade adaptativa. |
| Alterado | `src/features/CrimeMap.tsx` | Filtros sobre mocks, contagens coerentes, estados vazios, labels e painéis adaptativos. |
| Alterado | `src/features/CrimeMapEntry.tsx` | Skeleton durante importação dinâmica; execução de mocks sem SSR preservada. |
| Alterado | `src/features/Dashboard.tsx` | Contagens da base compartilhada, origem temporal fixa, grades e avisos ilustrativos. |
| Alterado | `src/features/DashboardEntry.tsx` | Skeleton durante importação dinâmica; execução de mocks sem SSR preservada. |
| Alterado | `src/features/ImportarDados.tsx` | Prévia/histórico fictícios identificados, ações com feedback e grade adaptativa. |
| Alterado | `src/features/NovaOcorrencia.tsx` | Conclusão explícita de simulação, labels/foco, prioridade por teclado e diálogo acessível. |
| Alterado | `src/features/Occurrences.tsx` | Rótulos acessíveis e texto secundário; filtros/paginação existentes preservados. |
| Alterado | `src/features/OccurrencesEntry.tsx` | Skeleton durante importação dinâmica; execução de mocks sem SSR preservada. |
| Alterado | `src/features/Usuarios.tsx` | Prévia de perfis correta, feedbacks, validação visual básica, diálogos e menu em portal. |
| Alterado | `src/index.css` | Tokens, contraste secundário, foco, grids, breakpoints, diálogos, toast e login. |
| Criado | `src/lib/utils.ts` | Combinação de classes para componentes locais shadcn/ui. |
| Criado | `tests/demo-analytics.test.mjs` | Quatro testes de filtros, limites temporais, agregações e estado vazio. |
