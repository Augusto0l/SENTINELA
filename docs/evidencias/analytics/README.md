# Evidências — Sprint 3, Etapa 2

Validação local em 28/10/2026, sobre a branch `integracao-pedro`, base `7451b44`. Workspace inicialmente limpo. Não houve commit, push ou publicação. Resultados dizem respeito à demonstração com dados fictícios, sem backend/persistência.

## Verificações técnicas

Com Node 22.23.2 e pnpm 10.34.3 (invocado por `corepack pnpm@10.34.3`):

| Comando | Resultado |
| --- | --- |
| `pnpm typecheck` | Aprovado, sem erros |
| `pnpm lint` | Aprovado, zero avisos |
| `pnpm test` | 62 aprovados, zero falhas/ignorados; 11 novos testes analíticos |
| `pnpm build` | Aprovado, todas as rotas geradas; ID em `build-id.txt` |
| `git diff --check` | Aprovado, sem erro de whitespace |
| `node scripts/check-analytics.mjs` | Aprovado; [resultado](browser-results.json) |
| `node scripts/check-satellite.mjs` | Aprovado; [relatório](satellite-report.json) |

A tentativa inicial de build dentro do sandbox compilou e parou com `spawn EPERM`; o build completo passou fora dessa restrição, sem alterar política do Windows ou configuração de SWC. O runner Node e o Chrome também foram executados fora do bloqueio de subprocessos.

Os testes cobrem intervalo válido, invertido/incompleto, limites inicial/final, período vazio, limpeza, filtros combinados, conservação de contagens, múltiplas naturezas, navegação e UTC/São Paulo/Nova York/Kiritimati. A suíte inteira inclui importação e regressões anteriores de mapas, satélite, geometria e rótulos.

## Navegador

Chrome headless com build de produção local em `http://127.0.0.1:3000`. As duas telas foram verificadas em claro/escuro e larguras 1366, 768, 390 e 320 px. Formulários sem overflow horizontal, datas legíveis, rótulos associados, erro acessível, foco visível e aplicação com Enter. O Mapa Criminal permite rolar o conteúdo em celulares mesmo com as datas expandidas.

Base restaurada: **790 ocorrências**. Sete dias: **14** nas duas telas. Combinação de período completo + Plano Piloto + Furto + 18h–24h: **6**, preservadas ao navegar do Dashboard ao Mapa e na camada Satélite. A série mensal soma o total filtrado. Intervalos inválidos mantêm o último recorte; URL inicial inválida orienta limpar os filtros e não amplia os dados. Intervalos sem registros exibem zero e mensagem clara.

A geometria antes/depois de filtrar e limpar foi comparada. Referência de pico de calor preservada: `8.136348724365234`. O roteiro de Satélite utilizou **54 tiles reais**, verificou os quatro modos, 37 RAs, contagens, filtros, seleção por teclado, zoom, arraste, restauração e falhas 403/429/503/offline/GeoJSON/componente. A rodada do Satélite ocorreu antes do último ajuste exclusivamente responsivo de rolagem; o roteiro analítico foi repetido no build final, inclusive com intervalo personalizado na camada Satélite.

Capturas selecionadas da última rodada:

- [Dashboard — claro, desktop](dashboard-claro-1366.png)
- [Dashboard — escuro, desktop e mapa](dashboard-escuro-1366-map.png)
- [Dashboard — claro, celular de 320 px](dashboard-claro-320.png)
- [Mapa Criminal — escuro, tablet](mapa-criminal-escuro-768-map.png)
- [Mapa Criminal — claro, celular de 390 px](mapa-criminal-claro-390-map.png)
- [Mapa Criminal — escuro, celular de 320 px](mapa-criminal-escuro-320-map.png)

As demais capturas permanecem em `tmp/analytics-evidence` (ignorado pelo Git) e podem ser reproduzidas pelo roteiro. Fontes Google foram bloqueadas no roteiro analítico para evitar dependência externa; tiles foram exercitados no roteiro específico. Não houve teste em aparelhos físicos ou outros navegadores. Isso não equivale à homologação acadêmica/institucional.

## Inventário desta entrega

Arquivos modificados:

- `src/app/(sistema)/mapa-criminal/page.tsx`
- `src/data/demoAnalytics.ts`
- `src/features/Dashboard.tsx`
- `src/features/DashboardEntry.tsx`
- `src/features/CrimeMap.tsx`
- `src/features/CrimeMapEntry.tsx`
- `tests/demo-analytics.test.mjs`
- `sprints/sprint-03.md`

Arquivos criados:

- `src/components/analytics/AnalyticFilters.tsx`
- `src/components/analytics/Analytics.module.css`
- `src/components/analytics/PeriodTrend.tsx`
- `scripts/check-analytics.mjs`
- `docs/filtros-analytics.md`
- `docs/decisoes/adr-periodo-civil-analytics.md`
- Nesta pasta: `README.md`, `browser-results.json`, `satellite-report.json`, `build-id.txt` e as seis capturas listadas acima.

Dependências, lockfile, Etapa 1, arquivos originais PCDF, mocks e componentes de renderização cartográfica não foram modificados.

## Parecer

**APTO para revisão e commit da Etapa 2**, considerando o escopo demonstrativo e os limites acima. Nenhuma atribuição de autoria foi alterada. Contratos de API, integração de banco, autenticação e aceite final da Sprint 3 permanecem fora desta entrega.
