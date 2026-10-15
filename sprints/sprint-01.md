## Período
* Data início: 21/09/2026
* Data Fim: 27/09/2026

## Objetivo
O foco e objetivo principal da sprint é o Setup Next.js 14, Tailwind, shadcn/ui, Design System e Mapeamento de Regras, estabelecendo a Fundação Web e Regras de Negócio do sistema

## Milestone
* Épico 01: Fundação Front-end e Identidade Visual (EP01)
* Épico 05: Governança, Contratos e Qualidade (EP05)

## Itens planejados

**Planejamento proposto:** 21 issues (2 Features e seus PBIs/Tasks), com a distribuição das novas issues derivada da Sprint de suas Features originais. Esta documentação não altera o campo Sprint no GitHub Projects.

### EP01 — Fundação Front-end e Identidade Visual

* **Feature [#4](https://github.com/CAMPUSCEUB/Sentinela/issues/4)** — Páginas e Mocks do Layout Base (`GH#4`), vinculada ao EP01.
  * **PBI [#29](https://github.com/CAMPUSCEUB/Sentinela/issues/29)** — Navegação pelas páginas principais (`EP01-PBI-01`).
    * **Task [#30](https://github.com/CAMPUSCEUB/Sentinela/issues/30)** — Criar telas mockadas de Login e Usuários (`EP01-PBI-01-T1`).
    * **Task [#31](https://github.com/CAMPUSCEUB/Sentinela/issues/31)** — Criar telas mockadas de Dashboard e Mapa Criminal (`EP01-PBI-01-T2`).
    * **Task [#32](https://github.com/CAMPUSCEUB/Sentinela/issues/32)** — Criar telas mockadas de Ocorrências e Importação (`EP01-PBI-01-T3`).
    * **Task [#3](https://github.com/CAMPUSCEUB/Sentinela/issues/3)** — ISSUE-01: Setup inicial do projeto Web e Design System (`GH#3`).
  * **PBI [#33](https://github.com/CAMPUSCEUB/Sentinela/issues/33)** — Visualização consistente e responsiva (`EP01-PBI-02`).
    * **Task [#5](https://github.com/CAMPUSCEUB/Sentinela/issues/5)** — ISSUE-03: Padronização Visual, Responsividade e Feedbacks (`GH#5`).

### EP05 — Governança, Contratos e Qualidade

* **Feature [#13](https://github.com/CAMPUSCEUB/Sentinela/issues/13)** — Formalização de Catálogos e Regras de Negócio (`GH#13`), vinculada ao EP05.
  * **PBI [#95](https://github.com/CAMPUSCEUB/Sentinela/issues/95)** — Padronizar o catálogo de Regiões Administrativas (`EP05-PBI-01`).
    * **Task [#96](https://github.com/CAMPUSCEUB/Sentinela/issues/96)** — Consolidar lista oficial de RAs em catálogo estruturado (`EP05-PBI-01-T1`).
    * **Task [#97](https://github.com/CAMPUSCEUB/Sentinela/issues/97)** — Definir IDs e nomenclaturas padronizadas das RAs (`EP05-PBI-01-T2`).
  * **PBI [#98](https://github.com/CAMPUSCEUB/Sentinela/issues/98)** — Padronizar o catálogo de naturezas criminais (`EP05-PBI-02`).
    * **Task [#99](https://github.com/CAMPUSCEUB/Sentinela/issues/99)** — Consolidar catálogo estruturado de naturezas (`EP05-PBI-02-T1`).
    * **Task [#100](https://github.com/CAMPUSCEUB/Sentinela/issues/100)** — Documentar nomenclaturas para cadastro/importação (`EP05-PBI-02-T2`).
  * **PBI [#101](https://github.com/CAMPUSCEUB/Sentinela/issues/101)** — Formalizar regras de deduplicação (`EP05-PBI-03`).
    * **Task [#102](https://github.com/CAMPUSCEUB/Sentinela/issues/102)** — Documentar campos e condições de duplicidade (`EP05-PBI-03-T1`).
    * **Task [#103](https://github.com/CAMPUSCEUB/Sentinela/issues/103)** — Elaborar exemplos e cenários de validação (`EP05-PBI-03-T2`).
  * **PBI [#104](https://github.com/CAMPUSCEUB/Sentinela/issues/104)** — Formalizar a matriz de permissões (`EP05-PBI-04`).
    * **Task [#105](https://github.com/CAMPUSCEUB/Sentinela/issues/105)** — Elaborar matriz de operações por perfil (`EP05-PBI-04-T1`).
    * **Task [#106](https://github.com/CAMPUSCEUB/Sentinela/issues/106)** — Revisar e homologar regras de acesso, edição e administração (`EP05-PBI-04-T2`).

## Responsáveis

* **Pedro Augusto**:
  * **Feature [#4](https://github.com/CAMPUSCEUB/Sentinela/issues/4)** — Páginas e Mocks do Layout Base (issue original do Artefato 2).
  * **Feature [#13](https://github.com/CAMPUSCEUB/Sentinela/issues/13)** — Formalização de Catálogos e Regras de Negócio (issue original do Artefato 2).
  * **Task [#3](https://github.com/CAMPUSCEUB/Sentinela/issues/3)** — ISSUE-01: Setup inicial do projeto Web e Design System (issue original do Artefato 2).
  * **Task [#5](https://github.com/CAMPUSCEUB/Sentinela/issues/5)** — ISSUE-03: Padronização Visual, Responsividade e Feedbacks (issue original do Artefato 2).

Os responsáveis pelas novas PBIs e Tasks não foram definidos nos arquivos originais da sprint.

## Entregas
* Repositório inicializado no GitHub, com Next.js 14+ (App Router), Tailwind CSS e componentes shadcn/ui configurados para o layout base (Sidebar + Topbar).
* Telas mockadas de Login, Dashboard, Mapa Criminal, Ocorrências, Importação e Usuários criadas com suporte a prototipação rápida.
* Interface ajustada para responsividade (resoluções de 1366x768 até 1920x1080) em Desktop, Notebook e Tablet, com componentes de loading (skeletons) e notificações (toasts).
* Documento/Arquivo JSON contendo a lista padronizada de RAs do DF e Naturezas criminais elaborado.
* Matriz de regras de deduplicação e matriz de permissões/políticas para os perfis Administrador, Operador e Analista definidas.

## Issues concluídas

## Pull requests aceitos

## Evidências

## Impedimentos

## Retrospectiva

## Próximas ações
Preparação para a execução da Sprint 2 (Semana 2), focada nos Fluxos Operacionais e Geocodificação UI (EP02 e EP03):
* **Feature [#6](https://github.com/CAMPUSCEUB/Sentinela/issues/6)** — Consulta, Pesquisa e Filtros de Ocorrências; PBIs: [#35](https://github.com/CAMPUSCEUB/Sentinela/issues/35) (`EP02-PBI-01`), [#38](https://github.com/CAMPUSCEUB/Sentinela/issues/38) (`EP02-PBI-02`).
* **Feature [#7](https://github.com/CAMPUSCEUB/Sentinela/issues/7)** — Formulários de Cadastro, Edição e Inativação Manual; PBIs: [#41](https://github.com/CAMPUSCEUB/Sentinela/issues/41) (`EP02-PBI-03`), [#44](https://github.com/CAMPUSCEUB/Sentinela/issues/44) (`EP02-PBI-04`).
* **Feature [#8](https://github.com/CAMPUSCEUB/Sentinela/issues/8)** — Controle de Permissões e Perfis na Interface; PBIs: [#47](https://github.com/CAMPUSCEUB/Sentinela/issues/47) (`EP02-PBI-05`), [#50](https://github.com/CAMPUSCEUB/Sentinela/issues/50) (`EP02-PBI-06`).
* **Feature [#9](https://github.com/CAMPUSCEUB/Sentinela/issues/9)** — Interface de Geocodificação e Ajuste no Mapa; PBIs: [#54](https://github.com/CAMPUSCEUB/Sentinela/issues/54) (`EP03-PBI-01`), [#57](https://github.com/CAMPUSCEUB/Sentinela/issues/57) (`EP03-PBI-02`).
