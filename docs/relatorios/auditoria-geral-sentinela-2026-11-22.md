# AUDITORIA GERAL DO PROJETO SENTINELA — STATUS DAS SPRINTS E PLANO DE CONCLUSÃO

- **Data de corte** em 22/11/2026, horário de Brasília.
- **Base auditada** em `feat/redesign-interface`, commit `3e1b3adb8b597c393a3bb3fe0d18c38f1166c9f0`, incluindo as alterações locais que existiam antes da auditoria.
- **Escopo** dos dois repositórios GitHub do projeto, checkout principal em `D:\Projetos\SENTINELA`, diretório de preparação PCDF, validações estáticas, servidor local ativo e consultas de leitura no PostgreSQL. Os ensaios de escrita citados são evidências anteriores de bancos sintéticos isolados.

## 1. Resumo executivo

O SENTINELA dispõe de uma aplicação local com autenticação, perfis, histórico de importações e consulta de registros PCDF reais. Janeiro de 2021 permanece íntegro no PostgreSQL local com **6.393 associações de origem, 6.393 registros em staging, 34 campos por associação, 20.020 pendências e zero ocorrências consolidadas**. O painel analítico da inicialização atual usa um leitor sem configuração para essa base. A falta de ocorrências consolidadas é uma segunda dependência, independente da conexão.

O projeto está na **continuação técnica da Sprint 4**, já com entregas de Sprints 5 e 6 em andamento. As Sprints 1 a 3 encerraram os principais escopos técnicos de suas épocas. Para a Sprint 1 há registro de aceite acadêmico. As Revisões das Sprints 2 e 3 registram homologação técnica e deixam o aceite formal em aberto. O quadro oficial ao vivo não ficou disponível para confirmar uma nova sprint em curso.

Pelo escopo documentado, **46 de 60 pontos ponderados (77%)** estão tecnicamente entregues ou parcialmente implementados. Há **36 de 60 entregas (60%)** com evidência de conclusão no critério original. MVP local, entrega acadêmica integral e produção têm critérios próprios e permanecem abertos. As mudanças atuais incluem funcionalidades e evidências ainda sem commit.

A próxima entrega deve encerrar uma fatia da Sprint 4: alinhar o leitor analítico local com a base autorizada, padronizar estados de tela e homologar o fluxo existente com os três perfis. A carga de novos meses históricos segue suspensa até concluir e aprovar as telas. [Planejamento](../../sprints/sprint-04.md) · [Requisitos](../requisitos_v1.md) · [Resumo executivo](resumo-progresso-sentinela-2026-11-22.md)

**Legenda de evidência.** Confirmado significa verificação direta em código, GitHub, teste, consulta ou relatório com resultado identificável. Parcialmente confirmado indica integração, ambiente ou aceite faltante. Não confirmado indica evidência inacessível ou insuficiente. Pendente indica critério ainda por atender. Nas tabelas de progresso, **C** é concluído, **P** parcial, **A** a fazer e **B** bloqueado por decisão ou pré-requisito.

## 2. Linha do tempo

| Período ou marco | Entrega planejada e evidência | Situação em 22/11 |
| --- | --- | --- |
| Sprint 0, antes da primeira entrega | Organização, escopo, papéis, duração e estrutura inicial do backlog. [Planejamento](../../sprints/sprint-00-planejamento.md) | Estrutura e cronograma documentados. Fechamento das atividades de preparação e situação atual do quadro parcialmente verificáveis. |
| 21–27/09, Sprint 1 | Login e estrutura, telas iniciais responsivas, componentes e navegação. Review em 27/09. Rodada complementar em 09/10 registrou 40 verificações HTTP/renderização, 13 fluxos e 49 capturas. [Sprint 1](../../sprints/sprint-01.md) · [Fechamento](../finalizacao-sprint-01-2026-10-09.md) · [PR 27, integrado em 16/10](https://github.com/CAMPUSCEUB/Sentinela/pull/27) | Escopo demonstrativo encerrado, com aceite acadêmico registrado. |
| 28/09–04/10, Sprint 2 | Consulta, filtros, formulários de ocorrências, permissões por perfil e geocodificação com ajuste no mapa. Rodada técnica em 24/10 registrou 17 testes Node, três tamanhos e dois temas. [Sprint 2](../../sprints/sprint-02.md) · [Implementação](../implementacao-sprint-02.md) · [PR 216](https://github.com/CAMPUSCEUB/Sentinela/pull/216) | Entrega técnica integrada em 24/10. Aceite formal acadêmico por comprovar. |
| 05–18/10, Sprint 3 | CSV/XLSX, Worker e prévia, recursos cartográficos, dashboard avançado e contratos. Rodadas em 28–29/10, incluindo 96 testes Node históricos e nove grupos de teste em navegador. [Sprint 3](../../sprints/sprint-03.md) · [Homologação](../homologacao-sprint-03.md) · [PR 218](https://github.com/CAMPUSCEUB/Sentinela/pull/218) · [PR 219](https://github.com/CAMPUSCEUB/Sentinela/pull/219) · [PR 220](https://github.com/CAMPUSCEUB/Sentinela/pull/220) · [PR 221](https://github.com/CAMPUSCEUB/Sentinela/pull/221) | Revisão técnica em 29/10, integrada. Teste interativo de contrato e aceite formal ainda abertos. |
| 19/10–01/11, Sprint 4 | PostgreSQL/PostGIS, RLS, autenticação, operações e persistência. Baseline e login local integrados em 10/11, leitura persistente em 11/11, integração e documentação da etapa em 19/11. [Sprint 4](../../sprints/sprint-04.md) · [PR 223](https://github.com/CAMPUSCEUB/Sentinela/pull/223) · [PR 224](https://github.com/CAMPUSCEUB/Sentinela/pull/224) · [PR 225](https://github.com/CAMPUSCEUB/Sentinela/pull/225) · [PR 226](https://github.com/CAMPUSCEUB/Sentinela/pull/226) · [PR 227](https://github.com/CAMPUSCEUB/Sentinela/pull/227) · [PR 228](https://github.com/CAMPUSCEUB/Sentinela/pull/228) | Parte integrada institucionalmente. Recepção real e redesign posteriores na linha local. Cadastro manual operacional, usuários e identidade institucional em aberto. |
| 02–08/11, Sprint 5 | Motor de processamento, integração com dados reais e indicadores persistentes. A recepção de janeiro, integridade e histórico avançaram. [Sprint 5](../../sprints/sprint-05.md) · [Piloto de janeiro](../desenvolvimento/piloto-pcdf-2021-01.md) | Entregas parciais incorporadas à continuação local. Consolidação, indicadores e cargas adicionais abertas. |
| 09–15/11, Sprint 6 | Operação, importação histórica, análise, QA e entrega. Fontes e manifesto verificados, backup e automação locais parcialmente comprovados. [Sprint 6](../../sprints/sprint-06.md) · [Backup local](../backup-recuperacao-postgresql-local.md) | Escopo parcial. Publicação e homologação acadêmica final em aberto. |
| Até 22/11, trabalho local após o calendário | Recepção e histórico PCDF, redesign, checkout integrado, geocodificação IPEDF e cadastro manual sintético. [Ativação manual](../desenvolvimento/ativacao-cadastro-manual-etapa-3.md) · [Commit local 3e1b3ad, seção 10](#10-git-e-github) | A atividade corresponde à conclusão funcional da Sprint 4. Os Sprints 5 e 6 permanecem com dependências abertas. |

O backlog planejado contém seis Sprints de entrega, precedidas pela Sprint 0 de preparação. Os arquivos enumeram 202 itens incluindo Features, PBIs e tarefas. Isso cria níveis de rastreabilidade dentro da mesma entrega. Os épicos transversais EP05, EP06 e EP07 aparecem nos registros locais de 11/11 como milestones 5, 6 e 7, respectivamente. O planejamento usa o campo **Sprint** para organizar o quadro. A consulta autenticada do GitHub confirmou PRs, issues e CI, porém o acesso disponível não retornou o quadro Projects nem os milestones ao vivo. A associação oficial vigente e mudanças de datas permanecem não confirmadas. [Histórico de versionamento](../desenvolvimento/auditoria-versionamento-sprint-04.md) · [Issues institucionais](https://github.com/CAMPUSCEUB/Sentinela/issues) · [Milestones institucionais](https://github.com/CAMPUSCEUB/Sentinela/milestones)

A arquitetura documentada define aplicação web, camada de serviços, PostgreSQL/PostGIS, identidade e integração externa. O checkout segue Next.js App Router, React 19, TypeScript, Tailwind e Leaflet. Os ADRs registram a transição da importação no navegador para operações autorizadas, a separação de baselines e a identidade temporária local. Documentos que descrevem as telas como integralmente demonstrativas correspondem a etapas anteriores. [README](../../README.md) · [Arquitetura](../arquitetura.md) · [Decisões técnicas](../decisoes)

## 3. Quadro das sprints

O denominador é o número de **PBIs planejados** por sprint. Features e tarefas filhas são evidência ou decomposição desses itens. A Sprint 0 é registrada separadamente. Sem pesos oficiais localizados, cada PBI vale um ponto. Concluído vale 1, parcial vale 0,5, a fazer vale 0. Item bloqueado vale 0,5 se existe parcela implementada e verificada. Publicação, #129, vale 0 porque o serviço institucional hospedado não foi homologado. A coluna **Aceite técnico**, mais estrita, considera só C sobre o total, com evidência suficiente para o critério original. O aceite acadêmico é registrado em separado. Os percentuais são arredondados ao inteiro mais próximo.

| Sprint | Escopo | Planejado PBI / todos os itens | C | P | A | B | Técnico | Aceite técnico | Situação, dependência e próxima ação |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 0 | Organização | 4 critérios reconstruídos | 2 | 1 | 1 | 0 | 63% | 50% | Cronograma e papéis definidos. Conciliar quadro e fechar evidências de preparação. |
| 1 | Interface e navegação | 6 / 21 | 6 | 0 | 0 | 0 | 100% | 100% | Aceite registrado para o escopo demonstrativo original. |
| 2 | Fluxos e mapas | 8 / 28 | 8 | 0 | 0 | 0 | 100% | 100% | Técnica e integração confirmadas para o escopo da época. Localizar aceite acadêmico. |
| 3 | Importação, mapas e contratos | 13 / 43 | 12 | 1 | 0 | 0 | 96% | 92% | Registrar teste interativo dos contratos e aceites formais. |
| 4 | Banco, identidade e persistência | 11 / 37 | 5 | 3 | 1 | 2 | 68% | 45% | Padronizar e testar as telas, alinhar leitor analítico, completar cadastro, permissões, usuários e estados da revisão. |
| 5 | Processamento e consultas reais | 9 / 30 | 3 | 5 | 0 | 1 | 67% | 33% | Homologar nomenclatura, RAs, coordenadas, deduplicação e consulta analítica consolidadas. |
| 6 | Histórico, operação e entrega | 13 / 43 | 2 | 6 | 2 | 3 | 46% | 15% | Validar observabilidade, restauração, histórico autorizado, release e entrega acadêmica. |
| **Total 1–6** | **Escopo planejado** | **60 / 202** | **36** | **15** | **3** | **6** | **46/60 · 77%** | **36/60 · 60%** | Continuação técnica da Sprint 4. |

**Rastreio dos PBIs.** Os identificadores são do backlog institucional. O status Aberta no GitHub indica fluxo do ticket. A classificação da auditoria reflete a evidência do critério e do ambiente.

| Sprint | C | P | A | B |
| --- | --- | --- | --- | --- |
| 0 | Cronograma e papéis, estrutura do repositório e planejamento | Evidência do quadro | Fechamento do backlog inicial e acordo de aceite | — |
| 1 | #29, #33, #95, #98, #101, #104 | — | — | — |
| 2 | #35, #38, #41, #44, #47, #50, #54, #57 | — | — | — |
| 3 | #60, #63, #66, #69, #73, #76, #79, #82, #85, #88, #91, #107 | #110, especificação gerada e validada, homologação interativa do serviço por concluir | — | — |
| 4 | #116 QA dos mocks da etapa, #120 modelo, #123 PostGIS, #126 migrations reproduzíveis, #151 leitura persistente no fluxo local | #113 QA da UI integrada, #145 perfis, #157 edição/inativação isoladas | #148 administração de usuários persistente | #142 identidade hospedada adiada, #154 cadastro manual isolado à espera de catálogo e autorização |
| 5 | #160 validação estrutural, #169 histórico, #175 tratamento de posição ambígua | #166 deduplicação de negócio, #172 resolução territorial/geográfica persistente, #178 indicadores, #181 análise espacial, #184 ensaios de desempenho | — | #163 qualidade e normalização de negócio antes da consolidação |
| 6 | #194 fonte recebida e inventariada, #197 integridade da preparação | #132 CI, #135 restauração local, #187 auditoria parcial, #207 integração, #210 QA, #213 documentação de entrega | #138 logs centralizados, #190 exportação analítica | #129 publicação, #200 histórico reservado, #203 validação analítica com dados consolidados |

Evidência para itens transversais abertos. [#151 consulta](https://github.com/CAMPUSCEUB/Sentinela/issues/151) · [#154 cadastro](https://github.com/CAMPUSCEUB/Sentinela/issues/154) · [#157 edição](https://github.com/CAMPUSCEUB/Sentinela/issues/157) · [#18 persistência](https://github.com/CAMPUSCEUB/Sentinela/issues/18) · [#19 motor](https://github.com/CAMPUSCEUB/Sentinela/issues/19) · [#20 dados reais](https://github.com/CAMPUSCEUB/Sentinela/issues/20) · [#21 análise persistente](https://github.com/CAMPUSCEUB/Sentinela/issues/21) · [#22 operação](https://github.com/CAMPUSCEUB/Sentinela/issues/22) · [#23 histórico](https://github.com/CAMPUSCEUB/Sentinela/issues/23) · [#24 análise](https://github.com/CAMPUSCEUB/Sentinela/issues/24) · [#206 homologação](https://github.com/CAMPUSCEUB/Sentinela/issues/206)

A Sprint 1 entregou a navegação, sidebar, header e as primeiras telas em modo demonstrativo. A Sprint 2 acrescentou tabela ordenável e paginada, busca, filtros, detalhes, cadastro, edição, inativação e affordances por perfil. Nessa entrega a gravação ficava em memória e a localização era um fluxo de interface. Desde então, consulta e staging passaram a ler PostgreSQL, a procura por CEP/endereço passou a usar ViaCEP/IPEDF e as novas mutações estão condicionadas à ativação ou ao ambiente isolado. Mapa de calor, pontos, clusters, satélite e filtros analíticos avançaram na Sprint 3. [Sprint 1](../../sprints/sprint-01.md) · [Sprint 2](../implementacao-sprint-02.md) · [Sprint 3](../homologacao-sprint-03.md)

A Sprint 3 entregou reconhecimento de cabeçalhos CSV/XLSX, mapeamento automático/manual, prévia e paginação, validação, duplicatas estruturais, pendências e estados de falha. O Worker limita o processamento e a simulação registrava o resultado demonstrativo. A persistência do histórico e da recepção real veio depois, na continuação da Sprint 4. O backlog de integridade de negócio ainda precisa decidir duplicatas históricas e consolidação. [Importação demonstrativa](../importacao-demonstrativa.md) · [ADR do processamento local](../decisoes/adr-importacao-demonstrativa-local.md) · [Etapa persistente](../desenvolvimento/auditoria-integracao-pcdf-real.md)

## 4. Progresso visual

Cada segmento representa aproximadamente dez pontos percentuais. Os números ao lado das barras preservam o denominador específico.

| Dimensão | Progresso | Base de cálculo |
| --- | --- | --- |
| Sprint 0 | `██████░░░░` 63% | 2,5/4 critérios de preparação |
| Sprint 1 | `██████████` 100% | 6/6 PBIs |
| Sprint 2 | `██████████` 100% | 8/8 PBIs no escopo previsto |
| Sprint 3 | `██████████` 96% | 12,5/13 PBIs |
| Sprint 4 | `███████░░░` 68% | 7,5/11 PBIs |
| Sprint 5 | `███████░░░` 67% | 6/9 PBIs |
| Sprint 6 | `█████░░░░░` 46% | 6/13 PBIs |
| Desenvolvimento do software | `███████░░░` 68% | 23/34 pontos sobre requisitos funcionais |
| Integração funcional | `█████░░░░░` 50% | 6/12 fluxos operando localmente conforme o recorte |
| Design e experiência | `███░░░░░░░` 33% | 3/9 telas principais com evidência recente de revisão específica |
| Banco e dados | `███████░░░` 65% | 6,5/10 controles e capacidades |
| Segurança | `██████░░░░` 63% | 5/8 controles ponderados |
| Testes e homologação | `██████░░░░` 60% | 36/60 PBIs com aceite técnico evidenciado |
| Preparação para publicação | `███░░░░░░░` 33% | 2/6 critérios ponderados. Zero releases institucionais de produção confirmadas. |
| Projeto geral | `████████░░` **77%** | 46/60 pontos dos PBIs, ponderação uniforme |

- **Software.** Conteio implementação e validação no escopo do RF, incluindo protótipo quando esse é o critério documentado. Com evidência suficiente RF01, RF02, RF04, RF08, RF10, RF11, RF13, RF16 a RF21, RF23 e RF25. Parciais RF03, RF05 a RF07, RF09, RF12, RF14, RF15, RF22, RF24, RF28, RF29 e RF31 a RF34. Por cumprir RF26, RF27 e RF30. Os estados operacionais seguem no inventário. [Requisitos v1](../requisitos_v1.md)
- **Integração.** Seis fluxos ativos confirmados no recorte local incluem login e RBAC, recepção PCDF em staging, histórico, consulta de associações, pesquisa pública por CEP/endereço e consulta dedicada de consolidadas com retorno vazio legítimo. Seis abertos incluem escrita geral no ambiente operacional ainda sem homologação própria, gravação manual, Central com mutações, edição/inativação, Dashboard e Mapa Criminal com leitores analíticos. A leitura geral do histórico local é ativa.
- **Design.** Nove telas principais existem. Importar, Ocorrências e Nova Ocorrência possuem evidências recentes específicas de redesign ou teste. Nova Ocorrência tem referência visual explícita fornecida pelo usuário. Uma segunda rodada transversal é necessária para registrar aceite visual do conjunto.
- **Banco.** Quatro completas, baseline, restauração local documentada, staging e histórico/consulta. Cinco parciais, RA, cadastro manual, revisão/consolidação, analytics e histórico ampliado. Naturezas homologadas disponíveis no banco valem zero.
- **Segurança.** Quatro comprovadas no escopo local, autenticação em loopback, RBAC no servidor, proteção no banco e configuração de credenciais fora do Git. Auditoria de operações e identidade hospedada recebem meio ponto cada. Administração persistente e controles de produção a fazer.
- **Publicação.** Build e CI valem um ponto, preparação das migrations e guias operacionais meio ponto cada. Infraestrutura hospedada isolada, identidade hospedada ativa e deploy com aprovação valem zero. O total geral vem dos 60 PBIs, evitando duplicidade entre esses recortes.

## 5. Inventário das telas

As telas abaixo foram confrontadas com as rotas, permissões, loaders, chamadas API e evidências de teste. A classe de estado distingue protótipo, operação local, homologação isolada e conectividade parcial. AD = Administrador, OP = Operador e AN = Analista.

| Tela | Estado e comportamento verificado | Lacuna para aceite |
| --- | --- | --- |
| **Login** `/login` | Operacional local. Seleciona o modo de autenticação, valida credenciais em servidor no modo local, inicia sessão sob Origin e host permitidos. Com sessão, a navegação passa pelo RBAC. | Recuperação administrativa e onboarding reais no modo hospedado, estados de erro e aceite visual integrados. |
| **Dashboard** `/dashboard` | Interface implementada. Filtros, indicadores, série temporal, natureza, ranking de RAs e mapa. Mock em modo de demonstração e cliente persistente em sessão local. O leitor analítico atual fica indisponível. | Corrigir conexão, testar vazio legítimo, obter consolidação autorizada, validar contagem e tema em desktop/mobile. |
| **Mapa Criminal** `/mapa-criminal` | Leaflet, polígonos oficiais na fonte persistente, pontos, densidade, clusters, satélite e filtros. Histórico de testes em dois temas e dispositivos. Compartilha o leitor analítico indisponível. | Provar fonte consolidada, datas, cobertura cartográfica, pontos válidos e degradação segura. |
| **Ocorrências** `/ocorrencias` | Operacional em leitura. Associações importadas para AD/OP, busca e filtros compatíveis, detalhe persistente com campos agrupados, pendências e opções de download autorizadas. Consolidadas para os três perfis, com total zero. | Cadastro manual operou no ensaio isolado. Homologar esse modo, filtros e navegação das três origens, além de edição/inativação quando ativadas. |
| **Nova Ocorrência** `/ocorrencias/nova` | Layout de duas colunas no desktop, empilhamento responsivo, Leaflet, ViaCEP/IPEDF, posição editável e validação do território. AD/OP. UI habilita o registro só quando validações e catálogo permitem. | Catálogos e SQL do cadastro ausentes na base operacional. Gravação, auditoria e consulta posterior são evidência isolada. Completar aceite com catálogos aprovados. |
| **Importar** `/importar` | AD/OP. Aba PCDF direta e histórico no localhost operacional. CSV/XLSX geral, prévia com Worker, validação, paginação, templates e contratos. Histórico real de janeiro e gravação geral qualificada em ambiente isolado. | Revisão e promoção de dados gerais/PCDF no ambiente unificado, mensagens por estado, limites hospedados e autorização de novos lotes. |
| **Usuários** `/usuarios` | AD. Interface e gestão demonstrativas com estado em memória. Autenticação local usa contas provisionadas fora dessa UI. | Definir administração autorizada, auditar criação/inativação e testar o isolamento por perfil. |
| **Configurações** `/configuracoes` | AD. Tema tem preferência local. Outros controles ainda exibem feedback local de salvamento. | Identificar os controles demonstrativos, evitar confirmação enganosa e persistir apenas as preferências aprovadas. |
| **Central de Revisão** `/central-revisao` | Política permite consulta nos três perfis quando o módulo está ativo. Fluxo isolado contém lista, detalhes e correções por papel. A UI retorna 404 se os modos necessários estão desligados e a inicialização 55484 não comprova a operação integrada. | Habilitar conforme escopo e comprovar trilha de alterações, correção e promoção com autorização explícita. |

| Rota auxiliar | Situação |
| --- | --- |
| `/` | Entrada que direciona ao login. |
| `/recuperar-senha` | Página pública de recuperação. Fluxo institucional depende de identidade, provedor de e-mail e links de retorno homologados. |
| `/atualizar-senha` | Restringida conforme identidade e modo de recuperação. O handler local de POST aceita login e logout. |
| `/acesso-negado` | Estado de identidade sem permissão. Acesso anônimo durante a auditoria redirecionou para login. |
| `/acesso-pendente` | Estado de cadastro ou vínculo sujeito à aprovação e provisionamento institucional. |
| URL inexistente | Next inclui `/_not-found` no build. O aceite visual do estado de erro compartilhado ainda está aberto. |

Evidências de layout e responsividade abrangem capturas históricas da Sprint 1, Sprint 3 e os ensaios recentes de Nova Ocorrência, Ocorrências e Importar. A rodada recente da Nova Ocorrência cobriu 1920, 1440, 1366, 1024, 768 e 390 px, temas claro/escuro, teclado e toque nos fluxos registrados. A aprovação transversal do checkout atual precisa incluir foco, leitura de estados sem cor, contraste, responsividade e latência percebida. [Páginas](../../src/app) · [Política](../../src/lib/auth/policy.ts) · [Evidências Sprint 3](../evidencias/sprint-03/README.md) · [Geocodificação](../desenvolvimento/geocodificacao-local-etapa-2.md) · [Ativação manual](../desenvolvimento/ativacao-cadastro-manual-etapa-3.md)

## 6. Banco e dados PCDF

### 6.1 Instâncias e arquitetura

| Ambiente | Evidência e limite |
| --- | --- |
| PostgreSQL operacional local, `127.0.0.1:55484/sentinela_pcdf_local` | Consultas em leitura confirmaram PostgreSQL 17.11, PostGIS 3.6.2 e migrations 0001–0005. Contém o lote real. O schema principal tem 19 tabelas com RLS forçada, 34 FKs, 80 índices computando índices de constraints, 55 triggers não internos e 17 funções. Schemas dedicados de recepção PCDF, consulta de ocorrência e importação geral estão presentes. A consulta de ocorrências usa views `security_invoker`. Schema do cadastro manual, carga dos catálogos e migration de identidade 0006 ausentes nessa instância. |
| Banco operacional histórico de desenvolvimento, `127.0.0.1:5432/sentinela_dev_operacional` | A carga `local-ra-0002` de 37 RAs e o leitor analítico foram documentados para esse alvo distinto. O número de RAs nesse histórico não implica carga na 55484. |
| Homologação privada e ambientes sintéticos | O modo de persistência isolada usa uma base própria, documentada na 55473. Os ensaios de cadastro manual usaram outro clone sintético descartável, com RAs e naturezas liberadas só para teste. |
| Supabase/PostgreSQL hospedado | Baseline preparada, dependências e compatibilidade verificadas estaticamente. Existência de implantação institucional homologada e ativação de negócios não confirmadas. |

As consultas de leitura confirmaram no operacional **zero** linhas nos catálogos de RAs e natureza, categorias e mapeamentos de natureza consultados, além de zero vínculos e ocorrências consolidadas. Há funções específicas de leitura de resumo, lista e detalhe, com parâmetros e filtros. O histórico geral usa schema e RLS próprios. A separação entre origem, staging, revisão e ocorrência consolidada mantém a procedência e evita publicação automática. [Migrations do núcleo](../../database/migrations) · [Funções de consulta](../../database/local/pcdf-sandbox/occurrences-read.sql) · [Catálogo RA em outro alvo](../catalogo-ras-carga.md) · [Baseline Supabase](../../database/supabase/README.md)

O backup local documentado gerou dump completo em área privada e restauração em destino descartável com verificação de integridade e testes negativos, incluindo hash divergente. Esta auditoria renovou a verificação de leitura e os testes estáticos, sem gerar novo backup nem restaurar o ambiente operacional. A retomada de janeiro documentada anteriormente e a prova sintética de cadastro após reinício têm escopos próprios. Restauração de identidade hospedada, rotina automatizada e metas de recuperação em produção estão em aberto. [Runbook de recuperação](../backup-recuperacao-postgresql-local.md) · [Etapa 3](../desenvolvimento/ativacao-cadastro-manual-etapa-3.md)

### 6.2 Origem, processamento e integridade

- A fonte em `SENTINELA-DADOS` é `360 - OCORRÊNCIAS CRIMINAIS - 20 NATUREZAS - TODO O DF - 2021 A 2026.xml`, com **841.730.010 bytes**. `processar_pcdf.py`, `tratar_pcdf.py`, `pcdf_integral.py` e `pcdf_layout.py` preparam o layout de **34 campos**, partindo de 18 originais e preservando campos derivados e técnicos. O manifesto `sentinela-dados-integral-1` contém **369.660 associações** de janeiro de 2021 a agosto de 2026, com agosto parcial na fonte. Foram conferidos tamanho e SHA-256 do XML e de **70 CSVs**, sendo 68 mensais e dois artefatos agregados. A contagem da fonte é de associações.
- A preparação aponta **349.582 chaves candidatas** e **19.262 chaves candidatas com múltiplas naturezas**. É necessário homologar a regra de identidade antes de calcular ocorrências únicas. A classificação de origem inclui **41 descrições literais e 19 categorias identificadas**. O projeto prevê **20 categorias analíticas**. A matriz registra dois exemplos documentados e **39 relações pendentes**, sem nenhuma regra de carga aprovada. Janeiro tem **34 descrições observadas** no inventário do cadastro manual.
- SHA-256 do manifesto `892ec5e61d493088bb9c7008bbaadfa4566401fd32df64562bc0684da7fcff8e`. SHA-256 do XML `faf82ae0620fa3ecc53bc002d9c2e49b24b6ec0126a44449510d12948dc0a022`. SHA-256 do CSV mensal de janeiro `e202df3622fbd5f0b4ae53e7a8f435bce9ad58ff30a43a3c248ce2d369fd3770`. [Contrato PCDF](../contratos/importacao-pcdf-v1.0.md) · [Inventário](../catalogos/pcdf-inventario-v1.json) · [Matriz](../catalogos/pcdf-correspondencias-v1.json) · [Janeiro](../desenvolvimento/piloto-pcdf-2021-01.md)

| Integridade na base 55484 | Resultado da consulta |
| --- | ---: |
| Lote PCDF e execução correspondente | 1 e 1 |
| Registros de origem / staging | 6.393 / 6.393 |
| Campos preservados por associação | 34 |
| Pendências abertas | 20.020 |
| Eventos de auditoria no escopo PCDF conferido | 2 |
| Ocorrências consolidadas / publicadas no analítico | 0 / 0 |
| Meses reais recebidos / previstos na fonte preparada | 1/68 |

As pendências por campo correspondem a 6.393 de mapeamento de natureza, 6.393 de mapeamento de RA, 8 de RA de origem, 833 de endereço e 6.393 de coordenadas (5.370 inválidas, 934 com referência para revisão e 89 ausentes). O conjunto e os fingerprints de integridade coincidiram com a evidência operacional anterior. Consultas leram a primeira página de 25 associações, a última de 18 e um detalhe de 34 campos para os perfis autorizados. O Analista teve leitura de consolidadas e nenhum acesso a staging. [Modelo de integração](../desenvolvimento/modelagem-integracao-pcdf.md) · [Recepção piloto](../desenvolvimento/piloto-pcdf-2021-01.md) · [SQL da consulta](../../database/local/pcdf-sandbox/occurrences-read.sql)

Restam **67 meses e 363.267 associações** da preparação. A suspensão é deliberada. Após a aprovação das telas e autorização da retomada, cada nova carga exige manifesto, verificação de identidade, backup recuperável, leitura de conferência, tratamento de pendências e aceite formal separado de qualquer promoção.

### 6.3 Nova Ocorrência e catálogos

ViaCEP preenche dados postais unitários preservando a digitação. O **Geocode IPEDF** atende consultas explícitas de endereço público e pesquisas por CEP na implementação local. O proxy `POST /api/ocorrencias/geocode` limita o resultado externo a cinco, serializa consultas com intervalo mínimo de 1,1 s e timeout de 8 s, usa ausência de cache para IPEDF e devolve 429, 503 ou 504 conforme a falha. Nominatim público foi analisado como alternativa na etapa e o fluxo local vigente utiliza IPEDF. O resultado é aproximado, admite escolha entre resultados e requer confirmação. CEP genérico pode ficar somente como informação postal. O marcador pode ser clicado, arrastado ou ajustado pelas coordenadas. O GeoJSON IDE/DF valida limites, inconsistências de RA, pontos exteriores e geometria ambígua. O mapa funciona com a cartografia local quando a busca falha. [Implementação IPEDF](../../src/lib/geocoding/ipedf.ts) · [Validação em navegador e serviços](../desenvolvimento/geocodificacao-local-etapa-2.md) · [Manual IPEDF](https://geocode.ipe.df.gov.br/tutorial/geocode-api.pdf) · [ViaCEP](https://viacep.com.br/) · [Política Nominatim](https://operations.osmfoundation.org/policies/nominatim/)

As **37 RAs** possuem geometria preparada. A correspondência cartográfica é técnica, com vigência territorial e o código XXXVII de Ponte Alta ainda por confirmar institucionalmente. Há **41 naturezas candidatas, zero homologadas** para gravação real. A classificação de origem e a analítica têm contratos separados. Os seeds demandam evidências de aprovação. [Revisão territorial](../revisao-oficial-catalogo-ras.md) · [Matriz manual](../catalogos/naturezas-manuais-matriz-aprovacao.md) · [Etapa 1](../desenvolvimento/homologacao-catalogos-manuais-etapa-1.md)

A implementação isolada valida data e hora, endereço, setor, RA, coordenadas WGS84 confirmadas e pelo menos uma natureza ativa. Escreve a ocorrência e seus vínculos em transação, materializa a geometria PostGIS, registra autoria, usa chave de idempotência, testa rollback e permite consulta pela mesma interface depois do reinício. O estado inicial `em_revisao` fica separado de registros importados e consolidados. A evidência anterior registrou dois cadastros, quatro associações, duas auditorias e dois recibos sintéticos, com Administrador e Operador. O Analista pôde consultar registros e recebeu 403 ao tentar cadastrar. Em 55484, o pacote estrutural `manual-occurrences.sql`, `manual-catalog-codes.sql` e `manual-catalog-release.sql` e a carga de catálogos aprovados continuam pendentes. A API de catálogo retornou 503 no ensaio operacional anterior e o botão de registro permaneceu desabilitado. A prova em leitura da ausência de camadas e dados no banco foi renovada nesta auditoria. [Implementação SQL](../../database/local/pcdf-sandbox/manual-occurrences.sql) · [Liberação de catálogo](../../database/local/pcdf-sandbox/manual-catalog-release.sql) · [Etapa 3](../desenvolvimento/ativacao-cadastro-manual-etapa-3.md)

### 6.4 Dashboard e Mapa Criminal

O contrato e a consulta persistente estão implementados. Indicadores, série, ranking territorial e distribuição por natureza usam visibilidade e contagem de ocorrências por **ID distinto** na fonte autorizada. A distribuição por natureza permite que a mesma ocorrência esteja em categorias diferentes. O mapa limita a resposta de pontos e referência de densidade a 5.000 pontos por lista, usa coordenadas elegíveis, máscara cartográfica e controles Leaflet. Heatmap, pontos, clusters, satélite, alternância de camadas e filtros têm cobertura de protótipo e testes de referência. O modo demonstrativo usa dados mock e a versão persistente mantém carregamento, falha e vazio separados. [Consulta analítica](../../src/lib/db/analytics-query.ts) · [Contrato](../../src/contracts/persistent-analytics.ts) · [Evidência analítica Sprint 3](../evidencias/sprint-03/resultados/analytics.json)

**Defeito confirmado por código e configuração da inicialização.** A rota `/api/v1/analytics/persistente` usa `readLocal → readOperational → operationalConfig`, que exige um leitor configurado para `5432/sentinela_dev_operacional`. Na inicialização homologada de `npm run dev:local`, `direct_runtime.app_environment` limpa `SENTINELA_LOCAL_READER_URL`, desliga o modo isolado e ativa o fluxo PCDF no banco 55484. Esse fluxo não fornece leitor analítico alternativo para a rota. O resultado esperado do handler é 503, independentemente do número de consolidadas. O teste HTTP autenticado fresco desse endpoint ficou pendente. Uma consulta válida no banco 55484 deve primeiro retornar coleção vazia legítima. Após liberação da consolidação, deve filtrar pela classificação aprovada, testar contagem distinta, cobertura de coordenadas e diferenças entre totais, mapa e categorias. [Inicialização](../../database/local/pcdf-sandbox/serve-import-3000.py) · [Ambiente](../../database/local/pcdf-sandbox/direct_runtime.py) · [Rota](../../src/app/api/v1/analytics/persistente/route.ts)

## 7. APIs e backend

Os 17 caminhos versionados de runtime estão agrupados abaixo. A especificação validada descreve 20 paths e 24 operações, incluindo contratos e metadados cujo funcionamento depende do modo. Caminho construído, contrato validado e fluxo operacional são evidências distintas. [Código das rotas](../../src/app/api/v1) · [OpenAPI](../contratos/openapi-v0.1.0.json)

| Caminhos | Métodos e estado |
| --- | --- |
| `/auth/[action]` | GET/POST. Login e logout locais ativos. Callback, recuperação e vínculo hospedados dependem de configuração e aceite institucional. |
| `/api/ocorrencias/geocode` | GET/POST. POST ativo localmente para consultas públicas com IPEDF configurado. Validação no servidor, filtro territorial e controle de chamadas. |
| `/api/v1/analytics/persistente` | GET. Consulta SQL e schemas presentes. Leitor indisponível na inicialização operacional 55484. |
| `/api/v1/catalogos/regioes-administrativas`, `/api/v1/catalogos/naturezas-criminais` | GET. Leitura isolada validada. Na Nova Ocorrência, a ausência do catálogo aprovado bloqueia o registro. A geometria de referência permanece utilizável. |
| `/api/v1/ocorrencias/consulta` | GET. Leitura dedicada com modo, filtros, detalhe e paginação. Importadas e consolidadas confirmadas em SQL. A interface de cadastro manual usa o endpoint próprio para completar a consulta. |
| `/api/v1/ocorrencias`, `/api/v1/ocorrencias/[id]`, `/api/v1/ocorrencias/[id]/inativacao` | GET/POST de coleção, GET/PATCH de detalhe e POST de inativação. Fluxos de escrita persistente qualificados em ambiente isolado. Na operação 55484, a consulta usa a rota dedicada. |
| `/api/v1/ocorrencias/manuais` | GET/POST. Contrato, sessão, permissão, validações, idempotência e transação em banco sintético. Depende do SQL de ativação e de catálogo aprovado em 55484. |
| `/api/v1/importacoes/pcdf/direta` | GET/POST. Recepção de lote mensal e consulta no alvo operacional, com CSV até 16 MiB, até 10.000 registros e manifesto até 1 MiB. A retomada de novos lotes está suspensa por decisão. |
| `/api/v1/importacoes/pcdf`, `/api/v1/importacoes/pcdf/[id]/consolidacao` | GET/POST no módulo de workspace e POST de consolidação. A recepção operacional usa a rota direta. Promoção/consolidação existente no SQL isolado, pendente de critérios de negócio e autorização. |
| `/api/v1/importacoes/geral`, `/api/v1/importacoes/geral/[id]` | GET/POST de coleção e GET de detalhe. Histórico e detalhe operacionais. Gravação geral CSV/XLSX qualificada com dados sintéticos, prévia local de até 50 MiB. |
| `/api/v1/importacoes/geral/revisao`, `/api/v1/importacoes/geral/revisao/[id]`, `/api/v1/central-revisao`, `/api/v1/central-revisao/[id]` | GET de fila e PATCH por ID. Implementações isoladas e escopo por perfil. Exigem validação operacional da Central e do fluxo de promoção. |

Administração persistente de usuários e preferências, exportação analítica, logs centralizados e homologação da API hospedada estão pendentes. O Worker do upload é de leitura e pré-validação no navegador. Processamento durável, tarefas assíncronas de produção e uploads grandes exigem desenho de operação hospedada. [Contrato PCDF](../contratos/importacao-pcdf-v1.0.md) · [Central de Revisão](../funcionalidades/central-revisao-ocorrencias-v1.0.md) · [Guia de implantação Sprint 4](../guia-implantacao-sprint-04.md)

## 8. Autenticação e segurança

| Rota / operação | AD | OP | AN | Alcance confirmado |
| --- | --- | --- | --- | --- |
| Dashboard, Mapa e consulta de consolidadas | Sim | Sim | Sim | Proteção de rota e leitura por perfil. O endpoint analítico tem o bloqueio de conexão da seção 6.4. |
| Ocorrências importadas e detalhe de staging | Sim | Sim | Não | SQL consultado em leitura, com isolamento por papel. |
| Nova Ocorrência e criação manual | Sim | Sim | Não | Guarda em servidor e gravação isolada. Consulta do cadastro manual liberada para os três perfis no ensaio sintético. |
| Edição e inativação | Sim | Sim | Não | Matriz e serviço isolado. Operação real sujeita à revisão e à autorização. |
| Importar, histórico geral e recepção PCDF | Sim | Sim | Não | Matriz e guardas na aplicação. Recepção real existente. |
| Central, consultar quando ativa | Sim | Sim | Sim | Política permite a rota. Dados de origem/staging e botões dependem da operação específica. |
| Central, corrigir | Sim | Não | Não | Permissão `corrigir` e função de revisão por operação. Promoção requer autorização própria. |
| Usuários e Configurações | Sim | Não | Não | Restrições em navegação e rota. Persistência administrativa pendente. |

`proxy.ts`, `routePermission`, `canVisit` e `hasPermission` protegem navegação e rotas. Os handlers validam identidade e permissão novamente. A ausência de sessão tende a produzir redirecionamento nas páginas e 401 nas APIs autenticadas. Sessão válida sem permissão gera estado de acesso negado ou 403 conforme o handler. Acesso anônimo, matriz e códigos de resposta têm cobertura Node. As consultas em PostgreSQL confirmam perfis sem superusuário ou `BYPASSRLS`, com RLS forçada no núcleo. Evidência de gravação manual e rollback vem do banco sintético.

No modo local, `localPost` exige Origin e Host configurados, aceita somente login e logout, valida tamanho e tipo do formulário e emite cookie HttpOnly e SameSite Strict. O armazenamento de contas/sessões depende do ambiente local autorizado, com scrypt e arquivos privados. A configuração de implantação deve manter segredos exclusivamente no servidor. A trilha atual cobre operações PCDF e ações sintéticas qualificadas. Falta auditoria centralizada, revogação e revisão de privilégios hospedados. [Política](../../src/lib/auth/policy.ts) · [Sessão local](../../src/lib/auth/local-provider.ts) · [Handler local](../../src/lib/auth/local-handler.ts) · [RLS local](../../database/local/rls-homologacao.md)

Supabase Auth está **deliberadamente adiado**. Há SDK, baseline, guardas, vínculo de identidade e a migration `0006_auth_vinculo_acesso.sql`. `businessDataEnabled()` permanece falso para o escopo institucional de acesso a dados. Produção exige provisionamento, convite, validação de callback, recuperação, e-mail, isolamento de perfis, expiração, revogação e testes que comprovem ausência de acesso indevido. [Implementação Auth Supabase](../banco/autenticacao-supabase-etapa2-2.md) · [Migration de vínculo](../../database/supabase/migrations/0006_auth_vinculo_acesso.sql) · [Guia oficial RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 9. Testes

| Verificação | Resultado nesta auditoria | Limite |
| --- | --- | --- |
| TypeScript e ESLint | Aprovados, incluindo ESLint com zero avisos. | Tipagem e estilo. |
| Node | **264/264** aprovados, 46 arquivos de suíte. | Cobertura de contratos, integração por adaptadores, RBAC, importação, localização, idempotência e testes estáticos de SQL. A aprovação tampouco valida todos os serviços externos e operações na base real. |
| Python | **30/30** aprovados nas suítes selecionadas, 11 de segurança estática e 19 de validação/comparação da baseline Supabase. | Contagem das suítes executadas nesta auditoria. As suítes que exigem gravação no banco não foram repetidas. |
| PostgreSQL/PostGIS estático | Migrations 0001–0005 e regressão analisadas. 43 comandos negativos SQL compilados estaticamente. Baseline Supabase equivalente nas diferenças permitidas. | Leitura do AST e sintaxe. O analisador inicial sem a dependência local falhou na preparação, e a repetição com a dependência já instalada passou. |
| PostgreSQL/PostGIS em execução | Consultas somente leitura confirmaram versão, RLS, tabelas, integridade, perfis de consulta e o lote de janeiro. | Replicação hospedada, desempenho realista e operações de escrita ficaram fora da rodada. Provas anteriores em bancos sintéticos cobrem triggers, geometria, rollback e restauração. |
| Contratos e OpenAPI | 36 schemas, 20 paths, 24 operações e 32 payloads. Catálogos e totais conciliados. | Homologação interativa e hosted pendentes. |
| Rotas estáticas | 9 rotas previstas e 632 imports locais resolvidos. | Páginas de erro, serviços externos e autenticação são verificados separadamente. |
| Build | Next.js 16.4.6 e Turbopack, build otimizado isolado aprovado, 20 entradas de prerender geradas. | Build local sem substituir o servidor já ativo. |
| Navegador e HTTP | **14/14 verificações anônimas em Edge** e **4/4 HTTP 401** nos endpoints amostrados de analytics, consulta, catálogo e importação. O primeiro roteiro esperava a URL de acesso negado para um visitante anônimo. A repetição com a expectativa da guarda correta passou. | Sessão autenticada completa e capturas do conjunto atual não foram renovadas. Evidências anteriores cobrem regressão visual e fluxo autenticado. |
| Arquivos PCDF e Git | 70 CSVs e XML com tamanho e hash compatíveis com o manifesto. `git diff --check` do checkout inicial aprovado. | Verificação de integridade sem abrir ou reapresentar registros policiais. |

Os resultados históricos apoiam cobertura, sem compor uma soma com a rodada atual. A Sprint 3 tem nove grupos de navegador e rodadas de tentativa registradas. As Etapas 2 e 3 documentam seis larguras, tema, navegação, CEP válido/inexistente, busca ambígua, mapa, localização fora do DF, persistência de teste e consulta após reinício. A combinação completa de temas, perfis, tecnologias assistivas, indisponibilidade de serviços, autenticação hospedada, carga simultânea, P95 e produção permanece aberta. [Testes Node](../../tests) · [Testes de banco](../../database/local/tests) · [Evidências de navegador Sprint 3](../evidencias/sprint-03/README.md) · [Homologação Etapa 3](../desenvolvimento/ativacao-cadastro-manual-etapa-3.md)

## 10. Git e GitHub

| Referência | Resultado |
| --- | --- |
| Trabalho principal | `feat/redesign-interface` sem upstream, HEAD `3e1b3adb8b597c393a3bb3fe0d18c38f1166c9f0`. `feat/importacao-persistente-localhost3000` aponta para o mesmo commit. |
| Repositório institucional `ceub` | Visibilidade interna. `main` remota verificada em `69a8bdeb0a4673bd3f7e1cfb727e5499a5971d8d`. O HEAD está 10 à frente e 0 atrás. [CAMPUSCEUB/Sentinela](https://github.com/CAMPUSCEUB/Sentinela) |
| Repositório pessoal `origin` | `main` remota verificada em `6014e899b88b0f11b7ab2d8fa979e2cee5adb958`. O HEAD está 87 à frente e 0 atrás. [Augusto0l/SENTINELA](https://github.com/Augusto0l/SENTINELA) |
| `main` local | `2f5eea969af42c7389d306b4920cf48529f4d11c`, antecede o HEAD em 12 commits. O upstream local configurado é a `main` pessoal. |
| Worktrees encontrados | Principal e checkout preexistente limpo `.cache/pcdf-receptor-worktree`, branch `feat/integracao-pcdf-real` em `7d3b616`. |
| Demais referências locais | Linhas de Sprint 3 contratos, Sprint 4 PostGIS/Auth/homologação, `integracao-pedro`, alternativas de autoria e referências `backup/pr226-20261119/*`. As funções das linhas devem ser confirmadas antes de reorganizar. |
| Alterações preexistentes | **52 arquivos modificados sem stage e 34 não rastreados**, 86 ao todo. Distribuição por grupo: `src` 45, `database` 12, `docs` 11, `scripts` 8, `tests` 6, README/ESLint/Next/package 4. |
| Estado final | 52 modificados sem stage e 36 não rastreados, incluindo os dois Markdown da auditoria. Nenhum commit, push, merge, PR ou worktree criado na auditoria. |

Os dez commits do HEAD ausentes da `main` institucional, do mais antigo ao mais recente, são `fbcf52e`, `367b131`, `a154729`, `e7d3778`, `c80984e`, `46e5465`, `e9b63ac`, `7d3b616`, `fa13e51` e `3e1b3ad`. A faixa cobre preparação e recepção PCDF, piloto, integração persistente e redesign de importação. Os remotes consultados não retornaram a referência de mesmo nome da branch atual. A auditoria não verificou alcançabilidade de cada SHA a partir de todas as demais branches remotas.

PRs históricos da seção 2 estão integrados. O [PR 230](https://github.com/CAMPUSCEUB/Sentinela/pull/230) foi encerrado sem merge. O [workflow institucional 44588736449](https://github.com/CAMPUSCEUB/Sentinela/actions/runs/44588736449) passou no commit `69a8bde` com checks de qualidade e build. A evidência do GitHub cobre esse commit institucional. A situação das issues abertas e o status não confirmado dos milestones constam nas seções 2 e 3.

Risco alto de perda, conflito e falta de autoria rastreável. Entre os arquivos novos estão APIs de consulta e cadastro, SQL do cadastro, catálogo, condições de ativação e testes. Entre os rastreados modificados há interface, regras persistentes e mudanças de tooling que podem conflitar com outros PRs. Em etapa futura autorizada, revisar o diff com os autores, preservar cópia privada das mudanças, classificar grupos pequenos por assunto, excluir artefatos policiais e credenciais do material a registrar, associar issues e provas e integrar em uma branch institucional com CI e revisão humana. A auditoria apenas registra a proposta. [Histórico de versionamento](../desenvolvimento/auditoria-versionamento-sprint-04.md)

## 11. Principais riscos

| Risco | Impacto | Evidência e controle proposto |
| --- | --- | --- |
| Conexão persistente fragmentada | Alto. Dashboard e Mapa ficam indisponíveis com a autenticação local. | Reproduzir 503 com a inicialização homologada e integrar leitor de perfis mínimos na instância autorizada. Exibir vazio legítimo na ausência de consolidação. |
| Classificação e territorialidade sem decisão | Alto. Gravação manual e consolidação podem atribuir natureza, território ou precisão sem base válida. | Assinar matriz de naturezas, códigos, vigência e regras de coordenadas. Separar classificação criminal, categoria analítica e precisão do ponto. |
| Inflação de estatística e publicação indevida | Alto. Uma ocorrência pode ter várias associações. Staging contém pendências e cobertura temporal parcial. | Definir identidade, conciliar origem e consolidação, testar multiplicidade e manter publicação dependente de concessão explícita. |
| Sucesso apresentado sem persistência | Alto para gestão. Configurações e Usuários têm interações demonstrativas. | Tratar por estado de capacidade e validar retorno do servidor para operações contratadas. |
| Dados de localização em provedores externos | Alto em uso sensível. Texto livre pode incluir endereço identificável e serviços externos podem falhar. | Restringir o fluxo a geografia pública autorizada, sancionar o adaptador de produção, conservar alternativa manual e cuidar dos registros de acesso. |
| Trabalho não versionado e histórico paralelo | Alto para perda e conflitos. 86 caminhos de trabalho preexistentes, cerca de dez commits fora da main institucional. | Preservação privada e organização autorizada por entregas com autoria, CI e testes anexos. |
| Evidência contemporânea incompleta | Alto para aceite. Há validações anteriores por tela e por banco, sem rodada autenticada completa deste corte. | Repetir a matriz com base sintética e os três perfis. Atualizar o quadro e obter aceite de responsável. |
| Ambiente hospedado sem homologação | Alto. A configuração de identidade local, o upload e os backups têm premissas locais. | Validar isolamento, identity, privilégios, limite de upload, restauração e operação autorizada. |

### Viabilidade de publicação

| Ambiente | Estado e critério |
| --- | --- |
| Local | Next.js e PostgreSQL 17/PostGIS em loopback, com sessão local e leitura da origem real. Guias e recuperação documentados. Os bloqueios analíticos, de catálogos e de revisão seguem abertos. |
| Homologação | Há modos locais privados para dados sintéticos, provas de baseline/Supabase e scripts. Preview público do repositório pessoal respondeu em HTTPS com redirecionamento 307 para a tela de login. Identidade, dados e operações hospedadas exigem ambiente e aceite institucionais próprios. |
| Produção | Nenhuma release operacional institucional confirmada. Vercel é candidata do projeto e Supabase/PostgreSQL hospedado está preparado em SQL. Falta aprovação de ambiente, topologia, dados e identidade. |

A trilha de produção requer PostgreSQL/PostGIS provisionados, versões e extensões conferidas, migração revisada com restauração ensaiada, RLS testada por papel, banco com rede restrita, rotação de segredos e sessão hospedada. O fluxo operacional atual usa serviços locais com premissas de loopback e arquivos privados. Desenvolvimento, homologação e produção precisam de projetos, chaves e dados isolados. [Guia de implantação](../guia-implantacao-sprint-04.md) · [Ambientes Vercel](https://vercel.com/docs/deployments/environments) · [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Backup Supabase](https://supabase.com/docs/guides/platform/backups)

Na Vercel, o limite de corpo padrão das Functions é **4,5 MB** e a opção de **20 MiB** está em beta público com requisitos de plano e configuração. Os limites locais incluem 16 MiB para CSV PCDF e prévia geral de 50 MiB. Reavaliar o transporte antes de homologação hospedada, por exemplo, envio direto para armazenamento privado e processamento por tarefas com tempo, memória, idempotência e trilha da execução. Também são necessários domínio institucional e HTTPS, pipeline de release com rollback, backup sem exposição, verificação de logs e alertas, acessos operacionais auditáveis e ensaio de carga. Os alvos documentados são P95 em cerca de 3 s, disponibilidade mensal de 99,5%, RPO de até 24 h e RTO de até 4 h. Nenhum desses alvos foi comprovado em produção. [Limites oficiais Vercel](https://vercel.com/docs/functions/limitations) · [Requisitos não funcionais](../requisitos_v1.md)

## 12. Pendências completas

Os IDs abaixo pertencem à auditoria. A indicação de sprint e, quando disponível, a issue dão rastreabilidade ao planejamento. Complexidade é de implementação e homologação, sem estimar prazo de aprovação institucional. P0 bloqueia um marco essencial. P1 tem impacto elevado nos critérios de entrega. P2 trata qualidade e P3 é polimento.

| ID / prioridade | Funcionalidade, tipo e motivo | Dependências | Complexidade / Sprint | Situação e critério de conclusão |
| --- | --- | --- | --- | --- |
| P0-01 | **Dashboard e Mapa. Defeito de conexão.** A inicialização local seleciona leitor incompatível com o banco autorizado. | Identidades SQL existentes e isolamento por perfil. | Média · 4/5 · #21 | Confirmado por código. Endpoint autenticado funciona no alvo 55484 com três perfis, retorna vazio legítimo e passa com consolidadas sintéticas. |
| P0-02 | **Catálogos. Decisão institucional.** Confirmar vigência e códigos das 37 RAs e aprovar as naturezas de cadastro e os mapeamentos PCDF. | Responsáveis de catálogo, base territorial, matriz de proveniência e mudanças aprovadas. | Alta · 4/5 · #154, #163 | 37 geometrias preparadas e zero naturezas aprovadas. Matrizes assinadas, com data de vigência, versionadas e verificadas em clone. |
| P0-03 | **Cadastro manual. Ativação pendente.** API transacional sem SQL e dados operacionais. | P0-02, migração e seeds revisados, backup/recuperação, autorização específica. | Alta · 4 · #154 | Homologado sinteticamente. Estender prova a catálogo aprovado, matriz AD/OP/AN, auditoria, idempotência e consulta posterior antes da liberação. |
| P0-04 | **Central e consolidação. Regra de negócio pendente.** Sem procedimento validado para transformar associações em ocorrências confiáveis. | P0-02, identidade/deduplicação, elegibilidade de coordenadas, revisão e decisão explícita. | Alta · 5/6 · #163, #166, #203 | SQL isolado. A Central registra autoria e justificativa. Ensaio distingue associação, ocorrência única, rejeição, erro e reprocessamento. |
| P0-05 | **Histórico PCDF. Decisão adiada.** Concluir as telas antes de novos meses e tratar pendências do piloto segundo os critérios aprovados. | Aceite de P1-01, P0-02/04, backup e autorização de retomada. | Alta · 5/6 · #200 | Janeiro preservado e outros 67 meses suspensos. Manifesto por lote, comparação de totais, revisão das pendências e promoção com autorização. |
| P0-06 | **Produção. Condição de segurança.** Identidade institucional adiada, RLS e proteção de dados hospedadas pendentes. | Ambiente isolado, decisão de hospedagem, migrations, responsáveis por dados/autorização. | Alta · 4/6 · #142, #129 | Baseline pronta. Perfis, onboarding, expiração, revogação, backups e testes comprovados antes de qualquer ativação de dados ou produção. |
| P0-07 | **Versionamento. Risco de perda e conflito.** Trabalho que altera fluxos críticos sem registro de versão. | Aprovação de procedimento pelos autores e mantenedor. | Média · 4/6 · #206 | 86 caminhos preexistentes. Prova privada preservada, mudanças agrupadas por autoria e issues, com CI e revisão na futura integração. |
| P1-01 | **Telas. Homologação do redesign.** Completar padrão visual, responsividade, foco, contraste, menus, erro, vazio, carregamento e bloqueio por perfil. | Referências aprovadas, P0-01 para estado real e dados sintéticos. | Média · 4 · #113 | Nove telas construídas e três com revisão recente. Checklist das nove, rotas auxiliares, temas, dispositivos e três perfis com aceite. |
| P1-02 | **Ocorrências. Completar modalidades, CRUD e ações.** Preservar filtros, paginação, detalhe importado, consulta manual e edição/inativação autorizadas. | P0-02/03, políticas de revisão e autoria. | Alta · 4 · #151, #157 | Leitura importada comprovada. Confirmar persistência das ações aprovadas e diferenças entre origens com testes após reinício. |
| P1-03 | **Importação geral e Central. Habilitação por modo.** Validar histórico, detalhe, erro do Worker, revisão por perfil e promoção. | P0-04 e ambiente de teste privado. | Média · 4/5 · #19 | Histórico operacional e escrita sintética. Repetir fluxo CSV/XLSX sintético, fluxos de erro e estados no alvo autorizado. |
| P1-04 | **Usuários e Configurações. Funcionalidade pendente.** Separar a gestão de usuários e preferências do estado local demonstrativo. | Matriz de permissões, provisionamento, decisão de identidade em P0-06. | Alta · 4 · #148 | UI demonstrativa. AD autorizado, trilha e feedback condizentes com a operação, tema preservado. |
| P1-05 | **Dashboard e mapa. Aceite analítico.** Validar séries, filtros, contagem distinta, distribuição, coordenadas, satélite, limites e exportação. | P0-01/02/04. Dados sintéticos podem antecipar a validação de cálculo. | Alta · 5/6 · #178, #181, #190, #203 | UI e contrato disponíveis. Reconciliação por identidade, deduplicação, cobertura de pontos e relatório autorizado. |
| P1-06 | **Regressão e aceite acadêmico.** Provar ambiente, versão, cenários e backlog de cada sprint. | P1-01, ambientes sintéticos, responsáveis e evidências dos PRs. | Média · 3/4/6 · #110, #210, #213 | Rodadas técnicas disponíveis. Matriz autenticada atual, contrato interativo, ata e links por critério de entrega. |
| P1-07 | **Produção. Entrega e operação.** Terminar preview privado, release, rollback, upload, backups e alertas. | P0-06, P2-02, P2-03 e P1-06. | Alta · 6 · #129, #132, #135, #138 | CI e ensaio local. Ambiente institucional aprovado, TLS/domínio, teste de recuperação RPO/RTO, monitoramento e release registrada. |
| P2-01 | **Geocodificação. Qualidade e privacidade.** Provar término de chamadas, resultados aproximados, serviços indisponíveis e uso autorizado de fontes. | Decisão sobre provedor e política de dados. | Média · 5 · #172, #175 | ViaCEP/IPEDF local testado. Documentar volumes, bloqueios, contingência com mapa/coordenadas e conformidade de envio para produção. |
| P2-02 | **Desempenho. Medição representativa.** Medir paginação, análise e mapa com volume, planos e concorrência. | P0-01, dados sintéticos representativos e versão candidata. | Média · 5/6 · #184 | Validação básica. Relatório com P95, cenário, volume, índices e qualidade das agregações. |
| P2-03 | **Operação. Logs e observabilidade.** Correlação e métricas de falha sem material policial. | Ambiente homologado e responsáveis pelos dados. | Média · 6 · #138, #187 | Auditoria local por ação. Alertas, remediação, retenção e sanitização verificados. |
| P2-04 | **Engenharia. Documentação e automação.** Atualizar descrições de protótipo, comandos, diagramas, modos locais e release. | P0-07, dono da documentação e fechamento de decisões. | Baixa · 4/6 · #132, #213 | Guias espalhados e regras demonstrativas históricas. Uma sequência versionada reproduzível para desenvolvimento, homologação e release. |
| P3-01 | **Interface. Polimento final.** Refinar alinhamento, estados de transição, microcópia e consistência das capturas. | P1-01 e referência final aprovada. | Baixa · 4/6 · #113, #210 | Ajuste incremental após os defeitos de interface. Checklist de contraste, foco e rótulos já deve fazer parte da homologação principal. |

## 13. Plano de conclusão

1. **Fechar a base visual e a conexão da Sprint 4.** Corrigir P0-01 em ensaio isolado, confirmar leitura e erros por perfil e auditar as nove telas e auxiliares. Foco em Dashboard/Mapa, Ocorrências, Nova Ocorrência, Importar, depois Central, Usuários, Configurações e Login. Entrega com temas, larguras, acessibilidade e receitas de regressão. P0-07 tramita em paralelo, sob autorização.
2. **Validar os catálogos e o cadastro manual sem depender de histórico adicional.** Encaminhar P0-02 aos responsáveis enquanto o redesign avança. Gravação, rollback, consulta e bloqueio de Analista podem ser exercitados em banco sintético. Só ativar com matrizes aprovadas e autorização específica para migration e seed. A revisão visual usa os estados vazio, indisponível e catálogo ainda em aprovação.
3. **Concluir a Central, consolidação e resultados analíticos primeiro em isolamento.** Definir identidade, classificação, RA, elegibilidade espacial, trilha de aprovação e regra de publicação. Validar com ocorrências de múltiplas naturezas e evitar dupla contagem. Retomar PCDF só depois do aceite das telas e da autorização de carga. Começar pela revisão do piloto sob autorização, avançar em lotes auditáveis por manifesto e conferir o período parcial.
4. **Fechar QA e entrega acadêmica.** Registrar matriz de aceites, issues, PRs, resultados de navegador, versão do build, relatório técnico, apresentação e acompanhamento do sprint. Consolidar evidências de local, sintético, homologação e institucional. Controles de observabilidade e desempenho começam com a mesma versão candidata.
5. **Homologar ambiente hospedado e preparar a publicação.** Aprovar topologia, RLS, identidade, armazenamento, sessões e recuperação. Ensaiar release/rollback, domínio/TLS, observabilidade e proteção de dados. A publicação é um marco posterior com autorização própria.

Há um conflito de ordem apenas quando o estado visual exige dados que ainda precisam ser homologados. O caminho é validar a interface com fixtures sintéticas e estados reais de erro ou vazio, enquanto a equipe decide catálogos e revisão. Assim o aceite visual precede novos lotes, e nenhum registro de staging precisa aparecer como indicador operacional.

| Marco | Estado e critérios cumpridos | Critérios pendentes / bloqueios | Próxima prova |
| --- | --- | --- | --- |
| **1. MVP funcional local** | **60% técnico estimado (3/5 pontos), um dos cinco critérios comprovado no recorte local.** Autenticação e autorização estão ativas em loopback, com guardas no servidor. TLS e identidade institucional pertencem ao recorte hospedado. | Os outros quatro critérios recebem meio ponto cada: cadastro manual sintético, importação com deduplicação de negócio pendente, analytics sem leitor e consolidação, e auditoria parcial. Governança dos catálogos e dados condicionam a homologação. | Leitor autorizado, três perfis, cadastro controlado e consulta com prova de auditoria. [Critérios do MVP](../requisitos_v1.md) |
| **2. Telas e experiência finalizadas** | Nove telas, três com evidência recente específica e referência aprovada para o layout de Nova Ocorrência. | Rodada final e aceite individual das nove telas e estados auxiliares. Dependência de catálogo e leitura pode ser representada em ambiente sintético. | Checklist responsivo, ambos os temas, foco, acessibilidade e revisão com usuário. |
| **3. Integração de dados** | Baseline, RLS, staging e história local, um mês real verificado. | Catálogo aprovado, identidade de ocorrência, consolidação, 67 meses suspensos, consultas estatísticas e coordenadas qualificadas. | Homologar pipeline em clone, concluir as telas e registrar autorização para a próxima etapa de dados. |
| **4. Entrega acadêmica** | Um fechamento formal localizado nas seis sprints de entrega. Sprints 2 e 3 tecnicamente revisadas e PRs da Sprint 4 integrados. | Localizar ou formalizar aceites das demais etapas, reconciliar Project, autoria, relatório, apresentação e comprovação de release quando exigida. A rubrica e os pesos da disciplina ficaram sem confirmação, por isso não há percentual de nota ou de entrega acadêmica. | Atualizar quadro e obter aceite com evidências vinculadas por sprint. |
| **5. Preparação para produção** | **33% de preparação**, build/CI e artefatos de migração e operação. | Identidade, banco, segurança, logs e backups hospedados, metas, release e operação autorizadas. | Aprovar preview privado e checklist de segurança e recuperação antes de promover. |

## 14. Próxima sprint

Enquadrar o próximo ciclo como **continuação e fechamento da Sprint 4** no planejamento existente. A próxima Sprint do plano é a 5, com consolidação e análise persistente. Nenhuma linha de trabalho indica a necessidade de inventar uma Sprint 7. A atribuição formal deve ser registrada com o responsável pelo quadro oficial.

**Objetivo do próximo ciclo.** Tornar o ambiente local coerente para as telas prioritárias com as permissões existentes. Primeira tarefa: **corrigir a conexão do leitor analítico em `npm run dev:local`**. A prova de aceite é Dashboard e Mapa com usuário autorizado e vazio legítimo quando a base está vazia, resposta negada sem sessão, e totais corretos com ocorrências sintéticas de múltiplas naturezas. Usar credencial de menor privilégio e manter o escopo dos dados do lote real em leitura.

O pacote de encerramento contém matriz das telas e perfis, dados sintéticos para Nova Ocorrência e Central, evidências de erros e acessibilidade, e inventário de mudanças para integração autorizada. A decisão de liberar cadastro manual deve continuar explícita junto aos catálogos. Depois do aceite visual, iniciar o fechamento planejado da Sprint 5 com a consolidação sob autorização. [Sprint 4](../../sprints/sprint-04.md) · [Sprint 5](../../sprints/sprint-05.md)

## 15. Conclusão

- **Onde estamos?** Ambiente local funcional para identidade, staging, histórico e consulta importada. Cadastro manual confirmado em isolamento. Leitor analítico sem conexão operacional e zero ocorrências consolidadas.
- **Quanto está concluído?** 77% de implementação ponderada e 60% de aceite técnico dos 60 PBIs. O MVP local tem 60% técnico no recorte de cinco critérios. A preparação para publicação tem 33% e a entrega acadêmica integral está por formalizar.
- **Qual sprint?** Continuação técnica da Sprint 4, em 68% técnico e 45% de aceite, com entregas adiantadas das Sprints 5 e 6. A Sprint 1 tem encerramento confirmado. As Sprints 2 e 3 foram revisadas tecnicamente e integradas.
- **O que falta na Sprint 4?** Fechar a validação visual e funcional das telas, corrigir o leitor, completar permissões e fluxos persistentes de cadastro e edição, definir administração de usuários e tratar os bloqueios de identidade e catálogo.
- **O que falta no projeto?** Decisões de catálogo e território, consolidação auditada, histórico depois da autorização, validação analítica, homologação acadêmica e entrega segura em infraestrutura hospedada.
- **Qual é a próxima tarefa?** Corrigir o leitor de Dashboard e Mapa no modo local, provar o estado vazio na consulta autorizada e comprovar o cálculo com base sintética.

O lote de janeiro permaneceu íntegro. Esta auditoria acrescentou os dois relatórios ao checkout e preservou o código, o banco real, o histórico Git e o servidor existente.
