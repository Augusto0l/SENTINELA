# SENTINELA — Pacote para decisão institucional de catálogos

## Regiões Administrativas

O pacote territorial contém 37 códigos internos, 37 UUIDs e números administrativos de 1 a 37. A matriz identifica nome, código da feição, origem do vínculo e o número administrativo. Os UUIDs e códigos são identificadores internos persistentes. O campo `codigo_oficial` continua vazio na carga de ensaio. [Matriz territorial](ras-revisao-2026-11-13-v1/matrix.md) · [Matriz em JSON](ras-revisao-2026-11-13-v1/matrix.json) · [Vínculos usados pela aplicação](../../public/data/cartography/ra-bindings.json)

O snapshot preserva os bytes da extração IDE/DF de 13/11/2026. O serviço informa SRID de origem 31983 e exportação em EPSG:4326. O SHA-256 da exportação é `fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553`. A versão de catálogo usada no ensaio é `SENTINELA_RA_PUBLICO_2026_11_13_V1`. Há aprovação técnica dos vínculos do snapshot. A vigência jurídica dos polígonos continua sem comprovação documental. [Procedência da extração](../../public/data/cartography/provenance.json) · [Manifesto da revisão](ras-revisao-2026-11-13-v1/manifest.json) · [Payload versionado](../../database/local/ra-catalog-v2/payload.json)

No PostgreSQL 17.11/PostGIS 3.6.2 sintético, as 37 geometrias eram MultiPolygon válidos com SRID 4326. A inspeção encontrou nove pares com interseção de interiores. A validação de cadastro exige um ponto no interior de uma única RA e recusa pontos ambíguos ou de fronteira. O ensaio também verificou mudança de RA, FK de ocorrência e geometria persistida. A decisão institucional deve definir validade por data, critério em áreas sobrepostas e origem de eventuais códigos oficiais.

## Naturezas e categorias

| Conjunto | Evidência | Decisão necessária |
| --- | --- | --- |
| Naturezas originais da PCDF | 41 descrições distintas na série, 34 observadas em janeiro/2021. Os IDs `PCDF-N-*` servem à revisão interna. | Aprovar denominações, códigos do emissor, versão, vigência e permissões de uso manual. |
| Naturezas para cadastro manual | 41 candidatas pendentes e zero homologadas nos artefatos acessíveis. O formulário usa UUID da fonte `SENTINELA_MANUAL` após carga aprovada. | Emitir ato independente e manifesto de natureza com descrição literal, `situacao: homologada` e `usoManual: true` para cada item aprovado. |
| Categorias analíticas internas | 20 categorias previstas, 19 rótulos de categoria na fonte PCDF e duas correspondências documentadas pendentes. | Homologar correspondências, tentativas, casos ambíguos, versionamento e regra de publicação. |

[Inventário PCDF](pcdf-inventario-v1.json) · [Lista das 41 candidatas](naturezas-manuais-candidatas-v1.json) · [Matriz de aprovação](naturezas-manuais-matriz-aprovacao.md) · [Correspondências PCDF](pcdf-correspondencias-v1.json) · [Modelo de manifesto](naturezas-manuais-aprovacao-modelo.json)

No cadastro, a tentativa é informada por vínculo e distingue `true` (Tentado), `false` (Consumado) e `null` (Não informada por seleção explícita). A classificação analítica usa mapeamentos homologados com evidência, em um fluxo próprio. A presença de um rótulo no XML comprova observação na fonte. A autorização de uso manual e a equivalência analítica exigem atos independentes.

## Encaminhamento para aprovação

1. O mantenedor do catálogo territorial valida a associação código–UUID–geometria–número, entrega evidência de vigência e decide o tratamento das sobreposições. O responsável pela fonte PCDF valida as descrições e a autorização de uso do histórico.
2. O responsável pelo cadastro manual entrega a lista de itens autorizados, versão, emissor, vigência e ato com SHA-256 independente do manifesto. O comitê de classificação registra as correspondências em instrumento separado, incluindo a regra para tentativa e a política para conflitos.
3. O DBA valida o hash, a procedência, o escopo, as unicidades e a compatibilidade com o catálogo já instalado no destino especificamente autorizado. Confronta contagens, FKs, índices espaciais e consultas de RA ambígua antes do aceite.
4. A equipe de segurança registra a matriz aprovada e a identidade institucional vinculada que poderá operar o fluxo. Enquanto as aprovações estiverem pendentes, o cadastro e a gestão integrados permanecem limitados ao ensaio sintético.

O parser do gerador rejeita chaves JSON repetidas e restringe o catálogo de ensaio à porta sintética. Um checksum válido atesta a integridade dos bytes entregues. A comprovação do emissor e do ato institucional cabe ao processo de aprovação. [Gerador de catálogos](../../database/local/pcdf-sandbox/manual_catalog_seed.py) · [Relatório integrado](../relatorios/finalizacao-sprint4-integracao-operacional-2026-11-24.md)
