# Sprint 3 — Homologação integrada e preparação do encerramento técnico

Rodada local de 28/10/2026, America/Sao_Paulo. **Não declara encerramento formal da sprint nem homologação acadêmica.** O sistema continua demonstrativo, com cenários em memória, importação local e contratos de API propostos.

## Base e escopo

Workspace inicialmente limpo, `feat/sprint3-contratos-api` em `33f6bf5`. `git fetch ceub` confirmou `ceub/main` em `2739dbb` e a branch remota da Etapa 3 disponível. A main ainda não contém a Etapa 3. Criada `test/sprint3-homologacao` a partir da branch da Etapa 3; destino temporário do PR: **feat/sprint3-contratos-api**. Não houve merge, rebase, commit, tag, push ou mudança de autoria.

Responsável planejado: João Pedro Roriz Costa, conforme solicitação. Planejamento não comprova contribuição individual nem atribui autoria de commits. O diff desta etapa contém implementação de robustez do Worker, testes, automação de homologação e documentação; não reapresenta os commits anteriores quando comparado à sua base.

Fontes de aceite consultadas: [Sprint 3](../sprints/sprint-03.md), critérios em [requisitos](requisitos_v1.md), [importação](importacao-demonstrativa.md), [filtros/analytics](filtros-analytics.md), [contratos](contratos/api-v0.1.0.md) e evidências históricas das três etapas. Rastreabilidade: Features #10/#11/#12/#14 e PBIs de importação, filtros/mapas/indicadores e contratos registrados na Sprint 3. As PBIs de QA #113/#116 estão planejadas na Sprint 4; esta verificação transversal não as move nem declara concluídas. Critérios remotos não foram obtidos por API autenticada; a revisão se limita ao texto local e à solicitação desta etapa, sem presumir fechamento de issues.

## Implementação e problemas registrados

| Registro | Gravidade/contexto | Constatação e tratamento |
| --- | --- | --- |
| W01 — envio ao Worker | Média, robustez da importação | O envio não tinha catch próprio no fluxo de ações posteriores à leitura. `postMessage` com falha agora encerra recursos e apresenta erro recuperável. Testes com falha controlada em Node e Chrome. |
| W02 — desserialização | Média, robustez da importação | Não havia handler de `messageerror`. Agora há diagnóstico imediato e limpeza; não se espera todo o prazo para uma falha explícita. |
| W03 — watchdog obsoleto | Média, condição de corrida | O callback anterior chamava falha global sem identidade de operação. Agora testa operação e Worker antes de agir, inclusive quando já enfileirado no momento do cancelamento. |
| W04 — correlação de respostas | Baixa, prevenção de estado obsoleto | A proteção anterior por identidade do Worker foi preservada e ampliada para ID da operação, tipo de resposta e bloqueio de sobreposição. O processador também ignora leitura assíncrona ultrapassada. Não é alegação de duplicação espontânea pelo navegador. |
| T01 — roteiro novo | Baixa, teste | As primeiras tentativas do roteiro do Worker usavam texto exato que omitia a codificação e um seletor de alerta que incluía o anunciador Next.js. Seletores corrigidos; rodadas reprovadas preservadas. Não eram falhas do produto. |
| T02 — serviços externos | Ambiente, teste | A primeira rodada encontrou ECONNRESET em tiles e timeout do ViaCEP. Nova rodada passou com imagens/respostas reais. O roteiro de Satélite usa tentativas limitadas de transporte e registra indisponibilidade, sem sintetizar imagens ou aprovar falha de provedor. |
| T03 — navegação e fontes | Ambiente, teste | A primeira rodada de navegação teve timeout. A repetição isolou fontes Google, mantendo os demais checks, e passou. Isso não valida disponibilidade da CDN de fontes. |

Os problemas de robustez foram identificados na inspeção do código anterior e verificados por injeção controlada de falhas/ordem de entrega na implementação revisada. Não houve build comparativo visual da versão anterior nem alegação de defeito observado por usuário real. Não foram encontradas outras regressões funcionais das etapas anteriores nos roteiros executados.

`importWorkerClient` concentra prazo, identidade, handlers e limpeza. O cleanup invalida a operação antes de liberar os recursos. `importWorkerProcessor` permite testar leitura real e estado de planilha sem depender de `self`; o arquivo `.worker.ts` continua sendo a entrada do Worker. A tela reaproveita o controlador e mantém seu layout/fluxo. IDs são internos e não alteram contratos HTTP.

Prazo mantido: **60.000 ms por operação**, valor já existente em `IMPORT_LIMITS.timeout`. Cancelar termina a thread; falhas explícitas não aguardam timeout. Encerramento silencioso é detectado pelo watchdog. Não houve nova tolerância por tamanho, redução de prazo ou alteração dos limites de parser/memória. Relógio de testes e callback controlado verificam a fronteira sem um ensaio real de 60 segundos.

## Validação técnica atual

Node 22.23.2, pnpm 10.34.3, Chrome headless 156.0.8078.48, build de produção identificado nas evidências.

| Comando | Resultado final |
| --- | --- |
| `pnpm install --frozen-lockfile` | Aprovado, sem alteração de dependências/lockfile |
| `pnpm typecheck` | Aprovado |
| `pnpm lint` | Aprovado, zero avisos |
| `pnpm test` | **96 aprovados**, zero falhas/ignorados; 13 novos testes do Worker/processador |
| `pnpm build` | Aprovado; 12 páginas geradas |
| `pnpm validate:contracts` | Aprovado; catálogo e OpenAPI sincronizados, 23 modelos, 13 operações e 29 payloads validados |
| `git diff --check` | Aprovado |

Os novos testes cobrem cancelamento/leitura, substituição, callbacks já enfileirados, respostas antigas no mesmo Worker, duplicação de resposta, prazo exato e prazo por operação, falha de criação/envio/execução/desserialização, encerramento silencioso, limpeza/unmount, sobreposição, CSV e XLSX reais, seleção vazia e recuperação, leitura/erro assíncrono ultrapassados. A suíte completa reexecuta os testes anteriores de importação, limites, analytics, contratos, geocodificação, geometria e permissões.

## Navegador — resultados finais

| Roteiro | Resultado e cobertura |
| --- | --- |
| Worker | Aprovado: cancelamento, substituição, resposta antiga/duplicada, falhas, recuperação, saída da tela e liberação de timer/Worker. Parsing nativo; entrega/falhas controladas pelo teste. |
| Importação | Aprovado: arquivos inválidos/vazios/corrompidos, CSV/XLSX reais, planilhas, mapeamento manual/automático, múltiplas naturezas, originais, erros, pendências, candidatas, prévia paginada, confirmação sem persistência, modelos e drag-and-drop. |
| Analytics | Aprovado: intervalos, atalhos, combinação de filtros, vazio, limpeza, navegação, tabela mensal, contagens e referência integral de calor. |
| Ocorrências | Aprovado: busca, filtros, ordenação, paginação, detalhes, foco/modal e concordância dos totais com Dashboard/mapa. |
| Sprint 2 | Aprovado: perfis, acesso demonstrativo, cadastro/edição/inativação em memória, cancelamento, validação, seleção/arraste e descarte ao recarregar. |
| Satélite | Aprovado após falha inicial de rede: 54 tiles reais, quatro modos, 37 áreas, contagens, filtros, teclado, zoom/arraste/restauração e falhas controladas de rede/componente/GeoJSON. |
| Localização real | Aprovado após timeout inicial: ViaCEP e geocodificador, três CEPs com 2/1/4 referências aproximadas e busca por endereço; UI reproduz amostras reais obtidas na mesma rodada. |
| Localização com fixtures | Aprovado separadamente: dados explicitamente sintéticos para testar UI sem afirmar disponibilidade de provedor. CEP completo/incompleto/inexistente, vazio/erro, seleção explícita e preservação de ajuste manual durante resposta atrasada. |
| Navegação | Aprovado após repetição: sete rotas nos dois temas, 13 larguras em três telas, perfis, foco/teclado e retorno ao login demonstrativo. |

Importação, Worker e analytics: claro/escuro, 1366/768/390/320 px, foco visível e sem overflow horizontal da página. Tabelas mantêm rolagem própria. Fluxos operacionais: claro/escuro, 1366/768/390 px. Satélite: 1440/820/390/320 px. Navegação: 1920, 1366, 1280, 1024, 1023, 820, 768, 767, 640, 480, 390, 360 e 320 px. Os checks não equivalem a auditoria formal WCAG.

Na base fictícia: 790 ocorrências ao limpar, 14 nos sete dias e 6 no recorte combinado transportado do Dashboard ao Mapa. A distribuição de múltiplas naturezas não multiplica ocorrências. CSV/XLSX com 10.000 e 10.001 registros são exercitados pela suíte Node; não houve upload desses volumes no roteiro visual. Importação não enviou requisições de gravação. Os roteiros finais não capturaram erros JavaScript não tratados, exceto falhas de transporte das tentativas iniciais registradas como reprovadas.

## Checklist de aceite

| Critério | Situação nesta entrega |
| --- | --- |
| Cancelar/substituir/ignorar processamento obsoleto | Atendido em testes Node e Chrome |
| Falha/timeout/limpeza e recuperação do Worker | Atendido; falhas e relógio controlados, sem benchmark de heap |
| Leitura, mapeamento, validação, prévia e confirmação | Atendido no fluxo demonstrativo |
| Limites 50 MB e 10 mil/10.001 registros | Atendido pelos testes de metadados/parser; limites preservados |
| Filtros e indicadores coerentes entre Dashboard/mapa | Atendido com os mocks existentes |
| Calor, Pontos, Clusters, Satélite e geometria | Atendido localmente; sem mudança nos renderizadores/cartografia |
| Contratos, exemplos, sucesso/erro e OpenAPI | Atendido como proposta executável; endpoints versionados não implementados |
| Regressões das Sprints anteriores | Roteiros locais executados e aprovados no escopo descrito |
| Temas, resoluções e teclado | Atendido em Chrome nas matrizes registradas |
| Persistência, autenticação/RLS, transações/deduplicação definitiva e auditoria real | Não implementados; fora do escopo e vedados nesta etapa |
| Homologação institucional dos catálogos/fontes e regras históricas | Pendente |
| Aceite do professor, critérios remotos e encerramento formal | Pendente; não declarado |

## Evidências e reprodução

[Índice de evidências desta rodada](evidencias/sprint-03/README.md): logs, resultados estruturados, tentativas iniciais, resumo das validações, ID do build e capturas selecionadas. As evidências anteriores permanecem históricas; não foram copiadas como resultados desta execução.

Com um servidor local já disponível para o build validado, executar `node scripts/homologate-sprint3.mjs`. O roteiro não inicia outro servidor e não altera Git; usa `SENTINELA_TEST_URL` quando definido e aceita apenas host local. `--only=worker,import,analytics` permite repetir casos específicos. Cada rodada tem pasta única em `tmp/sprint-03-homologacao`; há log e código de saída por caso. Só copia artefatos novos de casos aprovados. Falhas permanecem no manifesto e tornam o comando reprovado, mesmo que outros casos passem. A aprovação final considera as repetições identificadas, sem apagar falhas anteriores.

Localização real: `node --experimental-strip-types scripts/check-cep-location.mjs`. Interface isolada: o mesmo comando com `--fixtures`. São resultados diferentes, nunca intercambiáveis. Algumas verificações bloqueiam fontes Google para reduzir dependência externa; isso não altera a aplicação. Tiles e serviços reais foram consultados onde indicado.

## Limitações, parecer e próximo PR

Não foram executados testes em Firefox/Safari, aparelhos físicos, leitor de tela, carga concorrente, pico de heap hostil, integrações de banco, autenticação real ou endpoints `/api/v1`. Dados originais PCDF, geometria, cores, intensidade, algoritmos de clusters e contratos permaneceram intactos. Testes de falhas não comprovam resiliência a qualquer arquivo malicioso. Serviços externos podem falhar em outra execução.

**APTO para commit da Etapa 4**, no escopo demonstrativo e após a revisão solicitada. A sprint está tecnicamente verificada localmente, mas seu encerramento formal depende da homologação acadêmica. Não se declara aceite de regras ainda propostas.

Após auditoria e versionamento manual, abrir `test/sprint3-homologacao` → `feat/sprint3-contratos-api` enquanto a Etapa 3 não estiver integrada. Se ela for integrada antes, atualizar referências e avaliar `main` como destino, preservando somente o diff da Etapa 4 e observando eventual squash. Não executar merge/rebase/push automaticamente. Nenhum PR anterior foi alterado.
