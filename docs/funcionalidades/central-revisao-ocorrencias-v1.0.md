# Central de Revisão de Ocorrências — v1.0

Versão: 1.0. Data: 29/10/2026 (America/Sao_Paulo). Escopo: preparação da Sprint 4. Status: regras funcionais aprovadas pela equipe; desenho operacional proposto, ainda sem implementação. Referência: [contrato PCDF v1.0](../contratos/importacao-pcdf-v1.0.md).

## 1. Finalidade e integração

Integrar a Central à seção **Ocorrências**, com acesso à ocorrência, às associações de natureza, ao lote e às linhas de origem. Não criar uma base paralela de ocorrências: a Central apresenta diagnósticos e revisões da mesma base persistente utilizada por listagem, Dashboard e Mapa.

Regra aprovada: qualquer campo ausente ou inconsistente deve ser avaliado automaticamente e pode gerar pendência. Uma ocorrência pode ter várias pendências simultâneas; não limitar a revisão à localização nem permitir que uma causa oculte outra. A aplicação futura deve abrir os diagnósticos definidos pelas regras após importação e após cada alteração. Não inventar valores para eliminar alertas.

Registros sem identidade suficiente para consolidação também aparecem na Central, vinculados ao staging/lote, com indicação **ainda não consolidado**, sem inventar um ID canônico de ocorrência. Várias linhas comprovadamente ligadas à mesma ocorrência podem compartilhar diagnóstico, mantendo vínculo com todas as origens afetadas. Falha estrutural de arquivo deve ser visível no lote, mesmo quando não for possível identificar uma ocorrência.

## 2. Entrada automática e tipos de pendência

São exemplos de regras propostas, com mensagens e versões a detalhar no backend:

| Tipo | Gatilho |
| --- | --- |
| Identificação | Componente da chave ausente, colisão ou evidências incompatíveis na mesma chave candidata. |
| Datas/horários | Ausência, formato inválido, precisão insuficiente ou divergência entre ano e data do fato. |
| Natureza/classificação | Descrição ausente, código desconhecido, mapeamento sem homologação ou conflito entre descrição, categoria e tentativa. |
| Endereço/RA | Ausência em qualquer componente recebido, RA desconhecida/não informada, composição incompleta ou correspondência territorial duvidosa. |
| Coordenadas | Ausência em GEO ou UTM, par incompleto, valor inválido, referência espacial pendente ou divergência com RA. A falta de UTM pode ser não bloqueante quando outro par for validado. |
| Informações policiais | Flagrante/tentativa com texto desconhecido, unidade de apuração ausente ou inconsistente. |
| Proveniência/importação | Falha de vínculo à linha original, hash incompatível, duplicação de linha de origem ou atualização entre extrações sem política resolvida. |

O layout técnico não exige que todo derivado seja preenchido antes de preservar a origem. Ausência legítima pode ser encerrada sem solução com justificativa; não deve ser preenchida artificialmente. Pendências herdadas de todas as linhas de uma ocorrência precisam ser avaliadas, não apenas as da primeira linha.

## 3. Prioridade e efeito na consolidação

Prioridades aprovadas: **alta, média e baixa**, conforme impacto. Proposta de classificação inicial:

| Prioridade | Impacto e exemplos |
| --- | --- |
| Alta | Risco de fundir ocorrências distintas, perder proveniência ou consolidar identidade/classificação incorreta; chave conflitante, linha de origem duplicada ou arquivo sem integridade. |
| Média | Restringe análise temporal, territorial ou criminal; data inválida, RA sem correspondência, classificação pendente, coordenadas inválidas/CRS desconhecido. |
| Baixa | Informação complementar incompleta que não invalida identidade ou dimensões analíticas já verificadas; UTM ausente com GEO validado ou unidade de apuração ausente. |

Prioridade e bloqueio são atributos diferentes. Uma regra pode impedir só a dimensão geográfica ou a consolidação inteira. Os exemplos não homologam automaticamente regras de severidade; a matriz deve ser versionada e ajustada por impacto real, com justificativa auditada para exceções.

Separar explicitamente:

- **Registro consolidável com pendências:** identidade suficientemente validada; faltas complementares ou de localização não devem eliminar a ocorrência. Coordenadas pendentes excluem o ponto do mapa, sem coordenada sintética. Indicadores mostram cobertura e exclusões por dimensão.
- **Registro impedido de consolidação:** falha crítica de identidade, integridade ou proveniência, ou outra regra bloqueante definida. Manter staging e diagnósticos; não contabilizar como ocorrência consolidada nem apagar a linha.

“Com pendências” não significa “todos os campos válidos”. Encerrar uma pendência sem solução não torna o dado válido nem remove um impedimento crítico por si só. Política de inclusão em indicadores e critérios finais de consolidação precisam de homologação explícita.

## 4. Consulta e filtros

Filtros aprovados, combináveis: **tipo de pendência, status/situação, prioridade, período, RA, natureza e lote**. Proposta: AND entre dimensões e OR entre valores selecionados na mesma dimensão; aplicar critérios de pendência ao mesmo diagnóstico, evitando combinar prioridade de um alerta com status de outro inadvertidamente.

Período padrão proposto: data do fato, inclusiva; permitir escolher período de detecção/correção, com rótulo explícito. Oferecer “sem data”, “RA não informada/sem correspondência” e “natureza não classificada”; valores ausentes não podem tornar os itens impossíveis de localizar. Natureza pode filtrar descrição PCDF ou categoria SENTINELA, identificando a unidade. Lote remete ao arquivo e à execução.

Prévia paginada no servidor, ordenação estável e contagens separadas de ocorrências/itens de staging e pendências. Ordenação inicial proposta: prioridade, data de detecção e ID. Mostrar resumo da ocorrência, todas as pendências, impedimentos, versões de regras, lote e acesso autorizado ao original. A quantidade de pendências pode superar a de ocorrências.

## 5. Permissões aprovadas

| Ação na Central | Administrador | Operador | Analista |
| --- | --- | --- | --- |
| Consultar itens, filtros e histórico permitido | Sim, no escopo de leitura | Sim, no escopo de leitura | Sim, no escopo de leitura |
| Corrigir dados efetivos | Sim | Não | Não |
| Resolver ou encerrar sem solução | Sim, com justificativa | Não | Não |
| Reabrir manualmente ou alterar decisão | Sim, com justificativa auditada | Não | Não |
| Modificar valores originais ou apagar auditoria | Não | Não | Não |

A detecção/reavaliação pode registrar eventos automáticos por serviço confiável, mas não equivale a conceder correção manual a Operador ou Analista. Resolver após correção administrativa exige nova validação, não apenas clique de confirmação.

Esta decisão é específica da Central e prevalece sobre a possibilidade de revisão pelo Operador da [proposta v0.1.0](../contratos/deduplicacao-permissoes-v0.1.0.md). Não altera automaticamente permissões de cadastro manual em outras telas. Leitura não significa acesso irrestrito aos brutos ou a dados fora do escopo autorizado. Regras devem ser aplicadas no servidor e, quando adotada, por RLS; ocultar botões não implementa autorização.

## 6. Estados e ciclo de revisão propostos

Estados de uma pendência: `aberta`, `em_analise`, `resolvida` e `encerrada_sem_solucao`. Registrar cada transição, responsável e justificativa; proposta de reabertura retorna a `aberta` mantendo o histórico. Estados da ocorrência/staging e do lote são independentes.

1. Importação/alteração dispara avaliação versionada; criar ou atualizar pendências por item, campo e regra, sem multiplicar alertas idênticos a cada execução.
2. Administrador consulta origem, inconsistências e evidências; pode iniciar análise.
3. Correção exige justificativa e validação dos dados enviados. Preservar antes/depois da projeção efetiva e o vínculo à origem intacta.
4. Após cada correção, reavaliar automaticamente todas as regras afetadas, inclusive associações, identidade e dependências entre campos. Resolver somente causas comprovadamente eliminadas; manter as demais e criar novas se necessário.
5. Registrar mudança, revisão, reavaliação e estados de forma transacional ou com mecanismo consistente e recuperável. Não anunciar resolução se a reavaliação falhar; manter estado seguro e diagnóstico.
6. Sem solução possível, Administrador encerra com justificativa e impacto explícito. O valor continua ausente/inconsistente, a cobertura analítica permanece limitada e eventual bloqueio persiste.
7. Se novas evidências ou versão de regra invalidarem uma resolução, reabrir com evento automático rastreável. Encerramentos sem solução não devem reaparecer indefinidamente sem fato novo; política versionada deve distinguir mesma evidência de novo problema.

Correção de identidade nunca mescla registros ou transfere associações silenciosamente: deve apresentar conflitos e submeter a operação administrativa específica, com proveniência e reversibilidade. Alterar regras/catálogos exige homologação e versionamento próprios.

## 7. Preservação e auditoria

Cada correção deve registrar: ID da ocorrência ou linha de staging, campo/associação, responsável autenticado, instante UTC, valores anteriores e novos, justificativa, lote/linha de origem, versão da regra e resultado da reavaliação. Serviço automático é identificado separadamente de usuário humano. Exibir horários com contexto America/Sao_Paulo, sem confundir instante de correção com data do fato.

Preservar os 18 valores originais PCDF, inclusive descrições, tentativa/flagrante, coordenadas e endereço. O original não é o “valor anterior” editável: ele permanece referência imutável; o histórico acompanha a evolução da projeção efetiva. Campos brutos e justificativas exigem leitura autorizada. Clientes, inclusive Administrador, não podem apagar ou reescrever a trilha ordinariamente.

Proposta de concorrência: usar versão do registro/revisão; rejeitar atualização baseada em versão ultrapassada e exigir leitura atualizada, sem sobrescrever a correção de outro Administrador. Falhas devem ser recuperáveis e auditadas sem expor payload sensível em logs comuns.

## 8. Critérios de aceite futuro

- Ocorrência com dois ou mais problemas exibe todos; corrigir um não resolve os demais.
- Ausências de campos originais e inconsistências derivadas entram automaticamente conforme regras versionadas, incluindo registros ainda não consolidados.
- Filtros combinados mantêm os itens sem data/RA/classificação acessíveis e não confundem contagem de ocorrências com pendências.
- Operador e Analista consultam no escopo autorizado, mas tentativas diretas de correção/resolução no servidor são recusadas; Administrador também não altera o original.
- Correção administrativa exige justificativa, preserva antes/depois, autoria e origem e dispara reavaliação automática consistente.
- Encerramento sem solução exige justificativa, mantém o dado como não resolvido materialmente e preserva impactos e bloqueios.
- Colisão da chave candidata não funde ocorrências; linha impedida permanece reconciliável com o XML.
- Reavaliação repetida é idempotente; conflito de edição e falha entre alteração/auditoria não produzem sucesso falso.
- Dashboard, Mapa e Ocorrências refletem a mesma versão consolidada, com cobertura e pendências explícitas; ponto sem localização validada não é inventado.

Esses critérios são requisitos para testes futuros, não testes executados nesta entrega documental.

## 9. Impactos e sequência técnica

Componentes afetados futuramente: `src/features/Occurrences.tsx`, detalhes/formulário em `src/components/occurrences`, `OperationalProvider`, `demoPermissions`, `ImportWorkflow` e consumo de Dashboard/CrimeMap. Os contratos `occurrences.ts`, `imports.ts`, `analytics.ts`, catálogos e OpenAPI precisarão de evolução versionada para diagnósticos, histórico, revisão e incompletude histórica. Não há Central operacional ou autorização de servidor implementada por este documento.

Sequência: homologar regras de identidade/classificação/localização → modelar staging, pendências e auditoria compartilhados → definir contratos e autorização administrativa → implementar detecção e reavaliação → implementar consulta/filtros → implementar correção, encerramento e concorrência → integrar consolidação e indicadores → testar reconciliação, permissões, falhas e preservação. A sequência completa da Sprint 4 e as cinco pendências principais de homologação constam no [contrato PCDF](../contratos/importacao-pcdf-v1.0.md#11-pendências-de-homologação-e-sequência-da-sprint-4).
