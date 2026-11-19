# Revisão oficial do catálogo de RAs — Etapa 2.17.5

## Consolidação 2.17.6 — contrato para o futuro pacote operacional

**Atualização operacional de 18/11/2026.** A migration `local-ra-0002`
e a carga oficial foram confirmadas no PostgreSQL local. Os 37 UUIDs
persistidos compõem o arquivo operacional de vínculos. A verificação SQL da
reader retornou 37 RAs. Os GETs integrados aguardam a credencial já prevista
para a aplicação. [Registro da carga e fingerprints](catalogo-ras-carga.md#aplicação-operacional--18112026)

### Continuidade da etapa — implementação pronta para revisão

O pacote `ra-public-sandbox-2026-11-13-v2` foi homologado em PostgreSQL/PostGIS
isolado. O recibo privado registra 37 UUIDs persistidos, três fixtures invisíveis
à reader, repetição idempotente, rollback e HTTP real com os três perfis de teste.
O ensaio do handler não cobriu login ponta a ponta. A seção de checklist abaixo
preserva o estado da consolidação documental anterior ao pacote v2.

A [migration incremental](../database/local/migrations/0002_ra_official_catalog.sql)
e o [executor](../database/local/ra-operational/execute.mjs) estão preparados para
revisão. O executor verifica os bytes do v2 e usa o mesmo payload e GeoJSON.
A migration exige metadados exatos para a versão oficial, geometria presente e
referência cartográfica fixa. A policy permissiva dá acesso à versão aprovada,
enquanto a restritiva impede que a policy sintética amplie a visibilidade da
reader. Metadados e geometria seguem fora da projeção e dos grants de coluna.

A variante operacional passou pelos seis cenários em PostgreSQL/PostGIS isolado,
incluindo a reconciliação independente pelo comando `--reconcile`. O HTTP foi
ensaiado com o handler e a reader reais, usando principais de teste.
Essa homologação antecedeu o preflight autorizado e a aplicação operacional
registrada acima. [Relatório de homologação](homologacao-ra-operacional-sprint-04.md)

As decisões abaixo consolidam a preparação; não alteram o dossiê v1, seu hash,
o SQL de sandbox anterior nem autorizam execução operacional.

### Identificadores definidos

| Informação | Representação proposta para a primeira carga |
| --- | --- |
| Identidade persistente | `id`: UUID gerado pelo PostgreSQL, preservado em reexecuções |
| Código literal IDE | `codigo_interno`: código exatamente como recebido, inclusive `XXXVII` |
| Código oficial em outro namespace | `codigo_oficial`: NULL; não copiar o código IDE nem fabricar um código a partir do número administrativo |
| Número administrativo comprovado | `referencia_cartografica.numero_administrativo`: inteiro explícito da matriz revisada, não calculado a partir do romano |
| Nome adotado | `nome`: `administrativeName` da matriz revisada |
| Nome original | `referencia_cartografica.nome_original`: `ideName` literal, sem substituir por nome adotado |

Assim, o número 37 de Ponte Alta não modifica seu código IDE `XXXVII`. Sol
Nascente/Pôr do Sol mantém o nome administrativo separado de
`SOL NASCENTE E POR DO SOL` na fonte. Não há mudança de identidade, UUID
artificial ou alteração do GET `{id,nome}`. A decisão de deixar `codigo_oficial`
nulo evita atribuir ao campo uma equivalência que não foi aprovada.

### Evolução mínima proposta, ainda não implementada

O schema atual não possui campos próprios para todos os metadados. Propõe-se
**uma coluna adicional `referencia_cartografica jsonb`**, com contrato estrito
e validações SQL em uma revisão incremental futura, sem editar a baseline.
Deverá conter: versão do contrato de metadados, URL institucional, hash SHA-256
do GeoJSON, data de extração, nome original, número administrativo comprovado,
documento administrativo comprobatório, versão/hash do manifesto de revisão,
`vigencia_legal_status` e limites legais opcionais. A versão da geometria continua
em `versao_cartografia`; `evidencia_referencia_espacial` referencia o dossiê.

Regras obrigatórias do futuro CHECK: objeto JSON, tipos e chaves previstos,
hashes de 64 caracteres hexadecimais, fonte allowlisted, número inteiro entre
1 e 37 para este pacote, nome original não vazio, estado `desconhecida` ou
`comprovada`; datas jurídicas nulas quando desconhecida. Não aceitar estado
comprovado sem documento específico e intervalo coerente. O campo não deverá
receber grant para a reader nem integrar o GET. O JSON não substitui constraints
ou verificação do hash do pacote pelo instalador.

Para a primeira carga, a vigência **jurídica da geometria** é `desconhecida`,
com início/fim nulos. A criação legal de uma RA não comprova a data inicial de
cada vértice do snapshot. O `daterange` obrigatório existente pode representar
intervalo não limitado apenas em conjunto com esse estado explícito; não significa
validade jurídica universal. Consumidores históricos deverão tratar desconhecida
como referência pendente. Não usar a extração de 13/11/2026 como início legal.
Não certificar cobertura, ausência de sobreposições ou vigência da geometria.

Essa evolução e o payload com nomes administrativos são mudanças materiais
frente ao ensaio anterior. **Não foram implementados nesta etapa** e exigem novo
pacote SQL de sandbox, validação das constraints e nova homologação antes da carga.
O SQL antigo não pode ser promovido diretamente ao operacional.

### RLS/grants: diagnóstico e proposta explícita

A policy `local_reader_regioes` atual só permite
`versao_catalogo='SENTINELA_TESTE_LOCAL_V1'`. Os grants existentes são SELECT em
`id,codigo_interno,codigo_oficial,nome,versao_catalogo,vigencia`, sem escrita.
O GET projeta exclusivamente `id,nome`. As seis colunas já concedidas não são
segredos, mas sua redução para apenas duas exigiria revisão das dependências
SQL; esta etapa não revoga privilégios nem afirma que eles sejam apenas dois.
Geometria, novos metadados, auditoria, usuários e staging continuam sem novo grant.

**Sem um ajuste de policy homologado, a futura carga real permanecerá invisível
no GET dos três perfis.** Não utilizar o marcador sintético nos dados reais.
Segue somente a proposta de policy adicional, não um script aprovado/aplicado:

```sql
CREATE POLICY local_reader_regioes_catalogo_publico_v1
ON sentinela.regioes_administrativas
FOR SELECT TO sentinela_local_reader
USING (versao_catalogo = 'SENTINELA_RA_PUBLICO_2026_11_13_V1');
```

O marcador identifica a versão administrativa pública aprovada, não comprova
autenticidade sozinho: o instalador futuro deverá validar o manifesto, hashes,
37 correspondências e conteúdo antes de atribuí-lo. Sem novos grants de escrita,
a reader não pode atribuir esse marcador. Não criar policy para PUBLIC, ALL ou
outras tabelas; preservar ENABLE/FORCE e as policies sintéticas existentes.
Como policies permissivas são combinadas por OR, fixtures sintéticas permaneceriam
visíveis se existissem; a auditoria anterior encontrou zero RAs, mas o preflight
da execução deverá reconfirmar a ausência delas, sem presumir o banco vazio.

As três contas humanas usam o mesmo principal SQL operacional por meio do backend.
A RLS distingue a role técnica, não a pessoa; a sessão local verificada no servidor
e a permissão `analisar` continuam obrigatórias. Não é acesso anônimo: apenas o
backend autenticado usa a reader, restrita ao loopback pelo HBA. Não atribuir à
policy SQL uma verificação de cookie ou perfil que ela não realiza.

### GET, evidências e checklist de liberação

Não há alteração de contrato, query, autorização ou frontend. Com a nova policy
aplicada **e homologada**, marcador correto e 37 linhas válidas, espera-se GET com
37 UUIDs persistidos e nomes administrativos para Administrador, Operador e
Analista. Sem sessão: 401; sessão inválida/fora do provedor permitido: rejeição
conforme o handler. Falha de conexão não autoriza fallback demonstrativo.

Nesta etapa foram reexecutados somente testes de contratos/catálogos,
identificadores, vínculos e revisão oficial. Eles exercitam autorização dos três
perfis com pool simulado e preservação das projeções; **não homologam a nova
policy SQL**. Os 223 testes completos, build, RLS sintética, idempotência e
PostGIS anteriores continuam evidências históricas de suas respectivas versões.
Nenhum cluster foi iniciado nem SQL executado nesta consolidação documental.

Resultado efetivo: **25 testes direcionados aprovados, zero falhas**, nos arquivos
`persistent-catalogs.test.mjs`, `ra-bindings.test.mjs`, `ra-catalog-load.test.mjs`
e `ra-official-review.test.mjs`. `git diff --check` aprovado. Sem alteração de
código executável, não foram repetidos TypeScript, build ou suíte completa.

Antes de autorizar a carga operacional:

- [x] Identificadores e duas ressalvas tratados sem normalização silenciosa.
- [x] Vigência desconhecida diferenciada de extração e criação administrativa.
- [x] Bloqueio atual de visibilidade do GET identificado.
- [ ] Implementar a coluna/constraints e a policy em artefatos exclusivos de sandbox.
- [ ] Gerar novo payload/manifesto com os 37 nomes e metadados aprovados.
- [ ] Homologar com conexão reader real: 37 UUIDs esperados; versão não aprovada
      invisível; campos internos e escrita recusados; GET autenticado e sem sessão.
- [ ] Revalidar carga idempotente, vínculos exatos, rollback e preservação dos
      outros catálogos/policies; não reutilizar o ensaio antigo como aprovação.
- [ ] Preparar a migration incremental revisada e o executor operacional atestado,
      sem conexão administrativa na aplicação; reconfirmar backup e estado atual.
- [ ] Obter autorização específica antes de qualquer alteração operacional.

**Estado final: consolidação documental concluída; liberação operacional bloqueada
pela evolução SQL e homologação RLS ainda pendentes.** A existência do SQL proposto
acima não constitui teste PostgreSQL, implementação de migration ou autorização.


## Histórico da revisão 2.17.5

As pendências de identificadores e desenho de metadados desta seção histórica
foram consolidadas no contrato 2.17.6 acima. A implementação e homologação SQL
continuam pendentes; a aprovação de identidade não libera a execução.

13/11/2026. **CATÁLOGO APROVADO COM RESSALVAS**, no escopo da revisão de
identidade administrativa. A carga operacional não foi autorizada nem executada.

## Pacote para revisão humana

Versão `ra-review-2026-11-13-v1`, em
[`catalogos/ras-revisao-2026-11-13-v1`](catalogos/ras-revisao-2026-11-13-v1/matrix.md).
O JSON contém, para cada entrada, código/nome IDE, objectid, CIRA, nome adotado,
número administrativo comprovado, documento, URL, hashes, versão, classificação
e observações. Não contém UUIDs operacionais fabricados.

| Classificação de identidade | Quantidade |
| --- | --- |
| APROVADA | 35 |
| APROVADA COM RESSALVA | 2 |
| DIVERGENTE | 0 |
| NÃO VERIFICADA | 0 |

SHA-256 de `manifest.json`, que referencia os arquivos do pacote:
`4e9b678630e34aa1db4827f40d79f426f645d1142ea4eba689c46fb82f01de3f`.
O recibo `sha256.txt` permite conferir o manifesto; este permite conferir matriz,
textos normativos públicos e resposta de atributos. Não é assinatura digital do GDF.

## Evidências oficiais e limite da aprovação

- [IDE/DF, LIMITES/FeatureServer/1](https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/LIMITES/FeatureServer/1):
  37 feições, sem transferência truncada. Snapshot geométrico fixado com hash
  `fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553`.
- [SEEC, SAG 2025, sexto bimestre](https://economia.df.gov.br/documents/d/seec/principais-realizacoes-sag-6-bimestre-2025-pdf?download=true):
  legenda administrativa da página 23, referência explícita de nomes/números I–XXXV.
  Hash do PDF consultado: `9e46ff61ca8f916a0f315bf7040daae3bfbd1f864e6c269566a89d928eab58c0`.
  O download foi preservado em `tmp/ra-review-official/sag2025.pdf`; não foi
  incorporado ao pacote versionável por seu tamanho. Não é lei de criação de cada
  uma das 35 RAs e não certifica sozinho a lista posterior a julho de 2026.
- [Lei 7.917/2026](https://www.sinj.df.gov.br/sinj/Norma/c47f63aae6cd4a15afab43209ccef723/Lei_7917_03_07_2026.html):
  criação de Ponte Alta, com identificação XXXVII no Anexo I.
- [Lei 7.918/2026](https://www.sinj.df.gov.br/sinj/Norma/70d4a6164e6d4498aecaf8a373d6e15e/Lei_7918_2026.html):
  criação de 26 de Setembro, com identificação XXXVI no Anexo I.

As leis foram consultadas e suas respostas HTML preservadas com hash no pacote.
Isso confirma que as duas entradas recentes representam RAs autônomas. O total
35 em referências anteriores é temporalmente anterior às duas criações; não é
evidência de que o snapshot com 37 entradas contenha duas RAs inexistentes.
Não foi realizada nova pesquisa individual de todas as normas de criação e
alteração das 35 RAs anteriores. Sua identidade/número foi confrontada com
documento administrativo oficial, sem converter semelhança textual em prova legal.

Não houve descontinuidade ou duplicidade dos números administrativos comprovados
1–37. Todos os códigos e objectids da camada são distintos. Isso não transforma
objectid em identificador administrativo permanente nem CIRA em chave universal.

### Correspondências que exigem explicação

1. **Ponte Alta:** código cartográfico literal `XXXVII`, objectid 107, CIRA 37;
   número administrativo XXXVII confirmado independentemente no anexo legal.
   Não substituir silenciosamente por `RA-XXXVII`. O código da camada e o número
   administrativo permanecem campos distintos.
2. **Sol Nascente/Pôr do Sol:** a camada apresenta `SOL NASCENTE E POR DO SOL`;
   a referência administrativa usa a grafia com barra e acento. A correspondência
   está explicitada pelo identificador administrativo XXXII, não por fuzzy matching.
   Os bytes do nome original não foram alterados.
3. **Água Quente:** fonte sem acento em AGUA; nome administrativo com acento.
4. **SCIA:** identidade XXV; Estrutural não gera uma RA adicional no catálogo.
5. **Plano Piloto:** denominação adotada na referência administrativa atual;
   referências históricas a Brasília não são aliases automáticos de importação.

A consulta atual de atributos, hash
`04ecd8701da5654e70bff9a295723b423c18d00c3553098abb0bed744e0e6bdb`,
confirma os mesmos códigos, nomes, objectids, CIRAs e links das 37 feições.
Sete atributos de área apresentam arredondamento numérico na serialização JSON,
sem mudança de identidade. Não se confundiu hash de formatos distintos com drift.
Não houve nova exportação/comparação integral dos vértices online.

## Compatibilidade e decisões operacionais

A baseline admite código interno obrigatório, código oficial textual opcional,
nome obrigatório, UUID gerado pelo banco, versão, daterange não vazio e geometria
MultiPolygon/4326. Não exige que o código seja um romano com prefixo RA-.
Os 37 candidatos são compatíveis com esses tipos; o literal `XXXVII` não viola
essa estrutura. A unicidade continua sendo código interno por versão de catálogo.

As FKs usam UUID, e não nome ou número romano. O GET expõe somente `{id,nome}`;
o vínculo territorial exige código/objectid/versão/hash exatos. A matriz de revisão
não deve ser consumida como vínculo operacional nem como retorno fictício de GET.
O arquivo operacional de vínculos continua vazio. Formulários demonstrativos
continuam sujeitos às limitações já documentadas, sem fallback de UUID inventado.

O SQL de sandbox já ensaiado copia o código cartográfico em `codigo_oficial`.
Isso é comportamento de protótipo, não decisão homologada para produção local.
Antes de elaborar o pacote executável operacional, decidir explicitamente:

- Namespace de `codigo_oficial`: código cartográfico, número administrativo ou
  outro identificador documentado; não misturar essas semânticas numa coluna.
- Versão administrativa do catálogo e representação da vigência. A data de coleta
  não é início legal de todas as RAs; um intervalo sem limites não comprova validade
  histórica da geometria para qualquer ocorrência PCDF.
- Preservação dos UUIDs existentes e geração de novos somente pela primeira
  inserção autorizada, exportando os vínculos a partir do banco.
- Policies e grants mínimos próprios para catálogos reais. O marcador sintético
  atual da reader não pode ser reutilizado para contornar a RLS.

Nenhuma dessas decisões foi implementada como mudança de migration, grants ou SQL.
O pacote criado é um dossiê de aprovação, não um instalador operacional. Se um
payload/SQL for modificado, criar versão nova e repetir em sandbox carga,
idempotência, vínculos, GET, classificação territorial e rollback. Evidências
anteriores não homologam automaticamente essa futura revisão.

## Geometria e temporalidade

A revisão confirma identidade administrativa; não certifica concordância de cada
vértice com todos os memoriais legais nem mudanças históricas de limites. Mantém
os ensaios geométricos anteriores e suas limitações, incluindo fronteiras,
sobreposições e diferenças do renderizador legado. `validFrom/validTo` continuam
nulos nos vínculos de fonte; não foram preenchidos a partir da extração.

## Testes e preservação

Passaram os 217 testes existentes e seis novos testes de revisão: recibos/hashes,
37 identidades, referências das novas RAs, duplicidades, rejeição de renumeração
silenciosa/fuzzy matching, evidências ausentes, versões desconhecidas, validade
legal inventada e UUID operacional indevido. TypeScript, ESLint, contratos
Zod/OpenAPI, rotas estáticas e build Next.js isolado passaram. Não houve nova
homologação HTTP/visual ou SQL: nenhum consumidor, SQL, geometria ou payload de
carga anterior foi modificado. Idempotência/GET/PostGIS anteriores continuam
evidências históricas da versão já ensaiada, não testes executados nesta revisão.

O backup aprovado de 2.17.4 foi novamente conferido por hash e preservado.
Nenhuma conexão PostgreSQL foi necessária nesta etapa. Contagem global zero e
ledger documentados em 2.17.4 são evidências históricas, não nova consulta atual.
Preservados os arquivos privados, sandboxes, autenticação, migrations,
`Breadcrumb.tsx`, HEAD e alterações anteriores. Nenhum commit/push foi criado.

## Atualização futura

Uma nova coleta deve gerar nova versão, preservar fonte anterior e comparar
explicitamente códigos, objectids, nomes, geometrias e normas posteriores.
Renomeação não cria nova identidade por si só; desmembramento não autoriza
reatribuir UUID antigo. Não sobrescrever linhas imutáveis para corrigir fonte.
Exigir revisão humana do documento normativo e ensaios da versão executável
antes de nova autorização de carga. Manter divergências como pendentes quando
não houver prova, sem transformar similaridade ou teste técnico em aprovação legal.
