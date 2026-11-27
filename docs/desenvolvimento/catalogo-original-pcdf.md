# Catálogo de naturezas do XML da PCDF

Na aba `NATUREZAS` do SpreadsheetML, a referência é o campo `Natureza` (coluna 7). Os CSVs o transportam em `natureza_original`. Foram lidas 369.662 posições físicas na aba, das quais uma é cabeçalho e uma é vazia. As 369.660 associações foram comparadas por `linha_xml` com os 68 CSVs de janeiro de 2021 a agosto de 2026. Todas as posições coincidiram e as 41 descrições foram preservadas literalmente. [Lista exata e SHA-256 do XML](../catalogos/pcdf-naturezas-xml-v1.json).

A fonte preserva grafias distintas e caracteres próprios de cada descrição. `FEMINICIDIO`, `ESTUPRO DE VULNERÁVEL` e `POSSE OU PORTE ILEGAL DE ARMA DE FOGO DE  USO RESTRITO (L.10826/03)` aparecem assim no XML, inclusive com o espaço duplo antes de `USO` no último rótulo. As colunas `Natureza Padronizada` (9, 19 valores distintos) e `Crime Tentado (S/N)?` (8) também coincidiram com os CSVs e conservam significado independente da descrição.

| Campo ou estrutura | Uso |
| --- | --- |
| `natureza_original` / `naturezas_criminais.descricao_original` | Referência literal para validação, cadastro, consulta e indicadores. O UUID técnico continua identificando o vínculo ao catálogo. |
| `natureza_padronizada_pcdf` e `crime_tentado` | Categoria de origem e tentativa, respectivamente. O filtro de categoria existente usa o rótulo de origem em texto. |
| `natureza_sentinela_codigo`, `versao_mapeamento` e `classificacao_status` | Metadados legados do contrato recebido. As 369.660 linhas do CSV atual trazem `pendente` no último campo. Os bytes e os manifestos históricos preservam esse valor, que deixou de gerar uma pendência funcional. |
| `categorias_criminais`, `mapeamentos_natureza`, `mapeamento_id` e `codigo_manual` | Referências legadas mantidas para histórico, integridade e auditoria. Os novos vínculos qualificados usam a descrição original, sem depender de códigos ou categoria SENTINELA. |

O leitor reconhece as 41 descrições exatas. Ausência, valores desconhecidos e divergências continuam em revisão. Dados civis, identidade, localização, coordenadas e integridade da entrega mantêm seus próprios controles. Os relatórios analíticos e uma futura tela Estatísticas podem reutilizar o endpoint `GET /api/v1/analytics/persistente`. Os totais contam cada ocorrência uma vez, inclusive quando duas naturezas compartilham uma categoria de origem.

O SQL de homologação aceita apenas clone atestado e valida o digest das 41 descrições antes de instalar as projeções. Ele mantém as chaves existentes e disponibiliza o catálogo a partir de `naturezas_criminais`. Vínculos históricos permanecem com seus IDs. O filtro por natureza cobre os IDs legados que têm a mesma descrição exata. As pendências artificiais históricas ficam fora da consulta funcional do leitor, com seus registros preservados no banco e nas trilhas de custódia. [Migração exclusiva para clone](../../database/release/pcdf-original-natures-clone.psql).

`python -B database/local/pcdf-sandbox/qualify-management.py --original-catalog` instala a baseline integrada descartável e qualifica o delta. Sem o argumento, o mesmo programa roda os testes de gestão. A leitura dos arquivos completos em `scripts/check-pcdf-v2-series.mjs` confere os hashes das entregas e testa os dois caminhos de validação dos 68 CSVs. A liberação do banco operacional permanece uma etapa separada.
