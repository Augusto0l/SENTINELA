# ADR — Provedor de autenticação local temporário

## Título

Autenticação de desenvolvimento independente do Supabase, restrita ao loopback.

## Status

Proposto para avaliação institucional. Registra controles já implementados e a decisão de desenvolvimento autorizada pela equipe; não declara aprovação formal deste ADR, arquitetura definitiva de produção ou conclusão da homologação Supabase Auth.

## Data

2026-11-11 — registro documental complementar das decisões implementadas anteriormente. Preserva o [ADR de Auth inicial](adr-auth-inicial-acesso-fechado.md).

## Contexto

A homologação definitiva de convites, e-mail, recuperação e provisionamento Supabase foi adiada para priorizar o funcionamento local com PostgreSQL/PostGIS. É necessário testar Administrador, Operador e Analista sem cadastrar identidades hospedadas ou conferir privilégios administrativos às contas de desenvolvimento.

O antigo modo demonstrativo de apresentação não valida credenciais e não serve como autorização de dados. O provedor local atual é distinto dessa prévia. As referências de JWT e BCrypt da [Feature #17](https://github.com/CAMPUSCEUB/Sentinela/issues/17) não são atendidas por substituir o fluxo definitivo por esta solução temporária de sessões opacas e scrypt.

## Decisão

- Seleção explícita por `SENTINELA_AUTH_PROVIDER=local`, exclusivamente com `NODE_ENV=development`. O launcher oficial restringe o servidor a `127.0.0.1` e fornece a trava de bind; a origem e o Host devem corresponder à configuração aprovada. Não definir a trava manualmente nem expor esse servidor em rede.
- Exatamente três contas com e-mails distintos e perfis fixos. E-mail e senha são verificados no servidor; o cliente não escolhe nem altera o perfil.
- Configuração fora do Git, com hashes scrypt e salt individual. As senhas podem ser iguais e ter de 4 a 1024 caracteres, inclusive numéricas, somente neste provedor. Não há credenciais padrão nem relaxamento da política do Supabase.
- Cadastro privado por entrada oculta. No Windows, DACL limitada ao usuário atual, SYSTEM e Administradores, sem alterar SACL nem exigir elevação.
- Sessões no servidor, tokens aleatórios e arquivos identificados por hash do token. Cookie HttpOnly e SameSite=Strict, duração de oito horas e logout com revogação e expiração do cookie. A operação local usa HTTP em loopback; não se apresenta isso como transporte de produção.
- Não há renovação automática da sessão local. Mudar a configuração de contas invalida sessões; reiniciar o processo não equivale a logout. Limite de dez tentativas por minuto, global por processo; reiniciar o processo reinicia esse limite.
- Preservar a matriz de permissões no servidor e a integração SSR/fluxos Supabase para retomada futura. A identidade local nunca autoriza uso do Supabase remoto.
- A única integração persistente permitida é a [leitura PostgreSQL local](adr-leitura-postgresql-local-homologacao-isolada.md), em duas rotas GET, com sessão local e permissão `analisar`. Não habilitar escrita, APIs hospedadas, service_role ou conexão administrativa como consequência desse login.

## Alternativas consideradas

- Escolher perfil no navegador ou usar o antigo modo demonstrativo como credencial: rejeitado, pois apresentação não comprova identidade nem autorização.
- Criar usuários hospedados ou usar service_role para acelerar o desenvolvimento: rejeitado por ultrapassar o escopo autorizado e o isolamento pretendido.
- Substituir definitivamente o Supabase por este provedor: rejeitado; o mecanismo atende uma única estação de desenvolvimento, não um serviço de autenticação de produção.
- Senhas e contas fixas no código/Git: rejeitado; configuração privada e individual continua obrigatória.

## Consequências

O desenvolvimento dos três perfis independe do envio de e-mails. Em contrapartida, há estado local de sessões e configuração a proteger. Senhas simplificadas, limite por processo e ausência de renovação não são controles adequados a produção. Processos da mesma conta Windows e administradores podem inspecionar arquivos ou memória; não há garantia de apagamento físico de strings gerenciadas. Não usar senhas de produção.

Essa autenticação não substitui JWTs hospedados, RBAC de escrita, auditoria por usuário ou testes de revogação Supabase. Sessão opaca local não deve ser apresentada como JWT. A role técnica do banco não identifica individualmente o usuário humano.

### Critérios para substituição

Antes de produção ou persistência hospedada, homologar identidades reais, provisionamento aprovado, e-mail/convites/recuperação, sessões SSR, expiração/revogação e autorização/RLS por operação e escopo. Registrar o aceite, desativar a seleção local e testar o bloqueio em produção. Preservar a decisão histórica; não promover a solução temporária a infraestrutura definitiva por simples mudança de variável.

## Links relacionados

- [Operação do provedor local](../autenticacao-local.md).
- [Registro histórico do modo demonstrativo](../evidencias/login-sprint4/acesso-local-temporario.md).
- [Relatório da Sprint 4](../../sprints/sprint-04.md).
- [Feature #17 — Autenticação, Usuários e RBAC](https://github.com/CAMPUSCEUB/Sentinela/issues/17).
- [PBI #145 — Permissões no backend](https://github.com/CAMPUSCEUB/Sentinela/issues/145).

Não encerra issues nem altera configuração, código, contas ou políticas.
