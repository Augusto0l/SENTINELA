# Evidências da homologação final da Sprint 1

Data de referência: 09/10/2026. Ambiente Windows x64, Node 22.23.2, Next.js 16.3.6 e Chrome 154.0.8037.98. Não houve commit, push, deploy ou mudança das políticas de segurança.

## Execuções

- `inicial/resultados.json`: primeira rodada; 24 verificações HTTP/render em três resoluções. As falhas funcionais registradas ocorreram por seletores do roteiro que não consideravam ícones nos nomes acessíveis e o anunciador de rotas do Next; não foram contabilizadas como aprovações. As capturas também documentam paginação recortada e texto de KPI fora do card antes dos ajustes.
- `reteste/resultados.json`: reteste após correção dos layouts e seletores; 24 verificações HTTP/render e 12 funcionais aprovadas.
- [final/resultados.json](final/resultados.json): execução final; **40 verificações HTTP/render e 13 funcionais aprovadas**, 49 capturas, zero erros JavaScript de página, zero erros de console e zero respostas HTTP >= 400. Foi registrada uma requisição RSC cancelada (`net::ERR_ABORTED`) durante a sequência de navegação; as rotas renderizaram e os testes passaram. Esse cancelamento não é tratado como falha de renderização nem omitido do JSON.
- [swc-diagnostico.json](swc-diagnostico.json): versões, hash constante, rejeição inicial por Code Integrity e resultado posterior. O binário nativo passou a carregar em rodada posterior sem alteração de arquivo ou política pelo agente; a causa dessa transição não foi determinada.
- [build.log](build.log): log da compilação aprovada com Webpack/WASM antes dos ajustes visuais. Mensagens de rejeição do nativo nesse log são não fatais porque o fallback carregou.
- [BUILD_ID.txt](BUILD_ID.txt): identificador da compilação final homologada, aprovada com Turbopack/SWC nativo. O resultado do comando está registrado no relatório de finalização.

## Cobertura HTTP e visual

Rotas: `/login`, `/dashboard`, `/mapa-criminal`, `/ocorrencias`, `/ocorrencias/nova`, `/importar`, `/usuarios` e `/configuracoes`.

Resoluções da execução final: 1920×1080, 1366×768, 768×1024, 1024×768 e 1200×800. Cada rota possui uma captura com o padrão `final/<largura>x<altura>-<rota>.png`; a relação exata está em `screenshots` no JSON. As tabelas extensas mantêm rolagem própria; screenshots do viewport não equivalem à captura de todo o conteúdo dentro de cada área rolável.

## Capturas dos fluxos

- [Paginação do notebook](final/paginacao-notebook.png): rodapé dentro do viewport e mudança de `DEMO-000001` para `DEMO-000026` ao avançar.
- [Diálogo no tablet](final/dialogo-768.png) e [diálogo no notebook](final/dialogo-1366.png): dimensões dentro do viewport, foco preso, Escape e retorno de foco testados.
- [Mapa por teclado](final/mapa-ra-teclado.png): skip link, contorno de foco e seleção da RA-I com Enter.
- [Cadastro simulado](final/cadastro-simulado.png): aviso explícito de que nenhum registro foi gravado.
- [Skeleton](final/skeleton-dashboard.png): carregamento observado com atraso controlado de 350 ms nas respostas JS.
- [Login/toast](final/login-toast.png): nenhuma autenticação realizada.
- [Prévia de tema](final/tema-demonstrativo.png): seleção visual demonstrativa; o texto informa que não altera o tema global.
- [Drawer](final/drawer-usuario.png): menu e abertura por teclado.

As evidências são de homologação do protótipo neste Chrome. Não certificam WCAG, outros navegadores, segurança de produção, desempenho de carga ou serviços futuros. A CI remota não foi executada.

## Reproduzir

1. Instalar dependências pelo `pnpm-lock.yaml`.
2. Executar `npm run build`; o wrapper mantém Turbopack quando o nativo carrega e usa Webpack/WASM no Windows se houver `ERR_DLOPEN_FAILED`.
3. Iniciar `npm run start -- --port 3001`.
4. Executar `node scripts/homologate-sprint1.mjs` com Chrome instalado. Para preservar execuções anteriores, definir `SENTINELA_TEST_RUN` com outro nome. A URL pode ser configurada por `SENTINELA_TEST_URL`.

O roteiro usa Chrome headless com sandbox do navegador ativo e fecha o navegador ao terminar. Não baixa outro navegador nem publica a aplicação.
