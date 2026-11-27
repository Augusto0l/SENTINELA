# Etapa 2.17 — cartografia IDE/DF e validação territorial

13/11/2026. Implementação e ensaios geográficos concluídos; **homologação integral
pendente da correspondência entre UUIDs do catálogo e códigos cartográficos**.
Não há escrita operacional, novos endpoints de escrita ou liberação da Central.

## Fonte, procedência e preservação

Fonte consultada diretamente por HTTPS: [camada Regiões Administrativas, IDE/DF](https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/LIMITES/FeatureServer/1).
Exportação integral com `where=1=1`, `outFields=*`, `outSR=4326`, `f=geojson`.
Os bytes recebidos foram preservados em
`public/data/cartography/ras-ide-2026-11-13.geojson`, com metadados públicos e
`provenance.json`. São 37 feições e 109.368 vértices, Polygon/MultiPolygon.
Nomes e códigos originais permanecem, inclusive `XXXVII` para Ponte Alta;
não foi inventado alias para `RA-S` ou normalizado esse identificador para RA-XXXVII.

SHA-256 da exportação: `fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553`.
Metadados: `c87f26fa485507956c93231dd1e2aa10b062427bed9f71311f18011edec2ef2c`.
A data identifica a coleta, não a vigência legal. A camada não informa uma versão
legal/temporal que permita certificar correspondências históricas de importações.

A cópia anterior `public/data/ras-df.geojson` tem 37 feições, mas apenas 18.957
vértices e geometria diferente. Seu hash continua
`4b9fcdd6e2ae3c1e8318f55899b463331fc412815c15811116bb1b8665568706`.
Não se comprovou equivalência territorial com a exportação atual; ela não pode
ser autoridade de pertencimento. Foi preservada nos mapas de Dashboard/Mapa
Criminal e no renderizador existente, sem mudar projeção visual ou vértices.
Assim, **renderização legada e validação nova usam versões distintas**, explicitadas
aqui; migrar o desenho exige revisão visual própria, não simplificação silenciosa.

## Coordenadas e algoritmos

O serviço declara origem EPSG:31983; a requisição solicita exportação EPSG:4326.
Não houve transformação local dos vértices. GeoJSON/PostGIS usam longitude X,
latitude Y. Campos do formulário mantêm latitude/longitude separadas. SQL cria
`ST_SetSRID(ST_MakePoint(lon,lat),4326)`. Ausência não é convertida em zero.

`territorial-validation.ts` valida estrutura, domínios finitos, anéis fechados,
polígonos, multipolígonos, interiores e buracos. O ray casting não usa bounding box
como decisão. Distância de segmento <=1e-10 grau é incerteza de fronteira, não
alegação de precisão de campo. Todas as geometrias são consideradas, sem escolher
a primeira. Fronteira/sobreposição retorna candidatas, sem atribuição automática.

PostGIS é a autoridade final experimental: ST_IsValid, ST_Contains e distância
à ST_Boundary com a mesma tolerância. O frontend não é validador geral de topologia
arbitrária: aceita a exportação fixada por hash, cuja validade foi testada no SQL.
Não se reparou geometria com ST_MakeValid nem simplificou qualquer polígono.

Resultados tipados: invalid_coordinate, consistent, outside_df, ra_mismatch,
boundary_ambiguous, cartography_unavailable e reference_pending. São resultados
de validação, não novos estados de banco. `outside_df` significa fora da união
das RAs adotadas; sem uma referência independente do perímetro oficial do DF não
se certifica a ausência de lacunas políticas/temporais. Buracos preservados não
são automaticamente classificados como defeitos.

## Auditoria geográfica real

PostGIS 3.6.2 confirmou as 37 geometrias válidas e SRID 4326. Encontrou 40 anéis
no total e nove pares com interseção de área >1e-15 grau². Áreas dessas interseções,
medidas via transformação conhecida para EPSG:31983, variam aproximadamente de
0,000021 a 0,369 m². São pequenas, mas não foram apagadas ou atribuídas a uma RA.
Podem refletir precisão/transformação da fonte; a causa não foi certificada.
Detalhes de pares/áreas estão na evidência privada. Não se afirma cobertura sem
lacunas nem ausência de interseções menores que o limiar auditado.

Casos compartilhados e derivados da geometria: 37 ST_PointOnSurface, 37 vértices,
nove interiores de interseções, origem zero externa, coordenadas ausentes,
código desconhecido e RA divergente. **87 casos com status e candidatas idênticos
entre TypeScript e SQL.** Há ainda teste nativo para NaN/Infinity.

## Formulários e mapas

`TerritorialFeedback.tsx` carrega a exportação local e verifica SHA-256 no navegador.
Mostra resultado estruturado, separa erro territorial de falta de cartografia e
não preenche RA/coordenada. `SimulationWorkspace.tsx` bloqueia conclusão da prévia
para ponto externo, fronteira/sobreposição ou divergência conhecida, preservando
os campos para correção. O mapa existente continua responsável apenas pela escolha
explícita de ponto; abrir o mapa não escreve coordenadas.

O GET de catálogo fornece apenas UUID e nome. **Não há vínculo homologado desses
UUIDs com ra_codigo.** Não foi inferido por nome, número ou código interno. Para um
ponto interno pode-se mostrar a RA cartográfica candidata, mas a correspondência
com a RA escolhida permanece reference_pending. A simulação pode gerar prévia
sem persistência, explicitamente sem aprovação territorial. Não se anuncia um
cadastro territorialmente válido nem um localizacao_status validada.

Isso é o bloqueio residual da homologação integral frontend: é necessário aprovar
uma tabela versionada UUID ↔ código IDE/DF ↔ hash/vigência, ou um contrato GET
equivalente com origem comprovada. Não alterar grants/RLS ou inventar essa tabela
no operacional para fazer o teste passar.

O helper legado `locationRa()` agora reutiliza o classificador e recusa fronteiras
ou múltiplas candidatas, em vez de retornar a primeira feição. Sua camada visual
anterior continua identificada como referência legada não homologada para decisões.

## PostGIS experimental e segurança

Artefatos novos: `database/local/write-sandbox/geography.sql`, `run-geography.py`
e `qualify-geography.mjs`. O executor usa um cluster novo e credenciais efêmeras,
reutilizando os controles de identidade da 2.15, sem consultar 5432 ou Supabase.
Importa os vértices integrais em `sentinela_geo_lab.regions`, com RLS forçado e
índice GiST. Os UUIDs de RA são técnicos, exclusivos do sandbox, ligados ao código
da fonte para o ensaio; não são IDs oficiais nem mapeamento aprovado do operacional.
Vigência fica ilimitada apenas tecnicamente no ensaio, sem inferir vigência legal.

Funções têm search_path fixo, nomes qualificados, owner NOLOGIN sem BYPASSRLS,
EXECUTE de PUBLIC revogado e grants limitados. Runtime não lê diretamente a tabela
de geometrias, comprovado por negativa de permissão. A role operacional não muda.

O novo trigger BEFORE INSERT/UPDATE impõe consistência cartográfica aos manuais,
além das funções de cadastro/edição e proteções originais. Rejeita fronteira mesmo
quando ST_Covers aceita e rejeita o antigo retângulo sintético sem vínculo à fonte.
Não remove/desativa triggers, constraints ou RLS. Importações não são descartadas:
um registro **sintético**, sem dado PCDF, foi inserido com coordenadas NULL e estado
ausente, e esses valores foram preservados. Não se implementa correção, não se
substituem coordenadas originais e não se libera a Central de Revisão.

Estados existentes referencia_pendente/em_revisao não são promovidos automaticamente.
Confirmar pertencimento territorial não substitui classificação, identificação,
autoria humana ou revisão. Auditoria técnica e histórico de associações da 2.15
continuam no mesmo mecanismo transacional. Cadastro/edição válidos e rollback da
edição divergente foram executados; o evento não é apresentado como autoria humana.

## Evidências e validações

Sandbox final: `455783c2-c91f-4a89-b88f-9f372c8a1c9d`, system identifier
`7707643908747880548`, endpoint 127.0.0.1:55432/sentinela_rls_sandbox, encerrado
STOPPED e sem postmaster.pid. Evidências em sua pasta privada `evidence`:

| Arquivo | SHA-256 |
| --- | --- |
| geography-tests.json | `3694330bd430aa7c74e63402c6316ccca62842bf08613bd91b6d2f171b88bf10` |
| geography-cases.json | `3d946ddc44882105b6e807846022ffa409143f637471fa1c2b31d0401913e31e` |
| geography-completion.json | `64bb00234d9fe3c51163174305c7c54c22a516be78f07a82789f90df6b4d216d` |

São **95 verificações reais**, incluindo os 87 casos de paridade. As tentativas
anteriores foram encerradas e preservadas, inclusive correções de qualificação do
operador espacial e formato dos UUIDs técnicos. Não foram sobrescritas evidências.

| Qualidade | Resultado |
| --- | --- |
| Testes automatizados completos | 191 aprovados, incluindo os 186 anteriores |
| TypeScript / ESLint | Aprovados |
| Zod/OpenAPI | 35 schemas, 13 paths, 15 operações, 31 payloads válidos |
| Rotas | Oito páginas planejadas, 347 imports resolvidos; análise estática |
| Build Next.js isolado | Aprovado |
| Navegador | Nove grupos aprovados |
| git diff --check | Aprovado; avisos LF/CRLF preexistentes |

Arquivos novos: exportação integral/metadados/procedência, `territorial-validation.ts`,
`TerritorialFeedback.tsx`, três artefatos SQL/executor/qualificação e
`tests/territorial-validation.test.mjs`. Alterados: SimulationWorkspace, mensagem
do serviço de prévias, helper addressLocation, teste postal (loader de aliases) e
script visual. Os artefatos homologados de mutações/cadastro não foram modificados.

O navegador passou em nove grupos no preview isolado existente, sem contas reais:
ponto externo bloqueado, valores preservados/corrigidos, mapa sem RA automática,
regressão dos fluxos, quatro larguras (1366/768/390/320), claro/escuro e GETs somente.
Evidência: `tmp/occurrence-workflows-7cf54887-ed93-4510-8558-1713a9b4648e/`.
GETs de negócio foram interceptados com fixtures; cartografia foi servida do arquivo
local fixado. Isso não homologa navegação autenticada com as três contas privadas.

Reprodução exclusivamente isolada:

```powershell
python -B database/local/write-sandbox/run-geography.py --execute
node --experimental-strip-types scripts/check-occurrence-workflows-browser.mjs
```

## Decisão e pendências

**PARCIAL: núcleo geográfico e persistência experimental homologados; vínculo do
catálogo real não homologado.** Nenhum critério pendente é apresentado como completo.
Também faltam vigência jurídica/histórica, referência independente de cobertura do
DF e revisão institucional das pequenas interseções. Não houve conexão ao operacional
nem alterações em Supabase, credenciais, dados PCDF ou arquivos de migrations oficiais.
A baseline original foi usada somente para preparar os clusters novos descartáveis.
Não houve commits ou PRs.
Próximo passo: aprovar a correspondência versionada dos catálogos, então repetir
os testes de consistência da RA selecionada na interface com esses vínculos.

## Etapa 2.17.1 — vínculo versionado (13/11/2026)

**PARCIALMENTE HOMOLOGADO.** A investigação posterior consultou o catálogo real
em transação READ ONLY, no destino literal `127.0.0.1:5432/sentinela_dev_operacional`:
**zero registros em `sentinela.regioes_administrativas`**. Não existem UUIDs reais
para comprovar as 37 correspondências. Não foram criados UUIDs operacionais.
Essa leitura é uma diferença explícita em relação à etapa anterior descrita acima;
nenhuma escrita operacional ou conexão ao Supabase foi realizada.

O mecanismo foi implementado e homologado com 37 UUIDs técnicos de sandbox.
A [especificação e matriz de fixtures](ra-bindings.md) registra fonte, versão,
hash, ObjectID, evidência, escopo e referência temporal, incluindo o plano futuro
para o catálogo operacional. O documento operacional permanece vazio.
O campo literal `ra_codigo` foi preservado, inclusive `XXXVII` para Ponte Alta.
O hash do snapshot integral e a cartografia legada permanecem inalterados.

Os formulários resolvem UUID–código somente no escopo e versão apropriados.
Cópias de GETs reais mantêm `reference_pending`; o cenário sintético explícito
pode comprovar consistência geométrica da fixture, sem aprovar UUID operacional.
Não há inferência por nome, nem ativação de persistência na aplicação principal.

### Ensaios reais finais

Cluster novo: `087a6b31-6ffe-4688-b858-9b95105ed619`.
System identifier: `7707649100301254552`.
Destino exclusivo: `127.0.0.1:55432/sentinela_rls_sandbox`.
Estado final: **STOPPED**, identidade atestada antes do encerramento.
Evidências privadas: pasta desse UUID em
`C:\Users\pedro\.sentinela-local\rls-sandboxes\`, subpasta `evidence`.

- As 95 verificações anteriores foram repetidas: 87 casos de geometria/paridade
  e oito verificações de mutações, segurança, auditoria e rollback.
- Mais 87 casos compararam TypeScript/PostGIS com resolução por UUID e versão.
- Quatro casos adicionais rejeitaram versão ausente, vínculo pendente, fonte
  incompatível e hash de atualização cartográfica não aprovado.
- Dois grupos verificaram ACL nativa e criação/edição real com vínculo aprovado.
- Seis rejeições SQL comprovaram duplicidade, FKs, imutabilidade e validade
  temporal. Total: **194 verificações registradas**, incluindo **174 casos de
  paridade**. Os grupos podem conter mais de uma asserção.
- Histórico técnico: duas edições sequenciais, versões incrementais e ator SQL
  esperado; os ensaios não simulam uma autoria humana homologada.
- Geometrias válidas, nove interseções e 40 anéis preservados sem reparos.
- Manifestos dos clusters anteriores permaneceram com os mesmos hashes.

Arquivos privados de evidência: `geography-tests.json`, `geography-cases.json`,
`bindings-tests.json` e `geography-completion.json`. O último registra também as
seis rejeições de constraints e o encerramento do cluster. O ensaio não fez
conexões operacionais; a leitura do catálogo ocorreu separadamente na investigação.

### Qualidade e navegador

- 197 testes automatizados aprovados, preservando os 191 anteriores.
- TypeScript principal e experimental, ESLint, contratos e rotas aprovados.
- Contratos: 35 schemas, 13 paths, 15 operações, 31 payloads.
- Rotas: oito páginas planejadas e 351 imports locais resolvidos.
- Build Next.js isolado aprovado, incluindo compilação e geração das páginas.
- `git diff --check` aprovado; somente avisos de conversão LF/CRLF preexistentes.
- Navegador: 11 grupos aprovados, sem erros JavaScript; 1366/768/390/320 px,
  claro/escuro. Consistência sintética, divergência com valores preservados,
  referência operacional pendente, edição e inativação demonstrativas verificadas.
  Todas as chamadas de API foram GET. Os GETs foram interceptados com fixtures;
  a cartografia e os documentos de vínculos vieram dos arquivos estáticos reais.
- Evidência visual: `tmp/occurrence-workflows-81446be9-34cd-4732-b62f-ceb616e8e035/`.
  Preview isolado, sem utilizar as contas privadas; não é homologação autenticada
  dos três usuários. Apenas o servidor do ensaio foi encerrado.

Reprodução: `python -B database/local/write-sandbox/run-geography.py --execute --bindings`.
SHA-256 das evidências finais: `geography-tests.json`
`3694330bd430aa7c74e63402c6316ccca62842bf08613bd91b6d2f171b88bf10`;
`bindings-tests.json`
`e50d7e14eb75e3a5e25f18f3b86a4ab884a5e86616ac979b02d3826b968ef56b`;
`geography-completion.json`
`84e9bd8ebd47c8d907375f080c65859709f9db12fce563ead9720dc51ad425dd`.
Não há alteração de migrations oficiais, autenticação, contas, credenciais,
Breadcrumb ou GeoJSON legado. Sem commits, push ou PR.

Bloqueio residual: obter um catálogo real aprovado e evidência verificável para
seus UUIDs. Também permanecem pendentes a vigência legal, a comprovação independente
de cobertura do DF e a revisão institucional das pequenas interseções.

## Etapa 2.17.2 — carga canônica reproduzível (13/11/2026)

**PRONTA PARA REVISÃO OPERACIONAL.** A infraestrutura foi homologada no sandbox;
**não há homologação nem carga no banco operacional**. O plano completo está em
[Catálogo de RAs — carga idempotente](catalogo-ras-carga.md).

As 37 feições têm códigos, nomes e ObjectIDs distintos na camada identificada
como Regiões Administrativas. Essa evidência define o catálogo técnico de referência
do ensaio; não substitui cadastro jurídico independente ou vigência normativa.
Os arquivos cartográficos e o documento operacional vazio foram preservados.

O novo executor usa a estrutura original de `regioes_administrativas`: UUID por
DEFAULT SQL somente na primeira inserção, código literal e nome da fonte, identidade
separada do ObjectID e histórico cartográfico versionado. A baseline é imutável;
conflitos são recusados, sem UPDATE ou DELETE de RAs. O campo `vigencia` recebe
range técnico ilimitado no ensaio, sem alegar validade legal. Essa semântica e o
uso de `codigo_oficial` exigem revisão antes de qualquer carga operacional.

### Resultado SQL final

- Sandbox: `86f2682e-2091-4b42-9b0e-8af7a1fd3d7d`.
- System identifier: `7707654865988988388`.
- Destino: `127.0.0.1:55432/sentinela_rls_sandbox`.
- Estado final **STOPPED**, sem `postmaster.pid`; demais manifestos preservados.
- Cenário inicialmente vazio: 37 inserções verificadas e revertidas.
- Falha injetada após cinco registros: rollback integral, sem recibo de sucesso.
- Cenário com um UUID preexistente: UUID preservado e 36 novas inserções.
- Reexecução: zero inserções, 37 reutilizações, mesmos UUIDs e resultado lógico.
- Resultado final: 37 códigos/UUIDs/vínculos aprovados no escopo sandbox,
  37 geometrias históricas, zero órfãos; ledger original preservado.
- Onze cenários de carga passaram. Código inválido/duplicado na fonte é bloqueado
  pela verificação do hash; testes Node cobrem também duplicidade estrutural.
- Quatro grupos com autenticação nativa da role reader passaram: mesmo SQL/Zod
  do GET `{id,nome}`, 37 UUIDs persistidos exatos, 48 grants, RLS efetivo ocultando
  a fixture não aprovada e negativas de escrita, campo espacial e acesso interno.
- As 194 verificações anteriores foram repetidas com sucesso, incluindo 174
  casos de paridade. A resolução por UUID agora utiliza os IDs efetivamente
  gerados/preservados na carga, não os IDs determinísticos do documento de fixtures.
- Histórico técnico, rollback de mutações, geometrias originais e importação
  sintética sem coordenadas inventadas foram preservados.
- Hashes dos artefatos conferidos antes e ao fim do ensaio final.

As tentativas anteriores ficaram paradas com suas evidências preservadas. Elas
registraram falha de qualificação PL/pgSQL, tentativa inadequada de UPDATE na
fixture de conflito (recusada pela imutabilidade) e drift de artefato de teste.
Esses resultados foram corrigidos e não são apresentados como execuções aprovadas.
Não houve desativação de proteção para fazê-los passar.

### Qualidade final 2.17.2

| Verificação | Resultado |
| --- | --- |
| Suíte Node 22.23.2 | 201 testes aprovados; 197 anteriores preservados |
| TypeScript principal e experimental | Aprovados |
| ESLint | Aprovado, zero warnings |
| Zod/OpenAPI | 35 schemas, 13 paths, 15 operações e 31 payloads |
| Rotas estáticas | Oito páginas planejadas, 351 imports locais resolvidos |
| Build Next.js isolado | Aprovado, compilação/TypeScript/geração das páginas |
| Navegador | 11 grupos aprovados, zero erros JavaScript |
| Responsividade | 1366/768/390/320 px, claro e escuro |
| git diff --check | Aprovado; avisos LF/CRLF preexistentes |

Navegador: `tmp/occurrence-workflows-38716845-d8f8-4787-b93f-0e170807ad02/`.
O `result.json` registra `catalogEvidence: native-sandbox-projection`.
Os GETs de negócio foram interceptados com a projeção sem credenciais do ensaio
SQL nativo. Foi conferida a preservação do UUID dessa projeção no select da edição.
O cenário sintético explícito mantém as fixtures anteriores; a cópia do GET com
UUID recém-persistido continua territorialmente pendente no escopo operacional.
Todas as requisições de API foram GET; não houve escrita de ocorrência pelo
navegador. Preview existente, sem contas privadas e sem alteração de autenticação:
isso não comprova uma sessão real dos três usuários nem HTTP conectado ao banco.
A consulta SQL com autenticação real da role reader foi homologada separadamente.
O servidor de preview do teste foi encerrado; nenhum servidor do usuário foi parado.

Arquivos novos nesta etapa: `catalog.sql`, `catalog-checks.sql`,
`catalog-source.mjs`, `qualify-catalog.mjs` em `database/local/write-sandbox/`,
`tests/ra-catalog-load.test.mjs` e `docs/catalogo-ras-carga.md`.
Atualizados: executor geográfico, qualificador de vínculos (aceita matriz exportada
do banco), README do sandbox, roteiro visual e os dois documentos cartográficos.
Nenhum arquivo da aplicação precisou mudar: o contrato GET e a resolução versionada
já existentes aceitaram os UUIDs persistidos sem quebrar consumidores.

### Evidências e preservação

Pasta privada final:
`C:\Users\pedro\.sentinela-local\rls-sandboxes\rls-sandbox-86f2682e-2091-4b42-9b0e-8af7a1fd3d7d\evidence`.

- `geography-completion.json`:
  `e3eb583b49a292928c1210f1fc3929243023d7baeaf4d9d9ec7410311c5bc0ad`.
- `catalog-get-tests.json`:
  `e60c00a428751221f35af5e380659c393519b4de14824a55884e2b2d18255760`.
- `catalog-bindings.json`: exportação da matriz com UUIDs do cluster final.
- `geography-tests.json`, `bindings-tests.json`, `geography-cases.json`:
  paridade, mutações experimentais e negativas de segurança.

A leitura operacional separada confirmou 17.11, PostGIS 3.6.2, zero RAs, RLS
forçado e ledger `0001–0005, local-read-0001`. Assinatura das colunas da tabela:
`e28c9790dacfccedb239f53ab02d1950`. O executor do sandbox não se conecta a 5432.
Credenciais efêmeras somente no cluster novo; nenhuma conta existente foi alterada.
Leituras antes/depois tiveram o mesmo catálogo vazio, ledger, RLS e assinatura de
colunas. `Breadcrumb.tsx` preservou SHA-256
`3c4528e5e547f9df0d52f05eba86b7b43db5fa0fc43c57618db4a93f9ffc38a8`.
Branch `feat/sprint4-auth-local-mapas`, HEAD
`fe874f68e4d6e36f9661fb00b683ecddad4c3ea9`, preservados.
Sem Supabase, migrations oficiais, endpoints de escrita, commits, push ou PR.

### Prontidão

Faltam autorização explícita, backup local atual, revisão semântica do catálogo,
vigência desconhecida e proposta própria de estruturas/ACLs operacionais.
A policy atual da role operacional só permite catálogos de teste: uma carga
real não pode ser disponibilizada reetiquetando-a como sintética.
Os limites de cobertura, pequenas interseções e validade histórica permanecem.
Nenhuma dessas pendências impede a revisão técnica da infraestrutura homologada,
mas impedem declarar homologação operacional ou ativar carga automaticamente.

## Etapa 2.17.3 — auditoria pré-operacional

Decisão atual: **BLOQUEADO para carga operacional**, conforme
[relatório e runbook](ra-preoperacional-auditoria.md).
A reader não pôde autenticar com a configuração disponível. Não houve fallback
administrativo e nenhum estado operacional histórico foi promovido a verificação
atual. Backup local e restauração permanecem pendentes; os dumps Supabase anteriores
não são evidência de recuperação deste banco local.

O ensaio final `47436ca6-7f55-49f8-a909-a3f2cfea0add` (system identifier
`7707663796932284316`) passou na porta 55432 e terminou STOPPED, sem postmaster.pid.
Capturou baseline completa antes das alterações experimentais e homologou o mesmo
SQL de metadados com a role nativa restrita, preservando carga, UUIDs, idempotência,
rollback, paridade, GET e segurança. Nenhuma escrita operacional ou conexão ao
Supabase foi realizada. A comparação operacional atual retornou NOT VERIFIED.

Requalificação offline posterior: a seleção anterior era da auditoria fracassada,
anterior ao snapshot autenticado. O audit `7c1ec859-60ea-4950-aaa5-d842bf6bcbd8`
e a baseline privada `47436ca6-7f55-49f8-a909-a3f2cfea0add` tiveram hashes conferidos
e passaram nos 14 grupos estruturais. A nova evidência tem escopo exclusivamente
de baseline e readiness BLOCKED. Contagem global, ledger e backup/restauração
continuam inconclusivos/pendentes. O relatório pré-operacional detalha a correção,
o novo CLI com hash explícito, os 15 testes offline e os gates restantes.
# Revisão oficial de identidades — Etapa 2.17.5

As 37 entradas foram confrontadas com referência administrativa oficial e com
as leis de criação de Ponte Alta e 26 de Setembro: 35 aprovadas e duas com
ressalvas de representação, sem RA espúria identificada. Consulte a
[matriz](catalogos/ras-revisao-2026-11-13-v1/matrix.md) e o
[dossiê](revisao-oficial-catalogo-ras.md).

Isso não certifica cada vértice nem vigência histórica de todas as poligonais.
Snapshot, geometrias, código literal `XXXVII`, vínculos vazios e SQL ensaiado
foram preservados. A data de extração continua distinta de vigência legal.
Não houve nova carga SQL nem homologação visual nesta etapa.
