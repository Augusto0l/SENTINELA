# ADR — Organização hierárquica do backlog do SENTINELA

## Título

Adoção da hierarquia **Epic → Feature → PBI → Task** como modelo oficial de organização, planejamento e rastreabilidade do backlog do SENTINELA.

## Status

**Adotado para a organização do backlog.** Este ADR formaliza uma decisão de estrutura já aplicada à reorganização das issues. As descrições detalhadas e as alocações das novas issues às Sprints ainda dependem de revisão e homologação pela equipe; a existência deste documento não significa que essas etapas estejam concluídas.

## Data

2026-10-16

## Contexto

O SENTINELA é um projeto acadêmico de desenvolvimento de uma plataforma para análise e monitoramento de ocorrências criminais no Distrito Federal. Seu escopo envolve interface web, cadastro e consulta de ocorrências, importação de planilhas, mapas e dashboards, controle de acesso, serviços de backend, banco de dados, infraestrutura, integração e homologação.

O planejamento original, documentado no **Artefato 2 — Cronograma Integrado, Arquitetura e EAP**, distribuiu **22 issues iniciais** entre **6 Sprints**, ao longo de 8 semanas. Essas issues representavam entregas de tamanhos e naturezas diferentes, sem uma decomposição uniforme e explícita entre objetivos amplos, funcionalidades de negócio, histórias de usuário e tarefas de implementação. A associação a Sprints e o uso anterior de milestones auxiliavam o planejamento, mas, isoladamente, não representavam adequadamente as dependências e os vínculos de decomposição entre entregas.

A disciplina passou a exigir uma hierarquia verificável em quatro níveis. Para atender à exigência e melhorar a gestão do trabalho, a equipe revisou o backlog e definiu um modelo em que as issues originais são preservadas e reposicionadas no nível pertinente, com a criação dos itens intermediários e técnicos necessários. O manifesto de migração contempla **210 itens**, sendo **22 issues existentes reaproveitadas** e **188 novas issues**, distribuídos em **8 Epics, 21 Features, 60 PBIs e 121 Tasks**.

A reorganização também revelou a necessidade de separar três conceitos distintos:

1. **Hierarquia:** qual entrega faz parte de outra (relações pai-filho).
2. **Planejamento temporal:** em qual Sprint uma entrega será executada (campo *Sprint* do GitHub Projects).
3. **Execução e evidência:** quem implementa, em qual branch e pull request, e quais critérios demonstram a conclusão.

As 22 issues originais já tinham classificação de Sprint. As issues adicionais foram criadas/reaproveitadas na reestruturação, mas sua distribuição nas Sprints ainda é uma **proposta documental**, a ser validada antes de qualquer atualização dos campos no GitHub Projects.

## Decisão

Adotar **Epic → Feature → PBI → Task** como hierarquia oficial do backlog e registrar cada nível como **issue própria no GitHub**, utilizando os tipos de issue configurados no repositório. Os relacionamentos deverão ser estabelecidos por **vínculos nativos pai-filho/sub-issues**, quando suportados na estrutura do projeto, e verificados após alterações. Títulos padronizados, comentários, labels e milestones são recursos auxiliares de rastreabilidade, **não substitutos** desses vínculos.

### Papéis dos níveis

| Nível | Finalidade | Diretrizes de conteúdo e conclusão |
| --- | --- | --- |
| **Epic** | Representar uma frente macro, módulo ou objetivo de produto que pode atravessar várias Sprints. | Consolidar contexto, objetivo, escopo e Features relacionadas; não confundir Epic com milestone nem exigir sua conclusão em uma única Sprint. |
| **Feature** | Agrupar uma capacidade funcional ou entrega intermediária perceptível no produto, vinculada a um único Epic. | Descrever resultado esperado, requisitos relacionados e os PBIs necessários para entregá-la. |
| **PBI (Product Backlog Item)** | Descrever uma entrega de valor verificável, sob a perspectiva do usuário ou do comportamento esperado do sistema. | Sempre que apropriado, formular como **“Como [perfil], quero [ação], para [benefício]”**, definir critérios de aceite, prioridade e estimativa em Story Points durante o refinamento. Cada PBI deve pertencer a uma Feature. |
| **Task** | Representar trabalho técnico concreto necessário para realizar um PBI. | Detalhar implementação ou validação, critérios de conclusão e evidências; relacionar commits, branch e pull request à issue de Task. Cada Task deve pertencer a um PBI. |

O tipo **Bug** permanece disponível para registrar defeitos. Ele não constitui um quinto nível fixo: cada Bug deverá referenciar a entrega afetada e, quando aplicável, ser associado à hierarquia existente de forma coerente com o fluxo de correção adotado pela equipe.

### Regras operacionais

1. **Preservar as issues preexistentes:** manter números, links, histórico, comentários e estado das issues originais. As antigas entregas agregadoras passam a ser tratadas como **Features** quando esse for seu papel, enquanto issues que já descrevem trabalho técnico específico permanecem ou passam a **Tasks**. A reclassificação não pressupõe excluir ou recriar registros já existentes.
2. **Garantir um caminho hierárquico identificável:** cada Task aponta para um PBI; cada PBI, para uma Feature; cada Feature, para um Epic. A decomposição deve poder ser conferida diretamente no GitHub. Evitar itens órfãos e duplicações de escopo.
3. **Separar decomposição de alocação:** a relação pai-filho não atribui automaticamente a mesma Sprint a todos os descendentes. Epics podem cobrir várias Sprints; a Sprint das Features, PBIs e Tasks deve refletir o planejamento efetivamente homologado. O agrupamento inicial das novas PBIs e Tasks na Sprint da Feature original é **proposta de distribuição**, e não atribuição já executada no Project.
4. **Preservar o cronograma de referência:** usar as seis Sprints do Artefato 2 como base histórica para redistribuir o trabalho, permitindo refinamento de capacidade, dependências e prioridades antes da alocação definitiva. Os Epics podem permanecer no Backlog administrativo enquanto seus componentes são executados em várias Sprints.
5. **Exigir rastreabilidade da execução:** antes do início de uma implementação, deve existir uma **Task** correspondente, associada a seu PBI. Commits, branches, pull requests, testes e evidências devem mencionar a issue pertinente. Essa regra deverá ser refletida nos guias de contribuição e nos registros de Sprint.
6. **Detalhar progressivamente as especificações:** substituir, em etapa controlada e revisada, os textos genéricos oriundos da migração por contexto real, requisitos, critérios de aceite e definição de pronto, sem modificar indevidamente os vínculos, a Sprint, o responsável ou o histórico da issue.
7. **Manter alterações controladas:** realizar consulta, backup/snapshot, simulação e conferência de conflitos antes de scripts de alteração em massa. Atualizações efetivas no GitHub exigem autorização explícita, revisão dos resultados e possibilidade de auditoria ou recuperação.
8. **Usar milestones somente de forma complementar, enquanto existirem:** a hierarquia principal passa a ser representada pelas issues e seus relacionamentos; o campo Sprint do GitHub Projects representa a iteração. Uma eventual limpeza de milestones não deve apagar nem descaracterizar a rastreabilidade histórica.

### Exemplo de decomposição

- **Epic EP01:** Fundação Front-end e Identidade Visual.
  - **Feature [#4](https://github.com/CAMPUSCEUB/Sentinela/issues/4):** Páginas e Mocks do Layout Base (issue original reaproveitada).
    - **PBI [#29](https://github.com/CAMPUSCEUB/Sentinela/issues/29):** Navegação pelas páginas principais.
      - **Task [#30](https://github.com/CAMPUSCEUB/Sentinela/issues/30):** Criar telas mockadas de Login e Usuários.
      - **Task [#31](https://github.com/CAMPUSCEUB/Sentinela/issues/31):** Criar telas mockadas de Dashboard e Mapa Criminal.
      - **Task [#32](https://github.com/CAMPUSCEUB/Sentinela/issues/32):** Criar telas mockadas de Ocorrências e Importação.
      - **Task [#3](https://github.com/CAMPUSCEUB/Sentinela/issues/3):** Setup inicial do projeto Web e Design System (issue original reaproveitada).

O exemplo mostra a **decomposição do trabalho**, sem afirmar que todas essas issues já estejam atribuídas no campo Sprint do GitHub Projects.

## Alternativas consideradas

1. **Manter as 22 issues originais como backlog plano, organizadas apenas por Sprint e milestone.** Rejeitada por misturar entregas de granularidades diferentes, dificultar o acompanhamento do trabalho técnico e não atender adequadamente à hierarquia exigida pela disciplina.
2. **Empregar apenas Epic → Task ou Epic → Feature → Task.** Rejeitada por eliminar a camada de PBI, na qual o valor esperado e os critérios de aceite podem ser descritos e validados antes da implementação.
3. **Registrar Epic, Feature, PBI e Task apenas como prefixos, labels, checklists ou referências textuais.** Rejeitada porque os vínculos ficariam sujeitos a inconsistência manual e não seriam relacionamentos hierárquicos nativos e verificáveis.
4. **Apagar as issues antigas e recriar todo o backlog do zero.** Rejeitada por comprometer números, histórico, comentários, rastreabilidade e classificações de Sprint já existentes.
5. **Criar toda a hierarquia e atribuir automaticamente as Sprints com um único script.** Rejeitada, nesta etapa, por risco de alocação incorreta, sobrecarga das Sprints e alteração de dados que ainda precisam de homologação. Optou-se por separar a migração estrutural do refinamento e da distribuição temporal.

## Consequências

**Benefícios esperados:**

- Rastreabilidade clara entre objetivos do projeto, funcionalidades, valor para o usuário e implementação técnica.
- Maior transparência sobre escopo, dependências, critérios de aceite e avanço de cada entrega.
- Melhor organização das cerimônias de refinamento e planejamento das Sprints, com identificação das Tasks executáveis.
- Preservação do histórico das 22 issues iniciais e capacidade de acompanhar as 188 issues adicionais sem perder os vínculos originais.
- Melhoria da auditabilidade acadêmica e do vínculo entre issue, branch, pull request, testes e evidências.

**Custos, riscos e cuidados necessários:**

- **Aumento do número de itens gerenciados:** a estrutura com 210 issues exige disciplina para evitar duplicidades, granularidade excessiva e relações quebradas.
- **Capacidade das Sprints:** herdar provisoriamente a Sprint da Feature pode produzir iterações com carga desigual; estimativas e capacidade da equipe devem orientar ajustes antes da homologação.
- **Descrições ainda incompletas:** parte das novas issues foi criada com texto genérico de migração; é necessário enriquecer PBIs e Tasks para torná-las executáveis e verificáveis.
- **Visualização no GitHub Projects:** as relações pai-filho podem não aparecer expandidas na visualização atual do Backlog; a equipe precisará configurar/validar a visualização e a navegação da hierarquia, sem confundir limitações da interface com ausência de vínculo.
- **Ajustes documentais e processuais:** atualizar o Artefato 2, os registros de Sprint e, quando aprovado, o guia de contribuição para refletir os quatro níveis e o uso das Tasks como unidade de implementação.
- **Controle de mudanças:** reclassificações e edições em massa devem preservar históricos, dados de planejamento, responsáveis e estados existentes, com validação anterior e posterior.

**Critérios para considerar a adoção plenamente operacional:** todos os itens devem ter tipo e parentesco coerentes; as PBIs/Tasks devem possuir descrições revisadas; as Sprints das novas issues devem estar homologadas e refletidas no Project; e os documentos de planejamento devem apresentar a mesma estrutura, sem contradições relevantes.

## Links relacionados

- [Template oficial de ADR](https://github.com/CAMPUSCEUB/Sentinela/blob/main/docs/decisoes/template-adr.md).
- [Diretório de decisões e orientações sobre ADRs](https://github.com/CAMPUSCEUB/Sentinela/blob/main/docs/decisoes/README.md).
- [Artefato 2 — Cronograma Integrado, Arquitetura e EAP](https://github.com/CAMPUSCEUB/Sentinela/blob/main/entregas/Artefato%202%20-%20Cronograma%20Integrado%2C%20Arquitetura%20e%20EAP.md).
- [Requisitos funcionais e não funcionais](https://github.com/CAMPUSCEUB/Sentinela/blob/main/docs/requisitos_v1.md).
- [Guia de contribuição (fluxo de issues, branches e pull requests)](https://github.com/CAMPUSCEUB/Sentinela/blob/main/CONTRIBUTING.md).
- [Planejamento da Sprint 01](https://github.com/CAMPUSCEUB/Sentinela/blob/main/sprints/sprint-01.md), [Sprint 02](https://github.com/CAMPUSCEUB/Sentinela/blob/main/sprints/sprint-02.md) e [Sprint 03](https://github.com/CAMPUSCEUB/Sentinela/blob/main/sprints/sprint-03.md).
- [Exemplo de Feature preservada — issue #4](https://github.com/CAMPUSCEUB/Sentinela/issues/4) e [PBI decomposto — issue #29](https://github.com/CAMPUSCEUB/Sentinela/issues/29).
