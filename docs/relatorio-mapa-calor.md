# Correção do mapa de calor — 14/10/2026

## Escopo e arquivos

O aprimoramento foi aplicado ao modo Calor do componente compartilhado por Dashboard e Mapa Criminal. O seletor de localização de Nova Ocorrência mantém sua aparência anterior. As alterações anteriores de tema presentes no workspace foram preservadas.

- `src/components/map/MapaDF.tsx`: preenchimento neutro, integração da densidade, recorte e ordenação das camadas; legenda de densidade apenas no modo Calor.
- `src/components/map/heatmapDensity.ts` (novo): validação/projeção das coordenadas, campo de densidade e escala contínua.
- `src/components/map/heatmapCanvas.ts` (novo): rasterização alinhada ao SVG e recorte usando os caminhos existentes.
- `src/features/CrimeMap.tsx`: uma propriedade adicional fornece a base completa como referência fixa de intensidade; os filtros e seus dados permanecem iguais.
- `src/index.css`: variáveis de cor específicas da base geográfica do heatmap nos temas claro e escuro.
- `tests/heatmap-density.test.mjs` (novo): testes de coordenadas, concentração, filtros, transparência e cores.
- `scripts/check-heatmap.mjs` (novo): validação em Chrome; aceita `--baseline` para capturar uma referência antes de futuras alterações.
- `docs/relatorio-mapa-calor.md`: este relatório.

## Causa e correção

A implementação anterior combinava preenchimento das RAs por contagem com dois gradientes coloridos por ocorrência. Cada ocorrência recebia um centro vermelho, independentemente da concentração, e um halo amplo: raio baseado em `scale × 52`, limitado entre 28 e 72 pixels, além de uma segunda influência com raio 1,4 vezes maior. A sobreposição por composição de cores e `mixBlendMode: screen` produzia saturação e manchas extensas. O canvas ficava acima dos nomes e limites, sem recorte nos polígonos.

O novo campo soma kernels gaussianos de contribuição unitária: registros próximos aumentam a densidade, sem pesos por natureza, RA ou quantidade regional. O raio é 18 unidades da projeção SVG existente, com sigma 6 e corte a três desvios padrão. A grade usa passo de 2 unidades e interpolação bilinear na renderização. Não há halos adicionais ou desfoque CSS.

A intensidade é dividida pelo pico de densidade da base completa, preservado ao filtrar, selecionar uma RA ou redimensionar. Na base fictícia observada, o pico é aproximadamente 5,515 contribuições gaussianas sobrepostas. Um filtro com poucos registros não é renormalizado automaticamente para vermelho. A opacidade aumenta linearmente com a intensidade até 68%; densidade zero é transparente.

A escala contínua passa por azul, verde, amarelo, laranja e vermelho. As RAs têm um único preenchimento neutro, inclusive quando selecionadas; a interação continua indicada pelo contorno. Nomes e limites ficam acima do calor, nas coordenadas originais. Pontos e Clusters continuam com o preenchimento e comportamento anteriores.

## Coordenadas e geometria

O calor usa exclusivamente `longitude` e `latitude` dos registros recebidos, projetadas por `projectLonLat`, sem alterar essa função. Coordenadas não finitas, fora dos intervalos geográficos ou fora dos polígonos existentes são descartadas somente da camada de calor. Não há fallback para `x/y`, centroides, ruído, sorteio ou novos pontos na visualização. Os indicadores e a base não são modificados por essa validação.

Os 790 registros da base carregada no navegador foram aceitos. Suas coordenadas são fictícias, geradas pelo mock já existente; não representam endereços reais nem precisão operacional. O gerador e suas coordenadas foram mantidos integralmente.

O canvas fica dentro de um `foreignObject` do SVG, antes dos contornos e nomes. A rasterização usa `getScreenCTM`, a posição real do canvas e a resolução do dispositivo. O recorte reaproveita exatamente os caminhos atuais, com regra `evenodd`, preservando os vazios dos polígonos. A mudança de viewBox por seleção de RA e o ResizeObserver atualizam a renderização sem alterar a projeção.

`public/data/ras-df.geojson`, `src/components/map/raMapData.ts`, `src/data/mockOccurrences.ts`, `src/data/mockData.ts` e `src/data/demoAnalytics.ts` permaneceram sem diff. Coordenadas, limites, polígonos, posicionamento das RAs, projeção, quantitativos e indicadores não foram editados. Dashboard não recebeu alterações de código nesta tarefa.

## Validação

- TypeScript e ESLint aprovados.
- Build Next.js aprovado, com geração das rotas existentes.
- Nove testes Node aprovados: quatro existentes e cinco novos.
- PostCSS/Tailwind sem avisos; verificações de rotas/imports e contratos aprovadas.
- Comparação estrutural antes/depois em Dashboard e Mapa Criminal, nos dois temas: viewBox, caminhos, posições dos nomes e tamanho do mapa preservados. Pontos e Clusters mantiveram os mesmos atributos dos polígonos, rótulos e círculos.
- Navegador: preenchimento uniforme no Calor; 790 coordenadas aceitas; nenhuma amostra significativa de calor fora dos limites; referência de intensidade idêntica entre telas e temas.
- Filtros de natureza e RA reduziram os pontos e a intensidade sem alterar o pico de referência. Seleção de RA e redimensionamento para 768 × 1024 mantiveram a geometria e o recorte.
- Filtros combinados de período/horário conservaram a correspondência entre pontos de calor e contagens exibidas. O resultado vazio deixou o canvas totalmente transparente. Seleção de RA por Enter e totais dos modos Pontos/Clusters também foram aprovados.
- Capturas atuais disponíveis localmente em `tmp/heatmap-evidence/`; reproduzíveis com um servidor disponível e `node scripts/check-heatmap.mjs`.

## Limitações

Os controles de zoom/localização do Dashboard já são ilustrativos e continuam assim. A validação de ampliação utilizou a mudança de viewBox pela seleção de RA, além do redimensionamento. Não foram adicionados controles ou comportamentos de navegação.

A escala é relativa à concentração da base fictícia completa; não é uma taxa por população ou risco criminal. O kernel é uma suavização visual dos pontos existentes, não uma inferência de ocorrências em outras posições. A inspeção visual foi feita em Chrome, sem homologação em todos os navegadores.

As verificações usaram Node 22 e as ferramentas instaladas, diretamente pelos comandos equivalentes dos scripts do projeto, sem instalar bibliotecas nem alterar o lockfile. Nenhuma publicação, commit ou push foi realizado. O servidor que já estava disponível foi reutilizado.
