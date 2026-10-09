# Classificação da auditoria para a Sprint 1

Revisão de 09/10/2026, posterior ao período original (21–27/09/2026). Planejamento: `sprints/sprint-01.md`. Referência histórica preservada: `docs/auditoria-2026-10-09.md`.

Antes das alterações foram inspecionados App Router, configurações Next/TS/Tailwind, lockfile, telas, wrappers sem SSR, sidebar/topbar, mapas e documentação. Não foram encontrados catálogos formais, matriz de deduplicação/permissões, configuração shadcn ou testes. A única alteração não commitada preexistente era o relatório da auditoria, que será preservado.

| Achado | Sprint 1 | Etapa posterior |
| --- | --- | --- |
| A01 | ISSUE-02: feedback explícito de simulação | ISSUE-05: persistência/cadastro operacional |
| A02 | ISSUE-02/03: identificar prévia fictícia e feedbacks | Pipeline definitivo, parsing, deduplicação/transação |
| A03 | ISSUE-02: filtros sobre mocks coerentes | Consultas reais e intervalos operacionais |
| A04 | Documentar; fluxo geográfico não é entrega desta sprint | ISSUE-06: transformação de cliques e geolocalização |
| A05 | ISSUE-03: alinhamento visual calor/SVG em diferentes tamanhos | Homologação cartográfica operacional |
| A06 | ISSUE-02: mesma fonte de contagens demonstrativas | Séries/variações reais por período |
| A07 | ISSUE-01: remover configuração Vite do deploy, orientar Vercel | Publicação efetiva não solicitada |
| A08 | ISSUE-02: login visual; ISSUE-11: contratos | Auth, RBAC servidor, RLS e logs reais |
| A09 | ISSUE-02/03: remover senhas literais e sucesso enganoso | Segurança da conta e persistência |
| A10 | Rótulos/feedbacks visuais em ISSUE-03 | ISSUE-05/06: validação completa, anexos e sincronização do pin |
| A11 | ISSUE-03: responsividade | Homologação posterior em dispositivos reais |
| A12 | ISSUE-03: foco, labels, diálogos e teclado | Auditoria de acessibilidade operacional |
| A13 | ISSUE-02/03: feedback explícito de ação futura | Funcionalidades operacionais correspondentes |
| A14 | ISSUE-01/11: lint, documentação, contratos e perfis | Testes dos futuros serviços |
| A15 | Documentar, componentes legados não são usados pelas telas | Revisão de HTML antes de integrar dados externos |

Limites: nenhuma autenticação real, persistência, Supabase ou política RLS será implementada. Componentes legados e documentos históricos serão mantidos. A conclusão das issues depende de validações reais; build bloqueado e homologação visual incompleta serão registrados como pendências.
