# Fundação visual do SENTINELA

O App Router usa `src/app/layout.tsx` para estilos/provedor de feedback, e `src/app/(sistema)/layout.tsx` para Sidebar, conteúdo e identificação permanente da demonstração. O login é público e ilustrativo; não cria uma sessão.

Tailwind CSS 4 usa `postcss.config.mjs` e os tokens `@theme` em `src/index.css`. Cores de fundo, texto, foco, bordas e ações seguem a identidade escura existente. Componentes antigos mantêm a estrutura; texto secundário usa `--color-text-muted` e foco por teclado recebe contorno visível. Preferência de movimento reduzido é respeitada em CSS.

## Componentes compartilhados

- Sidebar e Header: navegação e identidade existentes; nomes acessíveis, rota ativa e feedbacks para controles ilustrativos.
- `ui/button.tsx`, `ui/skeleton.tsx`, `ui/dialog.tsx`: instalação manual de componentes no padrão shadcn/ui com Radix, adaptados à identidade local. `components.json` define aliases e CSS; `src/lib/utils.ts` combina classes. Não foi instalado um pacote fictício chamado `shadcn/ui`.
- `PageSkeleton`: carregamento das telas dinâmicas e das transições do App Router.
- `DemoProvider`: toast com região viva, fechamento por botão e limpeza do timer; nunca confirma gravação real.
- Dialog: usado nos três diálogos/drawer de Usuários e no descarte do cadastro. Radix oferece foco preso, Escape e isolamento modal; o wrapper restaura o foco ao acionador existente. A homologação em navegador ainda é necessária.

## Layouts e limites

Grades e painéis preservam a composição de desktop; abaixo de 1280 px grades longas reduzem colunas e formulários/importação empilham. Abaixo de 1024 px a Sidebar fica compacta e os painéis do mapa empilham com rolagem. Abaixo de 640 px detalhes da Topbar são ocultados e os campos empilham. Tabelas extensas usam rolagem horizontal; tabelas compactas de histórico não recebem largura mínima global.

Alvos de homologação: 1920×1080, 1366×768, 1024×768, 768×1024 e resolução intermediária 1200×800. A existência de breakpoints não comprova homologação visual; os resultados executados constam no relatório de finalização.

Contagens de dashboard, mapa e listagem partem de `MOCK_OCCURRENCES`. Variações e sparklines herdadas são identificadas como ilustrações e não significam análise histórica real. Donut informa que o total é das categorias exibidas. Fonte e timestamp da demonstração são fixos; não representar data de renderização como atualização de dados.

## Referências técnicas

Instalação manual e componentes próprios seguem a [documentação shadcn/ui](https://ui.shadcn.com/docs/installation/manual). O lint usa a [configuração ESLint do Next.js](https://nextjs.org/docs/app/api-reference/config/eslint). A hospedagem planejada usa o suporte nativo de [Next.js na Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), sem exportação estática Vite.
