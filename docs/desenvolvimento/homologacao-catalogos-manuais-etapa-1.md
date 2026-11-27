# Homologação técnica dos catálogos manuais

A Etapa 3 revisou `local-manual-0001` e preparou a ativação conjunta. Para aplicar, use os hashes, pré-condições e comandos da [Etapa 3](ativacao-cadastro-manual-etapa-3.md).

## Diagnóstico operacional

A auditoria somente leitura de 22/11/2026 em `127.0.0.1:55484/sentinela_pcdf_local` encontrou zero linhas em `sentinela.regioes_administrativas`, `sentinela.naturezas_criminais`, `sentinela.categorias_criminais` e `sentinela.mapeamentos_natureza`. A view `sentinela_ocorrencias_local.consolidadas` já está instalada. O schema `sentinela_ocorrencias_manual` e sua função de catálogo estão ausentes. O GET de cadastro retorna `503` até a instalação da sequência abaixo. A ausência de dados também impediria o cadastro após a instalação das funções, até a carga dos dois catálogos.

As quatro tabelas usam `ENABLE/FORCE ROW LEVEL SECURITY`, triggers `imutavel` e `impedir_truncate`. A tabela territorial possui chave por versão e código, além do índice GiST da geometria. A tabela de naturezas possui chave por fonte, descrição literal e categoria PCDF original. `mapeamentos_natureza` referencia natureza e categoria e carrega sua própria revisão. `ocorrencia_naturezas` referencia a natureza de cada associação. Os três logins da aplicação não têm `SELECT` direto dos catálogos e não são superusuários nem `BYPASSRLS`. A leitura consolidada já usa `ocorrencias_read_ra` e `ocorrencias_read_naturezas` para sua função de consulta.

| Ordem | Objeto | Efeito |
| --- | --- | --- |
| Pré-requisito já instalado | [`occurrences-read.sql`](../../database/local/pcdf-sandbox/occurrences-read.sql) | Identidade e consulta local de ocorrências |
| `local-manual-0001` | [`manual-occurrences.sql`](../../database/local/pcdf-sandbox/manual-occurrences.sql) | Cria funções locais de cadastro, catálogo inicial, consulta, auditoria e políticas por função |
| `local-manual-0002` | [`manual-catalog-codes.sql`](../../database/local/pcdf-sandbox/manual-catalog-codes.sql) | Acrescenta `codigo_manual`, unicidade sem distinção de caixa e projeção na função inicial. Depende de `0001` e não contém carga |
| `local-manual-0003` | [`manual-catalog-release.sql`](../../database/local/pcdf-sandbox/manual-catalog-release.sql) | Acrescenta procedência, restringe a seleção de catálogo, protege nomes/códigos normalizados e cria `catalogo(text)` |
| Depois das migrations | [`manual_catalog_seed.py`](../../database/local/pcdf-sandbox/manual_catalog_seed.py) | Gera SQL de carga atestado, transacional e idempotente para cada catálogo |

`GET /api/v1/ocorrencias/manuais` consulta o banco usando a identidade da sessão. O parâmetro opcional `q` busca partes do código ou da descrição/nome com normalização de caixa e acentos. Para RA, também aceita o número administrativo completo. Os resultados são ordenados pelo nome/descrição normalizado e UUID, com listas vazias em um catálogo instalado sem resultados. A cardinalidade atual permite carregar uma lista integral na tela e pesquisar localmente sem requisições a cada tecla. As chaves SQL protegem a normalização e ordenação. A busca por trecho percorre o conjunto de referência de cada catálogo.

Administrador e Operador podem executar `catalogo(text)` por uma função com proprietário `NOLOGIN`, `NOBYPASSRLS` e `SELECT` nas colunas necessárias. A RLS associa a seleção territorial ao snapshot revisado e a seleção de naturezas ao código e ao manifesto de homologação. A mesma RLS atende à função que cadastra ocorrências. Analista mantém a consulta de ocorrências conforme seu perfil. A função do catálogo manual retorna acesso negado para esse perfil. A interface preserva os cartões, o mapa e o seletor aprovados e lista apenas as RAs persistidas. O formulário compara os códigos persistidos com o GeoJSON carregado para habilitar o cadastro.

## Regiões Administrativas

O pacote de 13/11/2026 tem **37 regiões** e 37 vínculos de UUID verificados. As fontes são a [camada institucional da IDE/DF](https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/LIMITES/FeatureServer/1), a [proveniência e o SHA-256 do snapshot](../../public/data/cartography/provenance.json), a [matriz revisada com as 37 identidades e fontes administrativas](../catalogos/ras-revisao-2026-11-13-v1/matrix.md) e os [vínculos aprovados](../../public/data/cartography/ra-bindings.json). A [Lei 7.918/2026](https://www.sinj.df.gov.br/sinj/Norma/70d4a6164e6d4498aecaf8a373d6e15e/Lei_7918_2026.html) referencia 26 de Setembro, RA XXXVI. A [Lei 7.917/2026](https://www.sinj.df.gov.br/sinj/Norma/c47f63aae6cd4a15afab43209ccef723/Lei_7917_03_07_2026.html) referencia Ponte Alta, RA XXXVII.

Os códigos da IDE/DF são `RA-I` a `RA-XXXVI`, seguidos do literal `XXXVII` para Ponte Alta. `codigo_interno` preserva a grafia da IDE. `referencia_cartografica` traz número administrativo comprovado, nome da fonte, documento comprobatório, versão, hash e status da revisão de identidade. `codigo_oficial` está reservado para um identificador em outro namespace, conforme a [decisão do dossiê](../revisao-oficial-catalogo-ras.md#identificadores-definidos). A geometria mantém EPSG:4326, com SHA-256 `fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553`. A vigência jurídica dos polígonos segue desconhecida. A carga destina o snapshot à referência espacial do cadastro atual. Análises históricas exigem referência temporal própria.

O seed verifica os arquivos por hash e relaciona os registros por código, objeto da fonte e UUID. Nomes normalizados, números administrativos, códigos e UUIDs são únicos. Reexecuções preservam os registros existentes se o conteúdo persistido for idêntico. Divergência na versão, geometria ou identidade interrompe a transação.

## Naturezas candidatas

O [inventário de candidatas](../catalogos/naturezas-manuais-candidatas-v1.json) preserva as **41 descrições literais** do [inventário PCDF](../catalogos/pcdf-inventario-v1.json), com fonte, IDs internos `PCDF-N-*`, situação e a indicação de presença no lote de janeiro. A consulta agregada ao PostgreSQL confirmou **34 descrições distintas**, todas com correspondência literal, e **19 rótulos de categoria PCDF**. Sete descrições do inventário não aparecem no lote auditado. O lote usa a coluna `natureza_sentinela_codigo`, destinada à classificação SENTINELA. A fonte agregada auditada não informa código institucional das naturezas de origem nem vigência, por isso ambos constam como desconhecidos.

A [matriz de correspondências](../catalogos/pcdf-correspondencias-v1.json) contém duas relações analíticas documentadas e 39 pendentes. Existem **20 categorias analíticas pretendidas** e **zero naturezas aprovadas para cadastro manual**. As relações documentadas aparecem no inventário para conferência de contexto. O executor de carga só aceita um manifesto específico de uso manual, com código e descrição institucional para cada item, fonte emissora, versão e ato de homologação.

## Evidências desta etapa

- PostgreSQL 17 e PostGIS 3.6, porta sintética `55486`. As 37 RAs carregadas corresponderam por UUID, código, nome e número administrativo. O PostGIS validou as 37 geometrias em SRID 4326. O ensaio confirmou reexecução, rollback de divergência, rejeição de manifestos pendentes e duplicados e visibilidade de apenas duas naturezas sintéticas.
- Administrador e Operador pesquisaram os catálogos e cadastraram duas ocorrências de teste em revisão, com quatro associações, dois recibos e dois eventos de auditoria. O Analista consultou o detalhe e recebeu bloqueio ao tentar cadastrar ou abrir o catálogo manual. Os três logins SQL tiveram acesso direto negado às tabelas. Os catálogos, associações e recibos persistiram após reinício.
- Edge no Next.js local, porta sintética `3318`, em 1920, 1440, 1366, 1024, 768 e 390 px, incluindo interação por toque. A interface foi testada com catálogo vazio, acesso negado e indisponibilidade. A validação usou CEP e geocodificação controlados e bloqueou tiles e outros recursos externos. As capturas sintéticas estão em `tmp/manual-catalog-stage1-evidence/`.
- Edge na porta `3000`, com PostgreSQL operacional em leitura. A consulta exibiu 6.393 associações em `/ocorrencias`. `/importar` exibiu a conexão e o histórico de janeiro. `/ocorrencias/nova` exibiu a indisponibilidade do catálogo e manteve o cadastro desabilitado. O GET manual devolveu `503`.
- O PostgreSQL operacional manteve as mesmas contagens e fingerprints em transações antes/depois somente leitura. O lote auditado tem 6.393 associações com 34 campos, 20.020 pendências e zero ocorrências consolidadas. As 19 tabelas protegidas mantiveram RLS forçada.
- Passaram 263 testes Node, 11 testes estáticos SQL/Python, TypeScript, ESLint, contratos/OpenAPI, verificação de rotas, build Next.js e `git diff --check`. O OpenAPI foi regenerado com o contrato de busca e o número administrativo.

## Arquivos da Etapa 1

- A etapa adicionou `database/local/pcdf-sandbox/manual-catalog-release.sql`, `database/local/pcdf-sandbox/manual_catalog_seed.py`, `docs/catalogos/naturezas-manuais-candidatas-v1.json` e este relatório.
- A etapa ajustou `database/local/pcdf-sandbox/qualify-manual.py`, `database/local/tests/test_static.py`, `docs/contratos/openapi-v0.1.0.json`, `scripts/check-manual-occurrence-browser.mjs`, `scripts/validate-contracts.mjs`, `src/app/api/v1/ocorrencias/manuais/route.ts`, `src/contracts/manual-occurrences.ts`, `src/contracts/openapi.ts` e `src/features/occurrences/ManualCreate.tsx`.
- Checkout principal `feat/redesign-interface`, HEAD `3e1b3adb8b597c393a3bb3fe0d18c38f1166c9f0`. As modificações e os arquivos não rastreados preexistentes foram preservados. A etapa foi mantida em alterações locais.

## Procedimento de ativação

1. Autorizar a execução no destino atestado `127.0.0.1:55484/sentinela_pcdf_local`, abrangendo as três migrations manuais e a carga territorial. Confirmar o backup privado existente, registrar um backup atualizado e validar o restore em instância isolada antes da alteração. Registrar a integridade de origem, staging, pendências e ocorrências em leitura antes e depois.
2. Em uma sessão de manutenção local, validar o UUID/sistema do destino e a ausência de carga territorial concorrente. Aplicar as três migrations na ordem documentada, com `psql -v ON_ERROR_STOP=1 -v expected_uuid=<uuid-atestado> -f <arquivo>` e a conexão local já atestada. O script de geração apenas produz SQL em UTF-8. Gerar a carga territorial com `python -B database/local/pcdf-sandbox/manual_catalog_seed.py ra --saida tmp/ras-manuais.sql`. Aplicar o SQL gerado com as mesmas verificações e conferir 37 correspondências.
3. Obter da autoridade responsável o manifesto de naturezas aprovado para **uso manual**, com versão e fonte emissora. O ato deve identificar o SHA-256 dos bytes do manifesto aprovado. Depois de autorização específica de carga, gerar o SQL com `python -B database/local/pcdf-sandbox/manual_catalog_seed.py natureza <manifesto.json> --sha256 <hash-do-ato> --saida tmp/naturezas-manuais.sql`. Aplicar com o mesmo destino atestado, confirmar o total aprovado e testar os GETs como Administrador e Operador. A aplicação do seed não cria mapeamentos analíticos ou consolidações.
4. Cada aplicação tem rollback automático em caso de erro. Após commit, reverter por procedimento autorizado e validado no backup isolado. A interrupção do fluxo manual pode ser feita revogando o acesso às funções manuais durante a revisão. As linhas de referência seguem a imutabilidade da base. Mudanças de versão das naturezas com o mesmo código exigem revisão da regra de transição e dos vínculos existentes.

| Arquivo da Etapa 1 | SHA-256 verificado |
| --- | --- |
| `manual-occurrences.sql` | `7d97a806f60f62c8a797f7f3cfbbc46242c241f24d823d9b38ac15d35cf38ba9` |
| `manual-catalog-codes.sql` | `47fbe06a78bbeb0ab1bbeb87c0500c5280cf52aff4232d5a5ddbbcb02a5b2529` |
| `manual-catalog-release.sql` | `ea34257bcd2971a43ebdb9adc6a9c2210577a1ff84a80df9c49e8d05deb2bc02` |
| SQL territorial gerado em UTF-8 | `a5ff249b24b4f6b8d2aaeb4039d8e282fe6859424288c6f72ac39446801630f9` |

Modelo de manifesto. O emissor deve preencher os campos com valores do catálogo aprovado.

```json
{
  "versao": "<versão institucional>",
  "fonte": "<identificação estável do órgão emissor>",
  "evidencia": "<ato de homologação para uso manual>",
  "registros": [
    {
      "codigo": "<código do emissor>",
      "descricao": "<descrição literal do emissor>",
      "situacao": "homologada",
      "usoManual": true
    }
  ]
}
```
