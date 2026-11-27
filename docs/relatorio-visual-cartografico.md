# SENTINELA — reformulação visual de Calor, Pontos e Clusters

## Escopo

A alteração está concentrada no renderizador compartilhado `MapaDF`, usado pelo Dashboard e pelo Mapa Criminal, e nos parâmetros de renderização do calor. Não foram modificados o GeoJSON, coordenadas, registros, filtros, análises, permissões, componentes do Satélite ou layouts das demais telas.

O fundo cartográfico permanece azul-marinho mesmo quando a aplicação utiliza o tema claro. As variáveis de cor ficam em um CSS Module aplicado somente à raiz dos três modos analíticos; a renderização Satélite retorna antes dessa raiz e não recebe esses estilos. O uso legado de seleção de localização com `onClickPoint` mantém sua apresentação anterior.

## Calor

| Parâmetro | Anterior | Atual |
| --- | --- | --- |
| Raio de influência | 18 unidades da projeção SVG | 24 unidades |
| Sigma gaussiano | 6 unidades | 8 unidades |
| Truncamento do kernel | 3 sigmas | 3 sigmas |
| Passo da grade | 2 unidades | 2 unidades, preservado |
| Opacidade máxima | 0,76 | 0,88 |
| Resposta da opacidade | Linear: `t` | `t^0,6` |
| Interpolação das cores | Linear | Linear, preservada |
| Cores | Azul → verde → amarelo → laranja → vermelho | Preservadas |

O kernel continua sendo `exp(-distância² / (2 × sigma²))`, com contribuição unitária de cada registro. Não há peso por RA, por natureza ou por quantidade agregada. O aumento de um terço no sigma e no raio aproxima núcleos espacialmente próximos de forma moderada e amplia a leitura das áreas de influência.

A função de opacidade melhora a percepção dos valores baixos, mas não antecipa sua cor na escala: uma ocorrência isolada fica mais visível sem receber artificialmente a cor vermelha de um hotspot. A opacidade permanece limitada e a densidade zero continua totalmente transparente.

A intensidade é relativa ao pico da **base completa de referência**, recalculado com os mesmos parâmetros e preservado durante os filtros. Não se usa o maior valor de cada subconjunto para transformar automaticamente uma seleção esparsa em área crítica. Com a base demonstrativa atual, o novo pico de referência é aproximadamente 8,13635 nos dois mapas.

As contagens fixas por RA do modo Calor permanecem nas mesmas posições. Elas representam totais regionais; as manchas representam densidade espacial local. A máscara das RAs e o recorte do canvas permanecem intactos.

## Pontos

- Preenchimento neutro das RAs: `#11243a`, sobre fundo `#07111f`.
- Um círculo vermelho `#ef4444` por registro, opacidade 0,95, borda `#fecaca` com opacidade 0,65 e largura de 0,6 px sem escala.
- Raio nominal de 2,4 unidades SVG, com mínimo visual de 1,2 px em telas menores.
- Remoção dos três círculos decorativos de halo/brilho de cada ocorrência.
- Sem nomes ou quantitativos fixos de RA. As informações regionais continuam nos tooltips, e o tooltip de cada ocorrência mantém o conteúdo e os handlers existentes.

As posições `x/y` dos pontos são as mesmas da referência capturada antes da alteração; não foram criadas, ajustadas ou redistribuídas coordenadas.

## Clusters

- Mesma base neutra de Pontos e Calor.
- Sem nomes ou quantitativos fixos das RAs; somente a contagem de registros de cada agrupamento aparece no círculo.
- Um círculo azul `#2563eb`, opacidade 0,94, borda `#b4d1ff` de 1,1 px, sem halo externo.
- Raio nominal: `clamp(8 + 2,4 × √quantidade, 12, 27)` unidades SVG. Antes era `clamp(10 + 2,5 × √quantidade, 14, 32)`, mais um halo de 4 unidades.
- Em telas menores, o raio também respeita um mínimo de `6 + 0,35 × √quantidade` pixels de tela. Isso mantém o tamanho relacionado à quantidade e acomoda o texto.
- Texto branco centralizado, 11–12 unidades SVG, com mínimo efetivo de 9 px em tela.

O tamanho mínimo usa a escala efetiva do SVG, observada ao redimensionar e ao selecionar uma RA. Trata-se somente de renderização: centros, quantidade de clusters e contagens não são alterados.

O agrupamento continua usando a mesma grade de 80 unidades e o mesmo centro médio dos registros de cada célula. O código da função `buildClusters` foi preservado e conferido por hash. Os círculos são menores no enquadramento desktop e dispensam o halo, reduzindo sobreposição; em celulares, o mínimo de leitura tem prioridade. As legendas distinguem densidade, ocorrência individual e quantidade agrupada.

## Validação

Ambiente utilizado: Node 22.23.2, pnpm 10.34.3, Next.js 16.3.6 e Chrome headless.

- `pnpm typecheck`, `pnpm lint` e `pnpm build`: aprovados.
- `pnpm test`: 28 testes aprovados. A suíte cobre coordenadas válidas, contribuição unitária, concentração local, ausência de calor entre pontos suficientemente afastados, referência fixa após filtros, transparência do vazio, sequência das cores, limite de opacidade e visibilidade de uma ocorrência isolada sem classificá-la como hotspot.
- `node scripts/check-heatmap.mjs --baseline`: referência capturada antes da alteração.
- `node scripts/check-heatmap.mjs`: geometrias e enquadramentos comparados com a referência nos dois mapas e temas; posições individuais e centros dos clusters preservados; contagens corretas, ausência de rótulos fixos em Pontos/Clusters, fundo neutro, filtros, tooltips, seleção por teclado, navegação Dashboard → Mapa Criminal e enquadramento de RA verificados.
- Responsividade verificada em 820, 390 e 320 px nos dois temas, três modos e duas telas, incluindo legendas dentro do mapa e texto de clusters com mínimo de 9 px.
- A base integral mantém 790 ocorrências. O calor não apresentou pixels significativos fora do recorte geográfico (`outside: 0`); o pico da base completa permaneceu fixo durante os filtros.
- Hashes conferidos para os quatro arquivos do Satélite, Dashboard, Mapa Criminal, GeoJSON, projeção derivada, mocks, filtros, permissões e função de agrupamento: preservados.
- `node scripts/check-satellite.mjs`: integração existente executada para verificar os quatro modos, Satélite sem contadores, imagens reais, contornos, tooltips, filtros, zoom, movimentação, restauração, responsividade e tratamento de falhas.

As evidências locais ficam em `tmp/heatmap-evidence/` e `tmp/satellite-evidence/`, ignoradas pelo Git. O primeiro diretório contém capturas `before-*`, `after-*` e `responsive-*`, o snapshot anterior e a referência de hashes `cartography-preserved.json`. Os scripts usam um servidor local disponível; não iniciam outro automaticamente.

## Arquivos desta alteração

- `src/components/map/MapaDF.tsx`: base neutra, símbolos, legendas e tamanho mínimo em tela.
- `src/components/map/AnalyticMap.module.css`: identidade cartográfica isolada dos três modos.
- `src/components/map/heatmapDensity.ts`: raio, sigma e resposta de opacidade.
- `tests/heatmap-density.test.mjs`: verificação de visibilidade sem saturação artificial.
- `scripts/check-heatmap.mjs`: comparação de geometria/posições e validação do novo estilo, contagens, interações, responsividade e preservação do Satélite/dados.
- `docs/relatorio-visual-cartografico.md`: este relatório.

## Limitações

- Os parâmetros são uma calibração visual para a projeção e base fictícia atuais; não constituem um modelo estatístico operacional, taxa criminal por área ou avaliação de risco.
- A grade fixa pode produzir círculos próximos em células adjacentes. A alteração reduz halos e tamanhos nominais, mas não desloca centros nem muda agrupamentos para eliminar toda sobreposição.
- A visão geral de um celular é compacta; selecionar uma RA amplia o enquadramento. Nos modos SVG, os botões de zoom do Dashboard continuam ilustrativos e não existe expansão interativa dos clusters. Esses comportamentos preexistentes foram preservados.
- A validação visual foi feita no Chrome. Não foi realizada homologação em outros navegadores.

Não houve commit, push, alteração de dados ou publicação.
