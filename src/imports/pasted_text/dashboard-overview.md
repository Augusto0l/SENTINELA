Use a imagem anexada como referência VISUAL E FUNCIONAL para a tela Dashboard / Visão Geral do DF.

IMPORTANTE:

A imagem anexada NÃO é referência para a geometria do Distrito Federal.

O mapa real das 37 Regiões Administrativas já está corretamente implementado no projeto utilizando:

`src/components/map/MapaDF.tsx`

`src/components/map/raMapData.ts`

Esses arquivos são a fonte definitiva das geometrias.

NÃO recrie as formas das RAs da imagem.

NÃO redesenhe os limites.

NÃO interprete GeoJSON novamente.

NÃO use d3-geo.

NÃO use Leaflet.

NÃO altere os paths existentes em `raMapData.ts`.

A regra é:

**Imagem anexada = referência de design e funcionalidades.**

**Mapa atual do projeto = referência geográfica.**

---

# 1. DASHBOARD

Quero que o Dashboard fique visualmente o mais próximo possível da imagem anexada.

Mantenha:

* sidebar atual;
* header;
* busca global;
* usuário Pedro Augusto;
* título “Visão Geral do DF”;
* identidade visual dark do SENTINELA.

Remova completamente a barra de filtros do Dashboard.

Não devem existir aqui:

* Período;
* Região;
* Natureza;
* Horário;
* Aplicar filtros;
* Limpar filtros.

Esses filtros serão exclusivos da tela Mapa Criminal.

---

# 2. CARDS SUPERIORES

Manter a mesma estrutura visual da imagem com cinco cards:

### OCORRÊNCIAS NO PERÍODO

Total geral das ocorrências.

### RA COM MAIOR INCIDÊNCIA

Nome da RA e quantidade.

### MAIOR CRESCIMENTO

RA com maior crescimento percentual.

### MAIOR REDUÇÃO

RA com maior redução percentual.

### NATUREZA EM DESTAQUE

Natureza criminal predominante.

Não alterar a estrutura geral da tela.

---

# 3. MAPA PRINCIPAL

No card:

**Ocorrências por Região Administrativa**

usar exclusivamente:

`MapaDF.tsx`

e

`raMapData.ts`

O mapa deve continuar mostrando as 37 geometrias reais já existentes.

O mapa deve possuir as mesmas funcionalidades apresentadas visualmente na imagem:

### Mapa de calor

### Pontos

### Clusters

Criar estado:

```ts
type MapMode = "heat" | "points" | "clusters";
```

Modo inicial:

```ts
"heat"
```

Os três botões devem realmente funcionar.

---

# 4. BASE ÚNICA DE OCORRÊNCIAS DEMONSTRATIVAS

Criar uma base demonstrativa de ocorrências para o protótipo.

IMPORTANTE:

Os registros são fictícios e devem ser utilizados somente para demonstração das funcionalidades.

Criar algo como:

`src/data/mockOccurrences.ts`

ou

`src/data/mockOccurrenceGenerator.ts`

Cada ocorrência deve possuir:

```ts
{
  id: string;
  raCode: string;
  raName: string;
  natureza: string;
  data: string;
  horario: string;
  latitude: number;
  longitude: number;
  x: number;
  y: number;
  local: string;
}
```

Exemplo:

```ts
{
  id: "DEMO-000001",
  raCode: "RA-V",
  raName: "Sobradinho",
  natureza: "Roubo",
  data: "18/08/2026",
  horario: "21:37",
  latitude: -15.65,
  longitude: -47.79,
  x: 742.4,
  y: 238.1,
  local: "Local demonstrativo"
}
```

Nunca apresentar esses registros como ocorrências policiais reais.

Adicionar identificação discreta:

**Dados demonstrativos**

quando necessário.

---

# 5. DISTRIBUIÇÃO DAS OCORRÊNCIAS

As ocorrências fictícias devem estar geograficamente associadas à RA correta.

NÃO coloque pontos aleatoriamente fora dos limites das Regiões Administrativas.

Como `raMapData.ts` já possui:

* `path`;
* `bounds`;
* `viewBox`;

utilize os próprios paths SVG para validar a posição.

Para cada RA:

1. gere uma posição x/y aleatória dentro de `ra.bounds`;
2. crie `Path2D` utilizando `ra.path`;
3. valide a posição com Canvas:

```ts
const path = new Path2D(ra.path);

ctx.isPointInPath(
  path,
  x,
  y,
  "evenodd"
);
```

4. somente aceite o ponto quando estiver dentro da RA.

Assim nenhuma ocorrência demonstrativa ficará fora do polígono correspondente.

Use geração determinística com seed fixa para que os pontos não mudem toda vez que a página for recarregada.

---

# 6. QUANTIDADE POR RA

Utilize `occurrencesByRa` como referência para a distribuição.

A quantidade de ocorrências deve ser proporcional aos indicadores já existentes.

Regiões com maior incidência devem possuir maior concentração de ocorrências.

Exemplo:

Ceilândia deve possuir mais ocorrências que uma RA de baixa incidência.

Não precisa renderizar milhares de elementos SVG simultaneamente se isso prejudicar desempenho.

A base pode manter todas as ocorrências demonstrativas internamente e as visualizações podem utilizar Canvas ou agregação quando necessário.

---

# 7. NATUREZAS

Distribuir as ocorrências demonstrativas entre naturezas como:

* Furto;
* Roubo;
* Lesão corporal;
* Ameaça;
* Estelionato;
* Dano;
* Tráfico;
* Violência doméstica;
* Tentativa de homicídio;
* Homicídio;
* outras naturezas já utilizadas pelo protótipo.

Utilizar distribuição ponderada.

Não fazer todas as RAs possuírem exatamente a mesma distribuição.

---

# 8. DATA E HORÁRIO

Gerar datas fictícias dentro do período demonstrativo utilizado no Dashboard.

Gerar horários realistas entre:

00:00 e 23:59.

Permitir que posteriormente o Mapa Criminal filtre essas ocorrências por:

* período;
* natureza;
* RA;
* horário.

---

# 9. LOCAL

Como os locais individuais não são dados oficiais neste protótipo, utilizar identificação explicitamente demonstrativa.

Exemplos:

“Local demonstrativo 001”

“Local demonstrativo 002”

Não inventar endereço policial real.

---

# 10. MODO PONTOS

Quando o usuário clicar:

**Pontos**

mostrar as ocorrências individuais sobre o mapa.

Cada ponto corresponde a UM registro da base `mockOccurrences`.

Portanto:

**ponto do mapa = ocorrência da aba Ocorrências.**

Ao passar o mouse ou clicar em um ponto mostrar:

Natureza
RA
Data
Horário
ID da ocorrência

Exemplo:

**Roubo**

Sobradinho

18/08/2026 — 21:37

DEMO-000248

---

# 11. MODO MAPA DE CALOR

Quando o usuário selecionar:

**Mapa de calor**

utilizar as coordenadas x/y das MESMAS ocorrências.

O mapa de calor deve representar densidade espacial real dos pontos demonstrativos.

Não criar manchas decorativas aleatórias.

Onde existirem muitos pontos próximos:

vermelho / laranja.

Onde houver menor densidade:

azul / amarelo.

O heatmap deve ser uma visualização calculada a partir de `mockOccurrences`.

Pode ser implementado utilizando Canvas sobreposto ao SVG para melhor desempenho.

Não alterar os polígonos das RAs.

---

# 12. MODO CLUSTERS

Quando selecionar:

**Clusters**

agrupar visualmente ocorrências próximas.

Exemplo:

```text
28
```

```text
64
```

```text
103
```

Os números representam quantidade de ocorrências agrupadas.

Os clusters também devem ser calculados sobre `mockOccurrences`.

---

# 13. TOOLTIP DAS RAs

Ao passar o mouse sobre qualquer RA:

destacar discretamente o polígono e mostrar:

Nome da RA

Código

Quantidade de ocorrências

Exemplo:

**Ceilândia**

RA IX

1.842 ocorrências

Esse comportamento deve funcionar independentemente do modo:

Mapa de calor
Pontos
Clusters

---

# 14. CLIQUE NA RA

No Dashboard:

ao clicar em uma RA, navegar para:

**Mapa Criminal**

passando o código da RA.

Exemplo:

Clique em Sobradinho

→ `RA-V`

→ abrir Mapa Criminal

→ Sobradinho selecionado.

---

# 15. ABA OCORRÊNCIAS

Atualizar a página:

**Ocorrências**

para utilizar exatamente `mockOccurrences`.

Criar tabela contendo:

ID

Data

Horário

Natureza

Região Administrativa

Local

Exemplo:

| ID          | Data       | Horário | Natureza | RA         | Local               |
| ----------- | ---------- | ------- | -------- | ---------- | ------------------- |
| DEMO-000248 | 18/08/2026 | 21:37   | Roubo    | Sobradinho | Local demonstrativo |

Adicionar paginação.

Não renderizar milhares de registros de uma vez.

Sugestão:

25 registros por página.

---

# 16. CORRELAÇÃO OBRIGATÓRIA

Esta regra é fundamental:

A base deve ser única.

Não criar dados separados para o mapa e para a tabela.

Se existir:

`DEMO-000248`

na tabela de Ocorrências,

deve existir exatamente a mesma ocorrência na camada de Pontos.

A mesma coordenada também deve contribuir para:

* mapa de calor;
* clusters;
* estatísticas.

Arquitetura:

```text
mockOccurrences
       │
       ├── Dashboard
       │     ├── Pontos
       │     ├── Heatmap
       │     └── Clusters
       │
       ├── Mapa Criminal
       │
       └── Ocorrências
```

Não duplicar bases.

---

# 17. PAINEL DIREITO DO DASHBOARD

Manter visualmente como na imagem.

### Ranking das RAs por ocorrências

Mostrar Top 5.

### Natureza criminal mais frequente

Gráfico donut.

### Variação geral do período

Percentual e sparkline.

### Como interpretar o mapa?

Texto explicativo.

---

# 18. LEGENDA

No canto inferior esquerdo do mapa:

**Menor incidência**

gradiente:

azul → amarelo → laranja → vermelho

**Maior incidência**

---

# 19. NÃO ALTERAR

Não alterar:

`raMapData.ts`

Não alterar os paths das RAs.

Não recriar o mapa.

Não voltar para GeoJSON.

Não utilizar mapas aproximados.

Não alterar sidebar.

Não alterar header.

Não alterar a identidade visual.

Não redesenhar outras telas sem necessidade.

---

# 20. RESULTADO ESPERADO

A tela deverá ficar visualmente muito próxima da imagem anexada.

Porém o mapa deverá continuar utilizando as 37 RAs reais já existentes no projeto.

As funcionalidades devem ser reais dentro do protótipo:

**Mapa de calor**
→ calculado pelas ocorrências demonstrativas.

**Pontos**
→ cada ponto corresponde a uma ocorrência.

**Clusters**
→ agrupamento dessas mesmas ocorrências.

**Ocorrências**
→ tabela usando a mesma base.

**Tooltip da RA**
→ quantidade de ocorrências.

**Clique na RA**
→ abre Mapa Criminal com a região selecionada.

Não utilize a geometria da imagem anexada.

Preserve o mapa real já implementado.
