# Dashboard e Mapa Criminal · leitura PostgreSQL local

## Estado recuperado

Na branch `feat/sprint4-auth-local-mapas`, HEAD
`fe874f68e4d6e36f9661fb00b683ecddad4c3ea9`, a árvore local já continha o
endpoint analítico, os filtros compartilhados, os estados de erro e vazio,
a projeção da cartografia oficial e os ensaios SQL e de navegador. O recibo
interrompido havia falhado em `C/rollback`, antes do cenário analítico.

Os Prompts 1–3 já tinham evidências distintas: APIs de leitura validadas
em sandbox, mutações CRUD restritas ao laboratório e staging PCDF validado
com arquivos sintéticos. Permanecem pendentes, respectivamente, os GETs
operacionais autenticados e a carga do catálogo oficial de naturezas, a
liberação do escritor, e a consolidação PCDF com revisão humana.

## Contrato e indicadores

`GET /api/v1/analytics/persistente` exige sessão local e permissão
`analisar`. Dashboard e Mapa usam o mesmo contrato e uma consulta
parametrizada por recorte, em transação de leitura sob RLS. Os filtros são
datas civis inclusivas, código de RA, UUID de natureza, UUID de categoria
e faixa horária. Natureza e categoria combinadas devem pertencer à mesma
associação visível. Os atalhos relativos à data fictícia ficam na prévia.

- **Total:** ocorrências ativas distintas e visíveis. Cada ocorrência
  participa uma vez, mesmo com várias associações.
- **RA:** ocorrências por região visível. O total geral pode conter registros
  sem uma RA visível. As contagens no mapa preservam o contexto do DF,
  enquanto selecionar uma RA restringe os indicadores e pontos.
- **Natureza:** ocorrências distintas por descrição original. Uma
  ocorrência pode aparecer em mais de uma descrição, logo a soma dos
  setores pode exceder o total.
- **Série mensal:** contagem por mês da data do fato. Registros sem data
  não integram a série. A variação compara os dois últimos meses
  consecutivos disponíveis no recorte e exige base anterior positiva.
- **Picos:** dia da semana e faixa de uma hora mais frequentes, com
  desempate pelo primeiro valor em ordem cronológica. Datas e horas
  ausentes são omitidas de seu respectivo cálculo.

## Cartografia e limites

A aplicação valida o SHA-256 do GeoJSON oficial e projeta as 37 feições na
projeção existente. O modo Satélite usa a mesma versão oficial para os
limites e recebe as contagens do recorte. Tiles continuam a depender do
provedor de imagens já configurado.

Pontos e clusters usam apenas localização validada e RA visível. A API
omite identificador de ocorrência, endereço, ledger, metadados internos
e geometria armazenada. O calor usa a referência integral autorizada e
preserva os parâmetros visuais existentes. Acima de 5.000 pontos, a
camada de pontos/clusters é parcial e sinalizada e o calor fica
indisponível quando a referência integral supera esse limite. Os
agregados continuam completos. Nenhum índice foi aplicado ao operacional.

A seleção do modo de leitura depende da sessão local. Se a reader
estiver indisponível, a página oferece uma nova tentativa e preserva o
estado de erro. O modo demonstrativo continua disponível em sua prévia.

## Evidência PostgreSQL

O ensaio em PostgreSQL 17.11/PostGIS 3.6.2 registrou banco vazio, totais
distintos com associações múltiplas, filtros combinados, contagens
territoriais e mensais, geometria inválida recusada e referência térmica
independente do filtro. Foram três respostas 200 com principais de teste,
um 401 sem principal e um 400 por parâmetro repetido. O cluster terminou
parado, com zero conexões operacionais e zero conexões ao Supabase.

Com 10.002 ocorrências visíveis e 10.000 localizadas, a consulta retornou
5.000 pontos, total exato, sinalização de truncamento e calor indisponível.
O ensaio mediu 287 ms para consulta e validação e 417.037 bytes de JSON
antes da compressão. Os pontos de volume usam uma coordenada sintética
repetida. Essa medição não representa renderização de 10.000 pontos
distribuídos nem latência operacional.
[Recibo isolado](../tmp/ra-operational-homologation/rls-sandbox-7dedaec4-0951-4a2c-9c2d-175d0255f117/evidence/ra-operational.json)

## Validação da aplicação e liberação

Passaram 240 testes Node, TypeScript, ESLint, contratos/OpenAPI, rotas
estáticas, build de produção e `git diff --check`. O contrato gerado
contém 36 schemas, 14 caminhos, 16 operações e 32 exemplos de payload.
O ensaio responsivo usa sessões descartáveis do Next.js e intercepta
somente o endpoint analítico para fornecer respostas de teste. O SQL
real e a RLS são exercitados separadamente no cluster descartável.

O recibo HTTP local `e02a1945-a68c-4219-bcbd-4af85888a02c` passou com 182
verificações antes da limpeza do ambiente. Em 1440 px e 390 px foram
verificados os indicadores, calor, pontos, clusters, os 37 limites oficiais
no Satélite e a ausência de totais fictícios em caso de erro. O teste de
Satélite bloqueou os tiles externos para validar a camada geográfica
independentemente da disponibilidade do provedor de imagens.

A senha da reader permanece ausente da configuração disponível.
O Prompt 5 pode aproveitar as evidências isoladas e o build. A homologação
dos GETs com contas existentes, reader operacional e dados autorizados,
assim como a decisão de publicação, permanece independente.

## Recorte PCDF no cluster descartável

Quando o manifesto PCDF é atestado, o endpoint analítico usa o SQL comum
com uma role de leitura sob RLS. O recorte contém ocorrências PCDF
consolidadas. A listagem identifica a mesma origem junto aos registros
manuais do laboratório. O Dashboard e o Mapa compartilham a resposta
`sandbox-synthetic-only`. O recorte local regular continua usando a
reader operacional conforme seu próprio contrato.

A distribuição por categoria considera ocorrências distintas dentro de
cada categoria homologada. Duas naturezas vinculadas à mesma categoria
somam uma ocorrência nessa categoria. Uma ocorrência em categorias
diferentes participa de cada categoria correspondente. A seleção por
natureza e categoria combinadas exige uma associação que satisfaça
ambos os critérios. A distribuição resume as associações visíveis das
ocorrências selecionadas.

Uma ocorrência sem referência espacial confirmada contribui para as
dimensões válidas do recorte e fica fora de pontos e calor. Os 37
limites do GeoJSON aprovado permanecem disponíveis para visualização.
[Evidência do fluxo](desenvolvimento/progresso-conclusao.md)
