# Autenticação local de desenvolvimento

Não cria identidades Supabase nem permite acesso ao banco remoto. Dados da interface continuam demonstrativos e cadastros continuam em memória.

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

Preserve as variáveis Supabase e de backup. Nenhuma variável nova usa `NEXT_PUBLIC_`. Não configure `SENTINELA_LOCAL_BIND`: o launcher define essa trava somente ao executar `pnpm dev`, substituindo o listener por `127.0.0.1`. Não execute Next diretamente para esse modo. Encerre previamente somente o servidor deste projeto e reinicie pelo comando oficial. Acesse exatamente a origem configurada.

Se o provedor for alterado para `local` com o servidor já aberto, recarregar a página ou o hot reload do `.env.local` não altera o endereço de escuta. Reinicie completamente pelo comando oficial. Até isso acontecer, os campos permanecem desabilitados e a tela informa a necessidade de reiniciar. A indicação de acesso local disponível aparece somente quando as travas e o arquivo externo das três contas foram validados no servidor.

Faça login com cada e-mail e sua senha; não existe seletor de perfil. A sessão dura oito horas, não tem renovação automática e é revogada no logout. Reiniciar o Next não revoga os arquivos de sessão. Alterar a configuração de contas invalida as sessões existentes. Limitação de tentativas: dez por minuto, global por processo de login; reiniciar o processo reinicia o limite. Use somente uma instância local; este mecanismo não foi projetado para rede, clusters ou múltiplos usuários do sistema operacional.

O provedor recusa produção, hosts diferentes da origem e execução sem a trava do launcher. Todas as APIs são bloqueadas no modo local. Recuperação de senha, convites e definição de senha Supabase ficam indisponíveis nesse modo. Para retomar Auth hospedado, remova `SENTINELA_AUTH_PROVIDER=local` e reinicie o servidor; preserve as demais configurações Supabase. A implementação Supabase permanece independente.

Senhas existem brevemente na memória do PowerShell/Node durante o cadastro; strings gerenciadas não permitem garantir apagamento físico. Arquivos externos e ACLs protegem contra commits e outros usuários, não contra processos executados pela mesma conta Windows ou administradores. Não use senhas de produção.
