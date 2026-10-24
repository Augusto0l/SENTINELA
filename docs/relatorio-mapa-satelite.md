# SENTINELA — quarta visualização: Satélite

## Escopo e estratégia

Foi acrescentado **Satélite** aos seletores de `/dashboard` e `/mapa-criminal`. O modo inicial continua sendo Calor. Cada tela mantém seu próprio estado de visualização e seus filtros; a navegação entre as telas segue o comportamento anterior.

Os modos Calor, Pontos e Clusters continuam usando `MapaDF` e seu mecanismo SVG/Canvas. Apenas Satélite carrega um componente Leaflet compartilhado, via `next/dynamic` com `ssr: false`. As páginas e os wrappers existentes não foram convertidos nem substituídos. Nenhuma dependência foi adicionada.

O Dashboard continua enviando seus quantitativos demonstrativos. No Mapa Criminal, Satélite recebe o mesmo `occurrencesByRa` produzido pelos filtros existentes; não recalcula análises nem redistribui ocorrências. Os tooltips mostram nome, código existente e quantidade da RA. O clique mantém a navegação do Dashboard para o Mapa Criminal e a seleção de RA no Mapa Criminal. Enter e Espaço também selecionam regiões.

## Imagens e condições de utilização

Provedor: **EOX IT Services GmbH — EOxCloudless**, mosaico Sentinel-2 de 2024, camada `s2cloudless-2024_3857`.

Endpoint HTTPS público utilizado:

```text
https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg
```

A camada, a matriz `g` e a ordem `zoom/linha/coluna` foram conferidas no [WMTS GetCapabilities](https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml). Tiles reais da região foram carregados com HTTP 200 no Node e no Chrome.

O uso neste protótipo acadêmico não comercial é permitido sob **CC BY-NC-SA 4.0**, com atribuição visível e link para a licença. Os créditos ficam em uma faixa própria do mapa, inclusive em celulares, para não sobrepor os controles:

> EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)

Não há chave, conta, contratação, cobrança configurada ou variável de ambiente necessária. O navegador acessa diretamente os tiles públicos; não há proxy ou segredo no frontend. A integração usa HTTPS e é compatível com o build Next.js e futura hospedagem na Vercel, sem publicar o projeto.

O provedor permite integração direta para uso não comercial. Seus endpoints públicos não têm SLA nem limite numérico publicado e podem reduzir ou bloquear picos de tráfego. O carregamento fica restrito à visualização ativa, com `updateWhenIdle`, buffer reduzido e cache HTTP normal do navegador, sem download em massa ou pré-carregamento de regiões.

**A licença acadêmica não autoriza presumir uso comercial ou operacional institucional gratuito.** A EOX informa que produção comercial com imagens de 2018 em diante exige outra modalidade de licença/hospedagem. Nenhum serviço dessa natureza foi contratado.

Fontes primárias consultadas:

- [Condições e atribuição](https://cloudless.eox.at/documentation/license).
- [Integração direta e licença não comercial](https://cloudless.eox.at/license-non-commercial).
- [Serviços, projeções e matrizes](https://cloudless.eox.at/documentation/usage).
- [Tráfego, disponibilidade e restrições comerciais](https://cloudless.eox.at/documentation/faq).

## Alinhamento geográfico

- `public/data/ras-df.geojson` permanece intacto e é carregado diretamente como fonte dos polígonos. Não foram alterados vértices, nomes ou identificadores.
- O GeoJSON usa coordenadas geográficas na ordem longitude/latitude. `L.geoJSON` faz a conversão para o sistema do Leaflet, cujo CRS padrão é EPSG:3857, correspondente à camada WMTS escolhida.
- O mecanismo SVG existente usa uma projeção local aproximadamente equiretangular, com correção de longitude pela latitude. Seus caminhos SVG não são usados como polígonos sobre os tiles, evitando deslocamento por incompatibilidade de projeção. Essa projeção continua intacta nos três modos anteriores.
- As âncoras dos rótulos existentes são convertidas de volta para latitude/longitude pela inversa de sua projeção original. Isso preserva sua posição geográfica sem modificar coordenadas de ocorrências ou polígonos.
- Uma máscara não interativa escurece a área externa ao DF usando cópias dos anéis do próprio GeoJSON, inclusive anéis interiores e MultiPolygon. Contornos claros e preenchimento quase transparente preservam a leitura das imagens.
- O enquadramento usa os limites reais dos polígonos. Zoom, arraste, escala métrica e restauração são controles reais no modo Satélite. Os controles e a escala ilustrativos do Dashboard ficam ocultos somente nesse modo.
- Rótulos em colisão ou fora da área visível são ocultados visualmente, sem somar ou alterar quantitativos. Eles são reavaliados ao mover, ampliar ou redimensionar o mapa. Todas as RAs continuam disponíveis pelos polígonos e tooltips, inclusive quando um rótulo não cabe na visão geral.

A verificação de navegador projeta os vértices do GeoJSON pela fórmula Web Mercator e os compara às posições reais dos tiles e aos limites SVG renderizados. A diferença observada foi de aproximadamente 1,73 px no Dashboard e 1,50 px no Mapa Criminal, abaixo da tolerância de 3 px para arredondamento e simplificação visual do Leaflet. Isso verifica coerência de projeção na interface, não precisão topográfica em campo.

## Falhas e ciclo de vida

- Erros de tile, incluindo bloqueio, autenticação ou limite do provedor, exibem aviso discreto e botão **Tentar novamente**.
- A ausência de conexão e um carregamento superior a 15 segundos também recebem indicação explícita.
- Falha de carregamento do GeoJSON é informada sem montar um mapa com geometrias fictícias.
- Um error boundary isola falhas do componente/chunk de Satélite. Os seletores externos continuam permitindo retorno aos três modos existentes.
- Não há substituição silenciosa por mapa convencional ou imagem simulada.
- Fetch do GeoJSON, temporizadores, ResizeObserver, eventos de rede, eventos de rótulos e listeners de teclado possuem limpeza. React-Leaflet remove as instâncias e camadas ao desmontar o modo.

## Arquivos desta implementação

Modificados:

- `src/components/map/MapaDF.tsx`: novo modo e carregamento isolado.
- `src/features/Dashboard.tsx`: quarta opção, adaptação responsiva do seletor e ocultação dos controles ilustrativos somente em Satélite.
- `src/features/CrimeMap.tsx`: quarta opção e adaptação responsiva do seletor.
- `scripts/check-heatmap.mjs`: exclusão do Dashboard da antiga exigência de hash de arquivo imutável, pois seu seletor mudou. As comparações dos SVGs anteriores e os hashes de geometria, GeoJSON, mocks e filtros continuam sendo verificados.

Criados:

- `src/components/map/SatelliteMap.tsx`: mapa Leaflet compartilhado.
- `src/components/map/SatelliteMap.module.css`: estilos restritos à nova visualização.
- `src/components/map/SatelliteBoundary.tsx`: isolamento de falhas de carregamento/renderização.
- `src/components/map/satelliteData.ts`: configuração pública e utilitários geográficos/visuais.
- `tests/satellite-data.test.mjs`: seleção geográfica, âncoras, máscaras e colisões de rótulos.
- `scripts/check-satellite.mjs`: integração de navegador com imagens reais e simulação de falhas.
- `docs/relatorio-mapa-satelite.md`: este relatório.

As alterações preexistentes de sidebar/header foram preservadas. Cadastro, edição, inativação, importação, usuários, permissões, dados demonstrativos, regras de análise, GeoJSON e documentação das sprints anteriores não foram modificados por esta tarefa. Não houve commit, push, PR ou publicação.

## Validação

Ambiente: Node 22.23.2, pnpm 10.34.3, Next.js 16.3.6 e Chrome headless.

- `pnpm typecheck`: aprovado.
- `pnpm lint`: aprovado.
- `pnpm test`: 27 testes aprovados, incluindo os testes existentes de densidade do calor e os novos testes do Satélite.
- `pnpm build`: aprovado; rotas e wrappers SSR existentes preservados.
- `node scripts/check-heatmap.mjs --baseline`: referência dos três modos anteriores registrada antes da implementação.
- `node scripts/check-heatmap.mjs`: comparação aprovada nos dois mapas e temas, incluindo geometria, labels, Pontos/Clusters, recorte do calor, referência fixa de intensidade, filtros, resultado vazio, seleção por teclado e redimensionamento. Os hashes dos dados/geometrias preservados também passaram.
- `node scripts/check-satellite.mjs`: validação da integração em Chrome, com imagens reais e cache de respostas reais durante o teste, sem imagens sintéticas. Abrange os quatro modos, 37 RAs, quantitativos, alinhamento, tooltips, zoom, arraste, restauração, filtros e independência das telas; verifica desktop/tablet/celular em 1440, 820, 390 e 320 px, além de falhas 403/429/503, offline, nova tentativa, falha do GeoJSON e falha do chunk.

Evidências locais ignoradas pelo Git: `tmp/satellite-evidence/` (capturas e `report.json`) e `tmp/heatmap-evidence/` (comparação dos modos anteriores). Para repetir os testes de navegador, inicie um único servidor local e use `SENTINELA_TEST_URL` caso a URL seja diferente de `http://127.0.0.1:3000`.

## Limitações

- São mosaicos de 2024, não imagens em tempo real; resolução e qualidade variam. Zoom além do nível nativo configurado amplia a imagem sem criar detalhe novo.
- A disponibilidade depende da internet e do serviço público da EOX, sem SLA.
- Na visão geral de celulares, regiões densas exigem zoom ou tooltip para exibir todos os quantitativos sem sobreposição.
- A compatibilidade dos códigos segue o catálogo existente, sem renumerar divergências preexistentes entre catálogo demonstrativo e fonte geográfica.
- A validação visual automatizada foi executada no Chrome, sem homologação em outros navegadores ou precisão cartográfica de campo.
