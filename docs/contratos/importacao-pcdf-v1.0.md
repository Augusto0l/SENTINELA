# Contrato de importação PCDF — v1.0

Versão: 1.0. Data: 29/10/2026 (America/Sao_Paulo). Escopo: preparação técnica da Sprint 4, SENTINELA-DADOS → SENTINELA. Status: decisões de integração registradas; layout candidato e propostas operacionais sujeitos à revisão. Este documento não implementa importação, backend, banco, migrações ou autorização e não declara homologação oficial da PCDF.

## 1. Referências e níveis de decisão

- Referências externas locais, consultadas somente para leitura: `D:\Projetos\SENTINELA-DADOS\relatorios\dados\resumo_recebimento_pcdf.md` e `D:\Projetos\SENTINELA-DADOS\scripts\dados\visualizar_xml_pcdf.py`. O script foi lido, não executado; o XML não foi reprocessado nesta tarefa.
- Informações complementares e layout de 34 campos: decisões fornecidas pela equipe em 29/10/2026. As 349.582 combinações da chave candidata são resultado informado pela equipe; o relatório de recebimento consultado não apresenta essa medição.
- Referências internas: [importação demonstrativa](../importacao-demonstrativa.md), [API v0.1.0](api-v0.1.0.md), [catálogo demonstrativo](catalogos-v0.1.0.json), [deduplicação e permissões](deduplicacao-permissoes-v0.1.0.md) e [Central de Revisão](../funcionalidades/central-revisao-ocorrencias-v1.0.md).

**Aprovado** identifica uma decisão de escopo comunicada pela equipe. **Proposta** identifica desenho técnico a revisar antes de implementar. **Não homologado** identifica dependência de validação institucional ou semântica. A versão documental 1.0 não torna o layout candidato um contrato executável nem substitui os schemas atuais.

## 2. Decisões aprovadas e base de reconciliação

1. Fonte original: XML Microsoft Excel SpreadsheetML da PCDF. Preservar o XML integral e imutável, incluindo a metodologia; registrar seu hash e manter acesso controlado.
2. Base histórica: **369.660 linhas de natureza**, de janeiro de 2021 a **18/08/2026**. Uma linha representa uma associação de natureza criminal, não necessariamente uma ocorrência única.
3. Produzir um único modelo CSV UTF-8, delimitado por ponto e vírgula, organizado pelo ano e mês da **data do fato**, não do registro. Previsão: **68 CSVs**, de 2021-01 a 2026-08: 5 × 12 + 8. Agosto de 2026 tem cobertura parcial.
4. Preservar os 18 campos originais, acrescidos de atributos derivados e técnicos nos sete grupos descritos na seção 3.
5. Preservar as **41 descrições de Natureza** e suas **19 categorias Natureza Padronizada da PCDF**. Prever 20 categorias principais SENTINELA, com mapeamento versionado e homologação semântica; não substituir classificações desconhecidas.
6. Usar provisoriamente a chave candidata composta por **Ano de Registro + Unidade Policial de Registro + Número**, mantendo identidade da ocorrência separada da identidade da linha XML. A chave oficial não está homologada.
7. Não excluir automaticamente registros incompletos nem inventar coordenadas, endereços ou classificações. Encaminhar problemas à Central, preservando a origem e distinguindo pendência de impedimento crítico.
8. Entrada futura pela tela `/importar`, armazenamento PostgreSQL/PostGIS, controle de reimportação e histórico auditável. A implementação atual permanece demonstrativa.

O relatório consultado registra 369.662 linhas físicas na aba NATUREZAS: cabeçalho, 369.660 registros e uma linha vazia adicional. Essa linha vazia não é associação de natureza; sua exclusão da contagem de dados deve constar do manifesto, sem alterar o XML. Não confundir posição SpreadsheetML com ordinal do registro ou linha textual do arquivo XML.

| Ano do fato | Linhas de natureza de referência |
| --- | ---: |
| 2021 | 69.259 |
| 2022 | 70.389 |
| 2023 | 67.081 |
| 2024 | 63.867 |
| 2025 | 63.045 |
| 2026, até 18/08 | 36.019 |
| Total | **369.660** |

## 3. Layout candidato: 34 colunas

Os nomes e a ordem abaixo reproduzem o candidato fornecido pela equipe. `O` significa transporte do valor original; `D`, derivação; `T`, metadado técnico. Para campos O, preservar o conteúdo textual da célula sem trim, mudança de caixa, retirada de acentos, conversão numérica ou interpretação de fórmula. O XML preserva ainda a representação lexical, estrutura e distinções entre célula omitida e célula vazia.

| Nº | Grupo | Cabeçalho CSV | Classe | Correspondência ou regra proposta |
| --- | --- | --- | --- | --- |
| 1 | Identificação | `ano_registro` | O | Origem 1: Ano de Registro |
| 2 | Identificação | `unidade_registro` | O | Origem 2: Unidade Policial de Registro |
| 3 | Identificação | `numero_registro` | O | Origem 3: Número; texto, preservar zeros e sinais |
| 4 | Identificação | `ocorrencia_chave` | D | Composição provisória de 1–3, com namespace PCDF |
| 5 | Datas | `ano_fato` | O | Origem 4: Ano do Fato |
| 6 | Datas | `data_inicio_fato_original` | O | Origem 5: Data Início do Fato |
| 7 | Datas | `data` | D | Data civil extraída de 6, `YYYY-MM-DD` |
| 8 | Datas | `horario` | D | Hora civil extraída de 6, `HH:mm:ss` |
| 9 | Naturezas | `natureza_original` | O | Origem 7: Natureza |
| 10 | Naturezas | `natureza_padronizada_pcdf` | O | Origem 9: Natureza Padronizada, incluindo prefixo recebido |
| 11 | Naturezas | `crime_tentado` | O | Origem 8: Crime Tentado (S/N)?; preservar texto original |
| 12 | Naturezas | `natureza_sentinela_codigo` | D | Código interno somente após correspondência homologada; nulo enquanto não confirmada |
| 13 | Naturezas | `classificacao_status` | D | Situação do mapeamento, conforme seção 5 |
| 14 | Naturezas | `versao_mapeamento` | T | Versão efetiva do artefato de mapeamento; nula se nenhum foi aplicado |
| 15 | Endereço/RA | `cidade_endereco_original` | O | Origem 10: Cidade do Endereço do Fato |
| 16 | Endereço/RA | `ra_original` | O | Origem 11: Cidade com RA |
| 17 | Endereço/RA | `area_endereco_original` | O | Origem 12: Área do Endereço do Fato |
| 18 | Endereço/RA | `quadra_endereco_original` | O | Origem 13: Quadra do Endereço do Fato |
| 19 | Endereço/RA | `ra_codigo` | D | Correspondência em catálogo territorial versionado; não inferir por número isolado |
| 20 | Endereço/RA | `local` | D | Composição determinística dos componentes disponíveis, sem completar endereço |
| 21 | Coordenadas | `latitude_geo_original` | O | Origem 14: Latitude GEO |
| 22 | Coordenadas | `longitude_geo_original` | O | Origem 15: Longitude GEO |
| 23 | Coordenadas | `latitude_utm_original` | O | Origem 16: Latitude UTM; não assumir eixo pelo nome |
| 24 | Coordenadas | `longitude_utm_original` | O | Origem 17: Longitude UTM; não assumir eixo pelo nome |
| 25 | Coordenadas | `latitude` | D | Decimal interpretado/transformado somente com regra espacial validada |
| 26 | Coordenadas | `longitude` | D | Decimal interpretado/transformado somente com regra espacial validada |
| 27 | Coordenadas | `coordenada_status` | D | Situação da localização, conforme seção 6 |
| 28 | Informações policiais | `flagrante` | O | Origem 6: Flagrante (S/N)?; preservar texto original |
| 29 | Informações policiais | `unidade_apuracao` | O | Origem 18: Unidade Policial de Apuração |
| 30 | Rastreabilidade | `fonte` | T | Namespace técnico proposto `PCDF`; não é código oficial |
| 31 | Rastreabilidade | `linha_origem_id` | T | ID estável vinculado ao hash do XML, aba e posição lógica da linha |
| 32 | Rastreabilidade | `linha_xml` | T | Índice lógico positivo da linha SpreadsheetML na aba, respeitando `ss:Index` |
| 33 | Rastreabilidade | `aba_origem` | T | Nome literal da aba, nesta base NATUREZAS |
| 34 | Rastreabilidade | `versao_tratamento` | T | Versão do processo SENTINELA-DADOS que produziu o arquivo |

**Conferência:** identificação 4 + datas 4 + naturezas 6 + endereço/RA 6 + coordenadas 7 + informações policiais 2 + rastreabilidade 5 = **34**. São **18 campos O + 10 D + 6 T**. As posições originais 1 a 18 aparecem exatamente uma vez como O, embora reordenadas. Não confundir versão deste documento com `versao_tratamento` ou `versao_mapeamento`.

### 3.1. Preservação dos booleanos e limite do candidato

`crime_tentado` e `flagrante` são nomes do candidato, mas transportam os textos originais, por exemplo SIM/NÃO. Transformá-los diretamente em booleanos no CSV perderia dois dos 18 valores originais. Proposta: derivar os booleanos no staging/backend em atributos separados, preservando essas duas colunas como recebidas. A interpretação aceita somente vocabulário explicitamente versionado; sugestão inicial SIM → true e NÃO → false, ausência → null, outros textos → null com pendência. S/N e variações só entram após confirmação; null não significa false.

Caso se exija booleano normalizado também no CSV, revisar o layout e sua versão para incluir colunas originais separadas: não declarar que o mesmo candidato de 34 colunas contém ambas as representações. O payload bruto protegido permanece necessário para informações estruturais e auditoria.

## 4. Convenções de intercâmbio propostas

- **Codificação e cabeçalhos:** UTF-8 sem BOM na geração; receptor pode tolerar um BOM inicial. Exatamente 34 cabeçalhos únicos em `snake_case`, na ordem da seção 3. Cabeçalhos ausentes/repetidos, quantidade incorreta de campos e versões incompatíveis bloqueiam o arquivo para correção, sem descartar sua evidência.
- **CSV:** delimitador `;`, aspas duplas; duplicar aspas internas. Células com ponto e vírgula, aspas, CR ou LF devem ser delimitadas por aspas. Gerar registros com CRLF; preservar quebras internas nas células originais. Contar registros com parser CSV, nunca por quebra de linha textual.
- **Nulos:** campo vazio representa ausência no transporte; não usar as strings `NULL`, `None`, `NaN`, zero ou “não informado” para completar faltas. Texto literal recebido permanece texto. Não normalizar silenciosamente campos originais contendo só espaços; sinalizar vazio semântico. A distinção estrutural entre célula ausente e vazia fica no XML/payload bruto.
- **Datas:** interpretar o original por formato explícito, sem inferência mês/dia. Derivar `YYYY-MM-DD` e confrontar com `ano_fato`. Data inválida → derivado nulo e pendência. Não substituir pela data do registro ou da ingestão.
- **Horários:** propor `HH:mm:ss` para preservar a precisão recebida; não arredondar segundos. Precisão ausente deve ser registrada no diagnóstico, sem inventar horário. Data/hora civil não é timestamp UTC. A interpretação temporal operacional, inclusive datas históricas, exige regra documentada; timestamps de auditoria usam UTC e exibição America/Sao_Paulo.
- **Coordenadas:** derivados com ponto decimal, sem separadores de milhar, símbolos ou notação científica; números finitos. Preservar precisão de origem, sem arredondamento arbitrário. Campos originais continuam texto. Não preencher ausência com zero, centróide ou geocodificação estimada.
- **Booleanos:** no modelo persistente normalizado, true/false/null; no CSV candidato, preservar os dois textos de origem conforme 3.1.
- **Caracteres especiais:** preservar acentos, aspas, espaços e Unicode dos originais. Normalização para busca é atributo derivado. Não acrescentar apóstrofo a valores originais para abertura em planilha: uma exportação segura para visualização deve ser artefato separado. Não executar conteúdo como fórmula.
- **Endereço:** `local` pode combinar área e quadra disponíveis com separador documentado, sem duplicar componentes idênticos; regra deve ser versionada. Não presumir que área seja bairro ou quadra seja logradouro completo. Não truncar texto para caber nos 240 caracteres do formulário atual.
- **Mensais:** nome proposto `pcdf_naturezas_YYYY-MM.csv`. Mês sem dados pode ter somente cabeçalho, registrado no manifesto. Se uma data não puder ser classificada, preservar a linha em quarentena de tratamento e incluí-la na reconciliação; não atribuir mês fictício. A base auditada teve zero datas não interpretadas, mas novas extrações podem divergir.

Manifesto técnico opcional na recepção, externo aos 34 campos: hash/nome/tamanho do XML e dos CSVs, versão do layout, execução e versão do tratamento, tabela de nulos/tipos, versões de mapeamento e catálogo, regra espacial aplicada ou pendente, contagens mensais, exclusões estruturais justificadas e linhas em quarentena. O produtor calcula o hash a partir dos bytes do XML. O SENTINELA confere tamanho, SHA-256 e contagem do CSV com o manifesto quando presente e verifica os identificadores contra o hash do XML declarado. O CSV avulso mantém a identidade técnica declarada e a rastreabilidade a seus próprios bytes.

## 5. Identidade, naturezas e duplicação

### 5.1. Duas identidades independentes

A chave candidata produziu **349.582 combinações distintas**, segundo a auditoria informada pela equipe, entre as 369.660 linhas. Esse número é referência de agrupamento provisório, não comprovação de ocorrências oficiais únicas. A diferença de 20.078 não deve ser rotulada como duplicação: pode incluir múltiplas associações e situações a investigar.

Proposta: serializar `ocorrencia_chave` como tupla não ambígua com namespace, sem concatenar componentes por separador desprotegido. Não converter Número em inteiro, eliminar zeros ou fundir unidades por aliases não homologados. Ausência de componente → chave nula e impedimento de agrupamento automático. Coincidência da chave com datas/endereço conflitantes → revisão crítica, não sobrescrita ou mesclagem silenciosa.

`linha_origem_id` deve usar hash do XML + aba + posição lógica SpreadsheetML, com algoritmo/serialização versionados. Duas linhas idênticas em posições diferentes continuam sendo duas linhas de origem. Um novo XML tem outra identidade de extração, mesmo se reproduzir parte dos registros. `linha_xml` não é linha do CSV nem número da linha textual XML.

### 5.2. Catálogo e 20 categorias previstas

O relatório externo lista as 41 descrições originais e as 19 categorias PCDF, com frequências. Preservar cada texto e categoria, incluindo descrições sem correspondência confirmada. O catálogo interno atual do SENTINELA tem oito categorias demonstrativas; não representa as 20 previstas nem autoriza criar códigos oficiais.

| Categoria SENTINELA prevista | Evidência PCDF a conferir no mapeamento |
| --- | --- |
| Homicídio | `01_HOMICIDIO` |
| Tentativa de homicídio | `01.1_TENTATIVA DE HOMICIDIO` |
| Roubo a transeunte | `13_ROUBO A TRANSEUNTE` |
| Roubo em comércio | `19_ROUBO EM COMÉRCIO` |
| Roubo em residência | `20_ROUBO EM RESIDÊNCIA` |
| Roubo de veículo | `18_ROUBO DE VEICULO` |
| Furto em veículo | `28_FURTO EM INTERIOR DE VEICULO` |
| Furto de veículo | `25_FURTO DE VEICULO` |
| Furto em comércio | `26_FURTO EM COMERCIO` |
| Furto em residência | `27_FURTO EM RESIDENCIA` |
| Estupro | `05_ESTUPRO` + descrição original; outras modalidades exigem decisão |
| Violência doméstica | `112_LEI MARIA DA PENHA (Lei 11.340/06)`; equivalência semântica a homologar |
| Roubo em transporte coletivo | `14_ROUBO EM COLETIVO` |
| Feminicídio | `123_FEMINICIDIO` |
| Tentativa de feminicídio | `123.1_TENTATIVA DE FEMINICIDIO` |
| Estupro de vulnerável | Descrição `ESTUPRO DE VULNERÁVEL` dentro de `05_ESTUPRO` |
| Latrocínio | `21_LATROCINIO` |
| Tráfico de drogas | `89_TRAFICO DE DROGAS`; associação para tráfico exige revisão semântica |
| Uso e porte de drogas | `88_USO E PORTE DE DROGAS` |
| Posse/porte de arma de fogo | `87_PORTE/POSSE DE ARMA`; descrições específicas exigem revisão |

São **20 rótulos previstos**, reconstruídos da comparação do relatório externo; esta tabela não atribui códigos SENTINELA e não homologa equivalências. Os prefixos PCDF são valores recebidos, não códigos oficiais certificados por este documento. Não obter a classificação somente por “tentado”, por busca parcial ou por natureza padronizada: descrições e contexto devem participar de regra explícita.

Proposta para `classificacao_status`: `pendente` (não avaliada), `mapeada` (regra homologada aplicada), `sem_correspondencia` ou `conflitante`. Somente `mapeada` permite código preenchido. Artefato versionado deve registrar par de origem, regra, destino, vigência, responsável e evidência de homologação. Mudança de mapeamento recalcula derivados de forma auditável, sem reescrever a origem.

### 5.3. Idempotência e contagens

- Reenvio do mesmo CSV: verificar bytes/hash no servidor e vínculo com a extração/partição; registrar tentativa, retornar lote existente ou impedir nova execução concorrente. Não confiar apenas no hash enviado pelo cliente.
- Mudança de versão do tratamento não autoriza nova inserção automática das mesmas linhas. Prever reprocessamento explícito e versionado, separado da identidade da origem.
- Mesmo registro em nova extração: preservar nova proveniência e apontar possível reenvio/atualização. Não fazer upsert destrutivo enquanto a política de novas extrações estiver pendente.
- Associações distintas não podem desaparecer porque foram mapeadas para a mesma categoria SENTINELA. Manter associação de origem e proveniência; uma projeção analítica pode contar pares ocorrência/categoria distintos, mas deve declarar essa unidade.
- Sem ID confiável, semelhança gera candidata, nunca exclusão automática. Comparar só endereço, data, natureza ou coordenadas é insuficiente para identidade.

## 6. Localização e RA

**Não homologado:** sistema de referência espacial, datum, zona/hemisfério e semântica dos eixos UTM. Os nomes Latitude/Longitude UTM não comprovam easting/northing. Valores GEO numericamente plausíveis não comprovam WGS84. Não atribuir EPSG, trocar eixos ou transformar coordenadas por suposição.

Proposta para `coordenada_status`: `ausente`, `incompleta`, `invalida`, `referencia_pendente`, `divergente` ou `validada`. A avaliação registra causas separadas na Central; esse resumo não substitui múltiplas pendências. Só usar `validada` após referência e regra confirmadas, validação do par, domínio e verificações territoriais aplicáveis. Se várias causas coexistirem, a regra de precedência deve ser versionada.

Enquanto o CRS não estiver confirmado, manter o bruto e a pendência; derivados podem permanecer nulos. Não publicar pontos como WGS84/PostGIS definitivo. Após confirmação, usar ordem longitude/latitude na construção geográfica, conferir par completo, finitude, domínio e pertinência territorial com cartografia versionada. Discordância RA/ponto gera revisão, sem deslocar o ponto para a RA declarada. Ausência de localização pode permitir consolidação não espacial, mas exclui pontos e deve aparecer nas contagens de cobertura.

O relatório registra 34 valores de Cidade com RA, incluindo `RA 98_NÃO INFORMADA` (241 linhas); esse marcador não deve virar RA oficial nem código do catálogo demonstrativo. Correspondências, aliases e mudanças territoriais históricas precisam de vigência e homologação. Preservar a RA original, usar `ra_codigo` nulo quando não houver correspondência segura e gerar pendência.

## 7. Proposta conceitual PostgreSQL/PostGIS

Sem SQL ou migrations nesta versão. Nomes abaixo são conceitos de implementação, não tabelas existentes.

| Entidade | Conteúdo e relações propostas |
| --- | --- |
| Ocorrências | ID canônico imutável; identidade candidata versionada; dados civis; endereço/RA derivados; estado de consolidação; coordenadas opcionais e geometria somente com CRS confirmado. Não exigir completude de todos os campos para preservar o registro. |
| Naturezas de origem e categorias SENTINELA | Textos/categorias PCDF preservados; catálogo SENTINELA versionado; mapeamentos com estado e homologação. Separar classificação recebida de classificação atribuída. |
| Associações ocorrência–natureza | ID próprio; ocorrência; natureza específica e categoria PCDF; tentativa; classificação derivada; origem. Preservar multiplicidade das linhas, sem unicidade cega por ocorrência/categoria. |
| Extrações e arquivos | Hash/identidade do XML imutável; metodologia; manifesto; CSVs mensais e hashes; cobertura e versões. Uma extração possui várias partições. |
| Lotes e execuções | Arquivo/fonte; solicitante derivado no servidor; fases, contagens por unidade, versões, timestamps, erros, checkpoints e tentativas. Distinguir lote de tentativa/reprocessamento. |
| Registros de importação/staging | Uma linha de origem identificável, 18 valores originais, derivados, posição CSV e XML, diagnósticos, versão e vínculos ao lote, ocorrência e associação quando resolvidos. Linhas bloqueadas continuam preservadas. |
| Pendências de revisão | Ocorrência ou registro de staging ainda não consolidado; campo/regra; prioridade; status; evidências e vínculos aos registros afetados. Várias por ocorrência. |
| Histórico de alterações e auditoria | Responsável autenticado, instante UTC, ação, antes/depois, justificativa, versão, origem e resultado; trilha protegida contra alteração ordinária por clientes. |

Um registro sem chave confiável permanece no staging e aparece na Central como item ainda não consolidado, sem inventar ocorrência canônica. Correções mudam a projeção efetiva, nunca os originais. Alteração, reavaliação, relações e evento de auditoria devem ser consistentes transacionalmente. Autorização no servidor e políticas de acesso/RLS precisam ser implementadas; perfis da UI não bastam.

## 8. Lotes mensais e acompanhamento: proposta operacional

SENTINELA-DADOS extrai e trata preservando proveniência; SENTINELA recebe, revalida e decide consolidação. A validação no produtor não substitui a validação no servidor.

Na recepção local, a seleção do CSV inicia a verificação dos bytes e a prévia paginada. Administrador e Operador confirmam o envio pela interface. O servidor revalida a entrega e grava origem, staging e auditoria em transação, com reconciliação e recibo durável. O manifesto é opcional e técnico. A consolidação é uma etapa separada de homologação de identidade, classificação e localização. [Procedimento de recepção local](../desenvolvimento/piloto-pcdf-2021-01.md)

Prever fila de 68 partições, limites explícitos, repetição segura, controle de concorrência, checkpoints e retomada. Mostrar fases e contagens de linhas lidas/validadas/processadas, associações e ocorrências separadamente, sem percentuais artificiais quando o denominador não for conhecido. Bloqueios/rejeições são resultados auditáveis, não perda de origem. Dimensão dos blocos, transporte, fila, cancelamento, rollback e SLA ainda não estão definidos.

## 9. Critérios de qualidade e aceite futuro

| Critério | Evidência exigida |
| --- | --- |
| Reconciliação integral | Somatório dos registros dos CSVs mais linhas de dados em quarentena = **369.660**, sem IDs de origem perdidos ou repetidos entre partições. Na base atual espera-se quarentena temporal zero. Cabeçalho e linha estrutural vazia ficam documentados fora dessa unidade. |
| Recorte anual/mensal | Reproduzir os totais anuais da seção 2; manifesto com os 68 meses, cobertura parcial de agosto e contagens; cada data interpretável pertence a exatamente uma partição correta. |
| Identidades separadas | Informar 369.660 associações de origem e 349.582 combinações candidatas como métricas distintas; ocorrências consolidadas são outra métrica. Diferenças devem ter diagnóstico, sem forçar esses totais por mesclagem. |
| Preservação | Conferência célula a célula dos 18 campos, hash estável do XML e rastreabilidade reversa CSV → staging → aba/linha SpreadsheetML → XML. Distinguir transporte CSV de fidelidade lexical XML. |
| Naturezas | Reconciliar frequências das 41 descrições e 19 categorias PCDF com o relatório; 20 categorias SENTINELA continuam separadas. Mapear somente por regra homologada; quantificar pendentes, sem correspondência e conflitos. |
| Coordenadas/RA | Relatório de ausentes, inválidas, incompletas, CRS pendente, divergências territoriais e RAs sem correspondência; nenhuma coordenada sintética ou RA inventada. |
| Contagens de processamento | Cada linha possui estado de processamento exclusivo, com total conservado. Pendências múltiplas são dimensões adicionais, não parcelas somáveis ao total de linhas. Distinguir associações importadas, vínculos analíticos e ocorrências. |
| Reimportação | Reenvio e submissões concorrentes do mesmo arquivo não aumentam ocorrências/associações; tentativa auditada. Reprocessar versão e receber nova extração não sobrescrevem originais. |
| Resiliência mensal | Testar arquivo vazio de dados, mês grande, estrutura inválida, interrupção após commit de bloco e retomada; ausência de duplicação ou confirmação falsa de sucesso. |
| Central/auditoria | Toda ausência/inconsistência avaliada por regra produz pendência rastreável; corrigir e reavaliar exige Administrador e justificativa; encerramento sem solução não muda dado inválido para válido. |

Aceite exige evidência produzida pela implementação futura; este documento não atesta execução desses testes nem recalcula a auditoria XML.

## 10. Impactos no SENTINELA existente

- `src/features/ImportarDados.tsx` / `ImportWorkflow`: trocar o fluxo exclusivamente local por seleção, upload, prévia remota e acompanhamento de lotes; manter identificação demonstrativa até existir backend real. O legado não deve ser removido sem verificar dependências.
- `src/data/importTypes.ts`, `importFile.ts`, `importParser.ts`, `importValidation.ts` e `src/features/import/*`: hoje aceitam sete destinos, uma planilha/arquivo, 10 mil linhas e validação demonstrativa em memória. Não suportam automaticamente o CSV de 34 campos nem identidade por associação. Não basta aumentar limites.
- `src/contracts/imports.ts`: criar versão apropriada para upload, identidade de origem, partições, paginação remota, progresso e resultado operacional por unidades. `importCreateSchema` hoje só descreve metadados; `operationalImportResultSchema` não é serviço de gravação. Não alterar v0.1.0 silenciosamente.
- `src/contracts/occurrences.ts`, `common.ts`, `adapters.ts`: evolução de catálogos, campos históricos incompletos, segundos, identidade e estados; hoje horários são HH:mm e há oito naturezas demonstrativas. `toOccurrenceForm` não representa múltiplas naturezas/pendências sem perda.
- `src/features/Occurrences.tsx`, componentes de detalhes/formulário e `src/components/OperationalProvider.tsx`: integrar Central e dados persistentes. A restrição Administrador para correções na Central é específica desta funcionalidade; não altera por si só permissões gerais de cadastro manual.
- `src/data/demoPermissions.ts` e [matriz anterior](deduplicacao-permissoes-v0.1.0.md): a proposta anterior admitia revisão pelo Operador; para a Central, a decisão nova restringe correção e resolução ao Administrador. Aplicar a regra no servidor futuro sem alegar proteção pelo cliente.
- `Dashboard.tsx`, `CrimeMap.tsx`, `occurrenceQuery.ts`, `demoAnalytics.ts`, `src/contracts/analytics.ts` e renderizador `MapaDF`: mesma base persistente e filtros; separar total de ocorrências de associações e pendências. Substituir datas de referência fixas e consultas integrais locais por consultas adequadas ao volume, incluindo recorte geográfico. Os builders atuais continuam demonstrativos.
- `docs/contratos/catalogos-v0.1.0.json` e OpenAPI: futura revisão versionada; não equivaler automaticamente oito categorias atuais a vinte previstas. Nenhum desses arquivos é alterado por esta entrega.

## 11. Pendências de homologação e sequência da Sprint 4

### Extensão da homologação local

- A [matriz de correspondências](../catalogos/pcdf-correspondencias-v1.json)
  atribui identificadores internos a 41 descrições e referencia o hash
  do relatório agregado. Duas relações estão documentadas e 39 continuam
  pendentes. Nenhuma regra está aprovada para carga.
- A promoção sintética bloqueia chaves candidatas semelhantes em outros
  lotes ou extrações já em staging, além das já consolidadas. Espaços
  nas extremidades entram apenas na detecção de conflito. Os valores
  originais, zeros à esquerda e a chave usada na aprovação são preservados.
  Divergência ou falta de chave mantém as linhas em staging.
- A Central permite ao Administrador resolver horário, local e flagrante
  desconhecido antes da promoção. Para flagrante, o valor efetivo é
  booleano. Após a promoção, a Central informa o UUID da ocorrência e
  conserva o histórico. A alteração do caso consolidado exige política
  própria para versionamento e impacto nos indicadores.
- A exportação territorial da IDE/DF usa `outSR=4326`. GeoJSON usa
  longitude e latitude nessa ordem. O PostGIS representa os pontos com
  longitude em X e latitude em Y. A camada territorial preserva as 37
  feições e os casos de fronteira ambígua. O relatório PCDF descreve
  campos GEO e UTM, com referência, unidades e eixos ainda a confirmar
  junto ao produtor. Valores ausentes, par inválido ou par candidato sem
  CRS confirmado continuam em revisão, com geometria nula. Depois da
  confirmação, transformar somente a partir do CRS de origem aprovado
  e checar limites e vínculos territoriais vigentes.
  [Auditoria cartográfica](../cartografia-validacao-territorial.md) ·
  [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946.html)

| Pendência | Decisão necessária antes do uso definitivo |
| --- | --- |
| Chave oficial PCDF | Confirmar unicidade, escopo, estabilidade e conflitos da tupla candidata, inclusive entre extrações. |
| Mapeamento semântico | Homologar as 41 descrições/19 categorias para as 20 previstas, códigos internos, tentativa, modalidades e vigência. |
| Referência espacial | Confirmar CRS/datum/eixos/zona/hemisfério e regra de transformação; homologar cartografia e correspondências de RA. |
| Atualização entre extrações | Definir reenvio, alteração, revisão, precedência, conflitos, retenção e reversão. |
| Backend operacional | Aprovar upload, fila, limites, blocos, estados/transições, progresso, retomada, transações, autenticação/RLS e proteção dos brutos. |

Sequência recomendada: (1) homologar identidade, mapeamento e referência espacial; (2) revisar layout/manifesto e convenções com SENTINELA-DADOS; (3) versionar contratos operacionais e critérios de reconciliação; (4) modelar banco, acesso e auditoria e então produzir migrations em tarefa própria; (5) implementar upload/staging e validação incremental; (6) implementar Central, correções administrativas e reavaliação; (7) implementar consolidação idempotente, progresso e retomada; (8) conectar `/importar` e as três telas à mesma base; (9) ensaiar os 68 arquivos com reconciliação, falha/retomada, concorrência e desempenho. Enquanto houver dependências não homologadas, usar staging e revisão, sem promover suposições a dados oficiais.
