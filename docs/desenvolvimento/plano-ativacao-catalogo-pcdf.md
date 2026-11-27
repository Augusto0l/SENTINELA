# Plano de ativação operacional do catálogo PCDF

## Escopo da autorização

Autorizar separadamente a janela de ativação do catálogo no PostgreSQL `sentinela_pcdf_local`, em `127.0.0.1:55484`, e a reavaliação das pendências do lote PCDF v2 de janeiro de 2021 `84908630-bd04-4a03-923d-616649c8de74`. O pedido de autorização deve registrar o identificador do Administrador ativo que aprovou a operação, a referência da aprovação, a identidade do cluster e os hashes do catálogo, do backup, do SQL preparado e do conjunto exato de pendências.

Nesta preparação, a base operacional foi consultada em leitura. O artefato `local-pcdf-naturezas-operacional-v1` fixa o destino em `127.0.0.1:55484/sentinela_pcdf_local` e reúne o corpo homologado e o anexo de reprocessamento em uma transação. A migração original de clone conserva as portas 55487 e 55488. [Artefato operacional](../../database/release/pcdf-original-natures-operational.psql) · [Migração de clone](../../database/release/pcdf-original-natures-clone.psql) · [Reprocessamento auditado](../../database/release/pcdf-original-natures-reprocess.sql).

## Registro de aprovação e janela

O pedido **SENTINELA — EXECUTAR ATIVAÇÃO AUTORIZADA DO CATÁLOGO PCDF**, nesta conversa, autoriza a instalação aditiva das 41 descrições da PCDF e o reprocessamento funcional das 6.393 pendências artificiais do lote indicado. O vínculo local consultado para o UUID Supabase Auth `00859431-29c9-499f-b64a-cbed32f03742` é Augusto, UUID institucional `29e7ec39-192b-4790-9180-3df950969bfc`, perfil Administrador ativo. A matriz institucional concede `administrar`, `cadastrar_ocorrencias`, `consultar_analises`, `consultar_central`, `corrigir_central` e `importar`.

Augusto deve confirmar a aprovação em um registro institucional que identifique o escopo, a versão e o SHA-256 do SQL, o SHA-256 do conjunto de pendências e o backup verificado para a janela. O mesmo registro deve autorizar a suspensão temporária das escritas. O pedido desta conversa registra o escopo concedido. O vínculo consultado identifica o Administrador apto a confirmar a autoria e autorizar a janela.

| Campo do registro privado | Valor conferido ou a registrar |
| --- | --- |
| Responsável institucional | Augusto, `29e7ec39-192b-4790-9180-3df950969bfc` |
| Referência verificável da aprovação de Augusto | Pendente. Registrar protocolo, link interno ou outro identificador verificável |
| Início e término autorizados | Pendentes. Registrar ambos como `AAAA-MM-DDThh:mm:ss-03:00` |
| Identidade do cluster | UUID `c04244a6-bc8d-4491-98bc-9af8a268d30c`, sistema `7710764288366362848`, PostgreSQL 17.11, PostGIS 3.6.2 |
| Lote e revisão | `84908630-bd04-4a03-923d-616649c8de74`, `634f7f20897453028d0551c68d26778e69a7a772bdf2485fad39ba2ffff3600b` |
| Executor técnico | `postgres`, após atestar serviço, manifesto e privilégios |
| Catálogo, escopo, SQL operacional e backup | Registrar os hashes conferidos na seção de assinaturas e na evidência de restauração |
| Início, encerramento e reabertura efetivos | Preencher durante a operação em horário de Brasília, com responsável, estado do bloqueio, resultado, ID da auditoria SQL e eventual rollback |

O registro privado de manutenção acompanha a execução e guarda as evidências também quando a transação falha. O evento de auditoria dentro do PostgreSQL vincula o reprocessamento efetivo à referência de aprovação e ao UUID institucional.

## Objetos afetados

| Objeto | Alteração |
| --- | --- |
| `sentinela.naturezas_criminais` | Inserção das 41 descrições literais com fonte `PCDF` e categoria nula. O UUID interno identifica cada item de catálogo. |
| `sentinela.descricao_pcdf(text)` | Função de correspondência literal. A instalação exige os 41 valores e o digest do catálogo conferido no XML. |
| `sentinela.validar_associacao_mapeada()` | Mantém a integridade da proveniência, dos vínculos existentes e dos mapeamentos históricos. Permite a um cadastro manual autorizado referenciar uma natureza do catálogo PCDF onde o cadastro manual já estiver instalado. |
| `sentinela.linhas_origem` | Política de leitura para o papel técnico do leitor. A categoria PCDF vem da origem de associações consolidadas visíveis. Os perfis da aplicação continuam sem acesso direto às tabelas brutas. |
| `sentinela_ocorrencias_analytics.ocorrencia_naturezas` e `naturezas_criminais` | Views exibem categoria de origem e catálogo canônico. Ambas conservam o proprietário técnico sujeito a RLS. |
| `sentinela.pendencias_revisao` | Política restritiva do leitor deixa de apresentar as regras artificiais. Linhas, status, versões e valores históricos permanecem preservados. |
| `sentinela_ocorrencias_local.lista` e `resumo` | Filtros usam a descrição literal e continuam aceitando UUIDs históricos. A lista de opções prefere o UUID canônico. |
| `sentinela_ocorrencias_manual.catalogo(text)` e políticas relacionadas | Delta condicional à instalação existente. A instalação operacional atual não contém essa função. A API de cadastro manual segue indisponível para Admin/Operador neste escopo. |
| `sentinela.schema_migrations` e `sentinela.eventos_auditoria` | Uma versão de migração e um evento de serviço com responsável pela aprovação, referência, lote, UUIDs das 6.393 pendências e SHA-256 do conjunto. |

As colunas legadas `natureza_padronizada_pcdf`, `crime_tentado`, `classificacao_status`, `natureza_sentinela_codigo`, `versao_mapeamento`, `mapeamento_id` e `codigo_manual` mantêm seus vínculos e usos históricos. Os arquivos de custódia, recibos e totais históricos de importação permanecem preservados.

## Contagens e critérios de aceite

| Métrica | Antes | Depois esperado |
| --- | ---: | ---: |
| Naturezas canônicas no catálogo | 0 | 41 |
| Associações em staging / linhas de origem no lote | 6.393 / 6.393 | 6.393 / 6.393 |
| Descrições distintas no lote | 34 | 34 |
| Descrições fora do catálogo ou divergentes entre origem e staging | 0 | 0 |
| Chaves candidatas distintas | 6.091 | 6.091 |
| Pendências físicas | 26.714 | 26.714 |
| Pendências artificiais visíveis na consulta funcional | 6.393 | 0 |
| Pendências restantes visíveis na consulta funcional | 20.321 | 20.321 |
| Associações e candidatas sem pendência aberta restante | 0 / 0 | 0 / 0 |
| Ocorrências consolidadas / vínculos de natureza consolidados | 0 / 0 | 0 / 0 |
| Eventos na auditoria | 4 | 5 |
| Tabelas do schema principal com RLS forçada | 19 | 19 |

As 20.321 pendências restantes incluem 18.625 de coordenadas, 1.695 de endereço/RA e uma de identidade. O staging mantém seu estado histórico `bloqueada` nas 6.393 associações. A ativação não consolida candidatas, não gera pontos e mantém **0 ocorrências** no Dashboard. O filtro de natureza passa a oferecer o catálogo mesmo com total zero. Categorias de origem e gráficos recebem dados quando houver ocorrências consolidadas elegíveis.

## Janela autorizada e rollback

1. Confira o registro institucional e o horário autorizado. Ateste novamente host, porta, banco, manifesto local, UUID, identificador do sistema, PostgreSQL, PostGIS e executor. Compare os hashes do arquivo SQL, do catálogo e do conjunto de pendências com o registro. Execute o preflight em leitura e confira lote, revisão, totais, compartilhamentos e vínculos. Revalide o hash, os arquivos associados, a restauração e os fingerprints do backup com a sessão na zona `America/Sao_Paulo`. Se o backup estiver defasado, gere e restaure outro com o utilitário privado `operational_clone.py` e registre o novo hash antes da ativação. [Preflight](../../database/release/pcdf-original-natures-preflight.psql).
2. Registre o início efetivo com referência, executor, identidade do cluster e estado inicial dos papéis. Confirme que somente `postgres`, `sentinela_local_admin`, `sentinela_local_operator` e `sentinela_local_analyst` têm LOGIN e CONNECT nesse banco. Coordene a pausa de clientes e jobs de escrita e reserve o executor `postgres` para a manutenção. Bloqueie novas conexões dos papéis de escrita em uma transação com `ALTER ROLE sentinela_local_admin NOLOGIN` e `ALTER ROLE sentinela_local_operator NOLOGIN`. As consultas do Analista permanecem disponíveis quando os locks de DDL permitem. As consultas de Administrador e Operador usam os mesmos papéis das escritas e ficam suspensas junto com elas.
3. Deixe as transações existentes concluir e confirme que todas as sessões dos dois papéis foram encerradas. Consulte `pg_stat_activity` e `pg_prepared_xacts` em uma sessão atestada, excluindo somente o próprio executor e as sessões de leitura do Analista. Confira que não há outras sessões privilegiadas, transações preparadas ou locks de escrita incompatíveis. Havendo operação incompatível, mantenha a pausa e aguarde a conclusão ou encerre a tentativa conforme o registro. Nenhuma sessão é terminada à força por este procedimento.
4. Execute o artefato aprovado com o `psql -X -w -v ON_ERROR_STOP=1` e o host, porta, banco e executor fixados acima. Forneça as variáveis da tabela abaixo. Use a credencial de manutenção já custodiada pelo controlador local. O SQL aplica o lock transacional `sentinela-pcdf-local-v1` e locks complementares de tabela. A instalação e a auditoria acontecem em uma única transação. O SQL revalida a janela e o bloqueio de conexões imediatamente antes do commit.
5. Após a confirmação do commit, mantenha os dois papéis de escrita bloqueados para conferir os totais, o evento de auditoria, as permissões, o catálogo literal e a ausência de diferenças no conteúdo protegido. Valide os três papéis com `SET SESSION AUTHORIZATION` em transações de leitura. Teste consultas HTTP com o Analista e confirme a negação de acesso anônimo. Registre o aceite, o ID do evento de auditoria e o horário de reabertura. Restaure `LOGIN` somente nos dois papéis alterados e confira o estado original. Durante a reabertura supervisionada, confirme as consultas HTTP de Administrador e Operador e o login real por Supabase Auth com entrada manual da senha. Registre o encerramento efetivo e libere clientes e jobs da pausa após esse aceite.
6. Antes do commit, qualquer divergência encerra a transação com rollback. Confira os 27 fingerprints e a ausência da versão e do evento de ativação. A mudança temporária de `NOLOGIN` ocorre em outra transação. Registre o encerramento e restaure os estados de LOGIN registrados se o DBA confirmar o abandono da janela com a base pré-ativação íntegra.
7. Depois do commit, uma divergência mantém a instância preservada e em manutenção. Caso a reabertura supervisionada já tenha começado, restabeleça a pausa dos escritores e registre as conexões e escritas que tenham ocorrido. Restaure o backup pré-ativação em diretório e porta isolados. Confira hashes, proprietário, ACLs, os 27 fingerprints, os três perfis, as 6.393 associações e as 26.714 pendências. O retorno do tráfego para uma base restaurada exige decisão específica do DBA sobre identidade, configuração do lançador e eventuais escritas pós-ativação. Preserve o banco anterior e seu evento de auditoria para rastreabilidade.

| Variável `psql` | Origem |
| --- | --- |
| `lote`, `revisao` | Registro de aprovação e preflight recém-conferidos |
| `responsavel`, `aprovacao` | UUID institucional e referência verificável do registro autorizado |
| `janela_inicio`, `janela_fim` | Horários autorizados em `AAAA-MM-DDThh:mm:ss-03:00` |
| `backup_sha`, `fingerprints` | SHA-256 do dump conferido e inteiro teor do `fingerprints.json` associado, cuja assinatura consta de `backup.json` |
| `naturezas` | Array `naturezas` em JSON extraído do arquivo de catálogo com hash conferido |
| `pendencias_sha` | SHA-256 dos 6.393 UUIDs calculado no preflight e conferido com a aprovação |

## Checklist de execução

- [ ] Aprovação institucional de Augusto com referência verificável, versão e hashes registrados.
- [ ] Início, término e suspensão de escritas autorizados para a janela.
- [ ] Destino, executor, versão, privilégios, lote e revisão reatestados.
- [ ] SHA-256 do artefato homologado, do catálogo e do conjunto de pendências reconferidos.
- [ ] Dump, artefatos associados, restauração isolada e 27 fingerprints reconferidos.
- [ ] Início efetivo registrado, papéis de escrita bloqueados e sessões incompatíveis drenadas.
- [ ] Commit confirmado com indicadores, integridade, auditoria e RLS dentro do aceite, ou rollback registrado.
- [ ] Validação de consultas, reabertura supervisionada, horário de encerramento e evidências registrados.

## Backup desta preparação

O backup mais recente anterior a este ensaio registrava staging e pendências vazios. O novo snapshot foi obtido com `REPEATABLE READ READ ONLY`, no mesmo recorte do dump e dos fingerprints usados na restauração.

Backup lógico privado `clone-eb06e7a46e1948a0a410e356d7b80eeb/origem.dump`, capturado em **24/11/2026 às 21:26:11**, horário de Brasília. Formato `PGDMP`, PostgreSQL 17.11, 3.280.543 bytes, 546 entradas de TOC e 27 tabelas. SHA-256 `1036fe5ac7edf682a9b31e922321b1c3d3a1322a79d1c7c459c3c41e136927ff`. O diretório privado `%USERPROFILE%\.sentinela-local\homologacao-clone` guarda o dump e os arquivos de papéis, ACLs, schema e fingerprints. Os papéis foram exportados sem senhas.

O novo dump `clone-62989eabe6ad4bff95b26cdcc12df486/origem.dump`, capturado em **24/11/2026 às 21:47:41**, horário de Brasília, tem SHA-256 `a4d88392a6dab98034d7ded2316c84f3a89c79835636aaef18fdb1443dd5d091`. Formato `PGDMP`, PostgreSQL 17.11, 3.280.543 bytes e 546 entradas de TOC. Os 27 fingerprints coincidiram com o backup de 21:26 e com o operacional no preflight das 21:52:56 às 21:53:05. A janela exige nova conferência antes de executar.

## Assinaturas de referência

| Material | SHA-256 |
| --- | --- |
| SQL operacional `local-pcdf-naturezas-operacional-v1` | `bca256fa1bd3c0b1371a164f2fad5355ed7086500d0a6fa909507d59f4453245` |
| Migração de clone | `1de6c82fb9682b4f770d0a12687f3b9e0f4f550bb16f8fd5008a19280a46d1b8` |
| Anexo de reprocessamento | `8853bd000e936804ee338d2a34ce7fc0b8a5c95398b309fe20c8d96962d55535` |
| Arquivo JSON do catálogo | `df4e3a2be54102ec87c93b84723e1e0c3902808c397de5402dcc966ff6de2567` |
| 6.393 UUIDs de pendências, em ordem e separados por vírgula | `732459aac962625f96d17d826f513b2502b6779b37d87d06a4384eff4ea566c9` |

## Evidências do ensaio

O clone atualizado `clone-0a3fb4b8b029420584052c0eab2dcce0` foi restaurado na porta 55487. A comparação dos schemas encontrou uma diferença textual na associação de três alternativas com `OR` na política `gestao_lote`. Após normalizar somente essa expressão associativa, as definições e ACLs coincidiram. Os fingerprints das 27 tabelas coincidiram integralmente antes da migração.

O digest incorreto foi recusado e a comparação com o backup demonstrou o rollback integral. Com o digest correto, mudaram somente `naturezas_criminais`, `schema_migrations` e `eventos_auditoria`. A auditoria registrou os 6.393 UUIDs e a transação que os reavaliou. Os hashes de staging, linhas de origem, pendências físicas, associações, metadados de gestão e recibos coincidiram com o backup.

O Next.js de teste na porta 3318 verificou as APIs de consulta, indicadores, detalhes e histórico com contas descartáveis de Administrador, Operador e Analista. Confirmou HTTP 401 sem sessão, HTTP 403 para acesso do Analista ao staging e HTTP 503 no catálogo manual para os perfis habilitados, coerente com a ausência do módulo na origem. O Dashboard exibiu zero ocorrências, manteve o mapa e a responsividade em 1440 e 390 px. A janela operacional inclui uma confirmação de login com Supabase Auth.

O mesmo dump foi restaurado de forma independente na porta 55489. O ensaio conferiu o schema pré-ativação, o conteúdo das 27 tabelas, os três papéis de leitura e a ausência da função recém-instalada. Os dois clones foram encerrados após a verificação. O recibo `catalog-activation.json` e as capturas do Dashboard estão no diretório privado do clone atualizado.

### Artefato operacional v1

O dump de 21:47 foi restaurado nas portas 55487 e 55489. O arquivo operacional, com os bytes e o SHA-256 registrados neste plano, recusou a porta de clone. A variante de ensaio ajustou somente os três marcadores de identidade do destino, porta, UUID e identificador de sistema. Ela recusou papéis de escrita com LOGIN, janela vencida, revisão divergente, fingerprints incorretos e SHA-256 divergente das pendências. Após as recusas, o schema, as ACLs e as 27 assinaturas de conteúdo coincidiram com o backup.

Na execução válida, o clone teve 41 naturezas, 6.393 associações em staging, 6.091 chaves candidatas distintas, 20.321 pendências funcionais, 26.714 pendências históricas, zero ocorrências consolidadas e 19 tabelas com RLS forçada. Somente `naturezas_criminais`, `schema_migrations` e `eventos_auditoria` tiveram alteração de conteúdo. A auditoria totalizou cinco registros, incluindo o novo evento com os 6.393 UUIDs. As APIs dos três perfis e o Dashboard em desktop e mobile passaram usando contas descartáveis de clone. A verificação de Supabase Auth no ambiente principal fica reservada para a janela operacional.

O recibo `catalog-activation.json` em `clone-62989eabe6ad4bff95b26cdcc12df486` registra o hash do SQL operacional, as recusas, o rollback e a restauração independente. Os dois clones foram encerrados após os ensaios. [Qualificação reproduzível](../../database/local/pcdf-sandbox/qualify-original-natures-activation.py).
