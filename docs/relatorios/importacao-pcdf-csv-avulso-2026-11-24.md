# Importação mensal PCDF por CSV avulso

Foram examinados os 68 arquivos mensais em `SENTINELA-DADOS/dados_restritos/pcdf-v2-csvs-2021-2026`, de janeiro de 2021 a agosto de 2026. O layout tem 26 colunas em ordem fixa, delimitador ponto e vírgula, UTF-8 sem BOM e CRLF entre registros. O receptor aceita aspas e quebras de linha internas em campos entre aspas. O nome `pcdf_naturezas_AAAA-MM.csv` determina a competência.

O parser validou 369.660 associações, com 349.582 chaves candidatas distintas somadas por mês, zero linhas inválidas e zero identificadores ou posições de origem repetidos dentro de cada arquivo. A soma mensal pode contar uma chave presente em meses diferentes. Os arquivos têm 41 rótulos de natureza, 19 categorias PCDF e 34 rótulos de RA, incluindo o marcador de ausência. Todas as associações têm pendência de classificação analítica. O catálogo prevê 20 categorias SENTINELA e o vínculo analítico entre os catálogos depende de homologação.

Na série completa, 37.968 registros têm `local` vazio, 360.989 têm referência de coordenadas pendente e 8.671 têm coordenadas ausentes. Nenhuma chave ou hora está vazia na série mensal. As regras ainda aceitam essas ausências como pendência em arquivos futuros, desde que o restante da linha esteja coerente.

| Competência | Associações | Candidatas | `local` vazio | GEO ausente | Pares UTM vazios |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-05 | 4.871 | 4.524 | 373 | 1 | 970 |
| 2026-06 | 4.370 | 4.077 | 338 | 1 | 804 |
| 2026-07 | 4.399 | 4.099 | 259 | 0 | 896 |
| 2026-08 | 2.443 | 2.265 | 155 | 0 | 417 |

## Correspondência dos campos

As linhas abaixo seguem a ordem real do cabeçalho. Os 26 campos já existiam no v1.0 e mantêm seus nomes. O staging guarda todos os valores do CSV como texto original, inclusive vazios. A coluna de destino indica as projeções adicionais e seus usos.

| Campo | Formato e ausência | Destino e uso |
| --- | --- | --- |
| `ano_registro` | Ano textual de quatro dígitos | Origem, chave candidata, identificação e busca |
| `unidade_registro` | Texto de origem | Origem, chave candidata, identificação e busca |
| `numero_registro` | Identificador textual com zeros iniciais | Origem, chave candidata, identificação e busca |
| `ocorrencia_chave` | Vetor JSON com fonte e os três campos de registro. Vazio quando falta identificação | Conferência com o trio de origem e contagem distinta por lote |
| `ano_fato` | Ano textual coerente com a data | Origem e verificação temporal |
| `data` | Data civil obrigatória `AAAA-MM-DD` | Data projetada para consulta e filtros. Deve pertencer à competência |
| `horario` | `HH:MM:SS` ou vazio | Hora projetada e pendência quando ausente |
| `natureza_original` | Rótulo PCDF | Origem, consulta e conferência com o inventário |
| `natureza_padronizada_pcdf` | Rótulo de categoria PCDF | Origem, consulta e conferência com os rótulos PCDF do inventário |
| `crime_tentado` | `SIM`, `NÃO` ou valor pendente | Origem, diagnóstico e conferência de associação candidata repetida |
| `classificacao_status` | Literal `pendente` neste layout | Pendência de classificação. Nenhum código analítico atribuído |
| `cidade_endereco_original` | Texto de origem | Origem e detalhe técnico |
| `ra_original` | Rótulo `RA NN_TEXTO` com possível indicação de ausência | Origem, filtro textual e conferência de número e denominação no catálogo administrativo. Aliases históricos divergentes entram em revisão |
| `area_endereco_original` | Texto ou vazio | Origem e conferência de `local` |
| `quadra_endereco_original` | Texto ou vazio | Origem e conferência de `local` |
| `local` | Textos de área e quadra informados, distintos, unidos por barra vertical | Própria linha de staging, consulta e revisão auditada |
| `latitude_geo_original` | Decimal como texto ou estado de ausência | Origem, verificação lexical e faixa de ±90 graus |
| `longitude_geo_original` | Decimal como texto ou estado de ausência | Origem, verificação lexical e faixa de ±180 graus |
| `latitude_utm_original` | Componente UTM como texto, com possíveis marcadores de ausência | Origem e diagnóstico de par. A referência necessária à projeção não consta no CSV |
| `longitude_utm_original` | Componente UTM como texto, com possíveis marcadores de ausência | Origem e diagnóstico de par |
| `coordenada_status` | `invalida`, `incompleta`, `referencia_pendente` ou `ausente` | Conferência com GEO/UTM e pendência geográfica. Nenhuma geometria consolidada |
| `flagrante` | `SIM`, `NÃO` ou valor pendente | Origem e diagnóstico |
| `unidade_apuracao` | Texto de origem | Origem e detalhe |
| `fonte` | Literal `PCDF` | Extração e validação do arquivo |
| `linha_origem_id` | SHA-256 declarado pelo gerador | Identificador externo de origem, unicidade e vínculo com staging |
| `linha_xml` | Inteiro positivo declarado pelo gerador | Posição declarada, unicidade no arquivo e rastreabilidade |

Saíram da modalidade avulsa `data_inicio_fato_original`, `natureza_sentinela_codigo`, `versao_mapeamento`, `ra_codigo`, `latitude`, `longitude`, `aba_origem` e `versao_tratamento`. Esses campos seguem disponíveis onde foram gravados no fluxo v1.0. A validação do pacote completo continua usando os dados declarados nos anexos. Não houve renomeação, adição de coluna CSV ou remoção de coluna física.

Os campos exclusivos do banco incluem UUIDs de extração, lote, execução e staging, usuário institucional solicitante, versão, datas da operação, SHA-256 calculado sobre os bytes recebidos e diagnósticos. A extração guarda metadados da recepção CSV, com `nome_xml` e `sha256_xml` nulos. O valor técnico `CSV` no campo de armazenamento `aba_origem` e o identificador de versão `pcdf-linha-declarada-csv-v2` distinguem essa origem da extração XML conferida. O arquivo de origem permanece no disco. O banco retém seus valores por associação e a impressão digital do arquivo.

## Comportamento integrado

- O servidor valida dados e gera prévia em `POST /api/v1/importacoes/pcdf/direta?etapa=validar&versao=2.0&modalidade=csv`, com o campo multipart `csv`. Problemas de estrutura retornam 422. Erros de conteúdo na prévia identificam associação e coluna e impedem a confirmação. Pendências de classificação, RA e coordenadas permanecem revisáveis.
- A confirmação usa o mesmo caminho com `etapa=confirmar`, enviando `csv` e `sha256` da prévia. O servidor verifica novamente os bytes e a identidade institucional. A transação reconcilia origem, staging, pendências e auditoria. O reenvio idêntico retorna o mesmo lote. Outro conteúdo para uma competência com lote PCDF recebe 409.
- O Histórico e o detalhe da execução exibem os campos correspondentes à versão armazenada. A consulta e os indicadores de importados incluem as associações v2. Os indicadores, filtros e exportações analíticas consolidadas seguem o contrato de ocorrências consolidadas. A edição usa a revisão e a auditoria existentes. A exclusão usa a prévia revisada, a autorização específica e o comprovante independente já exigidos pelos procedimentos instalados.
- O pacote completo continua disponível para conferência local dos cinco anexos. O formulário de cadastro manual mantém a validação obrigatória do seu próprio contrato.

## Implantação e recuperação

A migration `database/release/pcdf-monthly-csv.psql` instala `sentinela_pcdf_local.receive_csv(uuid,uuid,text,jsonb,bytea)`. Ela ajusta a restrição de extração para aceitar CSV avulso com proveniência declarada, estende as políticas existentes à modalidade e registra o contrato no leitor de detalhe e no plano de exclusão. As funções de autorização, os triggers de auditoria e a proteção especial de janeiro/2021 continuam ativos.

O comando `python -B database/local/pcdf-sandbox/release-monthly-csv.py --qualify "CAMINHO_DO_CSV"` obtém um backup somente leitura, restaura na porta 55487, atesta o clone e executa os testes de PostgreSQL e navegador. A matriz de teste usa a identidade institucional restaurada e credenciais temporárias do ambiente descartável. O clone é encerrado ao fim.

O comando `python -B database/local/pcdf-sandbox/release-monthly-csv.py --activate ID_DO_CLONE` requer o relatório de qualificação, o mesmo hash de migration, o backup íntegro e os mesmos fingerprints de schema e dados na origem. Verifica os privilégios e os fingerprints dos dados após a ativação. Se a transação da migration falhar, o PostgreSQL reverte todas as alterações de schema. Para suspender apenas novas gravações após uma ativação, revogue `EXECUTE` sobre `receive_csv(uuid,uuid,text,jsonb,bytea)` de `sentinela_local_admin` pelo procedimento administrativo local. Preserve lotes já recebidos. Para recuperação completa, restaure e confira o arquivo privado em outro cluster antes de trocar o destino operacional.

## Arquivos

- Validação e DTOs em `src/data/pcdfV2.ts`, `src/contracts/pcdf-direct.ts` e `src/contracts/occurrence-management.ts`. O contrato gerado `docs/contratos/openapi-v0.1.0.json` inclui a versão 2.0 na prévia de exclusão de leitura.
- Recepção e ligação com gestão em `src/lib/db/pcdf-v2-delivery.ts`, `src/lib/db/pcdf-direct.ts` e `src/lib/db/operational-import-review.ts`.
- Interface em `src/features/import/pcdf-intake-client.ts`, `useImportWorkflow.ts`, `ImportWorkflow.tsx` e `ImportHistory.tsx`.
- Migration e automação em `database/release/pcdf-monthly-csv.psql`, `database/local/pcdf-sandbox/release-monthly-csv.py`, `scripts/check-pcdf-monthly-csv.mjs` e `tests/pcdf-monthly-csv.test.mjs`.

## Homologação e estado operacional

O backup operacional foi restaurado no clone `clone-10229146a45e49fe9cd2fa679f6eee05`. A comparação de schema e fingerprints comprovou a restauração de 27 tabelas. O CSV real de agosto/2026 foi importado pelo navegador com 2.443 associações, 2.265 chaves candidatas, 6.331 pendências e zero ocorrências consolidadas.

O clone confirmou o bloqueio para Operador e Analista, rollback após falha durante o staging, reenvio idêntico, conflito na mesma competência, leitura de 26 campos, atualização dos indicadores, edição auditada com preservação dos originais, exclusão mediante aprovação da revisão e comprovante independente. A validação usou larguras de 1.440 px e 390 px. O clone foi encerrado.

A mesma migration está ativa na porta 55484. Os fingerprints de dados coincidiram antes e depois da instalação. A leitura operacional encontrou um vínculo administrativo vigente, zero lotes v2 e um comprovante para o lote antigo de janeiro/2021, cujo UUID não está mais em `lotes_importacao`. A aplicação da porta 3000 respondeu no Edge e exigiu sessão para abrir `/importar`. O receptor retornou 401 a uma consulta anônima.

TypeScript, ESLint, build de produção, validação de contratos e verificação estática de rotas concluíram com sucesso. A suíte Node teve 282 testes aprovados e quatro cenários opcionais ignorados. A homologação do CSV real e da gestão foi executada no clone descrito acima.
