# Instalação inicial compatível com Supabase — v1

Sprint 4, Etapa 2.1. Artefato preparado **localmente**, sem aplicação remota e sem homologação operacional do Supabase. Consulte o [ADR](../../docs/decisoes/adr-baselines-local-supabase.md) e o [relatório de preparação](../../docs/banco/preparacao-baseline-supabase-etapa2-1.md).

## Dois caminhos exclusivos

| Destino inicial vazio | Caminho |
| --- | --- |
| PostgreSQL local com PostGIS em public | `database/migrations/0001` a `0005`, preservados |
| Ambiente com PostGIS previamente instalado em extensions | Somente `database/supabase/baseline/0001_modelo_inicial.sql` |

Nunca concatenar os dois caminhos, executar recursivamente todos os SQLs de database/, ou apontar um runner automático para ambos os diretórios. Esta baseline não é uma migration posterior à 0005. Não foi copiada para supabase/migrations nem configurada para deploy automático.

`sources.json` registra checksums SHA-256 dos cinco arquivos de origem e do artefato. Para portabilidade de checkout, os checksums usam UTF-8 com finais de linha LF (CRLF normalizado). Os hashes das origens coincidem com os da homologação da Etapa 1. Nenhuma fonte foi alterada.

O ledger mantém **cinco versões lógicas** 0001–0005, para preservar a estrutura e os testes. No caminho Supabase, isso representa o estado equivalente, não a execução byte a byte dos SQLs originais. O comentário do schema identifica `sentinela:supabase-baseline-v1:logical-0001-0005`; manifesto, checksum do artefato e evidência externa completam a proveniência. Não há tabela extra ou mudança no modelo.

## Adaptações permitidas

- Pré-verificação exige PostgreSQL >= 15, UTF-8 e PostGIS >= 3.3 em extensions. Não cria, move, atualiza ou reinstala a extensão.
- Recusa qualquer schema sentinela preexistente, inclusive vazio ou de instalação parcial; não tenta reparar/recriar automaticamente. Advisory lock transacional serializa este instalador; CREATE SCHEMA sem IF NOT EXISTS também evita sobreposição.
- Tipos e funções espaciais usam extensions.geometry e extensions.ST_*. Índices GiST permanecem sobre as mesmas colunas, com a classe padrão do tipo geometry; não há índice espacial em public a mover.
- Search path de instalação: pg_catalog, sentinela, extensions. Funções preservam seu caminho restrito pg_catalog e qualificam referências à aplicação e ao PostGIS. Nenhuma configuração global ou das roles gerenciadas é alterada.
- Uma única transação, em vez das cinco transações locais. Somente ENABLE/FORCE RLS é adiado até depois das verificações e do último registro do ledger. As travas de integridade permanecem; não se cria policy temporária e não se exige superusuário/BYPASSRLS para inserir o ledger.
- RLS é habilitado e forçado antes do único COMMIT. Antes dele, objetos novos não são visíveis às outras sessões. Qualquer falha reverte toda a instalação.
- Revoga privilégios de PUBLIC como na origem e também privilégios diretos/defaults por schema de anon, authenticated e service_role, **se existirem**. Não cria essas roles. ACLs residuais para outros grantees em schema/tabelas/sequências/funções fazem a instalação abortar.

O instalador precisa de CREATE no banco, USAGE em extensions e acesso aos tipos/funções da extensão usados pelo modelo, além de poder possuir/alterar os objetos que cria. Uma instalação gerenciada ainda precisa validar privilégios efetivos e event triggers do projeto; não presumir que o postgres remoto é um superusuário.

As revogações de defaults são limitadas ao schema e proprietário executor. No PostgreSQL, um REVOKE por schema não cancela grants globais de default privileges. Portanto, **cada futura criação de função deve incluir REVOKE explícito na mesma transação**; não assumir que as declarações históricas garantem funções futuras privadas. O fechamento dos objetos atuais é conferido antes do COMMIT. Não revogar defaults globais do postgres gerenciado indiscriminadamente.

## Validações estáticas

Usar o ambiente de ferramentas pglast descrito no [README local](../README.md):

```powershell
python database/tests/validate_structure.py --parser-path tmp/sql-validation
python database/supabase/tools/baseline.py
python database/supabase/tests/validate_baseline.py --parser-path tmp/sql-validation
python database/supabase/tests/test_validation.py
```

O gerador funciona como verificador por padrão. `--write` serve somente para geração inicial e recusa sobrescrever artefato ou manifesto existentes. Não atualizar checksums para esconder alterações: baselines publicadas são congeladas; correções exigem revisão e estratégia de versionamento.

A comparação AST independente ignora apenas posições lexicais, controles transacionais de instalação, pré-verificação da extensão original e diferenças espaciais/RLS explicitamente permitidas. Todas as definições do modelo são comparadas. Também se analisam os corpos SQL/PLpgSQL. O artefato completo é comparado com uma derivação determinística, incluindo fechamento de privilégios e guardas de instalação.

Os oito testes do verificador incluem rejeição de FK removida, FORCE RLS removido, referência espacial em public, policy permissiva, reinstalação de extensão, checksum divergente e sobrescrita do artefato. Não substituem os testes de banco.

## Regressão local opcional

Não usar URLs de ambiente, credenciais no comando ou banco remoto. O runner fixa localhost:5432 e postgres, exige nomes com prefixo sentinela_model_test_ e verifica ambos os destinos antes de seu primeiro DDL.

Preparar manualmente duas bases **novas e descartáveis**:

1. Referência: banco vazio, sem PostGIS; a migration local 0001 provisiona a extensão em public.
2. Alvo: banco sem objetos de aplicação, somente com PostGIS já provisionado em extensions. Não mover a extensão de outro banco para preparar esse alvo.
3. Disponibilizar autenticação não interativa para **cada nome de banco**, fora do projeto; não enviar senhas pelo chat. O runner usa psql -X -w e ON_ERROR_STOP=1.

```powershell
python database/supabase/tests/run_local_checks.py --psql "C:\Program Files\PostgreSQL\17\bin\psql.exe" --reference-db sentinela_model_test_reference21 --supabase-db sentinela_model_test_supabase21
```

O runner aplica as origens à referência, executa sua regressão, cria uma role de fixture NOLOGIN/NOSUPERUSER/NOBYPASSRLS para instalar o alvo, verifica bloqueio do próprio proprietário por FORCE RLS e rejeição de reaplicação/aplicação cruzada. Reutiliza a regressão sintética original com **somente** qualificações espaciais adaptadas em arquivo temporário ignorado pelo Git. Confere catálogos, contagens pós-rollback e ausência da role da regressão.

A role de instalação é exclusivamente uma fixture, com nome aleatório. Ao finalizar, seus objetos são reatribuídos ao postgres local e ela é removida; não há DROP OWNED/CASCADE. As bases e as estruturas aplicadas permanecem para diagnóstico. Falha em uma instalação/regressão interrompe a sequência; não recria bases automaticamente. O runner exige superusuário LOCAL para preparar as fixtures da regressão, mesmo que a aplicação da baseline alvo seja testada sem superusuário. Isso não reproduz as roles gerenciadas completas do Supabase.

Comparação posterior, somente leitura:

```powershell
python database/supabase/tests/compare_catalogs.py --psql "C:\Program Files\PostgreSQL\17\bin\psql.exe" --local-db sentinela_model_test_reference21 --supabase-db sentinela_model_test_supabase21
```

Compara tabelas/RLS, colunas/defaults, domínios, constraints/FKs, índices, triggers, funções e ACLs. Normaliza somente a localização espacial; exclui proprietários, OIDs e timestamps de dados. Não certifica a versão 3.3.7 nem o ambiente gerenciado.

## CHECKs NOT VALID e Auth futuro

Preservados correcao_nova_transacao_ck e evento_novo_transacao_ck, com transacao_id xid8. NOT VALID dispensa varredura histórica na adição, mas exige a condição em novos registros; triggers carimbam a transação e o instante. Não inventar carimbos retroativos nem validar/reescrever essas constraints silenciosamente.

Continuam exatamente três perfis e a matriz homologada, inclusive consultar_central para os três; qualquer mudança funcional depende da próxima etapa. auth_user_id continua UUID UNIQUE e opcional, sem FK para auth.users. Não há auth.uid falso, criação de auth.users, usuários reais, RPC, policies de aplicação, API exposta ou credencial.

Auth futuro exige vínculo à PK auth.users.id, provisionamento aprovado, preservação de autoria histórica, políticas por identidade ativa/ação/escopo e backend transacional. A trava de correção da 0005 continua ativa, inclusive para Administradores. Não usar service_role para contorná-la.
