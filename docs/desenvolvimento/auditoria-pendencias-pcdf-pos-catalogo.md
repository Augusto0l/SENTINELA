# Auditoria das pendências PCDF após ativação do catálogo

O lote `84908630-bd04-4a03-923d-616649c8de74`, de janeiro de 2021, tem **20.321 pendências funcionais, 6.393 associações e 6.091 chaves candidatas**. Entre as pendências, 12.230 são observações de ausência por componente que repetem um estado geográfico já registrado. A correção em clone reduz a fila funcional a **8.091**. Todas as associações mantêm a pendência geográfica aplicável. Uma chave tem impedimento explícito de identidade por divergência temporal. As 6.091 ainda dependem de homologação da identidade e de um fluxo operacional de consolidação.

## Escopo e reconciliação

As consultas ao PostgreSQL `127.0.0.1:55484/sentinela_pcdf_local` usaram sessões somente leitura. A revisão conferida foi `634f7f20897453028d0551c68d26778e69a7a772bdf2485fad39ba2ffff3600b`. A análise cruza `linhas_staging.linha_origem_id` com `linhas_origem.id` e `pendencias_revisao.linha_origem_id`. O leitor operacional vincula o staging a `execucoes_importacao`, `lotes_importacao` e `extracoes_origem`. Atribuir uma RA oficial requer `ocorrencias.ra_id` referenciando `regioes_administrativas.id` com vigência. O banco contém zero RAs, zero ocorrências, zero registros em `historico_correcoes` e zero chaves estrangeiras sem validação no schema `sentinela`.

O CSV avulso de 26 colunas `pcdf_naturezas_2021-01.csv` tem SHA-256 `91fa79f88988d1540e81f438e0fb470cea07a0809ac60387577fbdf0be9d6a00`, igual ao digest registrado no lote. A comparação por ordinal conferiu as 6.393 × 26 células com `linhas_staging.campos_csv`. A comparação por `linha_xml` conferiu os 17 campos originais compartilhados com o XML *360 - OCORRÊNCIAS CRIMINAIS - 20 NATUREZAS - TODO O DF - 2021 A 2026*, aba `NATUREZAS`, e com `linhas_origem`. Os valores originais e os snapshots das pendências coincidiram com o CSV em todos os campos pertinentes. A extração avulsa guarda a proveniência declarada pelo CSV. A data original em texto existe no XML, enquanto o CSV avulso transporta `data` e `horario` derivados.

### Pendências funcionais por campo e regra

Todos os grupos abaixo têm status `aberta` e versão de entrada `pcdf-csv-avulso-v2`. As chaves são deduplicadas dentro de cada linha da tabela.

| Campo | Tipo | Regra | Prioridade | Efeito registrado | Pendências | Associações | Chaves |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| `coordenada_status` | `coordenadas` | `referencia_pendente` | Média | Bloqueia dimensão coordenadas | 5.754 | 5.754 | 5.462 |
| `latitude_utm_original` | `coordenadas` | `nulo_declarado` | Média | Bloqueia dimensão coordenadas | 5.370 | 5.370 | 5.120 |
| `longitude_utm_original` | `coordenadas` | `nulo_declarado` | Média | Bloqueia dimensão coordenadas | 5.370 | 5.370 | 5.120 |
| `ra_original` | `endereco_ra` | `ra_pendente_de_correspondencia` | Média | Não bloqueante | 862 | 862 | 820 |
| `local` | `endereco_ra` | `endereco_pendente` | Média | Não bloqueante | 833 | 833 | 781 |
| `coordenada_status` | `coordenadas` | `ausente` | Média | Bloqueia dimensão coordenadas | 639 | 639 | 629 |
| `latitude_geo_original` | `coordenadas` | `nulo_declarado` | Média | Bloqueia dimensão coordenadas | 547 | 547 | 537 |
| `longitude_geo_original` | `coordenadas` | `nulo_declarado` | Média | Bloqueia dimensão coordenadas | 547 | 547 | 537 |
| `latitude_utm_original` | `coordenadas` | `ausente` | Média | Bloqueia dimensão coordenadas | 104 | 104 | 104 |
| `longitude_utm_original` | `coordenadas` | `ausente` | Média | Bloqueia dimensão coordenadas | 104 | 104 | 104 |
| `latitude_geo_original` | `coordenadas` | `ausente` | Média | Bloqueia dimensão coordenadas | 89 | 89 | 89 |
| `longitude_geo_original` | `coordenadas` | `ausente` | Média | Bloqueia dimensão coordenadas | 89 | 89 | 89 |
| `latitude_geo_original` | `coordenadas` | `vazio_semantico` | Média | Bloqueia dimensão coordenadas | 5 | 5 | 4 |
| `longitude_geo_original` | `coordenadas` | `vazio_semantico` | Média | Bloqueia dimensão coordenadas | 5 | 5 | 4 |
| `coordenada_status` | `coordenadas` | `revisao_utm_sem_geo` | Média | Bloqueia dimensão coordenadas | 2 | 2 | 1 |
| `ano_registro` | `identificacao` | `registro_anterior_ao_fato` | Alta | Bloqueia consolidação | 1 | 1 | 1 |
| **Total deduplicado nas duas últimas colunas** | | | | | **20.321** | **6.393** | **6.091** |

Por tipo, `coordenadas` soma 18.625 pendências em 6.393 associações e 6.091 chaves, `endereco_ra` soma 1.695 em 1.594 associações e 1.510 chaves, e `identificacao` soma uma em uma associação e uma chave. Há 101 associações e 91 chaves com pendência simultânea de RA e local. A distribuição por quantidade de pendências na associação é de 379 com uma, 501 com duas, 3.956 com três, 866 com quatro, 550 com cinco, 129 com seis e 12 com sete. As 6.393 pendências históricas de classificação já excluídas pela ativação completam o total físico de 26.714.

## Causas e tratamento

| Grupo | Pendências | Associações distintas | Chaves distintas | Efeito esperado |
| --- | ---: | ---: | ---: | --- |
| A · Correção técnica automática | 12.230 | 5.476 | 5.225 | Retirada funcional de observações redundantes com original e estado geográfico preservados |
| B · Resolução com dados existentes | 0 | 0 | 0 | Os originais disponíveis não resolvem com segurança outra pendência desta fila |
| C · Informação externa | 6.610 | 5.869 | 5.576 | Referência espacial dos pares e correspondência territorial com vigência |
| D · Revisão manual | 1.481 | 1.443 | 1.386 | Ausências de posição, endereço, RA desconhecida e uma divergência temporal |

As últimas duas colunas se sobrepõem entre grupos. A soma entre grupos aplica-se apenas às pendências.

- **Coordenadas originais.** `latitude_geo_original`, `longitude_geo_original`, `latitude_utm_original` e `longitude_utm_original` correspondem a Latitude GEO, Longitude GEO, Latitude UTM e Longitude UTM no XML. Os diagnósticos `nulo_declarado`, `ausente` e `vazio_semantico` são ocorrências reais de literal `NULL`, célula vazia ou só espaços. O parser calculava a pendência de cada componente e a do estado geográfico, e a entrega gravava todas como bloqueios da mesma dimensão. As 12.230 observações tinham o mesmo original na fonte e no banco e uma pendência geográfica de conjunto na mesma associação. O diagnóstico do componente continua útil para rastreabilidade. A condição de elegibilidade espacial continua no estado da associação. Erros de formato ou de domínio permanecem como diagnósticos próprios.
- **Estado geográfico.** `coordenada_status` é calculado a partir dos pares, validado pelo receptor e preservado no snapshot. Há 5.754 associações com algum par completo em `referencia_pendente`, incluindo duas associações da mesma chave com UTM completo e GEO ausente. O marcador adicional `revisao_utm_sem_geo` identifica essa particularidade e permanece na fila. O manifesto do pacote correspondente informa `crs_origem: null`. Confirmar com a fonte datum, zona e hemisfério UTM, ordem dos eixos, precisão, validade temporal e controles territoriais. Nas outras 639 associações, ambos os pares estão ausentes e exigem informação original ou revisão manual. Mapa de pontos e calor seguem sem dados elegíveis. [Metadados territoriais e de referência](../cartografia-validacao-territorial.md).
- **RA.** `ra_original` vem de Cidade com RA. O CSV avulso não tem `ra_codigo`, e o vínculo usado pelo domínio é a FK `ra_id`. O parser compara número e nome com a matriz de referência usada na importação. As 862 situações são 523 `RA 01_BRASÍLIA`, 182 `RA 32_SOL NASCENTE/POR DO SOL`, 125 `RA 25_ESTRUTURAL`, 24 `RA 22_SUDOESTE` e oito `RA 98_NÃO INFORMADA`. As 854 divergências textuais exigem equivalência histórica documentada e vigente em janeiro de 2021. As oito não informadas pedem revisão manual. A coincidência de um número no catálogo atual tem valor apenas de triagem. Nenhuma associação irmã da mesma chave contém uma RA que resolva esses casos.
- **Local.** `local` é derivado de Área e Quadra do Endereço do Fato. Nos 833 casos, ambos os originais trazem `não informado` em 832 associações e vazios em uma. A derivação exclui as duas formas de ausência corretamente. Nenhuma associação irmã da mesma chave fornece local complementar. Cidade ou RA não satisfazem o endereço de área/quadra.
- **Identidade.** `ocorrencia_chave` é a tupla textual `PCDF`, Ano de Registro, Unidade Policial de Registro e Número. Todas as associações têm tupla coerente com esses originais, inclusive a associação em que `ano_registro` é 2020 e `ano_fato` é 2021. A divergência temporal já consta na fonte e continua impedindo consolidação dessa chave. Foram preservados zeros e grafias dos identificadores. Não houve colisão após remover espaços de contorno para a conferência. Nenhuma identidade foi homologada nesta auditoria.

## Correção e reprocessamento

A entrega do **CSV avulso** agora grava os estados geográficos e erros de componente que demandam revisão. As observações de ausência por componente ficam na prévia e nos valores brutos quando existe um estado geográfico para a associação. O contrato de 26 colunas, a proveniência validada do pacote com anexos e as regras de natureza, identidade, validação espacial e endereço foram preservados. [Entrega do CSV](../../src/lib/db/pcdf-v2-delivery.ts) · [Teste do parser](../../tests/pcdf-monthly-csv.test.mjs).

O parser corrigido processou, em memória, o CSV com o SHA-256 registrado no lote. Produziu 6.393 registros, 6.091 chaves, zero rejeições e 8.091 pendências para revisão, distribuídas em 6.395 de coordenadas, 1.695 de endereço e RA e uma de identificação.

O SQL `clone-pcdf-coordenadas-ausencia-0001` é exclusivo para clone atestado da porta `55487`. Confere lote, revisão, SHA do CSV, RLS, ausência de origens compartilhadas e o conjunto exato de UUIDs de pendências. Aplica política de leitura restritiva e registra o conjunto em auditoria, em transação única. Preserva as linhas históricas, seus valores, status e versões, o snapshot do staging, os vínculos e os recibos. A reexecução confirma o aceite e conserva o mesmo evento. O SHA-256 dos UUIDs ordenados é `410fc2a72c5e439a2798494dfa4bf0ae5d1a1c89023693d3777ec9086de51a0a`. [SQL de homologação](../../database/release/pcdf-coordinate-absence-clone.psql) · [Qualificação](../../database/local/pcdf-sandbox/qualify-coordinate-absence.py).

| Indicador | Operacional em leitura | Clone após reprocessamento |
| --- | ---: | ---: |
| Pendências funcionais | 20.321 | 8.091 |
| Pendências de coordenadas funcionais | 18.625 | 6.395 |
| Pendências de endereço/RA funcionais | 1.695 | 1.695 |
| Pendências de identificação | 1 | 1 |
| Pendências físicas | 26.714 | 26.714 |
| Naturezas / associações / chaves | 41 / 6.393 / 6.091 | 41 / 6.393 / 6.091 |
| Ocorrências consolidadas / tabelas com RLS forçada | 0 / 19 | 0 / 19 |

### Evidências de teste

- Clone `clone-3ce486da95c246f8ae7ff87da8d903f3`, restaurado do snapshot somente leitura de 24/11/2026 às 22:49:36 em Brasília. O backup privado tem SHA-256 `d8d4dae9c237674d7c2c05a62b926e9d10a18c6524c7404515334336bee0df86`. O SQL de clone tem SHA-256 `242f0e1ec9198e1f91bb765720bc6f9ba25b72d01509f4aa3a17452c5a6f5a2b`.
- Um SHA-256 de coorte incorreto acionou rollback. Schema, ACLs e os 27 fingerprints coincidiram com o backup após a recusa. A aplicação válida alterou conteúdo somente em `schema_migrations` e `eventos_auditoria`. A repetição manteve os mesmos fingerprints e o mesmo evento, que inclui os 12.230 UUIDs. O recibo privado é `coordinate-absence.json`.
- Administrador e Operador consultaram 8.091 pendências e as 6.393 associações. Analista manteve acesso ao catálogo, com HTTP `403` para staging. A API sem sessão retornou `401`. Foram verificadas as APIs de resumo, detalhe, histórico de importação e indicadores, o filtro por natureza literal, o Dashboard e a rota do Mapa Criminal em desktop e mobile.
- A rodada comparativa no clone `clone-32c54f176f054dfe8ffb9d8262f4f790` repetiu o rollback, o reprocessamento e os testes. Com o mapa carregado, os PNGs do Dashboard antes e depois ficaram idênticos por SHA-256 em 1440 × 900 e 390 × 844. O recibo e as capturas estão no diretório privado do clone. O snapshot dessa rodada tem SHA-256 `6597701f6da3cb7e059105772c8165c98cff800bd6766031b91c7e4ac18c8ff1`.
- TypeScript, ESLint e build isolado do Next.js passaram. A suíte Node teve 284 testes aprovados, quatro ignorados e nenhuma falha. Os testes cobrem múltiplas naturezas, identidade, coordenadas, geografia, filtros e restrições de acesso.
- Os 27 fingerprints do operacional conferiram com o snapshot e o resumo operacional continuou em 20.321. A versão de clone estava ausente do operacional. A página de login de `localhost:3000` retornou HTTP `200` com o acesso institucional Supabase Auth.

## Elegibilidade analítica

O contrato do Dashboard usa a visão de ocorrências ativas consolidadas. Total geral, natureza e tempo não exigem coordenadas. RA exige vínculo territorial. Pontos e calor exigem RA e coordenadas validadas. O CSV avulso gravou todas as associações como `bloqueada` na recepção e o banco operacional não tem função instalada para promover este staging. Retirar pendências da fila de leitura conserva esse estado. A função de promoção encontrada no repositório é de sandbox e exige evidência de identidade própria daquele ambiente. [Leitor de ocorrências](../../database/local/pcdf-sandbox/occurrences-read.sql) · [Consulta analítica](../../src/lib/db/analytics-query.ts).

| Dimensão | Triagem com os dados disponíveis | Elegíveis nos indicadores oficiais agora | Critério para liberação futura |
| --- | ---: | ---: | --- |
| Geral e temporal | 6.090 chaves sem divergência temporal | 0 | Homologar a identidade, validar data e ausência de conflito nas associações, consolidar uma ocorrência por chave |
| Natureza original | 6.090 chaves sem divergência temporal e com naturezas reconhecidas | 0 | Aplicar o critério geral e vincular todas as descrições literais do catálogo, com contagem distinta por ocorrência e natureza |
| Região Administrativa | 5.270 chaves com texto coerente e sem diagnóstico de RA ou de identidade | 0 | Aplicar o critério geral e documentar correspondência e vigência do vínculo territorial |
| Pontos e calor | 5.462 chaves com algum par completo e referência pendente. 629 sem par | 0 | Validar CRS, transformação, precisão, domínio, RA e pertencimento antes de publicar ponto |
| Consolidação atual | 6.091 chaves aguardam homologação da identidade e procedimento de promoção. Uma tem bloqueio explícito de identidade | 0 | Processo próprio versionado, com evidência por chave, auditoria e autorização operacional |

São 5.798 chaves com uma associação, 284 com duas e nove com três. As 293 chaves repetidas têm múltiplas naturezas e os 6.393 pares chave/natureza são distintos. Não foram encontrados conflitos de data, hora, endereço, RA ou coordenadas entre as linhas de uma chave no lote. A triagem serve ao planejamento. Os totais oficiais permanecem baseados em ocorrências consolidadas e continuam zerados.

## Aplicação operacional futura

1. Revisar a decisão de tratar os componentes de ausência como evidência em vez de pendência funcional independente. Aprovar versão, janela, lote e digest do conjunto. O SQL de homologação permanece restrito à porta de clone.
2. Antes da aplicação, reatestar ambiente e RLS, confirmar que o lote, a revisão e a coorte continuam iguais e restaurar snapshot atualizado em porta isolada. Preparar artefato exclusivo para o destino operacional e homologá-lo com bloqueio de escrita e rollback.
3. Validar a queda funcional para 8.091, preservação dos 26.714 registros, auditoria, bloqueios legítimos, os três perfis e o Dashboard. Reabrir as escritas após o aceite. Uma divergência antes do commit será revertida pela transação. Uma divergência após commit exige preservação da instância, restauração isolada e decisão sobre retomada conforme o plano de ativação. [Plano de referência](plano-ativacao-catalogo-pcdf.md).
4. Tratar separadamente a homologação da identidade, a validação de CRS e da cartografia e as revisões de endereço e RA. Validar deduplicação entre lotes e múltiplas naturezas antes de implementar a promoção operacional. Habilitar os indicadores oficiais após aceite explícito das regras de elegibilidade.
