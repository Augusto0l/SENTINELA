# Receptor PCDF v1.0

O SENTINELA recebe o CSV mensal em `/importar` por conexão restrita ao PostgreSQL/PostGIS local. A sessão de Administrador ou Operador permite prévia, confirmação e consulta do histórico. Consulte o [procedimento de início e importação](piloto-pcdf-2021-01.md) e o [contrato PCDF v1.0](../contratos/importacao-pcdf-v1.0.md).

## Integridade e proveniência

O receptor exige CSV UTF-8, com ou sem BOM, delimitador ponto e vírgula e os 34 cabeçalhos na ordem do contrato. A competência vem do nome mensal e é comparada com as datas interpretáveis. Valores incompletos das associações ficam no snapshot com diagnósticos. Cabeçalhos, posições XML, largura de registros e identificadores técnicos incompatíveis impedem a gravação.

O manifesto técnico opcional aceita os estados de produção `reconciliado` e `validado`. O receptor confere estrutura, contagens e algoritmo, compara SHA-256 e tamanho do CSV recebido e recalcula os IDs em JSON compacto UTF-8 de `["pcdf-linha-v1", sha256_xml, "NATUREZAS", índice_inteiro]`. O hash XML vem do manifesto. Com CSV avulso, o receptor confere formato e unicidade dos IDs, posições e versão de tratamento e registra a proveniência como declarada no CSV.

### Matriz de preservação

**S** = `linhas_staging.campos_csv` com a chave da primeira coluna, sempre como string. **O** = `linhas_origem`, para o qual os 18 valores originais também seguem como texto literal. **E** = `linhas_staging.derivados_efetivos`, quando há avaliação separada. Os nomes de tabela se referem ao schema `sentinela`. O CSV conserva seus bytes fora do JSONB. A estrutura de célula omitida ou vazia pertence ao XML arquivado.

| Coluna CSV | Classe | Destino e tratamento |
| --- | --- | --- |
| `ano_registro` | Original | S e O.`ano_registro`. Texto usado na chave candidata. |
| `unidade_registro` | Original | S e O.`unidade_registro`. Espaços e Unicode preservados. |
| `numero_registro` | Original | S e O.`numero_registro`. Zeros, sinais e espaços preservados. |
| `ocorrencia_chave` | Derivado | S e comparação da tupla com `candidate` em E. Divergência vira pendência. |
| `ano_fato` | Original | S e O.`ano_fato`. Comparado à data civil sem sobrescrever. |
| `data_inicio_fato_original` | Original | S e O.`data_inicio_fato_original`. Preservado inclusive quando inválido. |
| `data` | Derivado | S e E quando coerente com a origem. |
| `horario` | Derivado | S e E quando comprovado com segundos no original. |
| `natureza_original` | Original | S e O.`natureza_original`. |
| `natureza_padronizada_pcdf` | Original | S e O.`natureza_padronizada_pcdf`. Prefixo preservado. |
| `crime_tentado` | Original | S e O.`crime_tentado`. Triestado efetivo separado em E. |
| `natureza_sentinela_codigo` | Derivado | S. Aplicação do código depende de homologação. |
| `classificacao_status` | Derivado | S. E permanece pendente até regra verificada. |
| `versao_mapeamento` | Técnico | S. Versão efetivamente aplicada dependerá de artefato homologado. |
| `cidade_endereco_original` | Original | S e O.`cidade_endereco_original`. |
| `ra_original` | Original | S e O.`ra_original`. Desconhecido permanece literal. |
| `area_endereco_original` | Original | S e O.`area_endereco_original`. Sem truncamento dentro do limite técnico de célula. |
| `quadra_endereco_original` | Original | S e O.`quadra_endereco_original`. Espaços distintos de vazio. |
| `ra_codigo` | Derivado | S. Vínculo territorial depende de catálogo e vigência. |
| `local` | Derivado | S e comparação auxiliar de conflito. |
| `latitude_geo_original` | Original | S e O.`latitude_geo_original`. |
| `longitude_geo_original` | Original | S e O.`longitude_geo_original`. |
| `latitude_utm_original` | Original | S e O.`latitude_utm_original`. |
| `longitude_utm_original` | Original | S e O.`longitude_utm_original`. |
| `latitude` | Derivado | S. Projeção espacial vazia enquanto o CRS e a regra estiverem pendentes. |
| `longitude` | Derivado | S. Projeção espacial vazia enquanto o CRS e a regra estiverem pendentes. |
| `coordenada_status` | Derivado | S e diagnóstico com o estado de entrada quando admissível. O receptor não ratifica validade geográfica. |
| `flagrante` | Original | S e O.`flagrante`. Triestado efetivo separado em E. |
| `unidade_apuracao` | Original | S e O.`unidade_apuracao`. |
| `fonte` | Técnico | S. A extração da qualificação tem namespace segregado. |
| `linha_origem_id` | Técnico | S e O.`linha_origem_id`. Hash verificado. A FK interna usa O.`id`. |
| `linha_xml` | Técnico | S e O.`linha_xml` como bigint positivo. |
| `aba_origem` | Técnico | S e O.`aba_origem`. |
| `versao_tratamento` | Técnico | S e `lotes_importacao.versao_tratamento`, coerentes com o manifesto. |

String vazia, espaço sem informação e marcador desconhecido são estados distintos em E. Valor inválido e informação pendente geram diagnósticos distintos e continuam recuperáveis em S. Booleanos policiais só são efetivos no vocabulário explícito. A validação lexical de datas e horários não certifica informações policiais. A operação não calcula coordenadas nem atribui classificações criminais.

## Transação e auditoria

A API compara os hashes da prévia com os bytes da confirmação e revalida o arquivo. A tentativa correlaciona a sessão autenticada, o perfil, a competência e o SHA-256. A função de staging reconfere os bytes recebidos e usa bloqueio transacional para serializar a recepção. Originais, snapshots, lote, execução, pendências e evento de sucesso são gravados juntos. As contagens são reconciliadas antes do commit. O histórico informa reenvio com os mesmos IDs e registra a falha após rollback quando a conexão permite.

A instalação aplica o [SQL local](../../database/local/pcdf-sandbox/direct.sql) sobre a baseline. As 19 tabelas do núcleo usam RLS forçada. Os logins da aplicação executam funções delimitadas e o proprietário das funções fica sem login e sem bypass de RLS. A prévia verifica o destino, o perfil, a estrutura e as permissões de staging. A confirmação retorna sucesso após o commit.

## Evidências históricas

A primeira qualificação conferiu 6.399 associações sintéticas, os 34 campos em staging, os 18 originais, reenvio concorrente, rollback e restauração. Os recibos `receiver-result.json` dos sandboxes `rls-sandbox-8f97edec-267d-46ef-b709-a53df14c6bbd`, `rls-sandbox-f4f76132-58fe-42f2-a796-86d60feebec9` e `rls-sandbox-663e695d-e9ac-46e1-a614-9ed40c959534` registram as etapas anteriores. O piloto de 55481 também reconciliou 6.393 associações sintéticas em transação revertida, conforme o recibo `pilot-executor-da33bf79-f220-42f6-917e-f98dcdc4cb9a.json`.

Os objetos e recibos do piloto assinado ficam preservados para consulta histórica. A interface, o preflight e a API ativos usam o receptor local direto.
