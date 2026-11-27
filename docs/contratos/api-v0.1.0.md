# Contratos executáveis da API — v0.1.0

O contrato reúne as propostas da Sprint 3 e os GETs persistentes locais da Sprint 4. Os exemplos são fictícios. O OpenAPI identifica o estado de cada operação em `x-implementation-status`.

## Leituras persistentes implementadas

Os GETs abaixo exigem Next.js em desenvolvimento, loopback, provedor local, sessão válida no cookie `sentinela-local-session` e permissão `analisar`. Administrador, Operador e Analista usam a mesma reader PostgreSQL sob RLS. Os handlers respondem com `Cache-Control: private, no-store`.

| Método e caminho | Parâmetros | Resposta 200 |
| --- | --- | --- |
| GET `/api/v1/catalogos/regioes-administrativas` | Nenhum | Lista de `id` (UUID) e `nome` no escopo da reader. |
| GET `/api/v1/catalogos/naturezas-criminais` | `q` de 1 a 120 caracteres após trim, `direction=asc\|desc` com padrão `asc` | Lista de `id` e `descricao` original. |
| GET `/api/v1/ocorrencias` | `raId`, `naturezaId`, `startDate`, `endDate`, `identificacao`, `local`, `page` de 1 a 1.000.000, `pageSize` de 1 a 100, `sortBy` e `direction` | Itens e paginação. Padrões: página 1, tamanho 25, ordenação `data desc`. Campos de ordenação: `data`, `horario`, `identificacao`, `local`, `ra`. Datas são inclusivas. |
| GET `/api/v1/ocorrencias/{id}` | UUID no caminho | Detalhe da ocorrência visível. |
| GET `/api/v1/analytics/persistente` | `startDate`, `endDate`, `ra` (código), `nature` e `category` (UUID), `hour` (`0-6`, `6-12`, `12-18`, `18-24`) | Agregados, séries, opções de filtro e projeção espacial limitada a 5.000 pontos. |

Sucessos usam `{success:true,data,meta}`. Os handlers devolvem `400` para entrada inválida, incluindo query desconhecida, repetida ou enviada a uma rota que não a aceita, `401` para sessão ausente, expirada ou inválida no provedor local, `403` para acesso não autorizado, `404` no detalhe ausente ou invisível, `503` para reader indisponível e `500` para erro interno. O proxy local recusa métodos não autorizados com `403` e um envelope simples. A confirmação HTTP operacional das 37 RAs depende da configuração legítima da reader.

## Fluxos experimentais

O Next.js disponibiliza `POST /api/v1/ocorrencias`,
`PATCH /api/v1/ocorrencias/{id}` e
`POST /api/v1/ocorrencias/{id}/inativacao` no modo de escrita isolada.
Fora desse modo, as mutações permanecem bloqueadas. O modo usa sessão no
cookie, origem exata em loopback e contas descartáveis do próprio cluster.
Cadastro aceita a chave UUID `Idempotency-Key`. Edição e inativação exigem
versão esperada e justificativa ou motivo. O OpenAPI identifica esse modo
em `x-isolated-implementation`; seus schemas de escrita operacional
continuam planejados. Os formatos e códigos da variante isolada estão
descritos no [contrato do laboratório](../../database/local/write-sandbox/MUTACOES.md).

O cadastro e a edição do Next.js isolado exigem `local`, `endereco`
e `bairroOuSetor` como campos distintos. Edição envia esses valores em
`alteracoes`. O cliente recebe o UUID e a versão confirmados. A autoria
individual sintética vem da sessão e do vínculo provisionado no banco.
No cadastro, reenviar a mesma chave com os mesmos dados reapresenta o
recibo original com HTTP 201. Alterar apenas o endereço ou o bairro ou setor
com a mesma chave também produz HTTP 409. A chave está vinculada ao perfil
SQL do laboratório. A edição concorrente com versão desatualizada retorna
HTTP 409. A sessão ausente, encerrada ou expirada retorna HTTP 401.

Os ensaios de escrita e staging vivem em `database/local/write-sandbox` e `database/local/pcdf-sandbox`. Seus serviços e procedures são exclusivos de clusters descartáveis. Administrador e Operador sintéticos podem cadastrar, editar e inativar ocorrências elegíveis no laboratório. A prévia da interface continua identificada como demonstração.

## Importação PCDF e Central no cluster descartável

| Rota | Regra | Resultado |
| --- | --- | --- |
| GET `/api/v1/importacoes/pcdf` | Administrador ou Operador | 200 com até 100 lotes e contagens. |
| POST `/api/v1/importacoes/pcdf?competencia=AAAA-MM` | Administrador ou Operador, corpo `text/csv` UTF-8, 34 colunas e até 16 MiB | 201 no recebimento, 200 no reenvio idêntico. |
| POST `/api/v1/importacoes/pcdf/{id}/consolidacao` | Administrador ou Operador, UUID da execução | 200 com ocorrências e associações criadas, linhas consolidadas e pendentes. |
| GET `/api/v1/central-revisao` | Três perfis, filtros `tipo`, `prioridade` e `status` opcionais | 200, até 100 itens por prioridade. |
| PATCH `/api/v1/central-revisao/{id}` | Administrador, JSON com decisão, versão esperada, justificativa e valor quando houver correção | 200 com a decisão auditada. |

O envelope de sucesso é `{ success: true, scope: "sandbox-synthetic-only", data }`.
As rotas exigem sessão local do ensaio. Nas mutações o `Origin` deve
coincidir com a origem de loopback configurada. Sessão ausente retorna 401,
perfil inválido retorna 403, versão obsoleta ou colisão de origem retorna
409, mídia inválida retorna 415, arquivo acima do limite retorna 413,
arquivo ou valor recusado retorna 422 e indisponibilidade retorna 503.
O OpenAPI identifica as operações operacionais ainda propostas.

Na Central, `occurrenceId` contém o vínculo com o caso consolidado
quando ele existe. `canResolve` indica se a pendência aceita correção na
Central do laboratório. Esse escopo cobre horário, local e flagrante
desconhecido antes da promoção. O sistema preserva o histórico das
decisões depois de consolidar e mantém a edição operacional separada.

## Base e rastreabilidade

Branch `feat/sprint3-contratos-api`, criada a partir de `integracao-pedro` em `626ab00`, que contém as Etapas 1 e 2. Referências de `ceub` antes da criação: `ceub/main` em `ad7899d`, sem o commit da Etapa 2; `ceub/integracao-pedro` em `626ab00`. Naquele momento, o usuário confirmou o PR #219 aberto e o destino previsto era a integração.

Após a criação da branch, o usuário integrou o PR #219. Novo fetch confirmou `ceub/main` em `2739dbb` (merge de #219), com `626ab00` como ancestral. **Destino atual do PR da Etapa 3: main institucional.** A origem histórica da branch é preservada; não é necessário merge/rebase para que o diff do PR contenha somente esta etapa.

O estado do PR foi confirmado pelo usuário: a API não autenticada retornou 404 e a consulta com reutilização da credencial do Git foi rejeitada pela revisão automática, sem extração de segredo. O fetch Git funcionou. Nenhum PR remoto foi modificado.

Fontes: [requisitos](../requisitos_v1.md), [arquitetura](../arquitetura.md), [Sprint 3](../../sprints/sprint-03.md), [catálogos](catalogos-v0.1.0.json), [deduplicação/permissões](deduplicacao-permissoes-v0.1.0.md), [importação](../importacao-demonstrativa.md) e [analytics](../filtros-analytics.md). Rastreabilidade local: Feature #14, PBI #107/tasks #108/#109 (endpoints/payloads) e PBI #110/tasks #111/#112 (erros/OpenAPI). Os títulos e o escopo local foram consultados; os critérios remotos dessas issues não foram obtidos e não há declaração de fechamento ou aceite.

## Organização e uso

Os módulos em `src/contracts` usam o Zod já instalado. Tipos de requisição e resposta são inferidos dos schemas. As enums vêm do catálogo versionado, sem importar Canvas ou recriar os dados cartográficos. Não há códigos oficiais novos. Naturezas usam os nomes já consumidos pelas telas; os IDs `NAT-*` continuam no catálogo e não são confundidos com nomes no payload.

```ts
import { occurrenceCreateSchema, parseOccurrenceQuery } from "@/contracts/occurrences";
import { fromOccurrenceForm } from "@/contracts/adapters";

const input = occurrenceCreateSchema.parse(payloadDesconhecido);
const query = parseOccurrenceQuery(new URLSearchParams("page=1&pageSize=25&includeInactive=false"));
const contrato = fromOccurrenceForm(valoresDoFormulario);
```

São exemplos de uso futuro; não foram adicionados handlers. Erros de `parse` são erros Zod, a serem convertidos pelo futuro handler no envelope padronizado. Erros de transporte como parâmetros repetidos são recusados antes do parse.

## Ocorrências

| Campo | Cadastro | Formato e significado |
| --- | --- | --- |
| `data` | Obrigatório | Data civil ISO `YYYY-MM-DD`, anos 1900–9999, sem conversão para instante |
| `horario` | Obrigatório | `HH:mm`, 00:00–23:59, horário civil de Brasília |
| `raCode` | Obrigatório | ID interno presente no catálogo, inclusive a área demonstrativa RA-S com ressalva de homologação |
| `naturezas` | Obrigatório | Lista não vazia de nomes do catálogo; sem repetição do mesmo vínculo, até as oito categorias atuais |
| `local` | Obrigatório | Texto normalizado por trim, 5–240 caracteres, como no formulário existente |
| `coordenadas` | Opcional/anulável | Par numérico `{latitude, longitude}` WGS84; omitido/null representa pendência |

Latitude deve estar em [-90, 90], longitude em [-180, 180], sempre números finitos. Um par parcial é inválido. GeoJSON/PostGIS utiliza ordem **longitude, latitude**; nenhuma geometria SQL foi criada. Validade numérica não comprova pertencimento ao DF/RA ou precisão da localização. O adaptador do formulário e a validação das linhas demonstrativas reaproveitam os limites do formulário atual (-16.2 a -15.4; -48.3 a -47.3), sem transformar esse retângulo em fronteira oficial.

A resposta detalhada exige ID interno opaco, `ativo`, origem manual/importação, `loteId` anulável, estado de localização e `createdAt`/`updatedAt` UTC. Origem manual exige lote nulo; importação exige ID de lote. Coordenadas nulas exigem estado pendente. Os timestamps são distintos da data/hora do fato. Não se exige UUID nem ID oficial: `#00001` continua representável. IDs devem ser codificados com `encodeURIComponent` ao compor o caminho, para que `#` não seja interpretado como fragmento da URL.

PATCH aceita somente os campos editáveis. Omitir preserva o valor; enviar coordenadas null cria pendência; os outros campos não aceitam null. PATCH vazio, ID, autoria e campos desconhecidos são recusados. A API futura deverá combinar o patch com o registro anterior, revalidar o resultado, autorizar a ação e auditar. Inativação requer motivo não vazio de até 500 caracteres, conforme a interface atual; não há DELETE físico proposto.

Os adaptadores convertem data brasileira/ISO e coordenadas string/número sem alterar a UI. A conversão de uma ocorrência com várias naturezas para o formulário antigo é recusada explicitamente: não se escolhe uma natureza principal arbitrária. Pendências também não ganham coordenadas artificiais.

## Consulta, ordenação e período

O modelo demonstrativo de filtros usa `search`, `page`, `pageSize`, `sortBy`, `direction`, `includeInactive`, `period`, `startDate`, `endDate`, `ra`, `nature`, `hour`. Seus campos de ordenação são `id`, `data`, `horario`, `natureza`, `raName` e `local`. A leitura PostgreSQL usa os parâmetros da tabela acima e não elege natureza principal.

Página inicia em 1; tamanho permitido de 1 a 100 é um limite técnico proposto, compatível com a paginação demonstrativa. O consumidor futuro deve definir explicitamente seus padrões e ordenação estável. A resposta inclui `items` e `pagination` com `page`, `pageSize`, `total`, `totalPages`; página vazia usa `totalPages=1`. IDs não se repetem na página, e as quantidades devem corresponder aos metadados. O contrato rejeita páginas fora dos metadados; a UI atual continua ajustando a página local por sua própria regra.

Atalhos: `all`, `today`, `7d`, `1m`, `3m`, `6m`, `12m`, relativos à referência demonstrativa de **25/08/2026**. `custom` exige início/fim válidos, inclusivos e ordenados. Datas sem `custom` são recusadas, evitando critérios silenciosamente ignorados. A API operacional futura precisará declarar outra referência temporal se abandonar a base demonstrativa.

RA e natureza usam o catálogo; `hour` mantém faixas semiabertas `0-6`, `6-12`, `12-18`, `18-24`. Parâmetros desconhecidos/repetidos, números inválidos e booleanos diferentes dos literais `true`/`false` são recusados pelo decodificador HTTP de ocorrências. Não se usa coerção que transforme `"false"` em true. Adaptadores tratam os campos vazios da UI como ausência, sem enviar o rascunho de datas de um atalho rápido.

## Importação

`ImportCreate` descreve identificação do arquivo e fonte. Nome seguro CSV/XLSX, tamanho de 1 a 52.428.800 bytes e SHA-256 hexadecimal são metadados a conferir no servidor futuro. Esse POST **não envia bytes**. Upload/Storage, associação segura dos bytes ao lote, verificação do hash e idempotência continuam para a integração posterior. Não basta confiar nos valores informados pelo cliente.

`ImportMapping` identifica planilha disponível, cabeçalhos e índices base zero; -1 representa não mapeado. Campos obrigatórios, índices dentro dos cabeçalhos e ausência de reutilização de coluna são conferidos. Os limites de 64 colunas e 10.000 registros vêm de `IMPORT_LIMITS`; o limite de 50 MB vem de `MAX_IMPORT_FILE_BYTES`. Demais proteções de expansão, texto, tempo e memória continuam no parser existente, sem alteração.

`ImportAnalysis` preserva exatamente as estruturas da Etapa 1: erros globais de mapeamento; linhas com número original, células brutas, valores normalizados, status, erros com campo/coluna (base um, null quando inexistente), pendências e referência a possível duplicata anterior. Uma linha inválida pode conter data/natureza inválidas: é diagnóstico, não ocorrência consolidada. Linhas válidas/pendentes têm seu status conferido; contagens correspondem às linhas. Erro global de mapeamento preserva a quantidade de linhas detectadas, com análise de linhas ainda vazia, como no fluxo atual.

O contrato de prévia retorna a análise completa limitada a 10 mil linhas; a UI continua paginando localmente. Paginação remota de prévias, retenção e acesso aos brutos precisam de desenho na etapa de backend. O schema não substitui inspeção de CSV/XLSX nem autoriza exposição de dados brutos.

O lote proposto inclui ID, hash/nome/tamanho, fonte, identidade futura derivada no servidor, timestamps UTC, versões de mapeamento/validação anuláveis enquanto não executadas, estado e diagnóstico seguro de falha. Estados propostos: criado, mapeado, validado, processando, concluido, falhou. Somente concluído possui resultado; falha exige diagnóstico. A máquina de transições, o versionamento efetivo e a retomada não são implementados.

Resultados demonstrativos conservam `simulated`, `pending`, `rejected`, `possibleDuplicates`, `total` e **persisted=false**. Resultados operacionais futuros usam `inserted` e persisted=true em um tipo separado; nenhum código atual produz esse resultado. Candidatos a duplicata não são subtraídos ou excluídos automaticamente. O endpoint proposto de confirmação é explicitamente de simulação, não de commit transacional.

## Analytics e mapas

`buildDemoAnalytics` e `buildDemoMap` recebem ocorrências canônicas e reutilizam `queryDemoAnalytics` da Etapa 2. Não importam mocks Canvas, não alteram as telas e não consultam banco. IDs repetidos na entrada são recusados, sem deduplicação por semelhança. Os builders demonstrativos excluem inativas e mantêm a distinção entre registro ativo com localização pendente e ponto disponível; a política operacional de consolidação/inclusão de pendências ainda precisa de homologação.

`AnalyticsData` retorna filtros, resumo selecionado e resumo territorial global, unidades explícitas, série mensal, distribuição por RA/natureza, dia/hora de pico e natureza em destaque. Total e série contam ocorrências; natureza conta vínculos distintos e pode somar mais que o total. Soma das RAs/série conserva o total; o resumo regional corresponde à RA selecionada. Meses são únicos e cronológicos, conforme o resumo existente.

`MapData` fornece `points` com ID, RA, múltiplas naturezas e coordenadas WGS84, contagens territoriais, total e pendências. `mode` aceita points/heat/clusters. Calor e clusters serão calculados pelo renderizador existente, sem inventar novos centróides, pesos, cores ou algoritmo cartográfico no contrato. Os pontos são individuais, não agregados mensais convertidos artificialmente.

`heatReference` contém coordenadas da base integral recebida, sem aplicar os filtros de período/RA/natureza/horário, para preservar a referência de intensidade. Na integração futura, essa base integral deverá ser **previamente autorizada**: a referência nunca concede acesso fora do escopo do usuário. O transporte/cache da referência em bases grandes, paginação geográfica, granularidade e limites de desempenho permanecem pendentes. Satélite reutiliza coordenadas/contagens e não ganha endpoint de imagem nesta etapa.

## Respostas e erros

Sucessos declaram versão de contrato, catálogo e execução em `meta`. Exemplos demonstrativos ou propostos usam `persisted=false`. Os GETs persistentes usam `mode: "operacional"` e `persisted: true` em respostas bem-sucedidas, inclusive no desenvolvimento local.

Erro: `{success:false, error:{code,status,message,details,requestId?}}`. `details` tem caminho, código e mensagem. Não há stack, credenciais ou payload sensível obrigatório. Relação de código/status validada em runtime:

| HTTP | Código | Uso proposto |
| --- | --- | --- |
| 400 | BAD_REQUEST | Transporte/JSON/parâmetro malformado |
| 401 | UNAUTHORIZED | Identidade futura ausente/inválida |
| 403 | FORBIDDEN | Perfil/escopo não autorizado |
| 404 | NOT_FOUND | Recurso inexistente no escopo autorizado |
| 409 | CONFLICT | Conflito de estado; sem deduplicação presumida |
| 413 | PAYLOAD_TOO_LARGE | Limite de processamento |
| 415 | UNSUPPORTED_MEDIA_TYPE | Formato não suportado |
| 422 | VALIDATION_ERROR | Dados semanticamente inválidos |
| 429 | RATE_LIMITED | Limite de consultas, Retry-After previsto |
| 500 | INTERNAL_ERROR | Erro interno seguro |
| 503 | SERVICE_UNAVAILABLE | Serviço indisponível |

As operações planejadas usam 200 para leitura ou alteração e 201 para criação. O esquema Bearer descreve a autenticação futura. Os GETs locais implementados usam o cookie e a RLS descritos acima.

### Endpoint que já existe

`GET /api/ocorrencias/geocode` fica fora do OpenAPI v0.1.0 e usa um envelope simples. O proxy bloqueia o modo local com `403`. O handler exige acesso autenticado e mantém a consulta externa bloqueada enquanto o escopo de negócio estiver desabilitado. Validação de endereço, cache e respostas do provedor são exercitados separadamente nos testes do handler.

## OpenAPI e validação

[Especificação gerada](openapi-v0.1.0.json) em OpenAPI 3.1.1. Os cinco GETs acima usam `implemented-local-development`; a tabela abaixo lista operações `planned`. O servidor `https://sentinela.invalid` é reservado para documentação.

| Método | Caminho proposto | Contrato principal |
| --- | --- | --- |
| POST | `/api/v1/ocorrencias` | Cadastro |
| PATCH | `/api/v1/ocorrencias/{id}` | Atualização |
| POST | `/api/v1/ocorrencias/{id}/inativacao` | Motivo e retorno da ocorrência |
| POST | `/api/v1/importacoes` | Identificação/criação de lote |
| GET | `/api/v1/importacoes/{id}` | Estado, diagnóstico e resultado |
| PUT | `/api/v1/importacoes/{id}/mapeamento` | Cabeçalhos, planilha e índices |
| GET | `/api/v1/importacoes/{id}/previa` | Análise, erros e contagens |
| POST | `/api/v1/importacoes/{id}/validacao` | Solicitação de validação |
| POST | `/api/v1/importacoes/{id}/simulacao` | Confirmação exclusivamente demonstrativa |
| GET | `/api/v1/analytics/dashboard` | Indicadores e séries |
| GET | `/api/v1/mapa` | Coordenadas, contagens e referência |

`pnpm generate:openapi` gera schemas e exemplos do mesmo registro Zod (`src/contracts/examples.ts` e `openapi.ts`). `pnpm validate:contracts` conserva a validação dos catálogos e acrescenta: sincronização exata do arquivo gerado, Swagger Parser, validação de todos os exemplos em Zod e AJV 2020 com formatos, exemplos de requisição/resposta/erro e unicidade das operações. A mesma verificação participa de `pnpm test`.

Refinamentos de relação entre campos (datas ordenadas, combinações de parâmetros, status/diagnósticos, contagens, código/status HTTP) e normalização trim não são todos expressáveis no JSON Schema. A extensão descritiva do OpenAPI explicita essa limitação; a validação Zod e os testes de casos inválidos são necessários. Um validador OpenAPI isolado não substitui as regras executáveis.

Referências técnicas: [conversão JSON Schema nativa do Zod](https://zod.dev/json-schema) e [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html). Validadores adicionados apenas ao desenvolvimento: Swagger Parser, AJV e ajv-formats; Zod permanece a biblioteca de runtime existente.

## Pendências e PR exclusivo

Catálogos/códigos oficiais, exceções de bases históricas, política de inativação por perfil, consolidação das pendências, natureza principal/ordenação multivalorada, fontes/coberturas, deduplicação, limites produtivos, autorização, upload seguro, transações e contrato SQL/PostGIS exigem homologação ou implementação posterior. Limites novos de paginação/ID/nome são propostas técnicas desta versão, não regras institucionais aprovadas. Há divergências de numeração e de obrigatoriedade nos requisitos históricos; esta versão segue os campos validados atualmente e explicita as exceções, sem declarar revisão institucional.

Após auditoria e versionamento manual, abrir PR no repositório institucional: `feat/sprint3-contratos-api` → `main`. Conferir o diff para conter somente os arquivos deste inventário; referenciar #107/#110 e tasks aplicáveis, usando Closes somente depois de confirmar os critérios remotos. O PR #219 já foi integrado pelo usuário e não precisa ser alterado. Nenhum merge/rebase/cherry-pick/push foi executado pelo agente nesta entrega.

Resultados e inventário: [evidências](../evidencias/contratos-api/README.md).
