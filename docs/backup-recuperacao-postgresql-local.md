# Backup e recuperação lógica local — Etapa 2.17.4

## Resultado de 13/11/2026

**BACKUP E RECUPERAÇÃO HOMOLOGADOS para o banco lógico e o estado inventariado.**
Não equivale a recuperação física integral do cluster, senhas, serviços ou PITR.
A carga operacional de RAs continua sem autorização nesta etapa.

O responsável autorizou expressamente `postgres` local exclusivamente para
leitura e backup. Foi utilizada autenticação privada preexistente, fora do Git.
As sessões da origem foram READ ONLY; nenhuma role, policy, grant, tabela ou
configuração operacional foi alterada. Não houve conexão ao Supabase.

## Artefato e evidência privada

Diretório: `D:\Backups\SENTINELA\LOCAL-PRE-RA-20261113T151626Z-04e9493eb5ba3846`.

| Campo | Resultado |
| --- | --- |
| Arquivo | `database.dump` |
| Formato | PostgreSQL custom, gzip nível 6 |
| Tamanho | 155930 bytes |
| SHA-256 | `75041a81fadcddb6af7a6a21b4b5d1a6ef028258016a0ac80bd9f18a451178b5` |
| Intervalo da execução final | 13/11/2026, 12:16:27–12:16:56, America/Sao_Paulo |
| Ferramentas | PostgreSQL 17.11: pg_dump, pg_restore, psql, initdb, pg_ctl |
| Exportação | Código zero, sem avisos |
| Inventário do archive | 322 entradas; `pg_restore --list` aprovado |
| Leitura integral | `pg_restore --file NUL` aprovado |
| Relatório | `report.json`, resultado PASS |
| SHA-256 do relatório | `382a2caca55a32d8e4b359241705c3277b19d6b6e6dc8da663157dcf6a2beefe` |

O diretório possui DACL protegida com acesso do usuário Windows atual, SYSTEM
e Administradores. Os arquivos herdam essa proteção. Não versionar dumps,
inventários privados, hashes de registros ou relatórios contendo metadados internos.
O diretório também contém snapshots estruturais e fingerprints dos dados da
origem e do destino, listagem do archive e arquivos derivados para testes negativos.

## Origem, consistência e cobertura

Origem atestada: `127.0.0.1:5432/sentinela_dev_operacional`, system identifier
`7702156035351602692`, PostgreSQL 17.11, PostGIS 3.6.2 em `extensions`.
Locale libc: `Portuguese_Brazil.1252`; codificação UTF8.

A coleta utiliza REPEATABLE READ READ ONLY e snapshot exportado compartilhado
com pg_dump. O dump não exclui schemas ou tabelas e não utiliza
`--enable-row-security`, `--no-owner` ou `--no-privileges`. A conta autorizada já
possuía privilégios suficientes; não houve elevação da reader nem alteração de RLS.
O inventário confirmou as 19 tabelas de usuário fora das extensões, todas em
`sentinela`. Objetos adicionais fora do escopo suportado interrompem a execução,
em vez de serem silenciosamente omitidos da qualificação.

Foram comparados estrutura e fingerprints ordenados dos dados das 19 tabelas.
Somente os catálogos iniciais possuem registros: três perfis, seis permissões,
12 associações e seis versões no ledger. As demais tabelas estão vazias.
As comparações incluem colunas, tipos, defaults, constraints, índices, triggers,
funções, ENABLE/FORCE RLS, policies, grants, ACLs efetivas, dependências e extensões.
Não foram validados automaticamente os CHECKs NOT VALID existentes.

Resultado estrutural: 19 tabelas com ENABLE/FORCE RLS, 34 FKs, 77 índices válidos,
55 triggers habilitados, 17 funções, seis policies SELECT, 48 grants por coluna
e dois CHECKs NOT VALID preservados.

ACL NULL com os privilégios padrão do proprietário e ACL explicitamente
equivalente são comparadas pelo conteúdo efetivo via `aclexplode/acldefault`.
Isso evita falso drift sem ignorar mudanças de privilégios.

### Verificações globais agora comprovadas

| Verificação | Resultado |
| --- | --- |
| Total global de RAs | 0 |
| Códigos internos distintos | 0 |
| Grupos de códigos duplicados | 0 |
| Ativas/inativas | Não aplicável: o schema não possui essa coluna |
| Ledger | `0001`, `0002`, `0003`, `0004`, `0005`, `local-read-0001` |
| Dados operacionais dependentes | Ausentes no snapshot das tabelas inventariadas |

Estes resultados provêm da conta explicitamente autorizada para leitura global,
e não da contagem filtrada da reader. A reader continua sem acesso ao ledger;
seu SQLSTATE 42501 histórico não foi contornado por novos grants.

## Restauração real comprovada

Foi criado um cluster novo, sem reutilizar diretório ou credencial operacional:

- UUID `451b4b30-3ec6-4495-8884-ade6553da467`.
- System identifier `7707675253484173024`, distinto da origem.
- Listener exclusivamente `127.0.0.1:55432`.
- Banco `sentinela_rls_sandbox`, criado vazio após atestação.
- Diretório privado em `%USERPROFILE%\.sentinela-local\rls-sandboxes`.
- Estado final STOPPED; cluster preservado, sem descarte automático.

O restore integral utilizou `pg_restore --exit-on-error --single-transaction`,
sem `--clean`, DROP ou alteração da origem. Código zero e nenhuma divergência
estrutural inesperada. Os dados das 19 tabelas e o ledger coincidem com a origem.
O estado estrutural e os fingerprints da origem antes/depois permaneceram iguais.

A role `sentinela_local_reader` foi recriada somente no cluster novo para manter
as referências de ACL, sem senha e com NOLOGIN. A diferença LOGIN/NOLOGIN é
explicitamente permitida apenas para essa role; os demais atributos restritivos
e privilégios precisam coincidir. O administrador do clone recebeu segredo
aleatório próprio por named pipe Windows privado. Não houve arquivo de senha
em texto puro nem senha em argumentos de processo.

## Falhas e testes

Na execução final, quatro testes reais passaram: hash divergente, cabeçalho
corrompido em arquivo derivado, archive truncado em arquivo derivado e falha
nativa de uma segunda restauração no próprio destino descartável. Esta última
confirmou rollback integral por transação única, com estrutura e dados preservados.
Os códigos não zero desses testes são esperados, distintos do restore válido.
As categorias de diagnóstico são heurísticas sanitizadas, não prova isolada da
causa nativa; não interpretar cada categoria como diagnóstico definitivo.

Os 14 testes Python cobrem também versão incompatível, extensão ausente,
permissão insuficiente, timeout, interrupção, destinos incorretos, locale,
isolamento da reader e transporte privado da senha. Esses casos são simulados,
exceto a entrega real pelo named pipe em arquivo/processo descartável. Não houve
remoção real de extensão nem interrupção forçada de um servidor PostgreSQL.

Regressão: 217 testes Node aprovados, incluindo o runner dos 14 testes Python;
TypeScript da aplicação e do write-sandbox, ESLint, contratos Zod/OpenAPI,
checagem estática de rotas, parser PowerShell e build Next.js isolado aprovados.
Não equivale a nova homologação visual no navegador.

Tentativas anteriores foram preservadas: a primeira encontrou bloqueio de
entrada de senha no initdb; a segunda restaurou, mas revelou falso drift na
representação de ACL. O bootstrap passou a usar named pipe e a comparação passou
a normalizar privilégios efetivos. Uma terceira execução passou antes da inclusão
da matriz final de falhas. Nenhuma dessas evidências foi sobrescrita ou apagada.

## Repetição autorizada e recuperação

Somente com autorização vigente para a conta existente, o procedimento completo é:

```powershell
python -B database/local/backup/recover.py --execute --authorized-account postgres
```

Utiliza o pgpass privado existente. Para entrada oculta alternativa:

```powershell
.\scripts\backup-local-postgresql.ps1 -AuthorizedAccount postgres
```

Cada execução cria diretório e cluster novos; não reutiliza nem sobrescreve
backups. O wrapper não modifica `.env.local`. A senha permanece apenas em memória
e no ambiente privado do subprocesso que a necessita; não enviar senha pelo chat.
Não repetir automaticamente após falha. Preservar evidências e conferir identidade,
processos, listener e manifesto antes de qualquer recuperação posterior.

O backup lógico não inclui senhas/roles globais, HBA, binários de extensão,
serviços Windows, WAL ou PITR. Extensões precisam estar disponíveis no destino.
O pg_verifybackup é destinado a backups físicos de pg_basebackup; não se aplica
a este archive lógico. A prova deste escopo é o restore real e sua comparação.
Não foi testada restauração de autenticação operacional, dados futuros ou
ambiente Supabase hospedado. Não existe autorização para restauração operacional.

Referências: [pg_dump 17](https://www.postgresql.org/docs/17/app-pgdump.html) e
[pg_verifybackup 17](https://www.postgresql.org/docs/17/app-pgverifybackup.html).

## Próxima decisão

O [roteiro revisado de carga](catalogo-ras-carga.md#roteiro-de-liberação-do-pacote-revisado)
inclui a verificação offline dos artefatos e o confronto do snapshot corrente
com os fingerprints do backup. A conferência offline mantém o estado global
atual pendente. Ela usa os artefatos da restauração isolada aqui documentada.

Backup e restore deixam de ser bloqueios para este estado inventariado.
A carga de RAs ainda depende de autorização específica, aprovação semântica do
catálogo, estratégia de UUIDs/códigos e revisão das ACLs/policies necessárias.
Não reetiquetar RAs reais com marcador sintético para contornar a reader.
Preservar o backup até uma política de retenção ser aprovada; este procedimento
não exclui backups, evidências nem sandboxes históricos.
