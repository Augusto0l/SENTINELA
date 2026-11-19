# Permissões locais — Etapa 2.13

Data: 11/11/2026. O login, as três contas existentes, hashes, senhas e sessões
permanecem os mesmos. Não há novo provedor, usuário, migration ou conexão remota.

## Matriz funcional e disponibilidade efetiva

`src/lib/auth/policy.ts` centraliza `PERMISSION_MATRIX`, `hasPermission`,
`routePermission`, `canVisit`, `NAVIGATION_ROUTES` e `actionAccess`.
`demoPermissions.ts` permanece como adaptador para consumidores antigos, sem
uma segunda matriz. Nenhuma decisão usa nome exibido ou e-mail como autoridade.

| Recurso | Administrador | Operador | Analista | Disponibilidade atual |
| --- | --- | --- | --- | --- |
| Dashboard e Mapa | Sim | Sim | Sim | Sessões locais consultam analytics pela mesma reader. O modo demonstrativo usa dados próprios. |
| Ocorrências e catálogos GET | Sim | Sim | Sim | Uma reader PostgreSQL compartilhada aplica RLS. RAs oficiais são visíveis; naturezas e ocorrências seguem o escopo sintético. A validação autenticada operacional depende da credencial. |
| Cadastro | Sim | Sim | Não | Formulário demonstrativo em memória, acessível pela listagem. |
| Edição regular | Sim | Sim | Não | Simulação em cópia de ocorrência manual, ativa e consolidada. API persistente pendente. |
| Inativação lógica regular | Sim | Sim | Não | Mesma elegibilidade da edição. Simulação em cópia; API persistente pendente. |
| Importação | Sim | Sim | Não | Leitura/validação e confirmação demonstrativa no navegador; não importa para PostgreSQL. |
| Consultar pendências na Central | Permissão funcional | Permissão funcional | Permissão funcional | A Central ainda não possui tela/endpoint implementado. Não há novo menu prometendo acesso existente. Pendências da importação são apenas sua prévia autorizada. |
| Corrigir pela Central | Exclusivo | Não | Não | Fluxo ainda indisponível; `correctionsEnabled` permanece falso. |
| Usuários e Configurações | Sim | Não | Não | Prévia demonstrativa, sem administrar contas reais; preferências visuais locais. |

`actionAccess` mantém escrita persistente indisponível e `businessDataEnabled()`
continua falso. A simulação usa a matriz funcional e exige elegibilidade da
ocorrência. A autorização de correção pela Central é independente e exclusiva
do Administrador. Autoria, escopo, grants e RLS de escrita ainda exigem
homologação operacional. A revisão 2 do executor experimental autoriza
Administrador e Operador técnicos a editar e inativar registros sintéticos
elegíveis. A sessão do laboratório seleciona o login restrito e o PostgreSQL
obtém a autoria de `session_user`. A Central mantém sua autorização própria.
[Especificação de escrita](escrita-persistente-planejamento.md)

Configurações reúne preferências e opções administrativas na mesma rota; por
segurança a rota inteira fica restrita ao Administrador. A alternância de tema
no Header continua disponível para todos. Separar preferências pessoais em rota
própria poderá ser uma decisão futura, sem liberar administração aos demais.

## Proteção em camadas

As rotas Next.js de escrita isolada só atendem ao trio de contas
descartáveis criado para o cluster atestado. O servidor mapeia a sessão
validada para a credencial de escrita do perfil sintético. O banco deriva
o autor técnico de `session_user` e restringe escopo e elegibilidade.
Perfis demonstrativos habituais continuam sem escrita nas APIs.

| Perfil no laboratório | Consultar e detalhar | Cadastrar | Editar e inativar registros elegíveis |
| --- | --- | --- | --- |
| Administrador | Sim | Sim | Sim |
| Operador | Sim | Sim | Sim |
| Analista | Sim | HTTP 403 | HTTP 403 |

O UUID da conta descartável é recuperado da configuração do servidor. O
PostgreSQL confere a correspondência com o login técnico sob RLS e registra
a versão com o evento produzido na mesma transação. Uma divergência
interrompe a transação. Para auditoria humana operacional será necessário
o vínculo com o provedor de identidade definitivo.

| Perfil no PCDF descartável | Consultar a Central e analytics | Receber CSV e solicitar consolidação | Corrigir ou encerrar pendência |
| --- | --- | --- | --- |
| Administrador | Sim | Sim | Sim |
| Operador | Sim | Sim | HTTP 403 |
| Analista | Sim | HTTP 403 | HTTP 403 |

O modo PCDF exige o manifesto atestado e a configuração de loopback do
laboratório CRUD. Upload e consolidação usam a sessão individual validada.
A Central exige versão esperada, justificativa e vínculo individual de
Administrador. As funções que executam com owner técnico têm `search_path`
fixo, `EXECUTE` limitado e tabelas com RLS forçada. O leitor analítico
recebe grants por coluna sobre projeções sintéticas consolidadas e usa
transação de leitura. As mesmas rotas operacionais conservam seu escopo
de origem e seus controles anteriores.

- Sidebar e Header usam a política compartilhada. Configurações/Usuários não
  aparecem para Operador/Analista; Novo/Importar não aparecem para Analista.
- O proxy verifica a sessão local existente e recusa URL direta conforme
  `routePermission`. Configurações também exige `administrar` na página do
  servidor, independentemente do proxy; Usuários, Importar e Nova Ocorrência
  preservam suas exigências de servidor já existentes.
- `OperationalProvider` conserva a guarda de renderização. Só aceita novo
  rascunho demonstrativo permitido, com ID `DEMO-`, sem sobrescrever registro já
  guardado. Não oferece edição, correção ou inativação persistente.
- O formulário verifica disponibilidade antes de renderizar e enviar. A importação
  também guarda seleção, processamento e confirmação, sem depender só do menu.
- Fora do laboratório, botões de mutação da lista persistente ficam desabilitados; seus motivos distinguem
  perfil sem permissão de funcionalidade ainda indisponível.
- Chamadas diretas a APIs de escrita continuam negadas pelo proxy local,
  inclusive para Administrador. Somente os GETs exatos já autorizados são
  admitidos, com validação independente de sessão/permissão nos handlers.
  Isso não permite chamadas a futuras APIs hospedadas nem geocodificação remota.

As telas de usuários/configurações continuam identificadas como demonstração.
Modificar um usuário fictício da prévia não modifica a conta que está logada,
o arquivo privado de contas nem o perfil da sessão verificada. Não foi criada
administração definitiva. Alteração de senha pela interface fica indisponível
no provedor local; os fluxos Supabase existentes permanecem preservados.

## Arquivos desta etapa

- Política: `src/lib/auth/policy.ts`, `src/data/demoPermissions.ts`.
- Navegação/contexto: `src/components/Sidebar.tsx`,
  `src/components/SystemSidebar.tsx`, `src/components/Header.tsx`,
  `src/components/OperationalProvider.tsx`.
- Páginas/ações: `src/app/(sistema)/configuracoes/page.tsx`,
  `src/components/occurrences/OccurrenceForm.tsx`, `src/features/Occurrences.tsx`,
  `src/features/import/ImportWorkflow.tsx`, `src/features/Usuarios.tsx`,
  `src/features/Configuracoes.tsx`.
- Testes: `tests/profile-authorization.test.mjs`,
  `tests/fixtures/permission-context.mjs`. Documentação: este arquivo.

## Testes e limites das evidências

Os novos testes usam o proxy real com um substituto explícito de sessão **em
memória** e renderizam Sidebar/Header/formulário reais por React SSR. Exercitam
os três perfis, URLs diretas, menus, ações, APIs GET, bloqueio de escrita e sessão
ausente/adulterada. Não criam contas de aplicação nem usam senhas reais.
São testes de autorização e renderização, não homologação de login/navegador.
Os testes anteriores do provedor continuam verificando senha, sessão expirada,
logout, produção e loopback com fixtures descartáveis isoladas.

Não houve navegação autenticada no navegador com as contas reais nesta etapa:
a senha privada não está disponível ao executor. Não se utilizou o harness que
cria contas temporárias de navegador, preservando a exigência de usar somente as
contas de login já existentes. Não foi solicitado envio de senha pelo chat.

Para conferir manualmente, use o servidor local oficial existente (não inicie
outro na mesma porta), faça login com cada conta cadastrada e confira:

1. Administrador vê Nova Ocorrência/Importar/Usuários/Configurações; os dois
   primeiros são simulações, e os últimos não administram contas reais.
2. Operador vê Nova/Importar, mas não Usuários/Configurações; URL direta para os
   dois últimos deve terminar em `/acesso-negado`.
3. Analista não vê Nova/Importar/Usuários/Configurações e recebe acesso negado
   por URL direta. Dashboard/Mapa/Ocorrências permanecem acessíveis.
4. Os três mantêm os GETs autorizados. Cadastro persistente, Editar e Inativar
   permanecem desabilitados; chamadas de escrita retornam bloqueio.
5. Após logout, URLs protegidas exigem login. Central/correções continuam
   indisponíveis, sem exceção por perfil; não inserir dados para testar.

Comandos de verificação: `pnpm typecheck`, `pnpm lint`, `pnpm test`,
`pnpm validate:contracts`, `pnpm check:routes` e
`node scripts/build-validation.mjs` (build isolado do `.next` de desenvolvimento).

Resultado desta implementação: **162 testes aprovados**, incluindo seis novos
grupos de autorização/renderização. TypeScript, ESLint, contratos Zod/OpenAPI,
verificação de rotas/imports, build Next.js isolado, links documentais e
`git diff --check` aprovados. O inventário estático de endpoints também passou:
nenhum handler de escrita foi acrescentado. Não houve teste PostgreSQL, conexão
ao Supabase ou navegação real com senha privada nesta execução.

## Pendências e próximo passo

Inativação pelo Operador continua sem aprovação. Edição regular requer decisão
de estado/escopo e histórico; Central precisa de implementação própria. Escrita
persistente permanece bloqueada pelos mecanismos descritos na Etapa 2.12 e
não é consequência desta matriz. Confirmar primeiro a navegação com as contas
existentes; depois priorizar funcionalidade pendente sem ampliar automaticamente
privilégios SQL ou retomar Auth hospedado/e-mail nesta etapa.
