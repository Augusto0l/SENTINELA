# Preparação da importação histórica de 68 CSVs PCDF

Escopo de janeiro de 2021 a agosto de 2026. A infraestrutura foi instalada no PostgreSQL operacional `127.0.0.1:55484/sentinela_pcdf_local` em 25/11/2026. A carga dos 67 meses posteriores a janeiro fica a cargo do usuário em `http://localhost:3000/importar`. A carga integral de homologação utilizou o clone privado atestado na porta 55487.

## Inventário dos arquivos

A [matriz mensal auditada](./pcdf-inventario-mensal-2021-2026.csv) lista os nomes, SHA-256, bytes, contagens, intervalo de datas, identificadores distintos, naturezas literais e estados GEO e UTM dos 68 arquivos. A matriz tem SHA-256 `18c7584ecf3566870d0384afa0b32bdcf7193b6c4007cc5a798a5e7dc0e6ba6a`.

| Mês | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Janeiro | 6.393 | 5.642 | 5.868 | 5.620 | 5.596 | 5.209 |
| Fevereiro | 5.490 | 5.270 | 5.393 | 5.057 | 5.047 | 4.537 |
| Março | 5.496 | 6.371 | 6.191 | 5.465 | 5.844 | 5.112 |
| Abril | 5.606 | 6.227 | 5.644 | 5.390 | 5.503 | 5.078 |
| Maio | 5.721 | 5.998 | 5.538 | 5.561 | 5.307 | 4.871 |
| Junho | 5.536 | 5.847 | 5.206 | 5.188 | 5.070 | 4.370 |
| Julho | 5.524 | 6.031 | 5.219 | 4.965 | 4.917 | 4.399 |
| Agosto | 5.628 | 6.169 | 5.655 | 5.412 | 5.055 | 2.443 |
| Setembro | 5.822 | 5.551 | 5.426 | 5.437 | 4.934 | — |
| Outubro | 6.332 | 6.152 | 5.701 | 5.405 | 5.277 | — |
| Novembro | 5.974 | 5.467 | 5.615 | 5.198 | 5.255 | — |
| Dezembro | 5.737 | 5.664 | 5.625 | 5.169 | 5.240 | — |
| **Total** | **69.259** | **70.389** | **67.081** | **63.867** | **63.045** | **36.019** |

- A série soma **369.660 associações**, 349.582 tuplas candidatas e 41 naturezas originais. Os arquivos conferem com as cópias arquivadas e manifestos. Layout PCDF v2 de 26 campos em UTF-8 sem BOM, separador `;` e terminações CRLF.
- A competência vem da data civil do fato. A identidade usa ano, unidade e número do registro policial. A proveniência usa a posição original na aba `NATUREZAS` e o SHA-256 do XML. Foram verificadas 369.660 origens distintas, sem repetição de origem ou de chave literal entre arquivos. A matriz identifica quatro associações com ano de registro anterior ao ano do fato. Janeiro inclui uma delas, já em revisão.
- O maior arquivo tem 2.640.483 bytes e a maior competência tem 6.393 associações. O receptor suporta 16 MiB e 10.000 associações por arquivo. A seleção histórica aceita os 68 arquivos. O CSV avulso é suficiente para a fila e o pacote com anexos continua disponível no fluxo existente.
- Agosto de 2026 tem 2.443 associações até 18/08/2026. Há 360.906 pares GEO numericamente plausíveis e 8.754 ausentes no inventário. O CRS está sem comprovação em todos os manifestos. A consolidação conserva as coordenadas originais e gera zero pontos geográficos publicáveis.

## Fila e consolidação

1. O painel **Histórico mensal PCDF** em **Nova importação** aceita um arquivo ou vários arquivos com nome `pcdf_naturezas_AAAA-MM.csv`. Ordena a seleção por competência e usa o cabeçalho padrão, sem mapeamento manual. O operador pode consultar o catálogo e os recibos. A validação e a aprovação exigem Administrador com capacidade institucional ativa no PostgreSQL.
2. **Validar seleção** envia um arquivo por requisição. Nome, mês, tamanho, SHA-256, contagem, layout e candidatos precisam conferir com o inventário. A validação exibe linhas aceitas e rejeitadas, erros e diagnósticos. Arquivos divergentes ficam em revisão. As competências já recebidas, consolidadas, em conflito ou ausentes são consultadas pelo PostgreSQL.
3. **Aprovar e importar** executa uma transação por competência. A mesma transação recebe origem e staging, identifica as ocorrências, grava um vínculo para cada origem consolidada, guarda pendências e registra o recibo auditado. O bloqueio transacional compartilhado com o receptor existente serializa as escritas. A atribuição registra o ator institucional, o hash do CSV, o hash do XML, o lote e a execução.
4. A conciliação compara a tupla literal e a data do fato. Colisões com outras extrações ou ocorrências, ou dentro da mesma competência, ficam em revisão. O catálogo PCDF fornece as descrições originais e cada ocorrência mantém suas múltiplas naturezas. O staging retém os valores literais e nulos. Campos GEO ficam disponíveis para validação futura, com RA, latitude, longitude e geometria publicáveis em branco.
5. Janeiro só é reconhecido como consolidado quando o recibo identifica o lote `84908630-bd04-4a03-923d-616649c8de74`, o hash esperado e a auditoria da consolidação. O receptor também confere a proveniência declarada no reenvio. O mesmo CSV retorna o recibo existente. Outro conteúdo exige revisão separada. O mesmo princípio protege as demais competências.

### Progresso e recuperação

O navegador conserva referências locais aos arquivos selecionados e envia cada competência separadamente. A fila mostra percentual geral de validação e de resultado, progresso de cada arquivo e as contagens definitivas do recibo. Enquanto a transação está em andamento, o progresso daquela competência é indeterminado. O processo completo não depende de uma requisição que mantenha a sessão aberta durante todos os meses.

**Interromper após o arquivo atual** conserva o resultado da transação em andamento e pausa os seguintes. **Cancelar seleção pendente** limpa a fila local. Uma falha de validação ou de gravação é registrada no item e os seguintes podem continuar. Expiração de sessão ou perda de autorização interrompe a fila. Um resultado de rede incerto é reconciliado pelo recibo do PostgreSQL antes de repetir a competência.

O histórico consolidado persiste no banco. O navegador guarda somente a competência e o estado local de cada item, recuperáveis em nova aba ou após reiniciar a aplicação. Os originais permanecem no dispositivo. Para retomar, autentique-se se necessário, selecione novamente os CSVs pendentes e valide a seleção antes de aprovar a gravação. Um reenvio idêntico recupera o recibo gravado.

## Dashboard e interfaces

O Dashboard usa as consultas existentes para total único, série mensal, natureza e filtros. O novo metadado de cobertura distingue competência ausente de uma competência consolidada com zero resultados no recorte. O cartão existente informa a cobertura parcial de agosto e a regra de variação mensal descarta comparativos com meses incompletos. A série contém apenas contagens observadas. Layout, CSS, cores, gráficos, login, menu, ocorrências e Mapa Criminal seguem o visual existente. O calor preserva os parâmetros 18, 6 e 76% no Dashboard e 24, 8 e 88% no Mapa Criminal.

## Homologação integral autorizada

O ensaio integral registrou as 68 competências em uma restauração isolada, com porta 55487, UUID, diretório de dados e credencial administrativa distintos do operacional. O backup usado foi capturado em 25/11/2026 às 12h47 BRT. SHA-256 `376a21a73a9305abd52b4cbb01eb10699be1582794b03ec575dca7d12b8fb44b`. A restauração conferiu esquema, ACLs, os três papéis e 27 fingerprints. As 67 competências posteriores foram recebidas no clone e janeiro foi reconhecido pelo lote e pelo hash existentes.

| Indicador da série integral no clone | Resultado |
| --- | ---: |
| Competências no clone | 68 |
| Associações de origem | 369.660 |
| Ocorrências únicas consolidadas | 349.579 |
| Vínculos de natureza | 369.656 |
| Ocorrências com múltiplas naturezas | 19.261 |
| Associações em revisão de identidade | 4 |
| Ocorrências sem GEO | 8.577 |
| Ocorrências consolidadas com data ou horário nulo | 0 |
| Pontos ou vínculos territoriais publicados | 0 |
| Pendências no histórico físico | 785.063 |
| Eventos novos de consolidação mensal | 67 |
| Eventos com trilha de auditoria divergente | 0 |
| Chaves estrangeiras pendentes de validação | 0 |
| Tabelas com RLS forçada, com o inventário da fila | 20 |

As quatro associações em revisão correspondem a três chaves. Janeiro de 2021 conservou uma associação em revisão. Janeiro de 2024 teve uma e janeiro de 2026 teve duas da mesma chave. Agosto de 2026 contém 2.443 associações e 2.265 ocorrências únicas até 18/08. O recibo integral por competência é `pcdf-historical-68.json`, na pasta privada `clone-79944a70de0f40c0ad01b52f9a79b856`.

O primeiro ensaio integral atingiu o prazo durante o staging de junho de 2021. Junho foi revertido, e os cinco recibos já confirmados permaneceram no clone. A recepção histórica passou a reaproveitar os UUIDs retornados pela inserção das origens, e a detecção de proveniência passou a usar interseção de conjuntos. A retomada concluiu junho e todas as competências seguintes. A homologação também verificou reenvio idêntico, concorrência, hash divergente, isolamento de uma identidade colidente e rollback.

Com a série ampliada, a consulta analítica passou a reutilizar a seleção de vínculos nos agregados por natureza e categoria. A transação de leitura usa parâmetros locais de execução para esse volume e mantém a contagem distinta. O Dashboard e o Mapa Criminal continuam usando os mesmos componentes e parâmetros visuais.

No Edge, as capturas de 1440 × 900 e 390 × 844 exibem 349.579 ocorrências, o gráfico de 68 competências e a indicação de dados parciais até 18/08/2026. A comparação com o Dashboard operacional capturado antes da instalação mostra a mesma disposição dos cartões, controles, filtros e mapa. O total de seis dígitos quebra linha no cartão de ocorrências na largura de 1440 pixels. O cartão e sua tipografia foram preservados.

Em um clone descartável separado, o Edge comprovou a seleção e a validação de um CSV sintético, a retomada em nova aba e a aprovação explícita. Duas associações produziram uma ocorrência e dois vínculos. A ocorrência com horário nulo entrou no total e na série. A falta de GEO preservou zero pontos e zero RA. O reenvio recuperou o recibo original. As evidências são `historico-fixture-edge.json` e `historico-fixture-edge-390.png` no diretório privado `clone-b00551d1044340a6a22dda709b9c41a0`.

TypeScript, ESLint, contratos, rotas e build de produção com Webpack passaram. A suíte Node registrou 286 testes aprovados, quatro opcionais ignorados e zero falhas. O SENTINELA-DADOS aprovou 22 testes. O Supabase Auth real de Administrador foi atestado antes da instalação e novamente no aceite operacional.

## Homologação amostral anterior

- O backup de 25/11/2026 às 15h02 UTC tem SHA-256 `6ac0cd4584d7eb61629ce7efd301a7fb76c461789bf84ac9ae37f85792c65f0d`. O clone `clone-de50644a12ba46a4a52b11ca78e2c6ba` restaurou o schema, os dados das 27 tabelas e os três papéis. A checagem em leitura posterior devolveu os mesmos hashes de 27 tabelas no operacional.
- O validador TypeScript de CSV avulso leu os 68 arquivos, com 369.660 linhas aceitas e 68 hashes distintos. A auditoria em Python reproduziu byte a byte a matriz. A suíte do SENTINELA-DADOS passou com 22 testes.
- O piloto confirmou 5.221 ocorrências e 5.490 vínculos em fevereiro. Com janeiro, são 11.883 origens, 11.311 ocorrências, 11.882 vínculos e zero pontos. Incluiu hash divergente, rollback, reenvio idempotente e verificação das capacidades dos três perfis. No piloto bem-sucedido, o intervalo do registro do lote ao evento de consolidação foi de 26,22 segundos. A primeira tentativa de desempenho foi revertida e a busca de colisões passou a comparar o conjunto de chaves.
- O Edge em desktop e mobile confirmou seleção dos 68 CSVs, ordenação, reconhecimento de janeiro, encaminhamento de arquivo divergente para revisão, aprovação de vários arquivos, pausa após março e retomada unitária de abril após recarregar a página. Foram verificadas a autenticação com contas descartáveis e as rotas dos três perfis.
- O teste de concorrência verificou a recusa de uma confirmação simultânea. Uma ocorrência de controle com identidade colidente deixou a associação nova em revisão, preservou a ocorrência existente e foi revertida junto com o lote.
- As apurações SQL da série, do filtro de natureza e do recorte de agosto produziram zero pontos, RAs e registros após 18/08. A API distingue o recorte de fevereiro sem ocorrências para uma natureza ausente de uma competência ainda sem carga. No Edge desktop e mobile, o Dashboard exibiu 28.202 ocorrências, a indicação de cobertura parcial até 18/08/2026 e variação indisponível para julho/agosto.
- Foram aprovados TypeScript, ESLint, contratos Zod/OpenAPI, rotas e build isolado com Webpack. A suíte automatizada do SENTINELA teve 286 testes aprovados e quatro cenários opcionais desabilitados na configuração padrão.
- A revisão automática havia bloqueado a gravação integral nesta fase anterior. A autorização explícita posterior permitiu concluir o ensaio integral descrito acima.
- O diretório privado de evidências é `%USERPROFILE%\.sentinela-local\homologacao-clone\clone-de50644a12ba46a4a52b11ca78e2c6ba`. Contém o dump, os fingerprints, `pcdf-historical-pilot.json`, `pcdf-historical-partial.json` e as capturas dos ensaios.

| Competência no clone | Associações | Ocorrências únicas | Vínculos | Associações em revisão de identidade |
| --- | ---: | ---: | ---: | ---: |
| 2021-01 preservada | 6.393 | 6.090 | 6.392 | 1 |
| 2021-02 | 5.490 | 5.221 | 5.490 | 0 |
| 2021-03 | 5.496 | 5.205 | 5.496 | 0 |
| 2021-04 | 5.606 | 5.322 | 5.606 | 0 |
| 2026-07 | 4.399 | 4.099 | 4.399 | 0 |
| 2026-08 parcial | 2.443 | 2.265 | 2.443 | 0 |
| **Total** | **29.827** | **28.202** | **29.826** | **1** |

## Instalação operacional e uso

O artefato [pcdf-historical-import.psql](../../database/release/pcdf-historical-import.psql) instala o inventário e as funções no PostgreSQL atestado. A função de escrita é exclusiva do papel já usado pelo Administrador e verifica novamente a capacidade institucional. A escrita em tabelas continua mediada por RLS, com papel interno sem LOGIN ou BYPASSRLS.

O executor confirmou a revisão `1d5bb5cbd0efaca945b89300b86e1f6aa84165a78eefa5cec2ac00734072f139`. O backup pré-janela foi capturado às 14h20min05s BRT, com 4.502.657 bytes. O ensaio em 55489 validou restauração, rollback transacional e remoção da infraestrutura já confirmada durante o teste. Ambos os testes de rollback recuperaram a linha de base. As evidências de backup, autorização, recuperação e janela foram guardadas no diretório privado `clone-16c18fd07cca408f9c1b4131d63d21a4`.

| Artefato | SHA-256 |
| --- | --- |
| Solicitação anexada com escopo de ativação | `a9fda0a6c66a4c9824e7237e9c6c3cedae63eac6af4fd60fb3569cb649ee2945` |
| Inventário v2 | `18c7584ecf3566870d0384afa0b32bdcf7193b6c4007cc5a798a5e7dc0e6ba6a` |
| Instalação SQL | `df9a7a6bbac1bf0bef98d619bd38b065122282ffcd80dd64ca49a93243f73d34` |
| Funções da fila | `ef8b59de080a99f93bd251deab07518b2d5ac90117f588ed6da91335bbee7a59` |
| SQL renderizado e aplicado | `8df03e5315afc078cc206c3290230d573630c86cd8be23b71a72372c32855f47` |
| Backup pré-janela | `c2d53460f60be8587a606e7180b45f1feba0fa68aff5d3b6ab77efcddb681db7` |

A autorização operacional foi fornecida diretamente no chat. A janela abriu às 14h21min16s BRT. O commit e o aceite do banco foram confirmados às 14h21min32s, os papéis escritores voltaram a aceitar conexões no mesmo segundo e a janela encerrou às 14h21min39s após testar os três perfis. Os 27 fingerprints originais ficaram iguais, incluindo a auditoria. O inventário tem 68 competências, com janeiro consolidado e 67 ainda sem carga. Janeiro preservou 6.393 associações, 6.090 ocorrências, 6.392 vínculos, uma chave em revisão, 8.091 pendências funcionais e 26.714 históricas. O catálogo preservou as 41 naturezas originais.

O aceite com Administrador autenticado por Supabase Auth terminou às 14h22min57s BRT. O Edge selecionou os 68 arquivos no desktop, validou janeiro e fevereiro em desktop e mobile, reconheceu janeiro como **Já importado** e exibiu fevereiro como **Pronto para importar**, com **Aprovar e importar (1)** habilitado. Após recarregar, o recibo de janeiro reapareceu e fevereiro ficou disponível para retomada. O teste bloqueou requisições de confirmação. O Dashboard manteve 6.090 ocorrências e a API listou fevereiro como ainda sem importação. O Mapa Criminal teve capturas idênticas antes e depois nos dois tamanhos e preservou zero pontos em suas camadas.

O recibo do navegador `fila-edge-operacional.json` e as capturas operacionais estão no diretório privado `clone-79944a70de0f40c0ad01b52f9a79b856`. A tabela já homologada tem sobreposição entre o nome do arquivo e a competência nas capturas. O visual da aplicação foi mantido nesta ativação. Os 33 testes essenciais de CSV, indicadores e contratos passaram novamente.

Na aplicação local integrada ao Supabase, entre como Administrador autorizado, abra **Importar Dados → Nova importação → Histórico mensal PCDF** e selecione os CSVs em `D:\Projetos\SENTINELA-DADOS\dados_restritos\pcdf-v2-csvs-2021-2026`. Clique em **Validar seleção**, confira os itens e clique em **Aprovar e importar** para os que estiverem prontos. Confira janeiro como já importado, acompanhe os recibos e consulte o Dashboard. Reenvie somente os originais quando houver interrupção. Trate divergências e colisões pelo fluxo de revisão.
