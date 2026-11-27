# Finalização da consolidação PCDF, Dashboard e Mapa Criminal

**25/11/2026, horário de Brasília.** A transação operacional consolidou 6.090 ocorrências únicas de janeiro de 2021 e tratou 12.230 diagnósticos redundantes na consulta funcional. O PostgreSQL permanece disponível e os papéis de escrita voltaram a aceitar conexões. As evidências de preparação e de homologação anterior permanecem nas seções seguintes.

## Execução autorizada das etapas 1 a 4

A solicitação **SENTINELA — EXECUÇÃO OPERACIONAL DAS ETAPAS 1 A 4**, anexada pelo responsável nesta conversa, foi registrada como autorização local em **25/11/2026 às 10:56:52**. O banco confirmou o vínculo Supabase e a permissão de administração de Augusto (`29e7ec39-192b-4790-9180-3df950969bfc`). O registro privado é `clone-3afda496d87746d9a0467c5e8469fe1a/autorizacao-local.json`, sob `%USERPROFILE%\.sentinela-local\homologacao-clone`. A referência de auditoria aponta para esse registro local. O escopo inclui backup, recuperação, consolidação do lote, projeção funcional das 12.230 pendências, validação do Dashboard e suspensão temporária dos escritores durante a manutenção.

| Material ou verificação | Evidência desta execução |
| --- | --- |
| Destino atestado | `127.0.0.1:55484/sentinela_pcdf_local`, cluster `c04244a6-bc8d-4491-98bc-9af8a268d30c`, identificador `7710764288366362848` |
| Lote e revisão | `84908630-bd04-4a03-923d-616649c8de74` e `634f7f20897453028d0551c68d26778e69a7a772bdf2485fad39ba2ffff3600b` |
| Backup lógico atualizado | **10:57:01**, 3.424.444 bytes, 549 entradas de TOC, SHA-256 `4f0e90e604b46089f907857c55a3b7124fb5f61b9c670de35fa45bc96be33020` |
| Recuperação atestada | **10:57:18**, instância isolada `55489`, schema, ACLs, 27 fingerprints e os três papéis conferidos |
| SQL renderizado | SHA-256 `a8ff7866ce126b9f233d0911a29930eeef68d0f10a3d5d110f953c0ab89fb2b4` |
| Coorte dos diagnósticos redundantes | SHA-256 `410fc2a72c5e439a2798494dfa4bf0ae5d1a1c89023693d3777ec9086de51a0a` |

As assinaturas do snapshot atualizado coincidiram com a linha de base da homologação. O dump em `origem.dump`, os quatro anexos com hashes verificados e a instância restaurada permanecem sob custódia no diretório privado acima. O arquivo `execucao-estatistica.jsonl` registra a manutenção e a aprovação da recuperação. Em caso de erro antes do commit, confirmar os 27 fingerprints e restaurar os estados de LOGIN registrados. Se o aceite falhar após o commit, preservar a instância, pausar escritores e reatestar a recuperação isolada antes de qualquer decisão do DBA sobre troca de destino.

| Manutenção registrada | Horário de Brasília |
| --- | --- |
| Início da janela | 11:00:04 |
| Suspensão de LOGIN para Administrador e Operador e confirmação de zero sessões, locks incompatíveis e transações preparadas | 11:00:05 |
| Commit confirmado em nova conexão | 11:00:23 |
| Aceite do PostgreSQL e reabilitação de LOGIN | 11:00:46 |
| Encerramento da manutenção do banco após testar novas conexões dos três papéis | 11:00:54 |
| Limite registrado da janela | 11:30:04 |

| Indicador | Antes | Depois no PostgreSQL operacional |
| --- | ---: | ---: |
| Naturezas originais PCDF | 41 | 41 |
| Associações de origem e staging | 6.393 | 6.393 |
| Chaves candidatas distintas | 6.091 | 6.091 |
| Ocorrências únicas consolidadas | 0 | 6.090 |
| Vínculos de natureza | 0 | 6.392 |
| Chave em revisão de identidade | 1 | 1 |
| Diagnósticos redundantes retirados da projeção | 0 | 12.230 |
| Pendências funcionais | 20.321 | 8.091 |
| Pendências históricas | 26.714 | 26.714 |
| Pontos geográficos publicados | 0 | 0 |
| Tabelas com RLS forçada | 19 | 19 |

Os eventos `pcdf.coordenadas.ausencias_informativas` (`6bc46a6b-1107-4ee5-888d-1bb9a9d9d734`) e `pcdf.revisao_independente` (`94fffa60-c5e5-4377-af4d-e95ef4e6d38b`) foram gravados na mesma transação `792`. O primeiro registra os 12.230 identificadores e a assinatura da coorte. O segundo registra o digest `8afc31fb1c1b8f102ce575f34fd79990e15d6d1e978966f056a8174808a2f481` das origens consolidadas. Os dois vinculam o lote, o backup e a referência da autorização local.

A transação manteve os fingerprints de 23 tabelas, inclusive as de origem, staging e pendências históricas. As outras quatro registraram ocorrências, vínculos, versões e auditoria. A nova revisão de impacto, após a inclusão dos vínculos, é `1d5bb5cbd0efaca945b89300b86e1f6aa84165a78eefa5cec2ac00734072f139`. A repetição do SQL homologado preservou os 27 fingerprints, o schema e os dois eventos. Novas conexões de Administrador, Operador e Analista confirmaram os resultados e os limites de visibilidade. A conferência encontrou zero chaves estrangeiras pendentes de validação.

### Dashboard operacional e autenticação

O Edge confirmou às **11:03:45** o Dashboard de `localhost:3000` com a sessão real de Augusto via Supabase Auth, em 1440 × 900 e 390 × 844. A sessão permaneceu autenticada após recarregar. O teste verificou as APIs de indicadores e ocorrências, a combinação de natureza e período, o estado vazio de fevereiro, a limpeza dos filtros e as camadas Pontos, Clusters e Calor vazias. A consulta anônima à API de indicadores retornou `401`.

O cartão apresentou **6.090 ocorrências únicas** e identificou **janeiro de 2021**. O gráfico de naturezas apresentou **6.392 vínculos em 34 naturezas com ocorrência**, com as **41 descrições originais** disponíveis no filtro. A série temporal apresentou somente janeiro. O cartão de variação exibiu **Sem período comparável**. As 630 ocorrências sem GEO participaram da contagem e da série. As restantes continuaram com a referência espacial pendente e o mapa preservou zero pontos publicados.

Às **11:03:56**, as consultas reais de Administrador, Operador e Analista confirmaram período, natureza, categoria, faixa horária, RA, combinações e retorno ao total sem filtros. O recorte de janeiro combinado com Lei Maria da Penha retornou 1.690 ocorrências e fevereiro retornou zero. O filtro territorial retornou zero por falta de vínculo validado. As consultas iniciais ao PostgreSQL ficaram entre 481 e 531 ms nessa medição local.

O diretório privado da execução guarda `edge-aceite.json`, `dashboard-operacional-1440.png`, `dashboard-operacional-390.png`, `mapa-operacional-1440.png` e `mapa-operacional-390.png`. A comparação com as capturas da homologação confirmou a disposição dos cartões, filtros, gráficos, mapa e navegação nas duas larguras. As imagens da sessão institucional exibem a identificação de Augusto e a barra de rolagem do Edge. A execução preservou os arquivos de interface, o XML e os CSVs originais.

Permanecem em revisão uma chave de identidade e 8.091 pendências funcionais. A publicação de pontos depende da confirmação do CRS da extração PCDF e da validação territorial. O Dashboard estatístico está disponível com o lote consolidado.

### Testes finais desta execução

| Verificação | Resultado |
| --- | --- |
| TypeScript e ESLint | Aprovados |
| Contratos, OpenAPI e rotas | Aprovados, com 36 schemas, 21 caminhos, 26 operações, 32 payloads e 730 imports locais validados |
| Build de produção isolado | Aprovado com Next.js 16.4.6 e Webpack |
| Suíte Node | 286 aprovados, 4 ignorados, nenhuma falha |
| PostgreSQL | Disponível na porta `55484`, 19 tabelas com RLS forçada e LOGIN restabelecido para os dois papéis de escrita |
| Supabase Auth, SSR e Edge | Login institucional real do Administrador e sessão após recarregar aprovados, com bloqueio anônimo `401` |
| Recuperação e idempotência | Backup restaurado e atestado na porta `55489`. Reexecução operacional com schema, fingerprints e auditoria estáveis. |

A ativação e os testes finais terminaram sem falha. A instância de recuperação foi encerrada depois da atestação. O PostgreSQL operacional aceitou conexões, o login respondeu `200` e a API analítica continuou retornando `401` para acesso anônimo na verificação final.

## Conexão e estado operacional na preparação anterior

O serviço Windows `postgresql-x64-17` atendia o diretório de dados padrão da instalação. O SENTINELA usa outro cluster, registrado sob `.sentinela-local/pcdf-local`. Antes da partida, `pg_controldata` mostrou estado `shut down` e identificador coincidente com o manifesto. O lançador existente iniciou esse cluster pelo `pg_ctl`, conferiu PID, porta, diretório, HBA e identidade e iniciou o Next.js em `http://localhost:3000` com Supabase Auth institucional.

| Item | Conferência |
| --- | --- |
| PostgreSQL/PostGIS | `127.0.0.1:55484/sentinela_pcdf_local`, PostgreSQL 17.11 e PostGIS 3.6.2 |
| Identidade | UUID `c04244a6-bc8d-4491-98bc-9af8a268d30c` e identificador `7710764288366362848` |
| Lote de janeiro de 2021 | `84908630-bd04-4a03-923d-616649c8de74` |
| Revisão operacional conferida | `634f7f20897453028d0551c68d26778e69a7a772bdf2485fad39ba2ffff3600b` |
| SHA-256 do CSV conferido no ensaio | `91fa79f88988d1540e81f438e0fb470cea07a0809ac60387577fbdf0be9d6a00` |
| Segurança das tabelas | 19 tabelas com RLS forçada e zero chaves estrangeiras pendentes de validação nos schemas SENTINELA |
| Papéis técnicos com LOGIN e CONNECT | `postgres`, `sentinela_local_admin`, `sentinela_local_operator` e `sentinela_local_analyst` |

As consultas ao conteúdo operacional ocorreram em leitura. A verificação encontrou zero das duas versões da ativação estatística e zero eventos correspondentes. Os registros privados de aprovação encontrados são das janelas encerradas da instalação do catálogo. A consolidação de janeiro e a projeção das pendências geográficas exigem um registro próprio, com aprovador ativo, referência verificável e janela vigente. [Ativação anterior do catálogo](relatorio-ativacao-catalogo-pcdf.md) · [Plano da consolidação estatística](validacao-consolidacao-pcdf-geo.md#pacote-de-ativação-estatística-preparado).

| Indicador | Operacional verificado | Aceite homologado em clone |
| --- | ---: | ---: |
| Naturezas originais disponíveis no catálogo | 41 | 41 |
| Associações de origem | 6.393 | 6.393 |
| Chaves candidatas distintas | 6.091 | 6.091 |
| Ocorrências consolidadas | 0 | 6.090 |
| Vínculos de natureza consolidados | 0 | 6.392 |
| Chave com divergência de identidade | 1 | 1 |
| Pendências funcionais | 20.321 | 8.091 |
| Pendências históricas | 26.714 | 26.714 |
| Pontos geográficos publicados | 0 | 0 |

## Backup, ensaio e rollback

O backup lógico foi capturado em **25/11/2026 às 10:35:58**, sob `REPEATABLE READ READ ONLY`. O dump e os anexos privados estão em `clone-b3eacfc493b5489eb843784b8da1a47c`, sob `%USERPROFILE%\.sentinela-local\homologacao-clone`. O dump tem 3.424.444 bytes, 549 entradas de TOC e SHA-256 `f6caa81873084f0ae49290d27e31316d051c6ded8a7ea1ec504cfff9c916c4fe`. Os 27 fingerprints e o schema coincidiram com a linha de base da homologação anterior. A restauração na porta isolada `55487` conferiu o schema, os 27 fingerprints, as ACLs e a identidade dos três papéis. A comparação usou a normalização já homologada da representação booleana de `gestao_lote` na saída do `pg_dump`.

| Artefato | SHA-256 |
| --- | --- |
| SQL de ativação operacional renderizado | `a8ff7866ce126b9f233d0911a29930eeef68d0f10a3d5d110f953c0ab89fb2b4` |
| SQL de ensaio renderizado | `2086bb7f02c73eaa78c064f72aefa95d997d9f37d34285a7963601c3446fd1bc` |
| Coorte de 12.230 pendências redundantes | `410fc2a72c5e439a2798494dfa4bf0ae5d1a1c89023693d3777ec9086de51a0a` |

O SQL reúne em uma transação a projeção das pendências e a consolidação. Os controles atestam o destino, a janela, o aprovador, a revisão, os hashes, as permissões e a pausa dos escritores. O ensaio homologado recusou destino, fingerprints e CSV divergentes, além de conexões de escrita abertas. A falha induzida antes do commit preservou schema e 27 fingerprints. A execução válida preservou os 23 fingerprints de tabelas fora do escopo de alteração e registrou dois eventos de auditoria. A repetição do mesmo escopo preservou as assinaturas e os eventos. [Renderizador](../../database/release/render-pcdf-statistical-activation.py) · [Transação e controles](../../database/release/pcdf-statistical-activation.sql.in).

Na janela autorizada, reconferir revisão, schema e fingerprints, associar o backup restaurado à aprovação e repetir a captura se houver alteração. O erro anterior ao commit reverte as duas fases. O bloqueio dos papéis de escrita é administrado separadamente e requer restauração dos estados de LOGIN registrados. Em caso de falha de aceite após commit, manter a pausa de escrita, preservar a instância e a auditoria, restaurar o backup pré-ativação isoladamente e conferir as 27 assinaturas antes da decisão de troca pelo DBA. [Procedimento de ativação e reabertura](validacao-consolidacao-pcdf-geo.md#pacote-de-ativação-estatística-preparado).

## Dashboard e Mapa Criminal

O leitor persistente usa o vínculo de ocorrência consolidada e a descrição original PCDF. Em clone, de 6.090 ocorrências únicas, 293 têm mais de uma natureza e contribuem uma vez no total e uma vez por descrição no gráfico. Os 6.392 vínculos cobrem 34 naturezas em janeiro. Há 5.460 ocorrências com referência GEO pendente e 630 sem par GEO, incluídas nas estatísticas gerais e temporais. A chave que segue em revisão de identidade permanece consultável no escopo de importação. [Distribuição completa por natureza](validacao-consolidacao-pcdf-geo.md#indicadores-reproduzidos-em-clone).

O cartão de ocorrências aproveita a legenda existente para identificar janeiro de 2021 quando o recorte tem dados de uma única competência. O Mapa Criminal informa a competência na legenda de origem. O gráfico exibe somente os meses encontrados. O comparativo de variação exige dois meses consecutivos e fica vazio quando o filtro de datas corta um dos dois meses usados na comparação. No ensaio, janeiro retornou 6.090 ocorrências e fevereiro retornou zero. Foram testados período, natureza, categoria, faixa horária e RA.

Pontos, Clusters e Calor consultam o conjunto espacial elegível. No clone e no operacional verificado, há zero pontos publicados e zero ocorrências aptas a indicadores por RA. As respostas do ensaio retornaram `points` e `heatReference` vazios. A ausência de geometria não exclui uma identidade validada das análises compatíveis. Intensidade, raio, cores, opacidade e demais parâmetros do mapa de calor foram preservados. A consulta SQL usada pela rota analítica retornou zero ocorrências e 41 opções de natureza no operacional para os três papéis. A medição, incluindo a inicialização de `psql`, ficou entre 296 e 453 ms nessa base anterior à consolidação. No clone consolidado, a consulta HTTP aquecida com filtro de janeiro, incluindo indicadores e pontos, levou 1.111 ms em uma medição local.

## Referência espacial da PCDF

A conferência da extração rastreou `latitude_geo_original` e `longitude_geo_original` às posições lógicas 14 e 15 da aba `NATUREZAS` do SpreadsheetML. A aba `METODOLOGIA`, os metadados, os scripts de transformação, 68 manifestos mensais e a documentação pública consultada deixaram o CRS de origem indeterminado. Os 369.660 pares textuais XML/CSV coincidiram. No lote ativo, 5.752 associações têm par completo plausível e 641 têm os dois componentes ausentes. A publicação segue com zero pontos. [Investigação e proveniência](validacao-consolidacao-pcdf-geo.md#investigação-da-referência-espacial-em-25112026) · [Metodologia SSP/DF](https://www.ssp.df.gov.br/dados-por-regiao-administrativa) · [Referencial oficial do IBGE](https://www.ibge.gov.br/geociencias/informacoes-sobre-posicionamento-geodesico/sirgas/16691-projeto-mudanca-do-referencial-geodesico-pmrg.html).

Para liberar pontos, obter da PCDF uma especificação vinculada ao hash, protocolo ou versão da extração. Ela deve identificar CRS, datum, unidades, ordem dos eixos, convenções, precisão, método de captura ou transformação e vigência. Em clone, validar pontos de controle independentes, transformar no PostGIS com o CRS documentado, conferir domínio, DF, geometria, limites de RA vigentes e divergências entre associações da mesma ocorrência. Registrar a evidência, a tolerância e as decisões. As associações sem par GEO dependem da localização original comprovada. A revisão territorial precisa de evidência aplicável à competência e critérios para bordas e conflitos.

## Segurança, testes e interface

O ambiente operacional manteve a configuração do Supabase Auth institucional. Em Edge desktop e mobile, o acesso anônimo ao Dashboard foi redirecionado para o login institucional, o formulário permaneceu disponível após recarregar e as APIs devolveram `401` com `no-store`. As três credenciais técnicas custodiadas em DPAPI passaram em conexões somente leitura no PostgreSQL operacional. Administrador e Operador puderam consultar os totais de importação e de pendências, e o Analista ficou restrito à consulta de ocorrências consolidadas. Os três papéis ficaram sem leitura direta do staging e sem escrita na auditoria. A comprovação de uma sessão Supabase autenticada com a conta institucional do Administrador fica para o aceite operacional.

| Verificação | Resultado |
| --- | --- |
| TypeScript e ESLint | Aprovados |
| Build isolado de produção | Aprovado com Next.js 16.4.6 e Webpack |
| Contratos e rotas | 36 schemas, 21 caminhos, 26 operações, 32 payloads e 730 imports locais validados |
| Testes Node | 286 aprovados, 4 ignorados, nenhuma falha |
| Testes de processamento no SENTINELA-DADOS | 22 aprovados |
| PostgreSQL operacional | 27 fingerprints reconferidos após o ensaio, 3 papéis testados e zero versões operacionais de consolidação |
| Restauração e transação no clone | Aprovadas. A primeira repetição atingiu o prazo de 180 segundos do cliente `psql`. O ensaio seguinte usou estatísticas de planejamento atualizadas no clone e prazo maior e passou nos testes de rejeição, rollback tardio e idempotência. |
| APIs autenticadas e sessão SSR em clone | Os três perfis consultaram os indicadores pela API. O Analista recebeu `403` na área de importados. A sessão local autenticada permaneceu ativa após recarregar o Dashboard no Edge. |
| Dashboard e Mapa Criminal em Edge | Cinco filtros, mês de referência, comparativo vazio e as três camadas geográficas vazias aprovados em desktop e mobile. |

As mudanças de aplicação se restringem à apresentação do recorte temporal e à regra do comparativo mensal. A evidência em Edge usa 1440 × 900 e 390 × 844. As capturas `catalogo-dashboard-1440.png` e `catalogo-dashboard-390.png` foram comparadas entre o clone de referência `clone-0410a5c7fac14fa291b7311b893d58fb` e o clone de verificação `clone-e1ebe06b2e474bb7939d5ad35f678b47`. A diferença ficou no texto do cartão de ocorrências. Mudaram 1.096 pixels no desktop (0,0846%) e 1.051 no mobile (0,3193%). O clone de verificação também guarda `catalogo-mapa-criminal-1440.png`, `catalogo-mapa-criminal-390.png` e o recibo `statistical-activation.json`. Os estilos, os componentes de mapa e seus parâmetros visuais, o layout e a navegação foram preservados.

## Pendências registradas na preparação anterior

1. Registrar a aprovação específica e a janela autorizada para a consolidação e a projeção das 12.230 pendências, vinculando o lote, a revisão, os hashes e o responsável.
2. Executar a transação homologada nessa janela, conferir os indicadores na base real e validar a sessão institucional após a reabertura.
3. Obter a especificação da PCDF e as referências territoriais para a validação espacial posterior. Essa etapa é independente da consolidação estatística.
