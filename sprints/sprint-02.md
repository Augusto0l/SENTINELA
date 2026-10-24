## Período
* Data Início:28/09/2026
* Data Fim: 04/10/2026

## Objetivo
O foco e objetivo principal da sprint é a construção da Interface Operacional de Ocorrências, Leaflet UI (Pino/Mapa) e Guards de Perfil, estabelecendo os Fluxos Operacionais e a Geocodificação na UI.

## Milestone
* Épico 02: Gestão Operacional de Ocorrências e Acessos (EP02)
* Épico 03: Geolocalização e Módulo de Importação (EP03)

## Itens planejados

**Planejamento proposto:** 28 issues (4 Features e seus PBIs/Tasks), com a distribuição das novas issues derivada da Sprint de suas Features originais. Esta documentação não altera o campo Sprint no GitHub Projects.

### EP02 — Gestão Operacional de Ocorrências e Acessos

* **Feature [#6](https://github.com/CAMPUSCEUB/Sentinela/issues/6)** — Consulta, Pesquisa e Filtros de Ocorrências (`GH#6`), vinculada ao EP02.
  * **PBI [#35](https://github.com/CAMPUSCEUB/Sentinela/issues/35)** — Consultar e visualizar ocorrências (`EP02-PBI-01`).
    * **Task [#36](https://github.com/CAMPUSCEUB/Sentinela/issues/36)** — Implementar tabela mockada paginada e ordenável (`EP02-PBI-01-T1`).
    * **Task [#37](https://github.com/CAMPUSCEUB/Sentinela/issues/37)** — Implementar modal de detalhes de ocorrência (`EP02-PBI-01-T2`).
  * **PBI [#38](https://github.com/CAMPUSCEUB/Sentinela/issues/38)** — Pesquisar e filtrar ocorrências (`EP02-PBI-02`).
    * **Task [#39](https://github.com/CAMPUSCEUB/Sentinela/issues/39)** — Implementar busca por número, RA, natureza e endereço (`EP02-PBI-02-T1`).
    * **Task [#40](https://github.com/CAMPUSCEUB/Sentinela/issues/40)** — Implementar aplicação e limpeza de filtros (`EP02-PBI-02-T2`).

* **Feature [#7](https://github.com/CAMPUSCEUB/Sentinela/issues/7)** — Formulários de Cadastro, Edição e Inativação Manual (`GH#7`), vinculada ao EP02.
  * **PBI [#41](https://github.com/CAMPUSCEUB/Sentinela/issues/41)** — Cadastrar ocorrências manualmente (`EP02-PBI-03`).
    * **Task [#42](https://github.com/CAMPUSCEUB/Sentinela/issues/42)** — Criar formulário com React Hook Form/Zod para natureza, data, hora, RA e endereço (`EP02-PBI-03-T1`).
    * **Task [#43](https://github.com/CAMPUSCEUB/Sentinela/issues/43)** — Validar obrigatoriedade e formatos brasileiros de data/hora (`EP02-PBI-03-T2`).
  * **PBI [#44](https://github.com/CAMPUSCEUB/Sentinela/issues/44)** — Editar e inativar ocorrências (`EP02-PBI-04`).
    * **Task [#45](https://github.com/CAMPUSCEUB/Sentinela/issues/45)** — Implementar formulário de edição com mocks (`EP02-PBI-04-T1`).
    * **Task [#46](https://github.com/CAMPUSCEUB/Sentinela/issues/46)** — Implementar confirmação de inativação com mocks (`EP02-PBI-04-T2`).

* **Feature [#8](https://github.com/CAMPUSCEUB/Sentinela/issues/8)** — Controle de Permissões e Perfis na Interface (`GH#8`), vinculada ao EP02.
  * **PBI [#47](https://github.com/CAMPUSCEUB/Sentinela/issues/47)** — Visualizar ações conforme perfil (`EP02-PBI-05`).
    * **Task [#48](https://github.com/CAMPUSCEUB/Sentinela/issues/48)** — Exibir/ocultar ações conforme Admin, Operador e Analista (`EP02-PBI-05-T1`).
    * **Task [#49](https://github.com/CAMPUSCEUB/Sentinela/issues/49)** — Implementar contexto de perfil no front-end (`EP02-PBI-05-T2`).
  * **PBI [#50](https://github.com/CAMPUSCEUB/Sentinela/issues/50)** — Restringir navegação conforme perfil (`EP02-PBI-06`).
    * **Task [#51](https://github.com/CAMPUSCEUB/Sentinela/issues/51)** — Implementar guards de rotas por perfil (`EP02-PBI-06-T1`).
    * **Task [#52](https://github.com/CAMPUSCEUB/Sentinela/issues/52)** — Testar bloqueios e tratamento de acesso negado nos três perfis (`EP02-PBI-06-T2`).

### EP03 — Geolocalização e Módulo de Importação

* **Feature [#9](https://github.com/CAMPUSCEUB/Sentinela/issues/9)** — Interface de Geocodificação e Ajuste no Mapa (`GH#9`), vinculada ao EP03.
  * **PBI [#54](https://github.com/CAMPUSCEUB/Sentinela/issues/54)** — Obter coordenadas a partir de um endereço (`EP03-PBI-01`).
    * **Task [#55](https://github.com/CAMPUSCEUB/Sentinela/issues/55)** — Criar campo de endereço e simular obtenção de latitude/longitude (`EP03-PBI-01-T1`).
    * **Task [#56](https://github.com/CAMPUSCEUB/Sentinela/issues/56)** — Exibir feedback visual para endereços inválidos (`EP03-PBI-01-T2`).
  * **PBI [#57](https://github.com/CAMPUSCEUB/Sentinela/issues/57)** — Ajustar a localização diretamente no mapa (`EP03-PBI-02`).
    * **Task [#58](https://github.com/CAMPUSCEUB/Sentinela/issues/58)** — Integrar Leaflet/OpenStreetMap ao formulário (`EP03-PBI-02-T1`).
    * **Task [#59](https://github.com/CAMPUSCEUB/Sentinela/issues/59)** — Permitir clique/arraste do marcador e sincronizar coordenadas (`EP03-PBI-02-T2`).

## Responsáveis

* **Arthur de Jesus Lira Rojas**:
  * **Feature [#6](https://github.com/CAMPUSCEUB/Sentinela/issues/6)** — Consulta, Pesquisa e Filtros de Ocorrências (issue original do Artefato 2).
  * **Feature [#7](https://github.com/CAMPUSCEUB/Sentinela/issues/7)** — Formulários de Cadastro, Edição e Inativação Manual (issue original do Artefato 2).
  * **Feature [#8](https://github.com/CAMPUSCEUB/Sentinela/issues/8)** — Controle de Permissões e Perfis na Interface (issue original do Artefato 2).
  * **Feature [#9](https://github.com/CAMPUSCEUB/Sentinela/issues/9)** — Interface de Geocodificação e Ajuste no Mapa (issue original do Artefato 2).

Os responsáveis pelas novas PBIs e Tasks não foram definidos nos arquivos originais da sprint.

## Entregas
* Tabela paginada para listagem de ocorrências mockadas com ordenação, busca global (por número, RA, natureza e endereço) e modal de detalhamento completo ao clicar no registro.
* Formulários de cadastro e edição de ocorrências com validação de campos obrigatórios (natureza, data, hora, RA, endereço) e diálogo de confirmação para ações de exclusão/inativação.
* Restrições de exibição e controle de navegação aplicados na interface por perfil (Analista sem ações de edição/criação, Operador sem acesso à gestão de usuários e Administrador com acesso total).
* Componente de mapa interativo com Leaflet na tela de cadastro para simular geocodificação via endereço, permitir ajuste manual do marcador (latitude/longitude) e emitir alertas para endereços inválidos.

## Issues concluídas

Implementação e verificação técnica local realizadas em **20/10/2026**, preservando o período original e os responsáveis do planejamento. As quatro Features estão implementadas no escopo demonstrativo:

| Feature | PBIs/Tasks cobertos | Entrega |
| --- | --- | --- |
| #6 | #35–#40 | Consulta paginada, ordenação, busca normalizada, filtros/limpeza e detalhes acessíveis |
| #7 | #41–#46 | Formulário compartilhado React Hook Form/Zod, datas e horários brasileiros, cadastro/edição em memória e inativação com confirmação/motivo |
| #8 | #47–#52 | Contexto dos três perfis, ações e navegação condicionais, bloqueio de URL direta na interface e acesso negado |
| #9 | #54–#59 | Geocodificação simulada com feedback, Leaflet/OpenStreetMap sem SSR, clique/arraste e coordenadas sincronizadas |

Isso não encerra issues no GitHub nem constitui aceite acadêmico. A inativação fica restrita ao Administrador: a autorização do Operador continua pendente de homologação no contrato da Sprint 1. Analista somente consulta; Operador cadastra/edita e não gerencia usuários. Não há autorização no servidor/RLS.

## Pull requests aceitos

Nenhum PR da Sprint 2 criado ou aceite remoto verificado nesta execução. Não houve commit, push ou publicação.

## Evidências

* Node 22.23.2; instalação final congelada com `corepack pnpm@10.34.3 install --frozen-lockfile` aprovada. React Hook Form, Zod e resolver adicionados ao manifest/lockfile; a inclusão inicial usou o pnpm 12.9.1 encontrado no ambiente, seguida da instalação com a versão declarada.
* TypeScript, lint, 17 testes Node pelo comando padrão, contratos, oito rotas/111 imports e CSS sem avisos aprovados. Runner e Chrome executados fora do sandbox após `spawn EPERM`.
* Build de produção Next.js 16.3.6/Turbopack aprovado. Um cache anterior omitia o CSS novo; o diretório `.next` foi preservado em `.tmp-sprint02-build-cache-backup` e o build limpo incluiu os estilos. O roteiro agora verifica explicitamente os estilos computados do formulário e da barra de perfil.
* `pnpm check:occurrences`: Chrome, temas claro/escuro, filtros, ordenação, paginação, detalhes, Enter/Tab/Escape/retorno de foco; modal em 1366×768, 768×1024 e 390×844. Base original de 790 registros consistente na listagem, dashboard e mapa.
* `pnpm check:sprint2`: Chrome contra o build de produção; três perfis, URLs diretas, cadastro, datas/horários inválidos, geocodificação, clique/arraste, ajuste manual, edição, descarte/cancelamento, motivo de inativação e restauração ao recarregar aprovados. Temas claro/escuro em 390×844, 768×844 e 1366×844, sem overflow horizontal da página e com o pino dentro do mapa. Zero erros JavaScript de página capturados.
* Resultados e capturas selecionadas: [evidências da Sprint 2](../docs/evidencias/sprint-02/README.md). Relatório e limites: [implementação da Sprint 2](../docs/implementacao-sprint-02.md). Capturas adicionais em `tmp/sprint-02-evidence/` são locais e não garantidas pelo clone.

## Impedimentos

Nenhum impedimento técnico identificado para a entrega demonstrativa nos fluxos verificados. Autenticação, banco, RLS, auditoria real e geocodificação real permanecem fora do escopo. O fundo OpenStreetMap depende de conexão; coordenadas podem ser ajustadas pelos campos mesmo sem tiles.

O cenário de cadastro/edição/inativação pertence à listagem e vive somente em memória. Dashboard e mapa analítico preservam a base fictícia original; a listagem informa essa diferença quando há alterações. O perfil simulado permanece apenas na sessão da aba (`sessionStorage`) e não é identidade autenticada.

## Retrospectiva

* Formulário e regras compartilhados evitam divergência entre cadastro e edição.
* Testes funcionais não detectaram sozinhos a ausência do CSS no build em cache; inspeção das capturas e verificações de estilos complementaram a validação.
* O mapa recebeu `ResizeObserver`/`invalidateSize` para preservar o pino após redimensionamento. O roteiro aguarda estabilidade antes de arrastar.

## Próximas ações
* Submeter as entregas e evidências à revisão do grupo/professor; aceite e alterações no GitHub permanecem ações separadas.
* Homologar permissões institucionais e catálogos antes de qualquer implementação operacional.

Preparação para a execução da Sprint 3 (Semanas 3 e 4), focada em Importação, Analytics e Contratos API (EP03, EP04 e EP05):
* **Feature [#10](https://github.com/CAMPUSCEUB/Sentinela/issues/10)** — Interface de Importação de Arquivos em Lote; PBIs: [#60](https://github.com/CAMPUSCEUB/Sentinela/issues/60) (`EP03-PBI-03`), [#63](https://github.com/CAMPUSCEUB/Sentinela/issues/63) (`EP03-PBI-04`), [#66](https://github.com/CAMPUSCEUB/Sentinela/issues/66) (`EP03-PBI-05`), [#69](https://github.com/CAMPUSCEUB/Sentinela/issues/69) (`EP03-PBI-06`).
* **Feature [#11](https://github.com/CAMPUSCEUB/Sentinela/issues/11)** — Mapa Criminal do DF — Camadas, Pontos e Calor; PBIs: [#73](https://github.com/CAMPUSCEUB/Sentinela/issues/73) (`EP04-PBI-01`), [#76](https://github.com/CAMPUSCEUB/Sentinela/issues/76) (`EP04-PBI-02`), [#79](https://github.com/CAMPUSCEUB/Sentinela/issues/79) (`EP04-PBI-03`), [#82](https://github.com/CAMPUSCEUB/Sentinela/issues/82) (`EP04-PBI-04`).
* **Feature [#12](https://github.com/CAMPUSCEUB/Sentinela/issues/12)** — Dashboard de Indicadores e Gráficos Analíticos; PBIs: [#85](https://github.com/CAMPUSCEUB/Sentinela/issues/85) (`EP04-PBI-05`), [#88](https://github.com/CAMPUSCEUB/Sentinela/issues/88) (`EP04-PBI-06`), [#91](https://github.com/CAMPUSCEUB/Sentinela/issues/91) (`EP04-PBI-07`).
* **Feature [#14](https://github.com/CAMPUSCEUB/Sentinela/issues/14)** — Especificação de Contratos e Swagger de API; PBIs: [#107](https://github.com/CAMPUSCEUB/Sentinela/issues/107) (`EP05-PBI-05`), [#110](https://github.com/CAMPUSCEUB/Sentinela/issues/110) (`EP05-PBI-06`).
