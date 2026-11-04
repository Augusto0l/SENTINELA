# Acesso demonstrativo temporário — 30/10/2026

Para inspecionar as telas sem configurar Auth, foi habilitado `SENTINELA_LOCAL_DEMO=1` no `.env.local` ignorado pelo Git. Abra `/login` por `localhost` e use **Entrar na demonstração local**. Não informe credenciais.

O modo exige `NODE_ENV=development`, Host local e ausência das variáveis públicas Supabase. Não funciona no build de produção. Renderiza páginas com um perfil demonstrativo de Administrador, identificado por banner; não cria usuários, sessões ou vínculos reais. Somente os guards de apresentação das páginas usam esse perfil; `getAccess`, `requirePrincipal`, `requireIdentity`, APIs e autorizações de dados continuam usando Auth real. Correções e acesso ao banco continuam fechados.

Validação: TypeScript, ESLint dos arquivos afetados e verificação estática de rotas aprovados; suíte completa com 112 testes aprovados. No Chrome, o botão navegou de `/login` para `/dashboard`, o banner demonstrativo ficou visível e `/api/ocorrencias/geocode` continuou respondendo HTTP 401 sem sessão. Não houve teste de Auth hospedado nem novo build de produção nesta alteração; o bloqueio do modo em produção foi coberto pelo teste unitário.

Para remover a liberação, exclua a linha `SENTINELA_LOCAL_DEMO=1` do `.env.local` ou defina `0` e reinicie o servidor se necessário. O botão de voltar ao login apenas navega: não há sessão demonstrativa para encerrar. Este opt-in é uma ferramenta de desenvolvimento, não um mecanismo de autenticação ou isolamento de rede; não exponha o servidor de desenvolvimento publicamente.
