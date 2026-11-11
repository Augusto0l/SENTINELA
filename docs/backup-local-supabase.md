# Backup administrativo local do Supabase

O script `scripts/backup-supabase.mjs` é independente do Auth da aplicação.
Não aplica SQL, não restaura e não configura o projeto hospedado.

## Configuração privada

Preencher no `.env.local` ignorado pelo Git:

- `SENTINELA_DATABASE_URL`: URI PostgreSQL oficial obtida em **Connect**, com
  usuário, senha, banco e endpoint corretos. Preferir conexão direta; quando
  necessário por conectividade IPv4, usar **Session pooler**. Não usar Transaction
  pooler neste roteiro. Acrescentar `sslmode=verify-full` à query da URI.
- `SENTINELA_DATABASE_SSLROOTCERT`: caminho absoluto do certificado CA confiável
  obtido pelo canal oficial do provedor. Não usar marcador ou certificado arbitrário.

A URI deve estar entre aspas simples no `.env.local`. Codificar caracteres
reservados de usuário/senha com percent-encoding, incluindo `$` como `%24`, para
evitar interpretação pela sintaxe da URI e pela expansão do carregador de ambiente.
Não enviar a URI pela conversa, não passá-la em argumentos e não criar variáveis
administrativas com prefixo `NEXT_PUBLIC_`.

Opcionais: `SENTINELA_BACKUP_DIR` (padrão `D:/Backups/SENTINELA`) e
`SENTINELA_POSTGRES_BIN` (padrão `C:/Program Files/PostgreSQL/17/bin`).
Nenhum diretório de backup é criado até a execução explícita.

## Execução futura, somente após configurar e conferir o destino

```powershell
node scripts/backup-supabase.mjs --help
# Somente depois de confirmar projeto, endpoint, escopo e autorização:
node scripts/backup-supabase.mjs --run
```

Não há conexão no modo ajuda. A execução lê o ambiente com o carregador do Next,
valida a configuração e exige clientes PostgreSQL 17 e TLS verify-full.
A senha é transmitida exclusivamente no ambiente do subprocesso (`PGPASSWORD`),
nunca na linha de comando ou em arquivo temporário. Contas administrativas locais
podem inspecionar memória/ambiente de processos; executar em computador confiável.
Não usar depuração que capture o ambiente. `.gitignore` não criptografa o `.env.local`
nem impede `git add -f`; manter o arquivo acessível apenas a pessoas autorizadas.

O script usa `pg_dump -Fc`, sem filtros de schema, com sessão configurada como
somente leitura e espera por locks limitada. Não usa `--clean` ou restauração.
Erros e avisos brutos são suprimidos para evitar vazamento; falha não é sucesso.
Antes do dump, conferir por procedimento separado a identidade do projeto e o
inventário remoto: o script não comprova que uma URI pertence ao SENTINELA.

Os arquivos ficam em subpasta UTC identificada como SENTINELA/PRODUCTION fora do
repositório. No Windows, a nova subpasta recebe ACL para a conta executora, SYSTEM
e Administradores; falha na aplicação dessa ACL interrompe a exportação.
Não escolher diretório compartilhado ou sincronizado sem autorização.

Após sucesso são gravados `database.dump`, `archive-list.txt` e `manifest.json`
com SHA-256, versões, tamanho, duração, códigos de saída e sinalização de avisos.
O inventário pode conter nomes de objetos; mantê-lo protegido junto com o dump.
Arquivos `.partial` ou execução com erro não devem ser considerados backups válidos.

`pg_restore --list` e checksum comprovam leitura do inventário e integridade
identificada, não restauração. O manifesto marca comparação remota e restauração
como não realizadas. Se houver avisos, exige revisão segura antes do aceite.

## Limites

O dump cobre somente o banco e os objetos/dados acessíveis ao executor. Não inclui
definições globais de roles, binários de extensões, arquivos dos buckets, SMTP,
provedores Auth, configurações hospedadas ou recursos externos ao PostgreSQL.
Auth/Storage gerenciados podem exigir tratamento específico na recuperação.
Falha de permissão interrompe o processo; não ampliar grants automaticamente.
Restauração exige plano e autorização separados, começando por ambiente isolado.

Depois de obter o dump, comparar seu inventário com o banco, revisar avisos e
testar recuperação antes de considerar atendido o requisito para a baseline.
