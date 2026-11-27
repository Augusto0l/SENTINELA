# Autenticação local de desenvolvimento

Não cria identidades Supabase nem permite acesso ao banco remoto. O estado atual permite exclusivamente a leitura persistente de ocorrências e catálogos sintéticos no PostgreSQL local pelos quatro endpoints GET descritos abaixo. Dashboard e Mapa continuam demonstrativos; cadastros, edições e inativações demonstrativas não gravam no banco.

## Histórico e estado atual

O antigo `SENTINELA_LOCAL_DEMO` liberava somente uma prévia de apresentação sem autenticar credenciais, conforme o [registro histórico de 30/10/2026](evidencias/login-sprint4/acesso-local-temporario.md). Não é o provedor atual e não autoriza APIs persistentes.

O provedor selecionado por `SENTINELA_AUTH_PROVIDER=local` autentica exatamente três contas no servidor, com perfis fixos. Sua implementação antecede a leitura PostgreSQL e originalmente bloqueava todas as APIs. A Etapa 2.9 introduziu a exceção estrita para os dois GET locais; a Etapa 2.10 integrou a listagem. A decisão temporária e seus critérios de substituição estão no [ADR do provedor local](decisoes/adr-auth-local-temporario.md).

## Configuração e proteção das contas

Com Node 22, execute `scripts/configure-local-auth.ps1` no seu próprio terminal PowerShell. As três senhas são solicitadas com entrada oculta, podem ser iguais e devem ter de 4 a 1024 caracteres. Senhas numéricas simples são aceitas exclusivamente neste provedor local; os três e-mails devem ser diferentes. Não passe senhas por argumentos, variáveis de ambiente ou comandos colados. Não habilite transcrição ou ferramentas de gravação de entrada durante o procedimento. Se a política do Windows bloquear scripts, não a enfraqueça: revise e execute o conteúdo do script no terminal interativo.

O script cria `%USERPROFILE%\.sentinela-local\accounts.json`, exclusivamente com e-mails, perfis, salts e hashes scrypt, e restringe a pasta ao usuário Windows atual, SYSTEM e Administradores. Por padrão, recusa sobrescrever um arquivo existente. Para repetir o cadastro, execute `./scripts/configure-local-auth.ps1 -Reconfigure`: o helper valida as três contas, grava somente hashes em um arquivo temporário protegido na mesma pasta externa e substitui o arquivo de contas. Erros de validação preservam a configuração anterior. A troca invalida as sessões existentes. Não copie esse arquivo para o repositório, anexos ou logs. Sessões são gravadas na subpasta `sentinela-sessions`, com tokens armazenados somente por hash; proteja toda a pasta.

No Windows PowerShell 5.1, `local-auth-acl.ps1` usa APIs .NET limitadas a `AccessControlSections.Access` (DACL), sem `Set-Acl`, SACL, alteração de proprietário ou necessidade de executar como Administrador. A DACL permite controle total somente ao usuário Windows atual, SYSTEM e Administradores, identificados por SID. A pasta é criada já protegida; em pasta existente, o arquivo `accounts.json`, quando presente, também tem sua DACL protegida. Os novos arquivos e substituições herdam somente os acessos confiáveis da pasta. Alvos com links/junções ou tipo inesperado são recusados. A rotina altera apenas a pasta indicada e o arquivo de contas, preserva o conteúdo e tenta restaurar as DACLs anteriores se uma aplicação falhar; se a reversão não puder ser concluída, interrompe com aviso explícito. Ela não solicita senhas antes de concluir a proteção. O acesso permitido a SYSTEM e Administradores não disponibiliza as contas para outros usuários comuns.

Adicione manualmente ao `.env.local` ignorado pelo Git:

```dotenv
SENTINELA_AUTH_PROVIDER=local
SENTINELA_LOCAL_ACCOUNTS_FILE=C:/Users/SEU_USUARIO/.sentinela-local/accounts.json
SENTINELA_APP_ORIGIN=http://localhost:3000
SENTINELA_LOCAL_DEMO=false
```

Preserve as variáveis Supabase e de backup. Nenhuma variável nova usa `NEXT_PUBLIC_`. Execute `pnpm dev:next` para o provedor demonstrativo. O lançador define `SENTINELA_LOCAL_BIND` e restringe o listener a `127.0.0.1`. Encerre previamente somente o servidor deste projeto. A página `/login` redireciona entre `localhost` e `127.0.0.1` na porta configurada para exibir o formulário na origem de `SENTINELA_APP_ORIGIN`. O envio das credenciais e o cookie de sessão usam essa origem. O login local depende das contas demonstrativas configuradas e funciona sem a credencial da reader PostgreSQL.

Se o provedor for alterado para `local` com o servidor já aberto, recarregar a página ou o hot reload do `.env.local` não altera o endereço de escuta. Reinicie completamente pelo comando oficial. Até isso acontecer, os campos permanecem desabilitados e a tela informa a necessidade de reiniciar. A indicação de acesso local disponível aparece somente quando as travas e o arquivo externo das três contas foram validados no servidor.

Faça login com cada e-mail e sua senha; não existe seletor de perfil. A sessão dura oito horas, não tem renovação automática e é revogada no logout. Reiniciar o Next não revoga os arquivos de sessão. Alterar a configuração de contas invalida as sessões existentes. Limitação de tentativas: dez por minuto, global por processo de login; reiniciar o processo reinicia o limite. Use somente uma instância local; este mecanismo não foi projetado para rede, clusters ou múltiplos usuários do sistema operacional.

## Autorização de leitura local

O provedor recusa produção, hosts diferentes da origem e execução sem a trava do launcher. Somente as seguintes formas de GET possuem exceção no bloqueio local de APIs:

- `GET /api/v1/ocorrencias`;
- `GET /api/v1/ocorrencias/{id}`;
- `GET /api/v1/catalogos/regioes-administrativas`;
- `GET /api/v1/catalogos/naturezas-criminais`.

Proxy e handlers verificam a sessão local e a permissão `analisar`. O backend também exige `principal.source=local`; Administrador, Operador e Analista podem consultar somente o conjunto sintético autorizado pelo RLS. Uma identidade Supabase não autoriza essa conexão. Sessão ausente, adulterada, expirada ou revogada não libera leitura; verificações no navegador não substituem a autorização no servidor.

A conexão operacional é exclusiva do servidor, utiliza `SENTINELA_LOCAL_READER_URL` e aceita somente `127.0.0.1:5432/sentinela_dev_operacional`, com a role `sentinela_local_reader`. Não utiliza a conexão administrativa `SENTINELA_DATABASE_URL`, não concede acesso ao Supabase remoto e não habilita escrita. Outras APIs e métodos POST/PATCH/DELETE de dados continuam bloqueados no modo local; os fluxos POST próprios de login/logout permanecem independentes.

Configuração ausente ou inválida resulta em indisponibilidade, sem fallback para mocks ou credenciais administrativas. A listagem persistente mantém cadastro, edição e inativação desabilitados. A rota de cadastro demonstrativo informa que suas simulações não alimentam essa listagem.

Recuperação de senha, convites e definição de senha Supabase ficam indisponíveis nesse modo. Para retomar Auth hospedado, remova `SENTINELA_AUTH_PROVIDER=local` e reinicie o servidor; preserve as demais configurações Supabase. A implementação SSR e os fluxos Supabase permanecem independentes. Essa troca, isoladamente, não homologa o provedor hospedado nem concede acesso aos dados.

Consulte a [configuração de leitura PostgreSQL](postgresql-leitura-local.md), a [interface persistente](ocorrencias-persistentes.md) e o [ADR de isolamento e leitura](decisoes/adr-leitura-postgresql-local-homologacao-isolada.md).

## Limitações de segurança

No modo de escrita descartável, a configuração efêmera associa um UUID
sintético à conta. A sessão resolve essa identidade no servidor a cada
requisição. O adaptador seleciona a credencial técnica do perfil e o
PostgreSQL valida o vínculo individual com `session_user` na transação da
mutação. O registro resultante correlaciona o UUID ao evento de auditoria
e à versão. Contas de desenvolvimento sem UUID ficam fora desse fluxo.
[Fluxo e persistência](ocorrencias-persistentes.md#crud-no-ambiente-descartável)

Senhas existem brevemente na memória do PowerShell/Node durante o cadastro; strings gerenciadas não permitem garantir apagamento físico. Arquivos externos e ACLs protegem contra commits e outros usuários, não contra processos executados pela mesma conta Windows ou administradores. Não use senhas de produção.
