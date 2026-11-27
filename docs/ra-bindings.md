# Vínculos UUID–IDE/DF — Etapa 2.17.1

## Vínculos operacionais após a carga — 18/11/2026

O [arquivo operacional](../public/data/cartography/ra-bindings.json) contém as
37 correspondências geradas após o COMMIT de `local-ra-0002`. Os UUIDs vieram
de uma nova consulta PostgreSQL e os códigos, objectids e nomes originais
foram conferidos contra o GeoJSON oficial, que preservou o hash existente.
A vigência jurídica da geometria continua desconhecida. Os resultados
anteriores de catálogo vazio, descritos abaixo, correspondem ao período anterior
à carga. [Evidência e SHA-256 da aplicação](catalogo-ras-carga.md#aplicação-operacional--18112026)

O verificador do catálogo compara a projeção `{id,nome}` com os 37 vínculos
aprovados. A comparação do GET autenticado permanece pendente da credencial
da reader. Os testes locais dos vínculos continuam usando o GeoJSON fixado.

Consolidação 2.17.6: `id` é UUID persistido; código do vínculo continua sendo o
literal IDE (`XXXVII` inclusive), não o número administrativo. Nome administrativo
e nome original serão preservados separadamente; nenhum UUID operacional foi
gerado nesta revisão. A [decisão consolidada](revisao-oficial-catalogo-ras.md)
mantém vigência jurídica desconhecida e exige novo ensaio para qualquer payload
com metadados/nomes alterados. O GET continua `{id,nome}`; não supre os vínculos
code/objectid/hash/version necessários ao classificador territorial.


**PARCIALMENTE HOMOLOGADO no operacional.** A infraestrutura é verificável com fixtures; não há
vínculos operacionais homologados. Uma consulta `BEGIN READ ONLY` em
`127.0.0.1:5432/sentinela_dev_operacional`, em 13/11/2026, confirmou **zero RAs**.
A consulta não retornou dados pessoais. Não houve escrita operacional.

Na auditoria 2.17.3, não foi possível autenticar a reader com a configuração
disponível; portanto essa contagem é evidência histórica, não reconfirmação atual.
Consulte [bloqueios e auditoria preparada](ra-preoperacional-auditoria.md).

Atualização: a auditoria autenticada `7c1ec859-60ea-4950-aaa5-d842bf6bcbd8` foi
posteriormente qualificada offline, com integridade e 14 grupos estruturais PASS.
Ela comprova zero RAs visíveis à reader, não zero RAs globais. Ledger e contagem
global continuam NOT VERIFIED; nenhum vínculo operacional foi criado nesta revisão.

### Continuação 2.17.2

A [carga canônica idempotente](catalogo-ras-carga.md) agora gera UUIDs pela primeira
inserção SQL em sandbox, preserva UUID preexistente e exporta seus vínculos sem
copiar os UUIDs determinísticos das fixtures. A reexecução foi comprovada sem
duplicação. O catálogo real permanece vazio; a carga operacional não foi autorizada.
O ensaio preserva a imutabilidade original das RAs e mantém geometrias históricas
separadas por versão. Consulte o relatório 2.17.2 ao fim da documentação cartográfica
para a identidade do cluster final e os resultados de qualidade.

## Fonte e identidade

Camada: https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/LIMITES/FeatureServer/1

São 37 feições e 37 códigos distintos. Os campos de referência são `ra_codigo`,
`ra_nome` e `objectid`. O código de Ponte Alta é literalmente `XXXVII` na fonte;
não foi normalizado para outro identificador. O nome é descritivo, nunca prova
suficiente de equivalência. `objectid` é um identificador da feição neste snapshot,
não uma promessa de estabilidade entre publicações.

Fonte fixada: `ras-ide-2026-11-13.geojson`, SHA-256
`fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553`.
A extração em 13/11/2026 não comprova vigência legal. Os metadados consultados não
fornecem período legal de validade; `validFrom` e `validTo` permanecem nulos.

## Contrato de correspondência

`public/data/cartography/ra-bindings.json` tem escopo `operational` e lista vazia.
`ra-bindings-synthetic.json` tem escopo `sandbox` e 37 fixtures técnicas. Ambos
registram versão, fonte, hash e referência temporal. Cada entrada registra UUID,
nomes descritivos, código, identificador da feição, estado e evidência.

Versão inicial: `ide-df-bindings-2026-11-13-v1`.
SHA-256 do documento operacional:
`693d64d270d208cb7a1fad14e394a6e82972a887d4078b77ecfd244a27f19f40`.
SHA-256 do documento sintético:
`deb0c0ee1219aec35220dd62e3a7e859c7bb4471bb025bea0ef1ce14e7934715`.

Estados: `approved` (homologado no escopo declarado), `pending` (candidato),
`unmapped` (sem correspondência) e `conflict` (conflitante). Só o primeiro resolve
o código. `approved` no sandbox **não homologa uma identidade operacional**.
UUID ou código duplicado na mesma versão invalida o documento. Uma relação
um-para-muitos exigiria modelo e evidência próprios; não é aceita silenciosamente.

Os UUIDs sintéticos são derivados tecnicamente do MD5 do código, com bits de
formato fixados; não são UUIDs oficiais nem uma implementação de UUIDv5.
Sua evidência é a importação do código e da feição do snapshot no cluster de teste.
As 37 feições continuam sem vínculo operacional, não há candidatos reais nem
conflitos reais que possam ser avaliados com o catálogo vazio.

## Classificação e interface

`src/data/ra-bindings.ts` valida UUID, versão, escopo, fonte, hash, estado e
identificador da feição. Não infere vínculo pelo nome. Código ou identificador
desconhecido resulta em `reference_pending`, com mensagem específica. Fronteira
e sobreposição preservam `boundary_ambiguous`, sem escolher uma RA arbitrária.

Cadastro e edição demonstrativos continuam usando UUID no formulário. Somente
o cenário sintético explicitamente selecionado carrega o mapa de fixtures.
Cópias de GETs persistentes usam o documento operacional, portanto permanecem
pendentes mesmo que um UUID coincida com uma fixture. Divergência, fronteira e
ponto externo bloqueiam a prévia; os campos são preservados. Referência pendente
pode continuar como simulação identificada, nunca como aprovação ou gravação.

O feedback no navegador não constitui autorização SQL. Nenhum endpoint de
escrita foi ativado. A autenticação e as contas existentes foram preservadas.

## SQL experimental

`database/local/write-sandbox/bindings.sql` cria versões e vínculos somente no
cluster descartável atestado. Usa FKs, unicidade por versão, validação temporal,
RLS ENABLE/FORCE, triggers de imutabilidade e revogação de acesso direto às roles
runtime. As funções privadas existentes continuam com contas técnicas restritas,
sem promover essas identidades a autoria humana. O trigger geográfico passa a
exigir vínculo aprovado para cadastro/edição manual experimental. Importações
sintéticas incompletas mantêm coordenadas ausentes.

Os ensaios guardam logs e identidades em diretório privado fora do Git. As senhas
são efêmeras, transmitidas em memória ao subprocesso; não constam de argumentos,
relatórios ou arquivos versionados. Cada execução cria cluster novo, preserva os
manifestos anteriores e encerra somente o próprio cluster identificado.

Reprodução, exclusivamente em cluster novo isolado:

```powershell
python -B database/local/write-sandbox/run-geography.py --execute --bindings
node --experimental-strip-types scripts/check-occurrence-workflows-browser.mjs
```

## Migração operacional futura — proposta, sem execução

1. Aprovar a origem e o povoamento do catálogo administrativo real em tarefa
   própria. Não reaproveitar os UUIDs destas fixtures como dados oficiais.
2. Obter evidência documental por identidade/código e abrangência; revisar
   mudanças de denominação, desmembramentos e períodos efetivamente comprovados.
3. Versionar a matriz operacional revisada, incluindo vínculos pendentes ou
   conflitantes sem promovê-los automaticamente. Uma mudança de cartografia
   exige novo hash e revisão dos vínculos, preservando a versão anterior.
4. Projetar migration incremental própria para versões/vínculos, com políticas
   e privilégios mínimos. Não copiar as funções experimentais SECURITY DEFINER
   sem revisão de identidade, autorização e auditoria de produção.
5. Homologar UUIDs reais em GETs, formulários e PostGIS. Só então avaliar qualquer
   ativação de escrita, em autorização distinta.

Continuam pendentes: vigência jurídica/histórica, perímetro independente para
provar cobertura integral do DF e revisão das nove pequenas interseções. Nenhuma
geometria foi reparada ou simplificada para ocultar essas limitações.

## Matriz sintética

As entradas abaixo são exclusivamente fixtures; a fonte e o hash comuns são os
registrados acima. Cada linha tem estado `approved` apenas no escopo `sandbox`.

| UUID sintético | Código literal IDE/DF | Nome da fonte | ObjectID |
| --- | --- | --- | --- |
| cd7f727e-49aa-5aa8-8327-31f51371edcc | RA-I | PLANO PILOTO | 69 |
| 5ceb6079-8bfc-5818-82ef-48b2795c8ba2 | RA-II | GAMA | 105 |
| 4ccf20e7-cee9-559a-8fc1-0af0363a2652 | RA-III | TAGUATINGA | 81 |
| 48a8fd91-ac28-5208-8c65-c5ed2dff091c | RA-IV | BRAZLÂNDIA | 92 |
| 9338d651-0f2e-50d3-85b5-33eadedc2108 | RA-IX | CEILÂNDIA | 102 |
| 2c8312ab-8df9-5993-87a3-018f12606ae3 | RA-V | SOBRADINHO | 70 |
| bfe8489f-4d24-57e4-8763-9b012a0b501d | RA-VI | PLANALTINA | 90 |
| f587b584-e0b5-56df-8f05-28851c40909f | RA-VII | PARANOÁ | 96 |
| e12ad9ae-c906-5d66-87b6-fc3447cce67d | RA-VIII | NÚCLEO BANDEIRANTE | 80 |
| 9c31769a-3d5f-5b1b-8986-afad9319dc68 | RA-X | GUARÁ | 71 |
| f6424605-048a-592a-8b5d-572578e9ce30 | RA-XI | CRUZEIRO | 72 |
| 46593aba-5ad7-5b08-85c9-60373f49821e | RA-XII | SAMAMBAIA | 98 |
| eeb8d43e-432d-5662-80b4-9a99a3d9ba69 | RA-XIII | SANTA MARIA | 99 |
| 041cd8a7-c472-5051-88b6-8a9a07fd9d47 | RA-XIV | SÃO SEBASTIÃO | 100 |
| 267a3011-4bc0-512e-847c-57fbe54c9852 | RA-XIX | CANDANGOLÂNDIA | 74 |
| 9b460b71-d88f-5b4b-8abc-99ebe0d75d16 | RA-XV | RECANTO DAS EMAS | 97 |
| 5946d219-273f-5208-8c1e-c0ff4426e8e4 | RA-XVI | LAGO SUL | 77 |
| d9c00edb-974e-5a30-80ef-2136fdea158b | RA-XVII | RIACHO FUNDO | 73 |
| dfe70674-5b53-5737-874c-4f5359f7db0c | RA-XVIII | LAGO NORTE | 78 |
| de9afa63-0d14-5d56-89d1-84c9cda64bd1 | RA-XX | ÁGUAS CLARAS | 82 |
| b665f7b7-f4ed-5bc0-8a5d-451c8d58409a | RA-XXI | RIACHO FUNDO II | 75 |
| 04650061-1863-50d4-8bf4-5e4743bb037d | RA-XXII | SUDOESTE/OCTOGONAL | 83 |
| 552dcb68-5625-5782-8e5c-b0ad17294203 | RA-XXIII | VARJÃO | 84 |
| dabf9ec6-42f9-5fa2-8328-5941c9d40d5c | RA-XXIV | PARK WAY | 76 |
| 4ceb2dd0-0b00-52d4-82a7-d473d438b35f | RA-XXIX | SIA | 86 |
| 2d7edc47-690c-50a8-8dc6-4dc090b660bb | RA-XXV | SCIA | 85 |
| 71c5627c-4796-5589-8301-c8123eff85d3 | RA-XXVI | SOBRADINHO II | 101 |
| d1014786-f87c-5f45-8d47-aed25c4eab5d | RA-XXVII | JARDIM BOTÂNICO | 95 |
| 64e68ed2-84d0-5935-8b75-b2cc3de8ca0a | RA-XXVIII | ITAPOÃ | 88 |
| b40596ed-5286-5f16-8c6c-eee2aeef74d8 | RA-XXX | VICENTE PIRES | 104 |
| 3b983094-becd-57e8-81dd-4c5bee9c38ec | RA-XXXI | FERCAL | 93 |
| b19b3bc7-cdb3-5284-88d1-48e0b413a0f9 | RA-XXXII | SOL NASCENTE E POR DO SOL | 103 |
| e4310614-3c56-5449-8f30-1969e8ac719b | RA-XXXIII | ARNIQUEIRA | 89 |
| 03c795ae-77e1-57f5-87c5-ff5db2211a42 | RA-XXXIV | ARAPOANGA | 79 |
| d9d7befb-407d-5aaa-8f19-454ed2ad5f4d | RA-XXXV | AGUA QUENTE | 91 |
| f14bea76-adde-5b4a-87d8-69babbeedd60 | RA-XXXVI | 26 DE SETEMBRO | 106 |
| 1eec55ae-3809-5666-862c-a2444f094175 | XXXVII | PONTE ALTA | 107 |
# Revisão administrativa — Etapa 2.17.5

A [matriz oficial das 37 entradas](catalogos/ras-revisao-2026-11-13-v1/matrix.md)
confirma identidades administrativas, sem produzir vínculos UUID operacionais.
Ponte Alta tem número XXXVII comprovado por lei, mas código cartográfico literal
`XXXVII`; os dois namespaces não foram igualados ou normalizados silenciosamente.
O mapeamento continua exigindo código/objectid/versão/hash exatos.
O arquivo de vínculos operacional permanece vazio; fixtures aprovadas em sandbox
não se tornam identidades operacionais por esta revisão documental.

Contagem global zero e ledger foram comprovados em 2.17.4 com acesso autorizado;
as passagens NOT VERIFIED abaixo são históricas da reader. Veja o
[relatório atual e limites](revisao-oficial-catalogo-ras.md).
