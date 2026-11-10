# Sprint 4 — Etapa 2.1: preparação da baseline Supabase

Data: 29/10/2026. Branch: feat/sprint4-etapa2-auth. **Etapa 2.1 homologada localmente: instalações e regressões SQL anteriores aprovadas, comparação integral dos catálogos agora aprovada. Sem homologação operacional do Supabase real.**

## Correção do comparador e conclusão local — resultado atual

Alterados nesta rodada somente database/supabase/tests/compare_catalogs.py e este relatório; criado database/supabase/tests/test_compare_catalogs.py. Nenhuma migration, baseline, manifesto, definição instalada ou outro arquivo do modelo foi modificado.

### Causa e correção

catalog_snapshot.sql obtém pg_get_functiondef no terceiro campo (índice 2) de cada entrada da categoria functions. snapshot() carregava esse JSON e aplicava a normalização espacial preexistente, mas comparava os finais de linha literalmente. As fontes Windows produziram CRLF nas definições da referência; o artefato gerado produziu LF no alvo.

normalize_function_definition() agora executa exclusivamente CRLF -> LF e depois CR isolado -> LF. normalize_catalog() aplica essa operação somente a functions[*][2], após a normalização espacial que já existia. Nenhum comentário, espaço, identificador, literal ou instrução é removido; nenhum outro caractere é alterado pela nova função. Nome, argumentos, SECURITY DEFINER/configuração e demais categorias não recebem normalização de finais de linha.

### Testes automatizados

```powershell
python database/supabase/tests/test_compare_catalogs.py
```

Código 0: **11 testes aprovados**, sem conexão ao banco. Cobrem equivalência CRLF/LF/CR isolado; preservação exata dos demais caracteres, inclusive espaços, tabulação e caracteres acentuados; detecção de alterações em instruções SQL, literais, identificadores, comentários e espaços; detecção de alterações em constraints e finais de linha de outras categorias; preservação dos metadados da função; integração da normalização com snapshot() sem modificar a entrada.

Os testes de divergência exercitam o caminho real de comparação da CLI e exigem Catalog mismatch para a categoria alterada, não apenas uma comparação isolada entre strings.

### Comparação real somente leitura

```powershell
python database/supabase/tests/compare_catalogs.py --psql "C:\Program Files\PostgreSQL\17\bin\psql.exe" --local-db sentinela_model_test_reference21 --supabase-db sentinela_model_test_supabase21
```

Código 0. A CLI confirmou a identidade local de cada banco e comparou integralmente suas categorias: tabelas/RLS, colunas/defaults, constraints/FKs, domínios, índices, triggers, funções e privilégios de tabelas/funções/schema. **Nenhuma divergência restante.** Somente o schema espacial e, agora, finais de linha das definições de funções são normalizados; proprietários, OIDs e timestamps continuam fora do comparador conforme o escopo original.

Confirmados pelo comparador: 19 tabelas com ENABLE/FORCE RLS, 34 FKs, 77 índices válidos/prontos, 55 triggers habilitados, dois CHECKs NOT VALID intencionais, zero policies e zero grants externos nos objetos verificados. As funções também passaram pela comparação de todas as definições e metadados extraídos.

Esta rodada não reaplicou migrations, não repetiu o runner de instalação, não recriou bancos e não executou DDL/DML. A homologação local combina as instalações/regressões SQL aprovadas na rodada anterior, incluindo 43 comandos negativos em cada ambiente e rollback confirmado, com a comparação integral aprovada nesta rodada. O manifesto foi novamente verificado sem drift nas fontes ou artefato.

### Limites e continuidade

Homologação restrita a PostgreSQL 17.11/PostGIS 3.6.2 locais, com PostGIS em public versus extensions. PostGIS 3.3.7, versão PostgreSQL efetiva, roles, privilégios/defaults, event triggers e operação no ambiente gerenciado Supabase ainda precisam de validação específica e autorização de execução. Nenhuma conexão ao projeto remoto foi feita.

Auth, vínculo a auth.users e autorização por identidade ativa/ação/escopo continuam para a próxima implementação. As travas de correção e os dois CHECKs NOT VALID permanecem intactos. Nenhuma leitura de pgpass.conf, credencial em código, alteração de dados PCDF/SENTINELA-DADOS, frontend ou commit.

## Retomada após configuração da autenticação — histórico da falha corrigida

As duas conexões com `psql -X -w -h localhost -p 5432 -U postgres -v ON_ERROR_STOP=1` foram aprovadas. Cada servidor confirmou exatamente o banco solicitado, usuário postgres e endereço ::1:5432. PostgreSQL 17.11 nos dois bancos. Antes de qualquer DDL, ambos continham somente plpgsql, zero relações de usuário fora de extensões e zero schemas adicionais. Não havia dados de outros projetos.

PostGIS 3.6.2 estava disponível para instalação. A nova base alvo recebeu `CREATE SCHEMA extensions; CREATE EXTENSION postgis WITH SCHEMA extensions;`. Na referência, a própria 0001 instalou PostGIS em public. Nenhuma extensão preexistente foi movida/reinstalada. Não foi reproduzida a versão remota 3.3.7.

Executado:

```powershell
python database/supabase/tools/baseline.py
python database/supabase/tests/run_local_checks.py --psql "C:\Program Files\PostgreSQL\17\bin\psql.exe" --reference-db sentinela_model_test_reference21 --supabase-db sentinela_model_test_supabase21
```

O verificador de fontes/artefato terminou com código 0. O runner usou ON_ERROR_STOP=1 em todas as sessões e terminou com código 1 na comparação final; a execução não foi declarada aprovada. Não houve repetição de migrations após a falha.

| Etapa do runner | Resultado real |
| --- | --- |
| Referência: migration 0001 | Código 0, aplicada |
| Referência: migration 0002 | Código 0, aplicada |
| Referência: migration 0003 | Código 0, aplicada |
| Referência: migration 0004 | Código 0, aplicada |
| Referência: migration 0005 | Código 0, aplicada |
| Referência: consistencia.sql original | Código 0; regressão concluída com rollback |
| Alvo: baseline Supabase | Código 0, aplicada como proprietário NOLOGIN/NOSUPERUSER/NOBYPASSRLS |
| RLS FORCE contra o próprio proprietário | SELECT sem visibilidade dos seeds e INSERT rejeitado conforme esperado |
| Reaplicação e aplicação cruzada das baselines | Rejeições esperadas confirmadas, sem alteração da estrutura instalada |
| Alvo: regressão adaptada somente nas qualificações espaciais | Código 0; regressão concluída com rollback |
| Comparação de catálogos | Falhou: AssertionError: ['functions'] |

As duas regressões executaram os 43 comandos negativos do helper esperar_erro, que exige falha com SQLSTATE esperado, além do teste de RLS sob role sem BYPASSRLS. Constraints diferidas foram verificadas pelo SQL. O runner usa -q, que suprime tags; o término sem erro dos scripts com ROLLBACK final foi corroborado pelas contagens em leitura após a interrupção.

### Diagnóstico e correção necessária

O diagnóstico posterior foi somente leitura, usando snapshots dos mesmos bancos. Somente a categoria functions divergiu. Nas 17 funções, o único campo divergente foi pg_get_functiondef: a referência preservou finais de linha CRLF das fontes Windows, e o artefato gerado contém LF. Para todas as 17 definições, os textos coincidiram após normalizar CRLF para LF, além da normalização espacial já existente. Não houve diferença textual restante nem divergência nas demais categorias do catálogo.

O problema identificado é de portabilidade do comparador: compare_catalogs.py normaliza public/extensions, mas não finais de linha. Correção recomendada: normalização controlada de finais de linha nas definições de funções, com testes que mantenham a detecção de alterações reais de SQL. Não é necessário alterar o modelo, as funções instaladas, a baseline ou as migrations originais por causa desse diagnóstico.

Conforme a instrução de interromper em falha, não foi aplicada correção ao comparador e não se prosseguiu com nova rodada de testes. A comparação apenas diagnóstica não substitui a aprovação do validador.

### Estado pós-falha, confirmado somente por leitura

| Objeto/proteção | Referência public | Alvo extensions |
| --- | --- | --- |
| Tabelas | 19 | 19 |
| RLS ENABLE/FORCE | 19/19 | 19/19 |
| FKs | 34 | 34 |
| CHECKs, incluindo domínios | 86 | 86 |
| PKs / UNIQUE / constraints de triggers | 19 / 20 / 4 | 19 / 20 / 4 |
| Índices | 77, todos válidos/prontos | 77, todos válidos/prontos |
| Funções | 17, nenhuma SECURITY DEFINER | 17, nenhuma SECURITY DEFINER |
| Triggers de usuário | 55, todos habilitados | 55, todos habilitados |
| Policies | 0 | 0 |
| Grants externos em schema/tabelas/funções | 0 | 0 |
| CHECKs NOT VALID | 2 intencionais | 2 intencionais |

Nos dois bancos, os únicos CHECKs não validados são historico_correcoes.correcao_nova_transacao_ck e eventos_auditoria.evento_novo_transacao_ck. Não se executou VALIDATE CONSTRAINT nem se alterou essa decisão.

Contagens idênticas após os testes: schema_migrations=5, perfis=3, permissoes=6, perfil_permissoes=12. As outras 15 tabelas estão vazias. Não restaram fixtures; nenhuma role sentinela_baseline21* ou sentinela_teste_sem_acesso permaneceu. O finally do runner reatribuiu os objetos da role instaladora ao postgres local e removeu somente essa role de teste. As duas bases instaladas permanecem disponíveis para diagnóstico, sem recriação ou descarte automático.

As migrations e testes originais continuam sem diff; o manifesto/artefato foi conferido sem drift. Nesta retomada, somente este relatório foi alterado no repositório. Os resultados estáticos anteriores permanecem registrados abaixo; não foram usados para substituir a comparação operacional que falhou.

### Próxima rodada e limites

Corrigir e testar o comparador antes de retomar. As duas bases agora contêm a aplicação: **não executar novamente o runner de instalação limpa**, que corretamente as recusará. Utilizar o comparador somente leitura após a correção, verificações pós-teste e, se necessário, repetir apenas as regressões transacionais apropriadas, sem reaplicar migrations.

A Etapa 2.1 continua **não homologada localmente**, pois a comparação automatizada não foi aprovada. Mesmo após sua aprovação, ainda será necessário validar PostGIS 3.3.7, versão PostgreSQL efetiva, roles/grants/defaults/event triggers e comportamento no ambiente gerenciado Supabase. As roles gerenciadas completas não foram simuladas. Auth, FK auth.users, políticas por perfil/escopo e integrações Next.js continuam fora desta baseline.

Nenhuma leitura de pgpass.conf, conexão remota, alteração de dados PCDF/SENTINELA-DADOS, credencial em arquivo, commit, push, PR ou merge.

## Preparação inicial e tentativa anterior — histórico

As seções seguintes preservam o registro da preparação e do bloqueio de autenticação anteriores à retomada acima.

## Arquivos

Criados:

- database/supabase/baseline/0001_modelo_inicial.sql: instalação inicial atômica, separada das fontes locais.
- database/supabase/sources.json: identidade, versões lógicas e checksums das fontes/artefato.
- database/supabase/tools/baseline.py: derivação determinística e verificação de congelamento.
- database/supabase/tests/validate_baseline.py: sintaxe e equivalência AST independente.
- database/supabase/tests/test_validation.py: oito testes positivos/negativos do verificador.
- database/supabase/tests/catalog_snapshot.sql: consulta somente leitura aos catálogos.
- database/supabase/tests/compare_catalogs.py: comparação normalizada entre duas bases locais.
- database/supabase/tests/run_local_checks.py: aplicação/regressão local optativa com comparação de catálogos.
- database/supabase/README.md e .gitignore: operação, limites e exclusão de caches Python.
- docs/decisoes/adr-baselines-local-supabase.md: estratégia, alternativas e evolução.
- Este relatório.

Modificado somente database/README.md para apontar ao caminho separado. Não houve alteração das migrations 0001–0005, regressão/validador originais, frontend, dependências do aplicativo ou contratos.

## Estratégia e comparação com o original

O novo arquivo deriva somente das cinco migrations congeladas. Não é uma 0006; destina-se exclusivamente a instalação inicial em banco sem schema sentinela. Não combinar as entradas. Pré-verificação, CREATE SCHEMA sem IF NOT EXISTS e advisory lock evitam reaplicação; nenhuma estrutura é apagada ou recriada automaticamente.

O ledger conserva 0001–0005 como estados lógicos; comentário do schema e manifesto identificam a execução por baseline consolidada. O manifesto não afirma que os originais foram aplicados literalmente. Futuras migrations seguirão 0006+, com especificação lógica única e variantes por destino quando necessário, sem regenerar a baseline congelada silenciosamente.

| Aspecto | Resultado estático |
| --- | --- |
| Fontes homologadas | Checksums correspondentes aos da Etapa 1; git diff restrito às fontes vazio |
| Tabelas | Mesmas 19 |
| FKs | Mesmas 34, por equivalência AST e validador original |
| Índices explícitos | Mesmos 38; GiST conserva colunas e classe padrão do tipo |
| Constraints, domínios, funções e triggers | Definições preservadas, exceto qualificação espacial e ativação final do RLS |
| Dados iniciais | Mesmos três perfis, seis permissões, 12 vínculos e cinco estados do ledger |
| RLS | ENABLE/FORCE em todas as tabelas antes do único COMMIT, nenhuma policy |
| Originais e auditoria | Mesmas travas de imutabilidade, histórico e autoria |
| NOT VALID | Dois CHECKs intencionais preservados |
| Auth | Nenhum usuário, FK, policy ou fluxo real introduzido |

Números acima descrevem os arquivos, **não objetos confirmados em um novo banco**. A comparação de catálogos reais foi preparada, mas não executada até o fim nesta etapa.

## Adaptações e avaliação do ambiente

Tipos/funções usam extensions.geometry e extensions.ST_*, inclusive nos CHECKs e avaliação territorial. O artefato não contém CREATE/ALTER/DROP EXTENSION. Exige PostGIS preexistente em extensions, versão >= 3.3, PostgreSQL >= 15 e UTF-8. A versão principal do PostgreSQL remoto não foi conferida.

Instalação usa pg_catalog, sentinela, extensions; as funções conservam search_path pg_catalog e nomes qualificados. GiST mantém a implementação padrão associada ao tipo geometry. Nenhuma configuração global de schema/role foi alterada.

Cinco transações foram consolidadas em uma. Somente a ativação ENABLE/FORCE RLS foi transferida para depois da última escrita de seeds/ledger e validação de integridade. Não há janela intermediária publicada, policy temporária ou exigência de BYPASSRLS para essas escritas. Funções/triggers protetores permanecem no modelo final, inclusive a trava de correções da 0005.

Preservam-se REVOKEs de PUBLIC. Roles anon/authenticated/service_role, se existentes, recebem somente REVOKEs de grants diretos/defaults por schema. Não são criadas. ACLs residuais inesperadas em schema, tabelas/sequências e funções abortam a transação. A conta instaladora precisa de CREATE no banco, USAGE/acesso aos tipos/funções de extensions e propriedade dos objetos criados. RLS FORCE não impede BYPASSRLS nem substitui privilégios mínimos e isolamento de credenciais administrativas.

Limitação documentada de default privileges: REVOKE por schema não remove grants globais, inclusive EXECUTE público padrão de funções. O artefato fecha explicitamente todas as funções antes do COMMIT. Migrations futuras deverão revogar explicitamente a execução das funções criadas na mesma transação; não se alteram defaults globais de roles gerenciadas nesta etapa.

correcao_nova_transacao_ck e evento_novo_transacao_ck continuam NOT VALID: novas linhas precisam de transacao_id, os triggers carimbam transação/instante, e registros históricos não recebem carimbo inventado. Não se executou VALIDATE CONSTRAINT nem qualquer correção de dados.

## Testes executados

| Comando | Resultado final |
| --- | --- |
| python database/tests/validate_structure.py --parser-path tmp/sql-validation | Aprovado: cinco migrations, sintaxe da regressão e estrutura original |
| python database/supabase/tools/baseline.py | Aprovado: fontes/manifesto/artefato consistentes |
| python database/supabase/tests/validate_baseline.py --parser-path tmp/sql-validation | Aprovado: equivalência AST das cinco fontes, SQL/PLpgSQL, transação única, 19 tabelas, 38 índices, dois NOT VALID; 22 corpos procedurais incluindo pré/finalização |
| python database/supabase/tests/test_validation.py | 8 testes aprovados |
| Sintaxe Python e SQL da consulta de catálogos | Verificada estaticamente |
| Snapshot somente leitura do banco local preexistente sentinela_model_test | Aprovado: consulta retornou 19 tabelas, 77 índices, 55 triggers e ausência de policies/grants externos nos objetos conferidos |
| run_local_checks.py com duas bases locais descartáveis | Interrompido na autenticação, antes do primeiro DDL do runner |

Os testes negativos do verificador rejeitam remoção de FK, remoção de FORCE RLS, referência espacial em public, policy permissiva, reinstalação de PostGIS, checksum divergente e sobrescrita do artefato. Esses testes não equivalem aos 43 comandos negativos da regressão SQL de banco.

### Tentativa de execução PostgreSQL local

Conexão não interativa com psql -X -w ao banco preexistente sentinela_model_test, localhost (::1):5432, postgres, aprovada. Confirmados PostgreSQL 17.11/PostGIS 3.6.2 em public e capacidade de criação de bases de teste.

Criadas exclusivamente para esta tentativa, a partir de template0:

- sentinela_model_test_reference21.
- sentinela_model_test_supabase21.

O acesso não interativo aos novos nomes retornou código 2 e `fe_sendauth: no password supplied`. A reconexão no mesmo cliente também não disponibilizou autenticação. Nenhuma credencial foi lida, solicitada, registrada ou contornada. Nenhuma configuração de autenticação foi alterada.

O comando de preparação de extensions/PostGIS/role sequer executou, pois a conexão foi recusada. Portanto, ambas as bases permanecem sem instalação da aplicação e sem provisionamento da extensão por esta tarefa; foram preservadas para continuidade. A consulta ao catálogo de roles confirmou zero roles sentinela_baseline21*. O ledger preexistente permanece com cinco versões.

O runner foi invocado e parou na primeira conexão, antes de executar migrations. Não foram executados nesta etapa a regressão SQL, o teste como proprietário sem BYPASSRLS, os testes de reaplicação ou a comparação de catálogos reais. O ambiente local disponível também não reproduz PostGIS 3.3.7 nem as roles/event triggers gerenciados.

A consulta de snapshot foi executada somente no banco local preexistente, em leitura, para verificar o extrator de catálogos. Isso não aplica nem testa a baseline nova e não constitui comparação entre os dois ambientes.

## Pendências e próximos passos

1. Revisar ADR, baseline e manifesto; não aplicar remotamente nesta tarefa.
2. Disponibilizar autenticação local segura para cada banco descartável, fora do repositório, sem compartilhar senha no chat. Provisionar PostGIS em extensions somente na nova base alvo.
3. Executar o runner local completo, registrar comparação real, RLS do proprietário, rejeição de duplicidade, 43 comandos negativos e rollback sem resíduos.
4. Testar a combinação PostGIS 3.3.7 e uma role instaladora equivalente à gerenciada, com inspeção de privilégios/event triggers. A aplicação remota exigirá autorização em outra etapa.
5. Depois, planejar FK auth_user_id -> auth.users.id, provisionamento administrativo, usuários ativos e políticas por ação/escopo; não apagar autoria histórica por cascata.
6. Liberar correções somente com operação autenticada e transacional que preserve histórico/reavaliação. A baseline atual permanece fechada e sem RPCs.

Não foi identificada necessidade de mudança no modelo de dados homologado. Qualquer divergência estrutural revelada pela regressão futura deverá interromper a instalação para diagnóstico e revisão, sem ajuste silencioso.

## Preservação

Nenhuma conexão ao Supabase, execução remota, credencial no código, criação de usuário real, acesso/carga PCDF, alteração do SENTINELA-DADOS, frontend, commit, push, PR ou merge.

O Git LFS apresentou erro de pipe no Windows ao inspecionar a árvore completa. A preservação das migrations e dos testes originais foi conferida por diff restrito e checksums; as verificações de whitespace foram restritas ao escopo para evitar acionar o filtro do XLSX. O modelo XLSX não foi editado por esta tarefa.

## Referências

- [README e comandos completos](../../database/supabase/README.md)
- [ADR](../decisoes/adr-baselines-local-supabase.md)
- [PostGIS Supabase](https://supabase.com/docs/guides/database/extensions/postgis)
- [Postgres gerenciado](https://supabase.com/docs/guides/database/postgres/roles-superuser)
- [Default privileges PostgreSQL](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)
- [Vínculo futuro a Auth](https://supabase.com/docs/guides/auth/managing-user-data)
