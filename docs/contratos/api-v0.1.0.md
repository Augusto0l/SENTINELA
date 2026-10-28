# Contratos executáveis da API — v0.1.0

Etapa 3 da Sprint 3, 28/10/2026. **Proposta de integração**, sem CRUD, banco, autenticação, upload remoto ou transação operacional. Os schemas são executáveis; os endpoints `/api/v1/**` são apenas documentados. Não foram conectados às telas. Exemplos são fictícios.

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

Parâmetros opcionais: `search`, `page`, `pageSize`, `sortBy`, `direction`, `includeInactive`, `period`, `startDate`, `endDate`, `ra`, `nature`, `hour`. `sortBy` reutiliza os campos existentes (`id`, `data`, `horario`, `natureza`, `raName`, `local`), acompanhado de `asc`/`desc`. A semântica de ordenação por natureza para registros com vários vínculos ainda exige homologação; o schema não elege natureza principal. Não foi implementada consulta de banco.

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

Sucesso: `{success:true, data, meta}`. Meta declara versão de contrato/catálogo e execução: demonstrativo ou proposto sempre exigem persisted=false; operacional é um tipo previsto para a implementação futura e não é selecionado pelos exemplos demonstrativos.

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

Leituras/alterações propostas usam 200, criação 201. Autenticação Bearer e autorização por perfil/escopo estão documentadas **somente como requisitos futuros**, sem tokens reais, Supabase Auth ou RLS implementados.

### Endpoint que já existe

`GET /api/ocorrencias/geocode` é o proxy funcional de localização anterior a esta etapa. Retorna `{results:[{id,label,latitude,longitude,approximate}]}` em 200 e `{error:string}` em 400, 429 ou 503; 429 inclui Retry-After=2. Recebe `q` (5–240 caracteres, com letras), e opcionalmente `cep`, `street`, `district`; dados postais têm validações adicionais no handler existente. Não exige autenticação real. Usa cache e um serviço externo. **Não usa o novo envelope**, não foi modificado e continua fora do namespace versionado desta proposta. Os testes existentes de rota/provedor permanecem na suíte completa.

## OpenAPI e validação

[Especificação gerada](openapi-v0.1.0.json): OpenAPI 3.1.1, 11 caminhos, 13 operações e 23 modelos nomeados. Todas as operações têm `x-implementation-status: planned`. O servidor `https://sentinela.invalid` é reservado e não operacional. Não há publicação Swagger nem handlers `/api/v1`.

| Método | Caminho proposto | Contrato principal |
| --- | --- | --- |
| GET/POST | `/api/v1/ocorrencias` | Consulta/Listagem e cadastro |
| GET/PATCH | `/api/v1/ocorrencias/{id}` | Detalhes e atualização |
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
