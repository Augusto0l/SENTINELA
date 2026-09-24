Crie um protótipo web profissional, responsivo e de alta fidelidade para o sistema **SENTINELA — Análise e Monitoramento Criminal**, voltado à visualização e análise geográfica de ocorrências no Distrito Federal.

O protótipo deve seguir rigorosamente as especificações abaixo.

# 1. OBJETIVO DO PROTÓTIPO

O SENTINELA é um sistema de análise e monitoramento de ocorrências criminais.

A interface deve permitir:

* visualizar a situação geral das ocorrências em todo o Distrito Federal;
* comparar as Regiões Administrativas;
* identificar regiões com maior incidência;
* identificar crescimento ou redução de ocorrências;
* analisar naturezas criminais;
* visualizar ocorrências geograficamente;
* utilizar mapa de calor;
* visualizar pontos individuais de ocorrências;
* visualizar clusters;
* selecionar uma Região Administrativa diretamente pelo mapa;
* filtrar uma Região Administrativa;
* entrar em uma análise específica da RA selecionada;
* analisar somente as ocorrências existentes dentro dos limites geográficos daquela RA.

O sistema será inicialmente desenvolvido para web, mas o design deve possuir uma estrutura que possa futuramente ser adaptada para dispositivos móveis.

---

# 2. REGRA CRÍTICA SOBRE O MAPA DO DISTRITO FEDERAL

ESTA É A PARTE MAIS IMPORTANTE DO PROTÓTIPO.

NÃO desenhe manualmente ou invente as divisões das Regiões Administrativas.

NÃO utilize polígonos fictícios.

NÃO simplifique o Distrito Federal em 8, 10, 15 ou 20 áreas.

NÃO crie formas geométricas aproximadas apenas para representar as RAs.

O mapa deve utilizar as **divisões geográficas reais e atuais das Regiões Administrativas do Distrito Federal**.

Utilize como referência geoespacial a camada oficial do **Geoportal / IDE-DF do Governo do Distrito Federal**, denominada:

**Regiões Administrativas — Feature Layer ID 1 — serviço Público/LIMITES**

Essa camada oficial possui geometria do tipo Polygon e suporte a GeoJSON.

Sempre que tecnicamente possível, carregue os polígonos dessa fonte oficial.

Se o ambiente do protótipo não conseguir consumir diretamente o serviço externo, prepare a arquitetura para utilizar um arquivo local:

`/data/ras-df.geojson`

Esse arquivo deverá representar uma exportação da camada oficial do Geoportal/IDE-DF.

O GeoJSON deve ser considerado a única fonte de verdade para:

* formato externo do Distrito Federal;
* limites das RAs;
* posição das RAs;
* tamanho das RAs;
* relacionamento espacial entre RAs;
* identificação da RA selecionada.

Não redesenhe essas geometrias em SVG manualmente.

---

# 3. O DISTRITO FEDERAL POSSUI 36 REGIÕES ADMINISTRATIVAS

O protótipo deve considerar a divisão territorial vigente em 2026, incluindo a nova Região Administrativa de **26 de Setembro — RA XXXVI**.

Considere as seguintes RAs:

1. RA I — Plano Piloto
2. RA II — Gama
3. RA III — Taguatinga
4. RA IV — Brazlândia
5. RA V — Sobradinho
6. RA VI — Planaltina
7. RA VII — Paranoá
8. RA VIII — Núcleo Bandeirante
9. RA IX — Ceilândia
10. RA X — Guará
11. RA XI — Cruzeiro
12. RA XII — Samambaia
13. RA XIII — Santa Maria
14. RA XIV — São Sebastião
15. RA XV — Recanto das Emas
16. RA XVI — Lago Sul
17. RA XVII — Riacho Fundo
18. RA XVIII — Lago Norte
19. RA XIX — Candangolândia
20. RA XX — Águas Claras
21. RA XXI — Riacho Fundo II
22. RA XXII — Sudoeste/Octogonal
23. RA XXIII — Varjão
24. RA XXIV — Park Way
25. RA XXV — SCIA/Estrutural
26. RA XXVI — Sobradinho II
27. RA XXVII — Jardim Botânico
28. RA XXVIII — Itapoã
29. RA XXIX — SIA
30. RA XXX — Vicente Pires
31. RA XXXI — Fercal
32. RA XXXII — Sol Nascente e Pôr do Sol
33. RA XXXIII — Arniqueira
34. RA XXXIV — Arapoanga
35. RA XXXV — Água Quente
36. RA XXXVI — 26 de Setembro

IMPORTANTE:

A criação de 26 de Setembro alterou territorialmente a área de Vicente Pires.

Portanto, não utilize mapas antigos do DF anteriores à criação da RA XXXVI como referência final.

A geometria atual fornecida pela camada oficial deve prevalecer sobre qualquer imagem ilustrativa anterior.

---

# 4. ESCOPO GEOGRÁFICO DO SENTINELA

Neste momento o sistema trabalha SOMENTE com:

**Distrito Federal → Regiões Administrativas**

Não criar subdivisões administrativas internas.

Não criar bairros fictícios.

Não dividir Sobradinho, Ceilândia, Taguatinga ou outras RAs em áreas inventadas.

Não implementar drill-down por bairro ou setor neste protótipo.

Quando uma RA for selecionada, o sistema deve simplesmente aproximar e destacar o **polígono oficial daquela RA**.

Dentro da RA serão mostrados:

* pontos das ocorrências;
* clusters;
* mapa de calor.

---

# 5. IDENTIDADE VISUAL

Criar uma interface moderna, tecnológica, institucional e profissional.

Tema predominantemente escuro.

Referência visual:

* sistemas modernos de inteligência;
* dashboards de segurança pública;
* plataformas GIS;
* centros de operações;
* ferramentas profissionais de análise de dados.

Evitar aparência de videogame ou interface excessivamente futurista.

## Paleta

Background principal:

* azul-marinho quase preto.

Sidebar:

* tom ligeiramente mais claro.

Cards:

* azul-marinho / grafite.

Cor primária:

* azul vivo.

Indicadores positivos:

* verde.

Atenção:

* laranja.

Alta incidência:

* vermelho.

Textos principais:

* branco ou cinza muito claro.

Textos secundários:

* azul acinzentado.

Bordas:

* discretas, aproximadamente 1 px.

Utilizar sombras e glow com extrema moderação.

---

# 6. TIPOGRAFIA

Utilizar fonte limpa e profissional semelhante a:

**Inter**

Hierarquia clara entre:

* título de página;
* título de card;
* números principais;
* indicadores;
* legendas;
* textos auxiliares.

Evitar fontes decorativas.

---

# 7. ESTRUTURA GLOBAL

Criar sidebar fixa à esquerda.

Topo fixo.

Área principal rolável.

## Sidebar

Logo:

escudo minimalista + texto:

**SENTINELA**

subtexto:

**Análise e Monitoramento**

### VISÃO GERAL

Dashboard

Mapa Criminal

### OCORRÊNCIAS

Ocorrências

Nova Ocorrência

Importar Dados

### GESTÃO

Usuários

Configurações

Na parte inferior:

Avatar PA

Pedro Augusto

Administrador

---

# 8. HEADER

No topo da aplicação:

campo de busca:

**Buscar ocorrência, região, natureza...**

À direita:

* notificações;
* alternância de tema;
* avatar PA;
* Pedro Augusto;
* menu do usuário.

---

# 9. TELA 1 — DASHBOARD / VISÃO GERAL DO DF

Esta é a primeira tela apresentada após o login.

Ela NÃO deve ser apenas um dashboard tradicional cheio de gráficos.

Sua principal função é responder rapidamente:

**O que está acontecendo no Distrito Federal?**

Título:

# Visão Geral do DF

Subtítulo:

**Uma visão ampla das ocorrências por Região Administrativa do Distrito Federal.**

---

# 10. FILTROS DO DASHBOARD

Criar uma barra horizontal contendo:

### Período

Exemplo:

Último mês

Outras opções:

* Hoje
* Últimos 7 dias
* Últimos 30 dias
* Últimos 3 meses
* Últimos 6 meses
* Últimos 12 meses
* Personalizado

### Região

Padrão:

**Todas as regiões**

Dropdown contendo as 36 RAs.

### Natureza

Padrão:

**Todas as naturezas**

### Horário

Padrão:

**Qualquer horário**

### Botões

**Aplicar filtros**

**Limpar filtros**

Todos os indicadores e o mapa devem reagir aos filtros selecionados.

---

# 11. INDICADORES PRINCIPAIS DO DASHBOARD

Criar uma linha com aproximadamente cinco cards.

### Card 1

OCORRÊNCIAS NO PERÍODO

12.430

Total em todas as RAs

---

### Card 2

RA COM MAIOR INCIDÊNCIA

Ceilândia

1.842 ocorrências

14,8% do total

---

### Card 3

MAIOR CRESCIMENTO

Planaltina

+28,6%

em relação ao período anterior

Mostrar seta ou pequeno gráfico ascendente verde.

---

### Card 4

MAIOR REDUÇÃO

Sudoeste/Octogonal

-18,7%

em relação ao período anterior

Mostrar indicador descendente.

---

### Card 5

NATUREZA EM DESTAQUE

Furto

3.271 ocorrências

26,3% do total

Os números são apenas dados demonstrativos para apresentação do protótipo.

Não apresentá-los como dados oficiais.

---

# 12. MAPA PRINCIPAL DO DASHBOARD

Esta deve ser a maior área visual da página.

Título:

**Ocorrências por Região Administrativa**

Subtítulo:

**Distribuição espacial das ocorrências no período selecionado**

Mostrar o Distrito Federal inteiro.

IMPORTANTE:

Renderizar os **36 polígonos reais das RAs** utilizando a camada geográfica oficial.

Não substituir o mapa real por formas geométricas genéricas.

---

# 13. CHOROPLETH DAS RAs

Cada RA deverá receber uma intensidade de cor baseada no número demonstrativo de ocorrências.

Escala:

menor incidência:
azul escuro

incidência intermediária:
azul claro → amarelo → laranja

maior incidência:
vermelho

Criar legenda:

**Menor incidência ← → Maior incidência**

A escala precisa ser dinâmica.

Não definir uma cor fixa permanente para cada RA.

---

# 14. LABELS DO MAPA

Mostrar nomes de RAs somente quando houver espaço suficiente.

Não tentar escrever obrigatoriamente os 36 nomes simultaneamente, pois existem RAs pequenas próximas umas das outras.

Utilizar estratégia de zoom.

Em zoom geral:

mostrar nomes das principais RAs sem sobreposição.

Ao aproximar:

mostrar nomes das demais.

Todas as 36 RAs precisam estar acessíveis por hover e clique mesmo quando o nome não estiver visível.

---

# 15. HOVER SOBRE UMA RA

Ao posicionar o mouse sobre uma RA:

destacar discretamente o polígono.

Exibir tooltip:

**Sobradinho — RA V**

Total de ocorrências: 1.248

Variação: +12,4%

Natureza mais frequente: Roubo

Os valores são demonstrativos.

---

# 16. CLIQUE EM UMA RA NO DASHBOARD

Ao clicar em qualquer RA:

exemplo:

**Sobradinho**

navegar para:

**Mapa Criminal**

Passar a RA selecionada como contexto.

O comportamento deve ser equivalente a selecionar Sobradinho manualmente no filtro da tela Mapa Criminal.

---

# 17. VISUALIZAÇÕES DO MAPA

Criar três opções:

**Mapa de calor**

**Pontos**

**Clusters**

Permitir também combinações visualmente coerentes, como choropleth + pontos.

---

# 18. PONTOS DE OCORRÊNCIA

Criar dados fictícios exclusivamente para demonstrar o funcionamento do protótipo.

Cada ocorrência de demonstração pode possuir:

* id;
* latitude;
* longitude;
* Região Administrativa;
* natureza;
* data;
* horário.

IMPORTANTE:

Ao gerar coordenadas fictícias para o protótipo, os pontos devem obrigatoriamente ficar dentro do polígono da respectiva RA.

Não posicionar ocorrências de Sobradinho em outra RA.

Não posicionar pontos fora do Distrito Federal.

---

# 19. PAINEL LATERAL DO DASHBOARD

À direita do mapa criar uma coluna de análises compactas.

### Ranking das RAs por ocorrências

Exemplo:

1. Ceilândia
2. Planaltina
3. Taguatinga
4. Samambaia
5. Plano Piloto

Botão:

**Ver todas**

---

### Natureza criminal mais frequente

Criar gráfico donut.

Exemplo:

Furto
Lesão corporal
Ameaça
Roubo
Outras

---

### Variação geral do período

+8,4%

em relação ao período anterior.

Adicionar pequeno sparkline.

---

# 20. TELA 2 — MAPA CRIMINAL

A segunda tela deve ser uma ferramenta de exploração geográfica.

Título:

# Mapa Criminal

Subtítulo:

**Explore a distribuição espacial das ocorrências e identifique padrões por região.**

A principal diferença para o Dashboard é:

Dashboard = visão estratégica de todo o DF.

Mapa Criminal = análise geográfica detalhada.

---

# 21. ESTADO INICIAL DO MAPA CRIMINAL

Quando nenhuma RA estiver selecionada:

mostrar o Distrito Federal inteiro.

Renderizar novamente os 36 polígonos oficiais.

O usuário poderá selecionar uma RA de duas maneiras:

### Opção 1

clicar diretamente sobre a RA no mapa.

### Opção 2

utilizar o filtro Região.

As duas ações devem executar exatamente o mesmo comportamento.

---

# 22. FILTROS DO MAPA CRIMINAL

Criar filtros para:

### Período

Últimos 6 meses

### Natureza

Todas as naturezas

### Região

Todas as regiões

Dropdown com as 36 RAs.

### Horário

Qualquer horário

### Dia da semana

Todos os dias

### Botões

Aplicar filtros

Limpar filtros

NÃO adicionar filtro obrigatório por bairro ou setor neste momento.

O escopo territorial atual é somente RA.

---

# 23. EXEMPLO DE DRILL-DOWN — SOBRADINHO

Simular o seguinte cenário:

um policial deseja analisar apenas Sobradinho.

Ele seleciona:

**Sobradinho — RA V**

O sistema deve imediatamente:

1. identificar o feature geográfico cuja RA corresponde a Sobradinho;
2. calcular os bounds do polígono;
3. executar zoom automático;
4. centralizar o mapa;
5. destacar Sobradinho;
6. ocultar ou reduzir drasticamente a ênfase visual das outras RAs;
7. mostrar as ocorrências existentes dentro de Sobradinho;
8. recalcular todos os indicadores considerando somente Sobradinho.

---

# 24. BREADCRUMB

Quando Sobradinho estiver selecionado:

mostrar no topo:

**Distrito Federal > Sobradinho**

Adicionar botão:

**← Voltar para visão do DF**

Ao clicar:

* remover a RA selecionada;
* voltar ao zoom completo;
* mostrar novamente todas as RAs.

---

# 25. MAPA DETALHADO DA RA

No modo Sobradinho:

mostrar exclusivamente o limite geográfico real de:

**RA V — Sobradinho**

NÃO criar divisões internas fictícias.

NÃO dividir Sobradinho em bairros.

NÃO desenhar setores inventados.

O foco deve ser:

* limite da RA;
* vias do mapa-base, quando disponíveis;
* pontos das ocorrências;
* mapa de calor;
* clusters.

O polígono oficial de Sobradinho precisa continuar sendo a referência territorial.

---

# 26. MAPA DE CALOR

Quando:

**Mapa de calor**

estiver selecionado:

mostrar zonas de intensidade baseadas na densidade dos pontos.

Escala visual:

azul:
baixa concentração

amarelo:
concentração intermediária

laranja:
alta

vermelho:
muito alta

O heatmap deve representar a densidade das coordenadas.

Não preencher áreas aleatórias apenas para deixar o mapa visualmente bonito.

---

# 27. MODO PONTOS

Ao selecionar:

**Pontos**

mostrar cada ocorrência individualmente.

Marcadores pequenos.

Ao clicar em um marcador:

abrir popup contendo exemplo:

**Roubo**

15/08/2026

21:37

Sobradinho — RA V

Ocorrência #00248

Não apresentar informações pessoais.

---

# 28. MODO CLUSTERS

Ao selecionar:

**Clusters**

agrupar automaticamente ocorrências próximas.

Exemplo:

28

54

103

Ao aumentar o zoom:

o cluster deve se decompor progressivamente em clusters menores e pontos individuais.

---

# 29. PAINEL DE RESUMO DA RA

Quando Sobradinho estiver selecionado:

mostrar painel:

### RESUMO — SOBRADINHO

Total de ocorrências

**1.248**

Variação

**+12,4%**

em relação ao período anterior

---

Principal natureza

**Roubo**

32,8% do total

---

Horário de maior incidência

**19h–23h**

37% das ocorrências

---

Dia da semana crítico

**Sábado**

18% das ocorrências

---

Naturezas em destaque

Gráfico donut:

Roubo
Furto
Lesão corporal
Ameaça
Outras

Todos os valores utilizados no protótipo são demonstrativos.

---

# 30. PAINEL ANALÍTICO COMPLEMENTAR

À direita do mapa incluir cards compactos.

### Variação no período

+12,4%

pequeno gráfico temporal.

---

### Indicadores rápidos

Horário crítico:

19h–23h

Dia crítico:

Sábado

---

### Sobre este mapa

Texto:

**O mapa de calor representa a densidade espacial das ocorrências registradas no período selecionado. Cores mais quentes indicam maior concentração de eventos.**

---

# 31. INTERAÇÕES

Implementar visualmente e, quando possível, funcionalmente:

* hover nas RAs;
* clique nas RAs;
* zoom;
* pan;
* fitBounds;
* tooltip;
* seleção por dropdown;
* filtros;
* alternância heatmap/pontos/clusters;
* reset da região;
* breadcrumb;
* atualização dos cards;
* atualização do ranking;
* atualização de gráficos;
* destaque visual da RA selecionada.

---

# 32. REGRA DE SINCRONIZAÇÃO

O mapa e os filtros precisam representar o mesmo estado.

Exemplo:

se o usuário clicar em Sobradinho:

Filtro Região:

**Sobradinho**

Breadcrumb:

**Distrito Federal > Sobradinho**

Mapa:

zoom em Sobradinho

Resumo:

dados somente de Sobradinho.

Se o usuário selecionar Ceilândia pelo dropdown:

tudo deve mudar para Ceilândia.

Nunca deixar o mapa mostrando uma RA e os indicadores mostrando outra.

---

# 33. MAPA-BASE

Utilizar mapa-base escuro e discreto.

O mapa-base deve servir apenas como contexto.

O elemento principal é a camada das RAs.

Evitar excesso de:

* nomes de estabelecimentos;
* publicidade;
* POIs irrelevantes;
* detalhes que concorram visualmente com as informações criminais.

---

# 34. CONTROLES DO MAPA

No canto direito:

* home;
* zoom +;
* zoom -;
* centralizar.

No canto inferior:

escala em quilômetros.

Adicionar legenda do heatmap quando necessário.

---

# 35. RESPONSIVIDADE

Priorizar desktop:

1920 × 1080

e notebooks aproximadamente:

1440 × 900.

A sidebar deve poder ser recolhida.

Em larguras menores:

* indicadores podem quebrar para segunda linha;
* painéis laterais podem ir para baixo do mapa;
* mapa deve permanecer como principal elemento visual.

---

# 36. COMPONENTIZAÇÃO

Criar componentes reutilizáveis para:

Sidebar
Header
FilterBar
Select
KpiCard
MapContainer
RALayer
MapTooltip
MapLegend
MapControls
HeatmapLayer
PointLayer
ClusterLayer
AnalyticsCard
RankingList
DonutChart
Breadcrumb

Evitar duplicação de componentes entre Dashboard e Mapa Criminal.

---

# 37. DADOS DO PROTÓTIPO

Utilizar dados fictícios apenas para fins visuais.

Separar claramente:

**dados geográficos reais**

das

**estatísticas demonstrativas**.

Os polígonos das RAs NÃO são fictícios.

Os números de criminalidade podem ser fictícios.

Criar pequena identificação:

**Dados demonstrativos para protótipo**

quando necessário.

---

# 38. ESTRUTURA SUGERIDA DOS DADOS DAS RAs

Cada feature deve possuir algo equivalente a:

`ra_codigo`

`ra_nome`

`ra_areakm2`

`geometry`

Além disso, o protótipo pode associar:

`occurrence_count`

`variation`

`most_common_crime`

Esses três últimos são dados simulados do protótipo.

---

# 39. ARQUITETURA DO MAPA

Preferir uma biblioteca web apropriada para dados geoespaciais, como MapLibre GL JS ou Leaflet.

O mapa deve aceitar GeoJSON.

O fluxo conceitual deverá ser:

GeoJSON oficial das RAs

→ renderização dos polígonos

→ associação dos dados criminais

→ choropleth

→ seleção da RA

→ fitBounds

→ renderização de pontos

→ geração do heatmap

→ geração dos clusters.

Não construir o mapa utilizando dezenas de elementos `div` posicionados manualmente.

Não utilizar uma imagem estática do mapa como solução final.

---

# 40. FIDELIDADE GEOGRÁFICA — CRITÉRIO DE ACEITAÇÃO

Antes de considerar o protótipo concluído, verificar:

* o contorno externo corresponde ao Distrito Federal;
* existem 36 RAs;
* 26 de Setembro está presente;
* Água Quente está presente;
* Arapoanga está presente;
* Arniqueira está presente;
* Sol Nascente e Pôr do Sol está presente;
* Sobradinho e Sobradinho II são áreas distintas;
* Riacho Fundo e Riacho Fundo II são áreas distintas;
* Lago Sul e Lago Norte são áreas distintas;
* SIA e SCIA/Estrutural são áreas distintas;
* o Lago Paranoá aparece adequadamente como elemento geográfico;
* áreas pequenas da região central não foram apagadas;
* nenhuma RA fictícia foi criada;
* os limites não foram redesenhados apenas para melhorar a estética.

Se houver conflito entre estética e fidelidade geográfica:

**a fidelidade geográfica deve vencer.**

---

# 41. NÃO FAZER

Não:

* criar mapa fictício;
* inventar polígonos;
* reduzir o DF para poucas regiões;
* utilizar mapa antigo com somente 33, 34 ou 35 RAs;
* esquecer 26 de Setembro;
* misturar RAs diferentes;
* criar bairros fictícios;
* usar divisões internas inexistentes;
* colocar pontos fora da RA correspondente;
* utilizar dados criminais fictícios como se fossem oficiais;
* sobrecarregar o mapa com textos;
* transformar o projeto em um dashboard genérico.

---

# 42. RESULTADO VISUAL ESPERADO

Quero duas telas extremamente profissionais e visualmente consistentes.

## Dashboard

Sensação:

**“Estou vendo rapidamente a situação criminal de todo o Distrito Federal.”**

Mapa grande do DF com todas as RAs reais.

Indicadores estratégicos.

Comparações.

Tendências.

---

## Mapa Criminal

Sensação:

**“Agora quero investigar geograficamente uma região específica.”**

Exemplo:

Distrito Federal

→ Sobradinho

→ Roubo

→ últimos 6 meses

→ 19h–23h

→ mapa de calor + pontos.

O mapa deve ser o elemento visual mais importante da aplicação.

---

# 43. PRIORIDADE FINAL

As prioridades são, nesta ordem:

1. fidelidade geográfica;
2. clareza das informações;
3. funcionamento das interações;
4. consistência visual;
5. estética.

Não sacrifique os limites reais das RAs para tornar o mapa mais bonito.

O resultado deve parecer um sistema real de análise criminal desenvolvido para uso profissional, e não apenas um conceito visual de dashboard.

Use o estilo visual das referências fornecidas para o SENTINELA, mas substitua qualquer mapa aproximado das referências pela geometria oficial e atual das Regiões Administrativas do Distrito Federal.
