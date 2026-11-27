# Etapa 5 — validação geográfica da PCDF e Mapa Criminal

**25/11/2026.** O CRS da extração PCDF permanece sem comprovação. O lote de janeiro de 2021 tem **5.460 ocorrências consolidadas com par GEO candidato** e **zero elegíveis para publicação**. A projeção PostGIS foi implementada com bloqueio de destino e ensaiada em clone. O PostgreSQL operacional permaneceu em leitura.

## PostgreSQL operacional

O lote `84908630-bd04-4a03-923d-616649c8de74` manteve 6.393 associações de origem, 6.090 ocorrências consolidadas, 6.392 vínculos de natureza, 41 naturezas originais, 8.091 pendências funcionais e 26.714 históricas. Uma chave permanece em revisão de identidade. A consulta analítica por papel manteve a série `2021-01` com 6.090 ocorrências e retornou listas geográficas vazias. Foram conferidos os 27 fingerprints, as 19 tabelas com RLS forçada e a inexistência de chaves estrangeiras pendentes de validação.

O clone `clone-79d409c002b842b791866cf46e4684ac`, na porta isolada `55487`, recebeu o backup somente leitura obtido às 11:11:22 de Brasília. O SHA-256 é `5965d0fdcf5621aa0f79034556fff00753047ec40a054d6ce28262d137573afa`. A restauração conferiu schema, permissões, os três papéis e 27 fingerprints iguais aos da origem. [Execução operacional da consolidação](finalizacao-consolidacao-dashboard-pcdf.md#execução-autorizada-das-etapas-1-a-4).

## Evidência oficial externa

Fontes consultadas em 25/11/2026. O vínculo literal entre as colunas GEO no XML e no CSV já estava demonstrado na auditoria anterior. A busca desta etapa procurou o dicionário, os metadados da captura e a regra de exportação do extrato. [Conciliação XML/CSV](validacao-consolidacao-pcdf-geo.md#investigação-da-referência-espacial-em-25112026).

| Documento | O que sustenta |
| --- | --- |
| Plano de Dados Abertos da SSP/DF, 2025–2027, seção 3 | Identifica o Sistema Millenium da PCDF como origem de recortes estatísticos publicados em PDF, CSV e XLSX. A descrição pública dessas bases deixa em aberto o esquema de `Latitude GEO` e `Longitude GEO` do extrato recebido. [Plano](https://dados.df.gov.br/dataset/734424c8-d747-4840-8f93-610b5710268f/resource/96378260-c9be-4735-a50c-4fd92047871f/download/planodedadosabertosdf2ssp.pdf) · [Catálogo de Segurança do Dados DF](https://www.dados.df.gov.br/group/seguranca). |
| Metodologia da SSP/DF, página atualizada em 11/11/2026 | Documenta recortes estatísticos por DF, RA e RISP. A documentação consultada é de agregados estatísticos. [Metodologia e dados](https://www.ssp.df.gov.br/dados-por-regiao-administrativa). |
| Portarias Conjuntas PCDF/CGDF de 23/11/2021 e PCDF/SSP/SEAPE de 29/07/2025 | Identificam a titularidade e o compartilhamento de sistemas como Millenium, PCDFNet e o Sistema Integrado de Geoestatística. A regra de captura e a transformação do extrato seguem sem documentação pública localizada. [Portaria de 2021](https://www.sinj.df.gov.br/sinj/Norma/650078b63b8e4e1191046e9881d6169f/Portaria_Conjunta_4_23_11_2021.html) · [Portaria de 2025](https://www.sinj.df.gov.br/sinj/Norma/139d3f59592e445c83bb77dedc9e0b58/Portaria_Conjunta_3_29_07_2025.html). |
| IDE/DF, camadas oficiais de limites e Rede Geodésica | Publica as camadas do perímetro do DF, das RAs e dos marcos geodésicos em EPSG:31983 no serviço e permite exportar em outro sistema. A camada de perímetro é atribuída ao IBGE. [Limites IDE/DF](https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/LIMITES/FeatureServer/layers) · [Rede Geodésica](https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/IDEDF/FeatureServer/22). |
| IPEDF, metadado Limite das RAs de 2019, publicado em 17/03/2026 | Declara EPSG:4326 para a camada histórica do Atlas. É insumo para a revisão territorial de janeiro de 2021. A correspondência aos identificadores do catálogo e a vigência aplicável precisam ser verificadas. [Metadado IPEDF](https://catalogo.ipe.df.gov.br/layers/geonode_data:geonode:Limite_RA_201900/metadata_detail). |
| IBGE, referencial geodésico nacional e ficha BRAZ da RBMC, referência 15/01/2026 | Documenta o SIRGAS2000 e uma estação de referência em Brasília, com coordenadas e precisão publicadas. São referências geodésicas para controles independentes. [Referencial do IBGE](https://www.ibge.gov.br/geociencias/informacoes-sobre-posicionamento-geodesico/sirgas/16691-projeto-mudanca-do-referencial-geodesico-pmrg.html) · [Ficha BRAZ](https://geoftp.ibge.gov.br/informacoes_sobre_posicionamento_geodesico/rbmc/relatorio/Descritivo_BRAZ.pdf). |

Nenhuma fonte localizada declara o CRS, datum, EPSG, unidade, convenção de eixos, acurácia, método de obtenção e transformações para os dois campos do extrato PCDF. A sequência das colunas é latitude e longitude conforme o cabeçalho do XML. A ordem geodésica no sistema produtor e as unidades permanecem indeterminadas.

## Auditoria dos pares originais de janeiro de 2021

A auditoria agrupou os valores decimais por par e pela chave de identidade e consultou, em memória no PostGIS do clone, o perímetro do DF e a malha de 37 RAs da IDE/DF. A triagem compara os números com uma malha angular exportada em `outSR=4326`, sob hipótese explícita de leitura dos dois valores. O resultado mede plausibilidade. Os pontos calculados na consulta foram descartados. [Consulta oficial do perímetro](https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/LIMITES/FeatureServer/2/query?where=1%3D1&outFields=unidade&outSR=4326&f=geojson).

| Medida | Resultado |
| --- | ---: |
| Associações | 6.393 |
| Pares numéricos completos | 5.752 |
| Ausência dos dois componentes | 641 |
| Um componente ausente, erro de formato ou valor fora do domínio angular | 0 |
| Pares numéricos distintos | 4.006 |
| Pares presentes em mais de uma associação | 617 |
| Pares compartilhados por mais de uma chave | 446 |
| Chaves distintas em pares compartilhados | 1.901 |
| Maior quantidade de chaves no mesmo par | 98 |
| Chaves com pares completos divergentes ou mistura de completo e ausente | 0 |
| Chaves com par candidato, incluindo a chave em revisão | 5.461 |
| Ocorrências consolidadas com par candidato | 5.460 |
| Ocorrências consolidadas sem par | 630 |
| Associações com par fora do perímetro na triagem | 0 |
| Associações sem cobertura ou com cobertura ambígua de RA na malha usada na triagem | 0 |
| Pontos autorizados para publicação | 0 |

Intervalo numérico externo arredondado a três casas, latitude de **−16,050 a −15,587** e longitude de **−48,237 a −47,563**. Os dois campos têm entre 6 e 15 casas decimais no lote. Há 2.881 associações com 13 casas em ambos os campos e 753 com seis casas em ambos. Casas decimais registram a representação textual e deixam a acurácia posicional pendente. Os 98 registros de chave no par mais recorrente justificam pedir à PCDF a regra para endereços repetidos, posições aproximadas e valores padronizados.

Na distribuição da triagem, as cinco maiores contagens de associações foram RA IX (911), RA III (548), RA XII (485), RA I (432) e RA XV (311). Os totais são da malha atual sobre valores plausíveis. O banco operacional possui zero vínculos territoriais confirmados para o lote e permanece com os indicadores territoriais vazios. O SHA-256 da exportação do perímetro é `e40561928b55e57df049eb7f5e2a927a26bcef992c3e274db53eee180b26c4a6`. [Proveniência da malha de RAs](../cartografia-validacao-territorial.md) · [Consulta de auditoria](../../database/local/pcdf-sandbox/pcdf-geo-audit.sql).

## Integração implementada e plano de ativação

A coorte usa os vínculos imutáveis do lote e emite uma linha por ocorrência ativa e consolidada. Se o lote não tiver evidência, a proposta conserva `referencia_pendente`, `ausente` e demais motivos, sem produzir geometria. A evidência exige vínculo com os hashes do lote e da extração, documento, datum, método, precisão, transformações, unidade angular, ordem de campos, perímetro versionado e controles independentes com tolerância declarada. O registro do CSV avulso traz `sha256_xml` nulo. A comparação admite a conciliação literal auditada apenas para a combinação exata deste lote, hash do CSV ativo e hash do XML original.

Para uma referência aprovada, o PostGIS usa longitude em X, latitude em Y e transforma do EPSG de origem atestado para EPSG:4326, o destino do mapa. A proposta verifica domínio, cobertura do perímetro e coerência com RAs de vigência compatível. Fronteira, sobreposição e vínculo existente incompatível retêm o ponto. Uma RA candidata permanece sem vínculo automático. Uma ocorrência com perímetro válido e sem RA vinculada pode alimentar as camadas de pontos, clusters e calor, com `raCode` nulo. Valores originais e histórico de pendências ficam na origem.

A função de publicação no clone exige a assinatura aprovada da proposta recalculada sob lock, guarda um ponto por ocorrência e registra lote, versão, CRS e hashes na auditoria. A projeção relaciona o ponto à versão da ocorrência, impedindo reaproveitar uma publicação antiga após alteração da versão. A view existente de análise conserva RLS e o contrato das APIs. Os perfis da aplicação recebem a localização elegível pela consulta existente. A tabela e as funções de publicação permanecem restritas. O artefato recusa a identidade e a porta operacionais. [Pipeline de clone](../../database/local/pcdf-sandbox/pcdf-geo-validation.sql) · [Qualificação PostGIS](../../scripts/check-pcdf-geo-validation.mjs).

| Entrada da proposta | Como preencher após a comprovação |
| --- | --- |
| `sha256_xml`, `sha256_csv` | Hashes dos bytes conciliados da extração e do lote. |
| `documento`, `documento_sha256`, `datum`, `metodo`, `precisao`, `transformacoes` | Referência revisada pelo responsável, hash do documento arquivado e informações declaradas pela PCDF. |
| `epsg`, `ordem`, `unidade` | EPSG geográfico declarado. Esta versão aceita `latitude,longitude` e `grau` confirmados para os campos GEO. Outro esquema de exportação precisa de regra própria homologada. |
| `perimetro`, `perimetro_ewkb_sha256` | Referência oficial do perímetro e hash da geometria normalizada em EPSG:4326, calculado por `hash_geometria`. |
| `controles_documento`, `controles_sha256`, `tolerancia_m`, `controles` | Documento e hash de controles independentes. A lista contém pelo menos dois pares distintos, cada um com `lat`, `lon`, `lat_alvo`, `lon_alvo`. A tolerância deve vir da evidência. |

Em clone atestado, `propor` calcula as decisões, `assinatura` resume o resultado e `publicar` exige a assinatura revisada. A evidência e a autorização são decisões de custódia técnica. A validação de hashes e controles pelo código vincula os materiais à proposta.

Após resposta da PCDF, a próxima ativação deve seguir estes passos.

1. Arquivar a documentação e os controles rastreáveis, calcular os hashes e confirmar que se referem ao XML e ao CSV deste lote. Revisar os pares compartilhados, a precisão, os valores padronizados e as exceções antes de aprovar as decisões.
2. Usar backup atualizado em clone. Registrar os hashes do perímetro, da referência e da proposta, qualificar o resultado de cada ocorrência e confirmar os limites de RA aplicáveis quando houver vínculo. Comparar Pontos, Clusters e Calor com os resultados do PostGIS e conferir filtros, RLS e os três perfis.
3. Preparar uma versão operacional específica sob autorização própria, com backup restaurado, janela, bloqueio de escritores, verificação de revisão e assinatura aprovada. Conferir contagens e auditoria antes de reabrir. Um erro anterior ao commit reverte a transação. Se o aceite posterior falhar, isolar a publicação e reverter a projeção em versão auditada ou recuperar a instância a partir do backup atestado, conforme decisão do responsável. Preservar os registros originais e as evidências.

## Testes e situação das camadas

O ensaio PostGIS comparou 13 estações públicas da Rede Geodésica, exportadas pela IDE/DF em dois CRSs identificados, EPSG:4674 e EPSG:4326. O ensaio usou a tolerância de 2 m exclusivamente para conferir essa transformação. Também testou recusa de referência ausente ou de outro lote, eixos trocados, CRS projetado, controles repetidos, ponto fora do perímetro e RA ambígua. A correção do validador eliminou uma ambiguidade de nome na consulta do SRID. Para o CSV avulso foi usada a conciliação documentada dos hashes, pois o banco registra `sha256_xml` nulo.

No teste de publicação, dois vínculos para uma identidade produziram um ponto. Uma identidade de teste com pares divergentes ficou sem ponto. A publicação repetida retornou zero novas linhas e preservou o único evento. Administrador, Operador e Analista receberam um ponto na consulta analítica do ensaio e tiveram acesso direto à projeção negado. O rollback deixou a tabela experimental vazia e removeu todas as linhas e eventos do lote de controle. Nenhum par da PCDF foi publicado. O agregado `pcdf-geo-validation-final.json` foi gravado na área privada do clone.

As camadas conservam o contrato existente. Pontos e Clusters usam as mesmas ocorrências elegíveis. Calor usa esses pontos e a base de referência validada da API, com os parâmetros já presentes no código. A configuração **raio 18, sigma 6 e opacidade máxima 76%** está aplicada ao Dashboard. O componente compartilhado já usava **24, 8 e 88%** no Mapa Criminal. As duas configurações e o gradiente do azul ao vermelho foram preservados. [Configuração de densidade](../../src/components/map/heatmapDensity.ts) · [Componente do mapa](../../src/components/map/MapaDF.tsx).

As quatro capturas do Dashboard e do Mapa Criminal, a 1440 × 900 e 390 × 844, tiveram SHA-256 idêntico ao das capturas de referência do clone `clone-e1ebe06b2e474bb7939d5ad35f678b47`. O cotejo usou o lote real sem projeção geográfica. O Edge exercitou separadamente o caminho de renderização com a resposta do controle público revertido, em um contexto isolado da aplicação principal. A primeira resposta de teste omitiu os metadados obrigatórios do contrato. O teste passou a reutilizar o envelope da API autenticada e a variar somente o conteúdo do controle.

No Edge, o controle produziu um marcador, um cluster com contagem `1` e um ponto no calor com densidade positiva. Para o lote real, as três camadas ficaram vazias. Também passaram login, recarga da sessão, acesso anônimo bloqueado, APIs dos três perfis e filtros de período, natureza, categoria, horário e RA. Após o ensaio, o clone ainda tinha os 27 fingerprints originais, além da projeção experimental vazia. O servidor isolado foi encerrado.

TypeScript, ESLint, contratos, rotas e o build de produção isolado com Webpack passaram. A suíte Node teve 286 testes aprovados, quatro ignorados e zero falhas. Os 22 testes do SENTINELA-DADOS passaram.

## Minuta de solicitação técnica à PCDF

**Assunto — Metadados dos campos `Latitude GEO` e `Longitude GEO` do extrato de ocorrências**

À equipe responsável pela extração de ocorrências criminais da PCDF,

Solicitamos o dicionário, a especificação do exportador ou uma nota técnica para os campos `Latitude GEO` e `Longitude GEO` da aba `NATUREZAS` do arquivo `360 - OCORRÊNCIAS CRIMINAIS - 20 NATUREZAS - TODO O DF - 2021 A 2026.xml`, SHA-256 `faf82ae0620fa3ecc53bc002d9c2e49b24b6ec0126a44449510d12948dc0a022`, com foco na competência janeiro de 2021.

Pedimos informar o CRS, datum, realização e época quando aplicáveis, identificador EPSG ou WKT, unidade, ordem e sinal dos eixos, precisão posicional e regras de arredondamento. Solicitamos identificar o sistema e a versão do exportador, o método de obtenção e eventuais transformações anteriores à exportação. Pedimos esclarecer o significado de ausências, posições repetidas, geocodificação aproximada e locais de referência padronizados.

Se possível, solicitamos controles identificados ou anonimizados que vinculem o par original a coordenadas de referência independentes, com CRS, tolerância e vigência. Para a associação a RAs, pedimos o dicionário de códigos e a edição dos limites aplicáveis a janeiro de 2021. A resposta pode indicar protocolo, versão do extrato ou hash correspondente. Os controles podem ser fornecidos sem dados pessoais e sem registros de ocorrências identificáveis.

## Publicação por decisão do responsável — 25/11/2026

O responsável decidiu publicar no Dashboard e no Mapa Criminal os pares Latitude/Longitude GEO do extrato PCDF, interpretados como graus decimais em EPSG:4326. O CRS de origem continua sem comprovação formal, e essa ressalva fica registrada na auditoria e no detalhe de cada ponto.

**Pacote.** [Publicação](../../database/release/pcdf-publicar-pontos.psql) · [Reversão](../../database/release/pcdf-publicar-pontos-rollback.psql). Ledger `local-pcdf-pontos-0001`. Nenhuma ocorrência é alterada.

**Critérios.** Entram as ocorrências PCDF ativas e consolidadas em que:
- todas as linhas de origem trazem o mesmo par numérico válido;
- exatamente uma RA oficial cobre o ponto.

Os pontos ficam em `sentinela_ocorrencias_analytics.pcdf_pontos`, presos à versão da ocorrência. A view `pontos_pcdf_publicados` exibe só os ativos, consolidados e na versão publicada. Cada ponto carrega a RA que o cobre, usada apenas pelo mapa: contagens por RA, tooltip e filtro de RA dos pontos. O vínculo territorial e os totais estatísticos permanecem inalterados.

**Execução no 55484.**
1. Backup `1e6fe24b…`, 34 tabelas, restaurado na 55487 com hashes iguais.
2. Ensaio na cópia: publicação, republicação idempotente, leitura pelo Analista, filtros, detalhe e reversão com schema igual ao original.
3. Ensaio com `ROLLBACK` no 55484 e aplicação.

| Resultado | Valor |
| --- | ---: |
| Pontos publicados | 5.460 |
| Pares distintos | 4.006 |
| Fora do DF ou com RA ambígua | 0 |
| Consolidadas sem par único válido (sem coordenadas) | 630 |

Depois da aplicação, as tabelas preexistentes mantêm os hashes do backup, exceto o ledger e a auditoria, que recebeu o evento `pcdf.publicacao_pontos`.

**Novos lotes.** Para publicar lotes importados depois, execute de novo o mesmo script, com as mesmas variáveis. O fluxo de importação não foi alterado.
