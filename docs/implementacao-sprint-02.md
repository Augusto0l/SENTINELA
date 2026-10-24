# Implementação da Sprint 2

Verificação local: 20/10/2026 (America/Sao_Paulo). Escopo: protótipo demonstrativo. Não representa aceite acadêmico, fechamento de issues ou autorização de publicação.

## Comportamento entregue

A consulta oferece 25 linhas por página, ordenação textual/cronológica, busca sem distinção de acentos/caixa/espaços e filtros combinados por RA/natureza. O identificador abre os detalhes por botão acessível; o modal mantém o foco, fecha com Escape e devolve o foco ao acionador.

Cadastro e edição usam `OccurrenceForm`, React Hook Form e Zod. Natureza, RA, endereço, data DD/MM/AAAA, hora HH:mm e coordenadas são obrigatórios. Datas inexistentes, horários inválidos e coordenadas fora do retângulo demonstrativo são rejeitados. Cancelar abre uma confirmação quando há alterações. A inativação exige confirmação e motivo e conserva o registro na opção “Incluir inativas”, sem exclusão física.

`OperationalProvider` mantém o cenário em memória durante navegação interna; recarregar restaura a base. Mensagens de aplicação/inativação dizem explicitamente que não houve gravação no servidor. Dashboard e mapa analítico mantêm a base fictícia original; a listagem informa essa separação quando há alterações. Nenhum mock Canvas/Path2D foi levado ao SSR. O formulário antigo `NovaOcorrencia.tsx` permanece preservado; a rota ativa usa o formulário compartilhado.

## Perfis e navegação

| Perfil simulado | Consulta | Cadastro/edição | Inativação | Importação | Usuários |
| --- | --- | --- | --- | --- | --- |
| Administrador | Sim | Sim | Sim, com motivo | Sim | Sim |
| Operador | Sim | Sim | Não, homologação pendente | Sim | Não |
| Analista | Sim | Não | Não | Não | Não |

O seletor fica disponível após hidratação, e as páginas são mostradas após a leitura do perfil. A navegação, ações e callbacks de alteração verificam as regras compartilhadas. URLs diretas proibidas mostram acesso negado e um link para consulta. O perfil é uma preferência demonstrativa de `sessionStorage`, editável pelo navegador, sem qualquer valor de autorização real. Não há servidor de identidade, autenticação ou RLS. Regras do Operador seguem a proposta conservadora do contrato `deduplicacao-permissoes-v0.1.0.md`.

## Localização

O mapa Leaflet é importado dinamicamente com SSR desabilitado. A simulação exige RA e endereço com formato mínimo e retorna uma referência sintética da RA, sem consultar o endereço. Não é um resultado geocodificado nem precisão cartográfica oficial. Clique, arraste e campos de coordenadas sincronizam o pino; os campos oferecem alternativa de teclado. `ResizeObserver` atualiza o mapa ao redimensionar. Tiles OpenStreetMap dependem de rede, preservam atribuição e apresentam aviso em caso de erro.

Referência de implementação: [marcador arrastável na documentação React Leaflet v5](https://react-leaflet.js.org/docs/example-draggable-marker/).

## Validação

Instalação congelada com Node 22.23.2/pnpm 10.34.3, TypeScript, lint sem avisos, 17 testes Node, contratos, rotas, CSS e build Next.js/Turbopack aprovados. Os testes novos cobrem datas bissextas/inexistentes, limites de horário/coordenadas, catálogos, simulação e matriz dos três perfis.

Os roteiros `check:occurrences` e `check:sprint2` passaram no Chrome contra servidor local de produção, sem erros JavaScript de página. O segundo gera JSON e 12 capturas em `tmp/sprint-02-evidence/`. Ver [índice de evidências](evidencias/sprint-02/README.md) para a rodada preservada. Temas claro/escuro e larguras de 390, 768 e 1366 pixels foram exercitados; o primeiro roteiro também verifica o modal em 768×1024. Capturas selecionadas de celular, tablet e desktop foram inspecionadas visualmente.

Tentativas intermediárias não contadas como aprovação: `EPERM` do sandbox; timeout na compilação inicial em desenvolvimento; seleção de perfil antes de hidratação; arraste durante movimento do mapa; CSS ausente em cache anterior. O seletor passou a aguardar hidratação, o roteiro aguarda estabilidade e valida estilos computados, e o build limpo corrigiu a saída CSS. Nenhuma política do Windows foi alterada.

## Reprodução e limites

Use o pnpm de `.mise.toml` (por exemplo `corepack pnpm@10.34.3`). Execute `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm validate:contracts`, `pnpm check:routes`, `pnpm check:styles` e `pnpm build`. Reutilize servidor disponível; para o build aprovado, `pnpm start`. Com o Chrome instalado, execute `pnpm check:occurrences` e `pnpm check:sprint2`. A URL alternativa usa `SENTINELA_TEST_URL`.

Não foram executados testes em Firefox/Safari, certificação WCAG, carga, CI remota ou backend. O teste de navegador captura erros JavaScript de página; não equivale a afirmar ausência de toda falha de rede/console de serviços externos. Catálogos, perímetros e permissões institucionais continuam dependentes de homologação. O encerramento acadêmico e o aceite do grupo precisam ser registrados pelos responsáveis. Não houve commit, push, PR ou deploy nesta execução.
