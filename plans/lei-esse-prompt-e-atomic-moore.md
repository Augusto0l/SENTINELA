# Plano: SENTINELA — Análise e Monitoramento Criminal (DF)

## Context

O usuário quer um protótipo web profissional e funcional de um sistema de análise e monitoramento criminal para o Distrito Federal. O sistema deve ter duas telas principais (Dashboard e Mapa Criminal) com mapa real das 36 Regiões Administrativas do DF, identidade visual escura e institucional, e interações completas de drill-down por RA.

O `App.tsx` atual está vazio, então construiremos tudo do zero dentro da estrutura React + Vite + Tailwind CSS v4 existente.

---

## Arquitetura de Dependências

Instalar:
- `leaflet` + `react-leaflet` — mapa interativo com suporte a GeoJSON
- `@types/leaflet` — tipos TypeScript
- `leaflet.heat` + `@types/leaflet.heat` (ou custom) — heatmap
- `leaflet.markercluster` + `@types/leaflet.markercluster` — clusters
- `recharts` — gráfico donut e sparkline

---

## Dado Geográfico (GeoJSON das RAs)

Estratégia em camadas:
1. **Fetch runtime** da API oficial do Geoportal/IDE-DF (WFS GeoJSON)
2. **Fallback** para `/data/ras-df.geojson` local
3. Se ambos falharem, exibir instruções de setup

URL primária a tentar:
`https://gisws.mapas.df.gov.br/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=IDE_BCIM_RA_POLIGONO_MAPA&outputFormat=application/json`

URL alternativa (SINESP/dados.gov.br):
`https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-53-mun.json`

Criar `src/data/geoLoader.ts` responsável pelo fetch com fallback e normalização dos campos (`ra_codigo`, `ra_nome`, `geometry`).

---

## Dados Mock de Ocorrências

Criar `src/data/mockData.ts` com:
- 36 objetos RA com `occurrence_count`, `variation`, `most_common_crime`
- Array de ~200 ocorrências com `id`, `lat`, `lng`, `ra_nome`, `natureza`, `data`, `horario` — coordenadas dentro das bounding boxes aproximadas de cada RA

---

## Estrutura de Componentes

```
src/
  App.tsx                    — estado global, navegação entre telas
  index.css                  — tokens de cor, Inter font, leaflet CSS import
  components/
    Sidebar.tsx              — logo escudo, nav groups, user profile
    Header.tsx               — busca, notificações, avatar
    FilterBar.tsx            — período, região (36 RAs), natureza, horário, botões
    KpiCard.tsx              — card de indicador com ícone, número, variação
    Breadcrumb.tsx           — "Distrito Federal > RA" com botão voltar
    RankingList.tsx          — lista ordenada de RAs
    DonutChart.tsx           — recharts PieChart com furo central
    AnalyticsCard.tsx        — card analítico compacto (sparkline, indicador)
    map/
      MapWrapper.tsx         — MapContainer do react-leaflet com dark tile
      RALayer.tsx            — GeoJSON choropleth com hover/click
      HeatmapLayer.tsx       — leaflet.heat plugin wrapper
      PointLayer.tsx         — marcadores individuais com popup
      ClusterLayer.tsx       — leaflet.markercluster wrapper
      MapLegend.tsx          — legenda da escala choropleth/heatmap
      MapControls.tsx        — botões home, zoom+, zoom-, centralizar
      MapTooltip.tsx         — tooltip custom de RA (nome, ocorrências, variação)
  pages/
    Dashboard.tsx            — tela 1: KPIs + mapa choropleth + painel lateral
    CrimeMap.tsx             — tela 2: mapa interativo detalhado + filtros + painel RA
```

---

## Identidade Visual (tokens em `index.css`)

```css
--bg-primary: #080f1a       /* azul-marinho quase preto */
--bg-sidebar: #0d1626       /* ligeiramente mais claro */
--bg-card: #111d2e          /* cards */
--color-primary: #2563eb    /* azul vivo */
--color-success: #22c55e    /* verde */
--color-warning: #f97316    /* laranja */
--color-danger: #ef4444     /* vermelho */
--text-primary: #f1f5f9     /* branco */
--text-secondary: #94a3b8   /* azul acinzentado */
--border: #1e3a5f           /* borda discreta */
```

Fonte: Inter (Google Fonts via `@import` no topo de `index.css`).

Tailwind v4 CSS custom properties mapeadas com `@theme`.

---

## Tela 1 — Dashboard

Layout: `flex h-screen`
- Sidebar fixa (240px, collapsível)
- Área principal: header + scroll vertical
  - FilterBar horizontal
  - 5 KpiCards em linha
  - Linha inferior: MapWrapper (flex-1) + painel lateral (320px)
    - Painel lateral: RankingList + DonutChart + AnalyticsCard variação

Mapa Dashboard:
- Tile escuro (CartoDB Dark Matter)
- RALayer com choropleth por `occurrence_count`
- Hover → tooltip
- Click → navegar para CrimeMap com RA pré-selecionada

---

## Tela 2 — Mapa Criminal

Layout similar, mapa ocupa maior área (full height menos header e filtros)
- FilterBar: período, natureza, região (dropdown 36 RAs), horário, dia da semana
- Breadcrumb visível quando RA selecionada
- Toggle: Mapa de calor / Pontos / Clusters
- Painel direito: Resumo RA (total, variação, natureza, horário crítico, dia crítico, donut)

Comportamento de seleção:
- Click no mapa OU seleção no dropdown → sincronia total
- `fitBounds` no polígono da RA
- Outras RAs ficam com opacity 0.2
- Indicadores recalculados para a RA selecionada

---

## Arquivos Críticos a Criar/Modificar

- `src/index.css` — tokens, Inter import, leaflet CSS
- `src/App.tsx` — estado de navegação, estado da RA selecionada, props drilling
- Todos os componentes listados acima
- `src/data/mockData.ts`
- `src/data/geoLoader.ts`
- `public/data/ras-df.geojson` — placeholder para o arquivo real (pode ser vazio com instrução)

---

## Verificação

1. App carrega sem erros no preview
2. Mapa renderiza com polígonos das RAs do DF (via fetch ou fallback)
3. Hover exibe tooltip com dados da RA
4. Click em RA no Dashboard navega para Mapa Criminal com RA selecionada
5. No Mapa Criminal, selecionar RA (mapa ou dropdown) faz zoom + sincronia
6. Toggles heatmap/pontos/clusters funcionam
7. Breadcrumb e botão "Voltar" funcionam
8. Sidebar pode ser recolhida
9. Layout responsivo (painel lateral vai para baixo em telas menores)
