# Validação e consolidação PCDF por dimensão

O lote de janeiro de 2021 tem 6.393 associações e 6.091 chaves candidatas. A homologação por tupla literal no clone consolidou 6.090 ocorrências e preservou uma associação para revisão da identidade. O lote real contém 5.752 pares GEO numericamente completos e plausíveis no DF. A referência espacial continua sem comprovação, portanto os pontos GEO validados e elegíveis para publicação somam **zero**.

## Auditoria GEO

Os campos Latitude GEO e Longitude GEO da aba NATUREZAS foram conciliados por posição XML com os campos latitude_geo_original e longitude_geo_original dos 68 CSVs de 26 colunas. Foram comparadas 369.660 associações sem divergência entre XML e CSV. No lote ativo, a consulta somente leitura confirmou igualdade integral entre os dois campos em linhas_origem e os valores do snapshot em linhas_staging. O SHA-256 do CSV ativo é 91fa79f88988d1540e81f438e0fb470cea07a0809ac60387577fbdf0be9d6a00. Lote 84908630-bd04-4a03-923d-616649c8de74, revisão de origem 634f7f20897453028d0551c68d26778e69a7a772bdf2485fad39ba2ffff3600b.

| Indicador | Lote ativo | Série de 68 CSVs |
| --- | ---: | ---: |
| Associações | 6.393 | 369.660 |
| Pares completos, decimais e dentro do domínio angular | 5.752 | 360.906 |
| Dois componentes ausentes, incluindo marcadores da fonte | 641 | 8.754 |
| Só latitude ou só longitude ausente | 0 | 0 |
| Formato inválido ou saída do domínio angular | 0 | 0 |
| Pares plausíveis na cartografia do DF | 5.752 | 360.900 |
| Pares completos fora da cartografia usada na triagem | 0 | 6 |
| Chaves distintas preenchidas | 6.091 | 349.582 |
| Chaves distintas com pelo menos um par GEO plausível | 5.461 | 340.999 |
| GEO geodeticamente validado para publicação | 0 | 0 |

A plausibilidade usa a posição relativa à cartografia IDE/DF versionada adotada pelo aplicativo. O manifesto PCDF declara crs_origem nulo. A inspeção dos campos e a busca na documentação pública da fonte não comprovaram datum, CRS, ordem dos eixos ou precisão da extração. Os dois diagnósticos UTM sem GEO do lote correspondem a uma chave e não entram no total de pares GEO. Os pontos, quando houver evidência aprovada, são calculados com longitude no eixo X e latitude no eixo Y, transformados ao CRS do mapa após a identificação do CRS de origem e aceitos com limite territorial comprovado. Os decimais de origem permanecem no CSV e no banco. [Cartografia adotada](../cartografia-validacao-territorial.md) · [Referência ST_Transform do PostGIS](https://postgis.net/docs/ST_Transform.html).

## Regras e reprocessamento

| Regra | Tratamento homologado |
| --- | --- |
| Origem, integridade de arquivo, 26 campos, identificação e ordinal da linha | Rejeitam um recebimento estruturalmente inválido. Hash, idempotência, controle de sessão e permissão de escrita foram preservados. |
| Data, hora e ano do fato ausentes ou inválidos | A associação é recebida. O valor literal fica na origem e o derivado inválido fica nulo. Estatísticas temporais usam apenas os valores validados. |
| RA, cidade, área, quadra, endereço, unidade de apuração, flagrante e tentativa | Avisos descritivos e preservação dos originais. Uma ausência pode deixar o valor efetivo nulo. Indicadores territoriais requerem um vínculo confiável de RA. |
| Natureza ausente ou fora das 41 descrições | Aviso e proveniência preservada, sem vínculo classificatório inventado. A ocorrência pode compor o geral se tiver identidade validada. O gráfico usa somente vínculos com descrição original do catálogo. |
| Coordenadas UTM e inconsistência no estado geográfico recebido | Avisos de qualidade. O estado GEO é calculado a partir dos campos GEO. |
| GEO ausente, incompleto, inválido, divergente ou sem referência comprovada | Pendência da dimensão espacial. O registro continua consultável e não produz pontos, clusters ou calor. |
| Tupla policial incompleta, divergente, com conflito de identidade ou colisão de chave | A associação permanece consultável e aguarda revisão humana. A contagem única exige identidade validada. |
| Pendência resolvida ou encerrada | O detalhe preserva e descreve o estado registrado pelo fluxo de revisão. O reprocessamento não declara resolução de falhas na origem. |

O CSV avulso usa as novas regras após o servidor detectar a função instalada no PostgreSQL. O modo anterior continua compatível com a instância operacional. O pacote com anexos conserva a validação de proveniência e o contrato de quarentena. A regra de recepção e a migração tratam os bytes de origem como imutáveis.

A migração do clone utiliza a existência de vínculo de proveniência para mostrar “consolidada” no leitor de importação. A linha em revisão aparece como “recebida”. O staging e seu histórico de recepção permanecem intactos. A versão registra um evento de serviço com lote, hash e totais da consolidação. O detalhe classifica os motivos existentes como aviso, pendência de GEO, revisão humana ou decisão registrada. A correção prévia das 12.230 observações redundantes foi preservada: 8.091 pendências seguem disponíveis na projeção funcional e 26.714 no histórico físico. [Migração](../../database/release/pcdf-independent-review-clone.psql) · [Leitor](../../database/release/pcdf-independent-review-reader.sql).

## Resultado do clone

| Medida | Operacional somente leitura | Clone |
| --- | ---: | ---: |
| Associações recebidas | 6.393 | 6.393 |
| Chaves candidatas | 6.091 | 6.091 |
| Ocorrências com identidade validada e elegíveis ao total geral | 0 | 6.090 |
| Ocorrências com datas válidas na evolução temporal | 0 | 6.090 |
| Ocorrências com naturezas do catálogo vinculadas | 0 | 6.090 |
| Vínculos de origem por natureza | 0 | 6.392 |
| Ocorrências com múltiplas naturezas | 0 | 293 |
| Ocorrências com RA confiável para indicador territorial | 0 | 0 |
| Ocorrências aptas a Pontos, Clusters e Calor | 0 | 0 |
| Pendências físicas preservadas | 26.714 | 26.714 |
| Pendências funcionais, após aplicar o reprocessamento de ausências no clone | 20.321 | 8.091 |

A identidade combina fonte, ano, unidade de registro e número, mantendo sua grafia e seus zeros. A homologação cruzou originais, tuplas declaradas e colisões de outras chaves no PostgreSQL. A associação restante tem ano de registro anterior ao ano do fato, uma divergência que veio da fonte. Ela permanece disponível no detalhe restrito aos perfis de importação. O leitor do Analista continua limitado às ocorrências consolidadas. Uma mesma ocorrência pode contribuir para diferentes naturezas e entra uma única vez no total geral.

Das 6.090 consolidadas no clone, 5.460 aguardam a referência espacial de um par GEO completo e 630 têm o par ausente. A chave em revisão de identidade tem um par completo. O evento de reprocessamento `c4a50db2-d55b-41a9-8d64-16f65a11bcee` do clone registra o SHA-256 `8afc31fb1c1b8f102ce575f34fd79990e15d6d1e978966f056a8174808a2f481` do conjunto consolidado.

Pontos validados podem ser exibidos com RA nula. O filtro de RA e suas contagens continuam usando o vínculo territorial existente. A regra de proteção do limite de pontos continua em vigor e no leitor integrado abrange 10.000 pontos, comportando o lote ativo quando houver validação espacial. Os componentes, os filtros, as camadas e os parâmetros visuais do mapa foram preservados.

## Testes e evidências

- O clone `clone-4849086ab052436cb01bc38826f9fa1e` foi restaurado de um snapshot atualizado com schema, ACLs, três perfis e 27 fingerprints conferidos. O SHA-256 do dump é `6561a5f7a88687a4c8439c0ceb1e619672ee572855777d34c63ca47168eac2da`.
- Um hash de CSV incorreto abortou a migração. O schema e as 27 assinaturas de conteúdo coincidiram com o estado após a projeção de ausências. Na reexecução da versão válida, o evento e as assinaturas ficaram estáveis. Mudaram somente o conteúdo das tabelas de ocorrências, vínculos, versão e auditoria. As 19 tabelas com RLS forçada conservaram esse controle.
- A recepção de amostra aceitou data e hora inválidas e natureza vazia, guardou os literais e manteve a chave conflitante fora da identidade efetiva. O reenvio retornou o mesmo lote. Um par GEO de ensaio com referência conhecida produziu exatamente um ponto sem RA para a API de pontos e calor, sem contar na evolução temporal nem no recorte por RA. A transformação recusou CRS ausente ou projetado, eixos trocados e coordenada fora do limite. As amostras foram revertidas e a conferência final encontrou zero lotes ou pontos de ensaio.
- As APIs de Administrador, Operador e Analista, o anonimato, as restrições do staging, o filtro de natureza, a série temporal, o detalhe e o Dashboard passaram no clone. No Mapa Criminal, os controles de Pontos, Clusters e Calor foram exercitados e as três camadas permaneceram vazias para os dados reais sem CRS confirmado. Comparei o Dashboard anterior com as capturas do clone após carregar a cartografia em 1440 × 900 e 390 × 844. Layout, filtros, controles e responsividade permanecem os mesmos, com os gráficos preenchidos pelo estado consolidado do clone.
- TypeScript, ESLint, build isolado, OpenAPI e suíte Node passaram. Foram 286 testes aprovados e quatro ignorados. A consulta analítica reutiliza uma leitura dos vínculos e manteve o filtro por descrição original no volume real do clone.
- O schema e os fingerprints das 27 tabelas operacionais permaneceram iguais ao snapshot. O leitor operacional retornou 6.393 associações, 20.321 pendências funcionais e zero ocorrências consolidadas. A página de login do ambiente principal continuou respondendo com Supabase Auth.

O SQL de clone tem SHA-256 `1afca987b75026b1f2b9ea261ca1ae356aa7a85e6a4546f31955e4bc084ac65c`. O anexo do leitor tem SHA-256 `4cf71bb31836ff3a9df9097bb75538e1491f29467570af535881394782494eef`. As capturas e o recibo `independent-review-final.json` ficaram no diretório privado do clone, que foi encerrado. [Qualificação SQL e HTTP](../../database/local/pcdf-sandbox/qualify-independent-review.py) · [Amostra de GEO com rollback](../../scripts/check-pcdf-independent-geo.mjs).

## Aplicação operacional

1. Obter autorização para o lote e o critério de evidência policial. Conferir a identidade do cluster, o lote, o hash do CSV, os hashes dos artefatos, a revisão, o conjunto de origens e a ausência de conflitos. O SQL desta entrega recusa a porta operacional.
2. Abrir uma janela registrada, suspender escritores, verificar sessões em andamento e restaurar um backup recente em clone isolado. Renderizar e homologar um artefato operacional específico com o controle de concorrência e o procedimento de rollback usados no catálogo.
3. Aplicar primeiro a projeção de ausências de componentes, depois a revisão independente. Atualizar as estatísticas das tabelas de ocorrências, associações, origem e naturezas após a carga. Validar integridade, RLS, auditoria, contagens, APIs e indicadores antes de reabrir a operação. Simular o rollback antes da execução. Preservar a instância e restaurar o backup isoladamente se o aceite falhar após commit.
4. Publicar pontos em uma etapa versionada posterior, após comprovar o CRS e a ordem dos eixos desta extração e validar transformação, precisão, consistência e limites. Ativar indicadores por RA quando houver referência territorial válida. Outros meses exigem conferência da origem, deduplicação entre lotes e ensaio de promoção próprio.

## Investigação da referência espacial em 25/11/2026

O bruto é o workbook SpreadsheetML `360 - OCORRÊNCIAS CRIMINAIS - 20 NATUREZAS - TODO O DF - 2021 A 2026.xml`, com 841.730.010 bytes e SHA-256 `faf82ae0620fa3ecc53bc002d9c2e49b24b6ec0126a44449510d12948dc0a022`. Na aba `NATUREZAS`, as colunas lógicas 14 e 15 são `Latitude GEO` e `Longitude GEO`. As colunas 16 e 17 são o par UTM. O leitor interpreta `ss:Index`, lacunas e células mescladas, extrai o texto de `Data` e preserva o índice lógico da linha. O layout mapeia os dois textos GEO para `latitude_geo_original` e `longitude_geo_original`. O v2 preserva os textos e aplica somente verificações de formato e domínio numérico. O cruzamento por `linha_xml` encontrou igualdade literal nas **369.660 associações** dos **68 CSVs**. [Leitor XML](../../../SENTINELA-DADOS/scripts/dados/pcdf_fonte.py) · [Layout v2](../../../SENTINELA-DADOS/scripts/dados/pcdf_layout_v2.py) · [Gerador de manifesto](../../../SENTINELA-DADOS/scripts/dados/processar_pcdf_v2.py).

| Achado | Consequência |
| --- | --- |
| Cabeçalho `Latitude GEO` seguido de `Longitude GEO` | Identifica a ordem das colunas no arquivo. A ordem formal dos eixos no CRS e no sistema de origem segue pendente. |
| Valores decimais e triagem no domínio angular | Compatíveis com graus decimais. A unidade de exportação, o datum e a precisão posicional carecem de declaração do produtor. |
| Propriedades do workbook, estruturas do SpreadsheetML, aba `METODOLOGIA` e documentação anexa | Nenhuma especificação geodésica vinculada aos campos GEO foi identificada. Na pasta do bruto, o XML é o único arquivo. O método de transformação, geocodificação ou captura na PCDF segue indeterminado. |
| Manifestos v2 e relatórios de transformação | `crs_origem` é nulo nos 68 manifestos mensais. A reprodução do tratamento demonstra a origem e a preservação dos valores, sem transformação espacial nessa etapa. |
| Documentação pública | A SSP/DF descreve recortes e critérios para suas estatísticas agregadas. A portaria de interoperabilidade identifica sistemas e compartilhamento. O IBGE documenta o referencial oficial do Brasil. A especificação para os campos GEO deste workbook segue pendente. |

[Metodologia SSP/DF](https://www.ssp.df.gov.br/dados-por-regiao-administrativa) · [Portaria Conjunta nº 3/2025](https://www.sinj.df.gov.br/sinj/Norma/139d3f59592e445c83bb77dedc9e0b58/Portaria_Conjunta_3_29_07_2025.html) · [Referencial geodésico do IBGE](https://www.ibge.gov.br/geociencias/informacoes-sobre-posicionamento-geodesico/sirgas/16691-projeto-mudanca-do-referencial-geodesico-pmrg.html).

Para validar GEO, obter da PCDF um dicionário, especificação do exportador ou nota técnica assinada que identifique a extração pelo hash, protocolo ou versão e período de vigência. O documento precisa indicar o CRS com código EPSG ou definição WKT equivalente, datum e realização e época quando aplicáveis, unidades, convenção de sinal e ordem dos eixos. Deve explicar a origem dos campos, sistema e versão de extração, método de captura ou geocodificação, transformações anteriores, precisão posicional, marcadores de ausência e eventuais mudanças por período. Para avaliar UTM, solicitar também zona, hemisfério e ordem dos eixos para cada segmento documentado.

O ensaio espacial posterior precisa de pares de controle rastreáveis fornecidos ou confirmados pela PCDF, com coordenadas independentes, CRS, precisão e tolerância acordada. Em clone, conferir domínio, transformação e DF, usando limites de RA com vigência adequada à data do fato e critérios explícitos para bordas. Registrar conflitos entre associações da mesma ocorrência, divergências com os controles ou a RA de origem e casos ambíguos para revisão. As 641 associações com GEO ausente precisam da posição original comprovada para entrar numa etapa futura de validação. As duas candidatas UTM de janeiro continuam sujeitas a evidência específica desse par. [Revisão UTM](../../../SENTINELA-DADOS/docs/relatorios/revisao-recuperacoes-utm-pcdf.md).

## Indicadores reproduzidos em clone

Janeiro de 2021 é a única competência deste ensaio. Foram observadas **6.090 ocorrências únicas**, **6.392 vínculos** com **34 naturezas originais** e **293 ocorrências com mais de uma natureza**. A evolução mensal tem 6.090 ocorrências em janeiro e o recorte de fevereiro fica vazio. Das consolidadas, 5.460 aguardam referência GEO e 630 têm os dois componentes ausentes. Todas entram no total e na série temporal. Uma associação com par completo segue em revisão de identidade. Zero ocorrências têm RA validada e zero têm geometria, pontos, clusters ou contribuições ao calor. O total por natureza conta uma ocorrência uma vez dentro de cada descrição.

| Natureza original PCDF | Ocorrências |
| --- | ---: |
| LEI MARIA DA PENHA (Lei 11.340/06) | 1.690 |
| ROUBO A TRANSEUNTE | 1.387 |
| FURTO EM INTERIOR DE VEICULO | 549 |
| FURTO EM RESIDENCIA | 473 |
| PORTE DE SUBSTANCIA ENTORPECENTE PARA CONSUMO PESSOAL | 429 |
| FURTO EM COMERCIO | 332 |
| FURTO DE VEICULO | 235 |
| TRÁFICO DE SUBSTANCIA ENTORPECENTE | 224 |
| ROUBO DE VEICULO | 199 |
| DESCUMPRIR DECISÃO JUDICIAL QUE DEFERE MEDIDAS PROTETIVAS DE URGÊNCIA PREVISTAS NA LEI 11.340/2006 | 121 |
| ROUBO EM PARADA DE ONIBUS | 117 |
| FURTO DE MOTOCICLETA | 110 |
| HOMICIDIO | 89 |
| ESTUPRO DE VULNERÁVEL | 86 |
| ROUBO EM OUTROS ESTABELECIMENTOS COMERCIAIS | 70 |
| PORTE ILEGAL DE ARMA DE FOGO DE USO PERMITIDO (L.10826/03) | 53 |
| ROUBO EM COLETIVO | 53 |
| ROUBO EM RESIDENCIA | 43 |
| ESTUPRO | 30 |
| POSSE IRREGULAR DE ARMA DE FOGO DE USO PERMITIDO (L.10826/03) | 28 |
| PORTE DE ARMA | 14 |
| POSSE OU PORTE ILEGAL DE ARMA DE FOGO DE  USO RESTRITO (L.10826/03) | 13 |
| ROUBO A DROGARIA | 10 |
| FEMINICIDIO | 8 |
| ASSOCIACAO PARA O FIM DE TRAFICO DE SUBSTANCIA ENTORPECENTE | 6 |
| ROUBO A PANIFICADORA | 5 |
| ROUBO A BAR | 4 |
| ROUBO A SUPERMERCADO E ATACADISTA | 3 |
| LATROCINIO | 2 |
| POSSUIR, DETIVER, FABRICAR OU EMPREGAR ARTEFATO EXPLOSIVO OU INCENDIÁRIO, SEM AUTORIZAÇÃO OU EM DESACORDO COM DETERMINAÇÃO LEGAL OU REGULAMENTAR | 2 |
| ROUBO A TRAILLER | 2 |
| ROUBO EM CHÁCARA, SÍTIO OU FAZENDA | 2 |
| ROUBO NA PROXIMIDADES DE BANCO | 2 |
| ROUBO NAS PROXIMIDADES DE CAIXA ELETRONICO | 1 |

## Pacote de ativação estatística preparado

O renderizador gera um SQL para o destino operacional fixo em `127.0.0.1:55484/sentinela_pcdf_local` ou, com `--clone`, um SQL que exige identidade distinta e porta `55487`. A geração é local e sem conexão ao banco. O SQL verifica a janela, o Administrador aprovador, a ausência de sessões de escrita, o catálogo, a revisão, a integridade e os fingerprints do backup. Sob lock transacional único, aplica primeiro a projeção de ausências e depois a consolidação, instala o leitor e registra os dois eventos de auditoria com aprovação, responsável e hash do backup. A validação ocorre antes de um único commit. O SHA-256 do SQL operacional renderizado é `a8ff7866ce126b9f233d0911a29930eeef68d0f10a3d5d110f953c0ab89fb2b4`. [Renderizador](../../database/release/render-pcdf-statistical-activation.py) · [Controles da transação](../../database/release/pcdf-statistical-activation.sql.in).

| Entrada da transação | Valor ou procedência |
| --- | --- |
| Lote fixado no SQL | `84908630-bd04-4a03-923d-616649c8de74` |
| Revisão fixada na conferência do lote | `634f7f20897453028d0551c68d26778e69a7a772bdf2485fad39ba2ffff3600b` |
| `csv_sha` | `91fa79f88988d1540e81f438e0fb470cea07a0809ac60387577fbdf0be9d6a00` |
| `pendencias_sha` | `410fc2a72c5e439a2798494dfa4bf0ae5d1a1c89023693d3777ec9086de51a0a` |
| `responsavel`, `aprovacao` | UUID de Administrador ativo e referência verificável da autorização específica. |
| `janela_inicio`, `janela_fim` | Datas autorizadas no formato `AAAA-MM-DDThh:mm:ss-03:00`. |
| `backup_sha`, `fingerprints` | SHA-256 do novo dump e conteúdo JSON de `fingerprints.json`, conferidos na restauração do backup associado à janela. |

O backup privado usado no ensaio foi capturado em **24/11/2026 às 23:20:59**, horário de Brasília, com 3.424.444 bytes, 549 entradas de TOC e 27 tabelas. SHA-256 `6561a5f7a88687a4c8439c0ceb1e619672ee572855777d34c63ca47168eac2da`. Os hashes do dump e dos quatro anexos, schema restaurado, papéis e fingerprints foram conferidos. A comparação de schema aplica a normalização já prevista para o agrupamento booleano da política `gestao_lote` na saída do `pg_dump`. A porta `55484` estava indisponível nesta sessão. O retrato restaurado comprova a revisão acima na data da captura e a revisão atual precisa de reconferência somente leitura na janela autorizada.

1. Registrar a autorização específica para consolidação e projeção de pendências, com responsável, evidência, escopo, identidade do destino, janela e assinaturas previstas. Renderizar o SQL e registrar seu SHA-256 no mesmo controle.
2. Conferir o destino e o lote em leitura, com as 6.393 associações, 6.091 chaves, 41 descrições no catálogo, versão `local-pcdf-naturezas-0001`, 26.714 pendências físicas e 20.321 funcionais. Coordenar a pausa de clientes e jobs de escrita, bloquear conexões de Administrador e Operador conforme a janela aprovada e aguardar o encerramento das sessões incompatíveis. Conferir transações preparadas.
3. Gerar backup lógico em `REPEATABLE READ READ ONLY` com os anexos de schema, papéis, ACLs e fingerprints. Restaurar em porta isolada e confirmar os 27 fingerprints e os três perfis. Guardar o backup sob custódia privada e registrar os hashes. Se a base divergir do escopo testado, abortar a execução e homologar a revisão nova.
4. Com a autorização, os escritores pausados e o backup atestado, aplicar o SQL renderizado via `psql -X -w -v ON_ERROR_STOP=1`, com as entradas da tabela e o destino fixado. Esperar duas versões, dois eventos de auditoria, 6.090 ocorrências, 6.392 vínculos, uma associação em revisão, 8.091 pendências funcionais e 26.714 físicas. Esperar zero RA, pontos, clusters e calor. Atualizar as estatísticas após o commit e conferir integridade, RLS, auditoria e o Dashboard. O alvo de idempotência é a mesma autorização, mesmos hashes e conjunto de dados sem escritas posteriores.
5. Antes do commit, qualquer erro aborta as duas fases juntas. Comparar schema, papéis e fingerprints com a linha de base e conferir ausência das versões e eventos. O bloqueio de LOGIN é administrado separadamente e deve ser revertido de acordo com o estado inicial registrado e o aceite do DBA.
6. Se o aceite falhar depois do commit, manter os escritores pausados, preservar a instância e a evidência da execução, restaurar o backup pré-ativação em clone independente e validar todos os fingerprints e os três perfis. O DBA deve decidir a troca de destino e reconciliar escritas posteriores antes da retomada. Após aceite, restaurar os estados originais de LOGIN e testar login institucional e consultas dos três perfis em reabertura supervisionada.

TypeScript, ESLint, validação dos contratos, rotas e build isolado passaram. A suíte Node passou com **286 testes aprovados e quatro ignorados**. O SENTINELA-DADOS passou com **22 testes**. Nesta máquina, o Turbopack encontrou um diretório temporário protegido e o build foi concluído com Webpack, sob a política do Windows em uso.

- O clone privado `clone-face2bcb45664b8d8998dc92039127b1` reproduziu os resultados da migração original, incluindo 19 tabelas com RLS forçada, login local e APIs de três perfis, Dashboard em 1440 e 390 pixels e as três camadas geográficas vazias para o lote. O recibo `independent-review.json` e o agregado `statistics.json` registram os totais e as assinaturas.
- O clone privado `clone-0410a5c7fac14fa291b7311b893d58fb` ensaiou o SQL de ativação em transação única. A versão operacional recusou o clone. A versão de ensaio recusou escritores ativos, fingerprints incorretos e hash de CSV divergente. Uma falha induzida imediatamente antes do commit reverteu as duas fases, com schema e 27 fingerprints iguais aos anteriores. A aplicação válida e sua repetição confirmaram os três perfis, 23 fingerprints preservados, as duas versões e os dois eventos de auditoria. O navegador confirmou login local, bloqueio anônimo, filtros de período, faixa horária, RA, natureza e categoria, além das três camadas vazias. A interface, a intensidade e a opacidade do calor foram preservadas. O recibo privado é `statistical-activation.json`.
