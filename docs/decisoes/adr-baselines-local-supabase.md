# ADR — Baselines exclusivas para instalação local e Supabase

## Status

Adotado na preparação local da Sprint 4 — Etapa 2.1, conforme solicitação da equipe. Aplicação remota não autorizada e ainda não homologada.

## Data

2026-10-29.

## Contexto

A Etapa 1 homologou PostgreSQL 17.11/PostGIS 3.6.2 com PostGIS em public. As migrations 0001–0005 estão integradas e devem permanecer imutáveis. O projeto Supabase informado utiliza PostGIS 3.3.7 em extensions, sem tabelas da aplicação. A 0001 exige public, e 0001/0003/0004 qualificam tipos/funções nesse schema. Uma 0006 posterior não impediria a falha inicial da 0001. O ambiente gerenciado não oferece o mesmo superusuário local; FORCE RLS antecipado também não deve exigir policies temporárias para instalar o ledger.

## Decisão

Manter duas entradas mutuamente exclusivas para o mesmo estado lógico 0005:

- Local: os cinco arquivos originais em database/migrations/.
- Supabase: um artefato inicial em database/supabase/baseline/, derivado deterministicamente das cinco fontes congeladas e acompanhado por manifesto SHA-256.

A entrada Supabase apenas exige extensão preexistente, qualifica objetos em extensions, usa search_path restrito e executa tudo em uma transação. ENABLE/FORCE RLS é transferido para o final dessa transação, depois de seeds, ledger e verificações. Nenhum estado intermediário é publicado, nenhuma policy temporária é criada e nenhuma proteção é retirada do estado final.

O artefato revoga grants diretos de roles de aplicação conhecidas, quando presentes, e aborta com ACL inesperada. Não altera papéis gerenciados, não concede BYPASSRLS e não depende de Auth para instalação. Não modifica o modelo de dados aprovado.

## Prevenção de aplicação duplicada

Não executar recursivamente todos os SQLs do repositório. Cada ambiente escolhe exatamente uma entrada. O instalador Supabase recusa schema sentinela preexistente, usa advisory lock transacional e CREATE SCHEMA sem IF NOT EXISTS. As origens locais também não podem ser reaplicadas sobre estrutura existente; sua primeira verificação já recusa PostGIS em extensions. Instalação parcial exige diagnóstico, nunca DROP/recriação automática.

O ledger conserva cinco versões **lógicas**; não afirma execução literal das origens no Supabase. Comentário de schema identifica a baseline; manifesto, checksum do artefato e relatório externo identificam sua proveniência. Não inserir uma sexta linha no ledger nem criar uma vigésima tabela apenas para esse marcador.

## Evolução e consistência

1. Congelar as duas entradas após publicação; não regenerar silenciosamente a baseline inicial para absorver 0006+.
2. Futuras mudanças têm uma única especificação lógica, revisão de contrato e identificação de versão 0006+.
3. Mudanças SQL portáveis usam a mesma definição; diferenças de qualificação/dependências Auth exigem variantes por destino explicitamente relacionadas e com checksums próprios. Nunca inferir que IDs iguais significam arquivos iguais.
4. Toda mudança deve definir sua ordem/dependências e testar atualização desde ambas as entradas quando aplicável. Mudanças exclusivas do Supabase não serão aplicadas ao perfil local sem Auth; isso deve constar no manifesto/roteiro da nova versão.
5. Comparar AST e catálogos finais, após normalizar somente diferenças de ambiente documentadas. Revisar políticas, privilégios e funções junto com mudanças de estrutura.
6. Nenhum runner de migração automático foi introduzido nesta etapa; sua implementação futura deverá selecionar explicitamente o perfil e conferir a baseline instalada.

As verificações atuais preservam fontes/checksums, definições das 19 tabelas, constraints, índices, funções/triggers, dois CHECKs NOT VALID, RLS fechado e imutabilidade. A regressão de execução compara o modelo real, não somente contagens.

## Alternativas consideradas

- Reescrever 0001–0005: rejeitado por perder rastreabilidade do que já foi homologado.
- Somente adicionar 0006: insuficiente, pois a instalação falharia na 0001.
- Mover/reinstalar PostGIS: rejeitado; deve-se adaptar a aplicação ao schema informado.
- Criar aliases/wrappers em public para simular PostGIS: rejeitado por ocultar dependências e aumentar superfície e manutenção.
- Liberar policies temporárias ou exigir BYPASSRLS do instalador: desnecessário com transação única e RLS ativado no final.

## Consequências e limites

Há dois artefatos de instalação a acompanhar; geração determinística, manifesto e comparação independente reduzem divergências. A atomicidade Supabase difere das cinco transações locais; falha reverte toda a nova instalação, sem apagar estruturas anteriores.

Os CHECKs NOT VALID continuam intencionais: exigidos em novas linhas, sem validar/retroatribuir transações do passado. Todos os bloqueios da 0005 continuam ativos. A baseline não concede acesso aos perfis, não integra Auth e não homologa o ambiente remoto.

Defaults de funções devem ser tratados explicitamente nas migrations futuras: REVOKE por schema não desfaz grants globais de default privileges. Cada nova função deve ser fechada na mesma transação. Não alterar defaults globais de roles gerenciadas indiscriminadamente.

## Links relacionados

- [Baseline e reprodução](../../database/supabase/README.md)
- [Manifesto](../../database/supabase/sources.json)
- [Relatório da preparação](../banco/preparacao-baseline-supabase-etapa2-1.md)
- [Modelagem homologada](../banco/modelagem-postgresql-postgis-v1.0.md)
- [Sprint 4](../../sprints/sprint-04.md): Feature #16 e PBIs #120/#123/#126; sem fechamento de issues nesta etapa.
- [PostGIS no Supabase](https://supabase.com/docs/guides/database/extensions/postgis)
- [Limites do postgres gerenciado](https://supabase.com/docs/guides/database/postgres/roles-superuser)
- [RLS PostgreSQL](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
- [Default privileges PostgreSQL](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)
