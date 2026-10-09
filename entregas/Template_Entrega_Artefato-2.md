# Template de entrega

## Identificação
* **Título:** Consolidação da Arquitetura, EAP, Cronograma de Sprints e Especificação de Requisitos (v0.4 / v3.6)
* **Projeto:** SENTINELA — Sistema de Análise e Monitoramento de Ocorrências Criminais do Distrito Federal
* **Instituição:** Centro Universitário de Brasília (UniCEUB / CAMPUSCEUB)
* **Turma:** A
* **Data:** 17 de Setembro de 2026
* **Repositório:** [CAMPUSCEUB/Sentinela](https://github.com/CAMPUSCEUB/Sentinela)

---

## Sprint relacionada
* **Sprint Origem:** Sprint 1 (Semana 1) — Fundação Web, Arquitetura e Governança de Regras
* **Marcos / Milestones:** [Milestone 1 — Planejamento, EAP e Arquitetura Base](https://github.com/CAMPUSCEUB/Sentinela/milestone/1)

---

## Escopo
A entrega compreende a formalização e atualização completa dos artefatos de governança e arquitetura do Projeto SENTINELA:
* **EAP (Work Breakdown Structure):** Mapeamento e diagramação em 5 níveis hierárquicos orientados à entrega.
* **Arquitetura Tecnológica:** Definição da stack completa composta por Next.js 14+ (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Leaflet, Supabase (Auth, DB, RLS), Vercel e OpenStreetMap/Nominatim.
* **Perfis e Acessos (RBAC):** Estruturação do controle de acesso para os perfis Administrador, Operador e Analista.
* **Cronograma Temporal:** Mapeamento de 6 Sprints (8 Semanas) alocando 22 Issues no GitHub.

---

## Links principais
* **Repositório Principal:** [CAMPUSCEUB/Sentinela](https://github.com/CAMPUSCEUB/Sentinela)
* **Milestone:** [Milestone 1 — Planejamento, EAP e Arquitetura Base](https://github.com/CAMPUSCEUB/Sentinela/milestone/1)
* **Documentação de Requisitos:** [Especificação de Requisitos v0.4 (PDF)](https://github.com/CAMPUSCEUB/Sentinela/blob/main/docs/SENTINELA_Requisitos_Plano_de_Desenvolvimento_v0.4_2.pdf)
* **Documento Consolidado (Google Docs):** [Cronograma Integrado, Arquitetura e EAP v3.6](https://docs.google.com/document/d/1QLztkJS__qVBcHP58tTcvWnz48OgEYgT_0KVospef4A/edit?usp=drive_web)
* **Issues Relacionadas:**
  * [#1 — Setup inicial do projeto Web, Next.js 14+ e Design System](https://github.com/CAMPUSCEUB/Sentinela/issues/1)
  * [#2 — Páginas e Mocks do Layout Base](https://github.com/CAMPUSCEUB/Sentinela/issues/2)
  * [#11 — Formalização de Catálogos, Regras e Perfis Supabase](https://github.com/CAMPUSCEUB/Sentinela/issues/11)
  * [#14 — Modelagem Física e Scripts DDL do Banco de Dados](https://github.com/CAMPUSCEUB/Sentinela/issues/14)

---

## Critérios atendidos

| Critério Avaliativo | Evidência / Demonstração no Artefato |
| :--- | :--- |
| **Modelagem e EAP Organizada** | Apresentação do diagrama visual da EAP dividido em 5 eixos claros e coerentes com a Regra dos 100%. |
| **Definição de Arquitetura de Software** | Mapeamento explícito de Front-end (Next.js/Vercel), Backend/BaaS (Supabase Auth/RLS) e Banco de Dados (PostgreSQL/PostGIS com 8 tabelas). |
| **Gestão de Perfis de Usuário (RBAC)** | Especificação das políticas de visualização e permissão no backend/frontend para Administrador, Operador e Analista. |
| **Rastreabilidade e Planejamento Temporal** | Matriz de Sprints (6 Sprints / 8 Semanas) vinculando formalmente cada funcionalidade às 22 Issues no GitHub. |

---

## Validação
* **Verificações Realizadas:** Revisão cruzada entre a Especificação de Requisitos v0.4, o Diagrama da Arquitetura v0.1 e os artefatos visuais gerados.
* **Responsável:** Equipe de Arquitetura e Gestão de Projetos (CAMPUSCEUB).
* **Resultado Obtido:** 100% dos requisitos não funcionais e funcionais essenciais foram contemplados no mapeamento da EAP e das Issues.

---

## Limitações
* **Protótipo com Dados Simulados:** O desenvolvimento atual da camada front-end utiliza dados mockados via arquivos JSON enquanto a integração com a base oficial do Supabase/PCDF está sendo construída.
* **Geocodificação Direta:** Atualmente dependente das cota-limites de requisição do serviço gratuito OpenStreetMap (Nominatim API).

---

## Pendências conhecidas
* Validação presencial do catálogo de naturezas criminais junto às fontes oficiais da SSP-DF/PCDF.
* Aplicação das políticas refinadas de Row Level Security (RLS) diretamente no console do Supabase (agendada para a Sprint 4).

---

## Próximos passos
* Iniciar a implementação dos componentes operacionais de consulta, cadastro e permissões visuais na interface (Sprint 2 / Issues #04, #05, #06 e #10).
* Construir o módulo de upload com pré-visualização de arquivos Excel/CSV para a carga em lote (Sprint 3 / Issue #07).
