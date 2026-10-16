# Ajustes da interface e temas — 14/10/2026

A faixa superior de demonstração foi removida do layout compartilhado, junto com suas regras de CSS. A pesquisa global e seu ícone foram removidos do Header. O espaço da faixa desapareceu e os títulos, subtítulos, botões e pesquisas internas foram preservados.

O ThemeProvider do layout raiz sincroniza o botão do cabeçalho com as opções Claro, Escuro e Sistema de Configurações. A seleção aplica imediatamente `data-theme` no HTML e grava `sentinela-theme` em localStorage. Um script no head restaura a preferência antes da renderização do corpo, sem depender da hidratação. O modo Sistema acompanha mudanças de `prefers-color-scheme`; eventos de storage sincronizam outras abas. Valores inválidos ou armazenamento indisponível mantêm o padrão escuro; sem acesso ao armazenamento, a seleção funciona apenas durante a sessão.

As cores fixas das superfícies, textos, bordas, formulários, gráficos e controles dos mapas passaram a usar variáveis CSS. A paleta escura existente foi mantida, com equivalentes claros e ajustes de contraste. O desenho da marca, a paleta cartográfica, as escalas de calor, os pontos, o GeoJSON e os cálculos foram preservados. As demais preferências continuam demonstrativas; os textos ligados à aparência e à simulação foram ajustados para refletir essa distinção.

## Arquivos modificados ou adicionados

- Layouts: `src/app/layout.tsx`, `src/app/(sistema)/layout.tsx`.
- Tema e estilos: `src/components/ThemeProvider.tsx` (novo), `src/data/theme.ts` (novo), `src/index.css`.
- Componentes compartilhados: `src/components/Header.tsx`, `Sidebar.tsx`, `SentinelaLogo.tsx`, `AnalyticsCard.tsx`, `Breadcrumb.tsx`, `DonutChart.tsx`, `FilterBar.tsx`, `KpiCard.tsx`, `RankingList.tsx`.
- Interfaces dos mapas: `src/components/map/DFMap.tsx`, `MapaDF.tsx`, `MapLegend.tsx`, `MapViewToggle.tsx`, `RALayer.tsx`. Alterações limitadas às cores de controles, legendas e tooltips.
- Telas: `src/features/Configuracoes.tsx`, `CrimeMap.tsx`, `Dashboard.tsx`, `ImportarDados.tsx`, `NovaOcorrencia.tsx`, `Occurrences.tsx`, `Usuarios.tsx`. Alterações limitadas ao tema e suas cores; Configurações também conecta a seleção ao provedor.
- Validação: `scripts/check-theme.mjs` (novo), `scripts/homologate-sprint1.mjs` (expectativas de faixa e tema atualizadas).
- Este relatório: `docs/relatorio-interface-tema.md`.

## Verificações

- TypeScript: aprovado, sem erros.
- ESLint: aprovado, sem erros ou avisos.
- Build Next.js: aprovado, com geração das rotas existentes.
- Testes existentes: 4 aprovados.
- PostCSS/Tailwind: aprovado, sem avisos.
- Verificação estática de rotas/imports e validação de contratos: aprovadas.
- Navegador Chrome: ausência da faixa e pesquisa global nas oito telas; alternância pelos dois controles; sincronização; persistência após recarregar e navegar; acompanhamento do tema do sistema; restauração antes da hidratação; carregamento das oito telas em ambos os temas.
- Pesquisas internas: filtros por ID de ocorrência e por nome de usuário aprovados nos dois temas.
- Capturas e inspeção visual: login, Dashboard, Mapa Criminal, Ocorrências, Nova Ocorrência, Importação, Usuários e Configurações. Evidências locais em `.next/theme-evidence/`, regeneráveis com `node scripts/check-theme.mjs` e um servidor local disponível.

## Limitações

As verificações foram executadas com Node 22 e as ferramentas instaladas do projeto, diretamente pelos comandos equivalentes dos scripts. O pnpm disponível era 12.9.1; o Corepack não conseguiu disponibilizar 10.34.3 nas restrições do ambiente. Dependências e lockfile não foram alterados. Processos do Next, runner de testes e Chrome exigiram execução fora do sandbox após erros EPERM; nenhuma política do Windows foi modificada.

A inspeção visual foi feita em Chrome desktop (1366 × 900), sem auditoria formal de acessibilidade ou homologação em todos os navegadores e tamanhos. As capturas mostram a área visível das telas com rolagem interna. Não existe uma rota de Relatórios neste checkout. A suíte histórica de homologação completa não foi executada; suas expectativas diretamente afetadas foram atualizadas. Os testes e a revisão do diff não identificaram regressões, mas não constituem homologação exaustiva de todas as funcionalidades.

Não houve commit, push, publicação, instalação de bibliotecas ou alteração de autenticação, persistência dos dados, permissões ou regras de negócio.
