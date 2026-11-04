# Sprint 4 — Etapa 2.2: Supabase Auth inicial

Data: 29/10/2026. Branch: feat/sprint4-etapa2-auth. **Implementação local; Auth real hospedado não homologado.** Não foram executadas migrations remotas, criadas contas reais ou importados dados PCDF.

## Funcionalidades e arquivos

- package.json/pnpm-lock.yaml: @supabase/supabase-js 2.118.0, @supabase/ssr 0.12.7 e server-only 0.0.1. Instalação com pnpm 10.34.3 e Node 22; lockfile congelado conferido.
- src/lib/supabase/{browser,server,config}.ts: clientes separados, configuração pública validada, cookies SSR e requisições de servidor sem cache. Credenciais administrativas não são utilizadas.
- src/lib/auth/{core,policy,gateway,server}.ts: fluxos testáveis, identidade confirmada por getUser, vínculo ativo, matriz de perfis, verificação por operação e acesso fechado sem escopo.
- src/proxy.ts: getClaims, renovação, preservação de cookies inclusive em redirecionamentos, páginas/API protegidas e respostas privadas sem cache.
- src/app/auth/[action]/route.ts: POST login/logout/recuperar/senha, confirmação de recovery/invite e PKCE, validação de origem e destinos fixos. Sem signup.
- src/app/login, recuperar-senha, atualizar-senha, acesso-pendente e acesso-negado: formulários/estados acessíveis no layout visual existente. Recuperação genérica, atualização de senha autenticada e logout real.
- src/app/(sistema)/layout.tsx e páginas: identidade/vínculo ativo e permissões verificados no servidor, inclusive em navegação que reutiliza layouts.
- OperationalProvider/Header/Sidebar/Configuracoes: perfil/identidade recebidos do servidor, nenhum seletor ou autoridade em sessionStorage; logout e senha reais. Simulações restantes continuam explicitamente fictícias e sem persistência.
- Occurrences/OccurrenceForm: edição/inativação continuam indisponíveis até backend transacional auditado. Novos rascunhos demonstrativos podem existir somente em memória para perfis autorizados.
- src/app/api/ocorrencias/geocode/route.ts: verifica identidade e bloqueia sem escopo aprovado. Handler geográfico legado preservado em src/lib/geocoding/handler.ts; nenhum endereço é enviado pela API fechada.
- database/supabase/migrations/0006_auth_vinculo_acesso.sql: FK Auth com RESTRICT, leitura do próprio vínculo, API mínima e provisionamento privado auditado. Não altera as cinco migrations nem a baseline.
- Testes Node de Auth, SDK/cookies, Proxy e API; teste SQL sintético com rollback. eslint.config.mjs ignora tmp/temp, diretórios já ignorados pelo Git, sem reduzir as regras aplicadas ao código.
- [ADR](../decisoes/adr-auth-inicial-acesso-fechado.md): escopo, alternativas e provisionamento.

## Configuração futura, fora do Git

| Variável | Finalidade |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | URL do projeto aprovado; HTTPS ou loopback local para testes |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Chave publishable sb_publishable_; pública, não administrativa |
| SENTINELA_APP_ORIGIN | Origem exata da aplicação; HTTPS em ambiente hospedado |

Não usar secret/service_role nem senha PostgreSQL no navegador, nas variáveis NEXT_PUBLIC ou no repositório. A integração não necessita dessas chaves administrativas. Nunca registrar corpo de login, cookies, tokens de recuperação ou respostas integrais de Auth em logs. Se usar .env.local, manter fora do Git; em hospedagem, usar o gerenciador de variáveis do ambiente. Nenhum arquivo de credenciais foi criado nesta entrega.

Sem configuração válida, o formulário fica indisponível e as rotas protegidas não abrem. Cookies usam SameSite=Lax e Secure em produção; a integração SSR suporta também cliente de navegador e não declara tokens HttpOnly. Portanto, evitar XSS, scripts não confiáveis e logs de cookies continua essencial. Tokens não são colocados em sessionStorage como autoridade.

## Preparação hospedada pendente

Nenhum dos passos abaixo foi executado remotamente nesta tarefa:

1. Revisar e autorizar a instalação da baseline e da migration incremental; confirmar PostgreSQL/PostGIS, propriedade, grants e role migradora. A 0006 exige Auth existente e migrador com manutenção/BYPASSRLS para o ledger fechado, sem conceder esse atributo a novas roles.
2. Desabilitar cadastro público no Supabase Auth. O aplicativo não oferece signup, mas a configuração do serviço também precisa ser fechada.
3. Configurar Site URL, origens e redirects exatos para /auth/confirm, sem curingas amplos ou destinos enviados pelo usuário.
4. Configurar SMTP, entrega e limites de login/recuperação; política de senha forte e proteção contra abuso. Os limites do provedor devem ser testados antes de expor o login publicamente.
5. Validar PKCE padrão e os templates recovery/invite. Para confirmação por token hash, os templates podem apontar para /auth/confirm com token_hash e type=recovery ou invite. Não registrar esses parâmetros em access logs. Links são trocados por sessão e redirecionados sem o token na URL.
6. Expor somente sentinela_api na Data API para as RPCs aprovadas. Não expor sentinela/sentinela_private. Não copiar exemplos de GRANT ALL em todos os objetos.
7. Provisionar contas pelo procedimento administrativo aprovado; testar os três perfis e usuários sem vínculo/inativos em um ambiente Auth de homologação.

## Provisionamento controlado

Nenhum usuário vira Administrador por ordem de cadastro ou metadados. A equipe ainda deve definir aprovadores, responsáveis pelo primeiro Administrador, MFA e desligamento de contas.

Após aprovação, uma identidade deve ser criada/convidada pelo canal administrativo do Auth, fora do frontend. Um operador de manutenção aprovado pode chamar sentinela_private.provisionar_vinculo com UUID Auth existente, nome, perfil explícito, estado ativo e referência da aprovação. A função não cria credenciais nem convida pessoas; registra serviço de manutenção e evidência, sem inventar autoria humana autenticada.

Não há GRANT de uso/execução dessa operação a anon/authenticated/service_role e o schema não será exposto. Atualizações de vínculo existente preservam o ID interno, auditam antes/depois e não rebaixam/desativam o último Administrador ativo pelo procedimento. A exclusão de Auth é RESTRICT quando vinculada: usar desativação e procedimento de retenção, preservando histórico. Vínculos históricos sem Auth exigem reconciliação explícita revisada, não correspondência automática por nome/e-mail.

## Permissões e bloqueios

| Ação | Administrador | Operador | Analista |
| --- | --- | --- | --- |
| Análise | Sim | Sim | Sim |
| Consultar Central no escopo aprovado | Sim | Sim | Sim |
| Cadastro/importação | Sim | Sim | Não |
| Administração | Sim | Não | Não |
| Permissão nominal de correção | Sim | Não | Não |

Essa matriz prepara a autorização; não libera operações ainda não implementadas. Nenhuma policy de ocorrências, staging, originais, importações ou auditoria foi aberta. A única policy nova permite ler as cinco colunas necessárias do próprio vínculo ativo, por auth.uid, sem recursão. Nenhum usuário pode atualizar seu perfil/estado/vínculo pelo frontend.

Todos os triggers de bloqueio da 0005 e os CHECKs NOT VALID permanecem. Correções, encerramento de pendências e inativação continuam bloqueados inclusive para Administrador, até existir RPC/backend autorizado com histórico, reavaliação e auditoria na mesma transação.

As telas ainda usam mocks; não representam dados persistidos ou PCDF. A geocodificação real fica bloqueada para não enviar endereços a terceiros sem aprovação. A consulta real aos dados exige definição institucional de escopo (unidade, território, equipe ou outro); não foi presumido acesso global por perfil.

## Validação e limites

Testes automatizados de Auth usam gateways/transportes sintéticos. Os testes SDK utilizam o cliente SSR verdadeiro, com transporte HTTP simulado em loopback, para cookies, renovação, rejeição de identidade e logout; não verificam assinatura/SMTP ou a infraestrutura GoTrue real. Os testes do Proxy também usam provedor simulado.

run_auth_local.py executa as instruções da migration 0006 dentro de uma transação externa com schema auth e roles **somente de fixture** e ROLLBACK final. Não instala Auth falso na aplicação ou permanentemente, não cria usuários reais e não substitui teste com Supabase Auth. Verifica FK/histórico, leitura própria, três perfis, usuários inativos/sem vínculo, autopromoção, ausência de acesso sem escopo, auditoria e proteção do último Administrador. Ao final confirma ledger original com cinco versões, zero fixtures/roles/schemas adicionais e catálogos da baseline preservados.

### Resultados reais

| Verificação | Resultado |
| --- | --- |
| pnpm 10.34.3 install --frozen-lockfile --offline | Aprovado; lockfile consistente |
| pnpm typecheck | Aprovado |
| pnpm lint | Aprovado, zero avisos após excluir tmp/temp |
| pnpm test | 111 testes aprovados, zero falhas; inclui 15 novos casos de Auth/SDK/Proxy/API |
| pnpm build | Aprovado: Next.js 16.3.6/Turbopack, compilação, TypeScript e geração de páginas concluídos |
| Validador de contratos | Aprovado: catálogo, JSONs, OpenAPI e exemplos |
| Verificador de rotas | Aprovado: oito rotas originais e 227 imports locais resolvidos; rotas novas também presentes no build |
| Validadores original e da baseline Supabase | Aprovados; fontes/artefato sem drift |
| Sintaxe SQL/PLpgSQL da 0006 | Aprovada: 20 instruções, nenhuma SECURITY DEFINER |
| run_auth_local.py | Aprovado em PostgreSQL 17.11 local, com fixtures e ROLLBACK; nenhum schema/role/usuário/evento de teste persistido |
| Comparação dos catálogos originais após o teste SQL | Aprovada: 19 tabelas, 34 FKs, 77 índices, 55 triggers e os dois CHECKs NOT VALID preservados |
| Verificação HTTP no servidor já existente localhost:3000 | Login renderizado; seis rotas privadas redirecionaram visitante para /login; API anônima retornou 401; /auth/signup retornou 404 |

O pnpm global encontrado era 12.9.1; os comandos pnpm foram executados com `npx --yes pnpm@10.34.3`, conforme .mise.toml. Node utilizado: 22.23.2. O sandbox inicialmente recusou criação de processos do runner Node e acesso ao cache npm; as verificações completas passaram na execução autorizada. Nenhuma política do Windows foi alterada.

O primeiro lint completo encontrou apenas dois avisos de imports não utilizados em tmp/collect-sprint3-evidence.mjs, arquivo temporário preexistente fora desta entrega. O arquivo não foi editado. A configuração de lint foi alinhada aos diretórios tmp/temp já ignorados pelo Git, mantendo as regras do código-fonte. O lint completo passou depois desse ajuste.

Não foi iniciado outro servidor: havia um processo ouvindo a porta 3000. A verificação HTTP utilizou esse servidor e não submeteu credenciais nem solicitou envio real de e-mail. Não houve homologação visual completa das telas autenticadas com conta real.

### Reprodução

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:contracts
pnpm check:routes
pnpm build
python database/tests/validate_structure.py --parser-path tmp/sql-validation
python database/supabase/tests/validate_baseline.py --parser-path tmp/sql-validation
python database/supabase/tests/run_auth_local.py --psql "C:\Program Files\PostgreSQL\17\bin\psql.exe"
python database/supabase/tests/compare_catalogs.py --psql "C:\Program Files\PostgreSQL\17\bin\psql.exe" --local-db sentinela_model_test_reference21 --supabase-db sentinela_model_test_supabase21
```

Usar o pnpm 10.34.3 definido no projeto. O teste SQL é optativo/local, exige a baseline Supabase homologada no banco descartável indicado e autenticação fora do repositório. Recusa schemas/roles de Auth preexistentes, não conecta remotamente e não instala persistentemente a 0006.

## Conclusão e bloqueios

A implementação e os testes locais passaram. **Autenticação real com Supabase Auth não está homologada**: não há teste integrado contra GoTrue/Auth apropriado, SMTP, convites ou sessões reais hospedadas. Não foi configurado nem instalado um serviço Auth local completo nesta tarefa.

Enquanto configuração, instalação autorizada, API mínima e vínculo não estiverem disponíveis, o acesso permanece fechado. Ainda dependem de aprovação/teste: responsáveis pelo provisionamento, bootstrap administrativo explícito, MFA, políticas de ciclo de vida, escopo de dados e uso do geocodificador. Em seguida, testar login/logout/recuperação reais, renovação entre requisições SSR, políticas com JWTs reais dos três perfis, sessão desativada, rate limits e ausência de dados fora de escopo.

As cinco migrations originais e a baseline Supabase permanecem intactas. A 0006 foi apenas preparada e exercitada transacionalmente com fixtures; não foi aplicada a ambiente remoto ou persistentemente aos bancos de referência. Não houve commit, push, PR, merge, usuário real ou carga PCDF.
