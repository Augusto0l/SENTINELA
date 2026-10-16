# SENTINELA — instruções de desenvolvimento

Protótipo acadêmico em Next.js 16 (App Router), React 19, TypeScript e Tailwind CSS 4. Os dados são fictícios; não há autenticação ou persistência real. Preserve a identificação de demonstração e não apresente sucesso de gravação inexistente.

## Estrutura atual

- `src/app/layout.tsx`: documento HTML, CSS global e provedor de feedback.
- `src/app/page.tsx`: redireciona para o login demonstrativo.
- `src/app/login/page.tsx`: login ilustrativo; não verifica credenciais.
- `src/app/(sistema)/layout.tsx`: Sidebar e identificação da demonstração.
- `src/app/(sistema)/**/page.tsx`: rotas das telas.
- `src/features`: telas e wrappers de cliente. Mocks Canvas/Path2D devem permanecer sem SSR.
- `src/components`: componentes compartilhados; `ui` contém componentes no padrão shadcn/ui.
- `src/index.css`: imports primeiro, tokens Tailwind v4, identidade visual e breakpoints.
- `src/data`: mocks e regras puras de análise demonstrativa.
- `docs/contratos`: catálogos internos e proposta de deduplicação/permissões/RLS.
- `sprints/sprint-01.md`: planejamento original e evidências da revisão.

## Ferramentas

Use as versões de `.mise.toml` e o `pnpm-lock.yaml`. Comandos: `pnpm install --frozen-lockfile`, `pnpm dev`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm validate:contracts`, `pnpm check:routes`, `pnpm build`. O script de testes usa o runner do Node 22. Não inicie outro servidor se já houver um disponível; confirme o ambiente antes de iniciar.

O build é Next.js e usa `.next`; não há Vite, `src/App.tsx`, `src/main.tsx` ou `dist` como saída de publicação. Vercel usa integração Next.js nativa. Publicação é uma ação separada, autorizada pelo usuário, e não faz parte das verificações locais.

## Qualidade e preservação

Use TypeScript estrito, imports pelo alias `@/` e componentes compartilhados. Componentes de entrada usam export default; utilitários e primitivas podem usar exports nomeados. Preserve a identidade do SENTINELA e a navegação por teclado. Use strings válidas, JSX fechado, labels associados e foco visível.

Não remova implementações legadas sem verificar dependências. Não sobrescreva alterações do usuário, faça commits, push ou publique automaticamente. Documente limitações reais dos testes: TypeScript aprovado não significa build ou homologação visual aprovados. Não desative políticas do Windows para carregar SWC.

Os três perfis são Administrador, Operador e Analista. A interface de permissões é uma prévia; autorização no servidor e RLS serão implementados em outra etapa. IDs dos catálogos são internos e dependem de homologação; não invente códigos oficiais.
