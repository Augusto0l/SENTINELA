# Plano de conclusão do SENTINELA

A homologação de escrita usa PostgreSQL/PostGIS descartável e dados sintéticos.
A configuração local permanece restrita ao loopback. A implantação, a troca de
provedor de identidade e a carga PCDF real têm janelas de autorização próprias.

| Fase | Estado no início | Dependência e aceite |
| --- | --- | --- |
| 1. Auditoria | Concluída e validada | Branch, inventário Git, contratos, caminhos de aplicação, migrations e evidências históricas conferidos. |
| 2. CRUD | Concluída e validada no laboratório | Ativar escrita operacional exige identidade humana, escopo e autorização. Manter auditabilidade, versões e teste dos três perfis. |
| 3. Catálogos | Parcial | RAs oficiais e vínculos homologados. Naturezas e filtros implementados. A carga criminal exige os 41 rótulos e a versão aprovada de seu mapeamento. |
| 4. PCDF | Parcial | Parser, staging e rollback validados. Consolidar somente grupos com identidade explícita e classificação confirmada, com recibo e vínculos reversíveis até a linha de origem. |
| 5. Central | Parcial | Leitura SQL de pendências sintéticas disponível. Integrar consulta, detalhes e decisões administrativas com versão, autoria e auditoria. |
| 6. Dashboard | Implementada sem homologação completa | Consulta real e UI verificadas em exercícios distintos. Demonstrar consistência entre agregados, filtros e linhas visíveis em uma execução integrada. |
| 7. Mapa Criminal | Implementada sem homologação completa | Mesma fonte analítica, cartografia oficial e limites existentes. Confirmar comportamento no fluxo integrado. |
| 8. Segurança | Parcial | Provedor local, política dos perfis e RLS revisados por fluxo. Verificar os novos caminhos de importação e revisão. Auth hospedado fica para a última etapa. |
| 9. Homologação | Parcial | Executar qualidade e testes de integração afetados com os três perfis, incluindo volume, repetição e rollback. |
| 10. Backup | Concluída e validada no escopo histórico | Restore lógico pré-RA documentado. RPO, RTO e backup do estado atual exigem janela autorizada. |
| 11. Publicação | Bloqueada | Build e guarda de ambiente existentes. Liberação exige estratégia de identidade hospedada, RLS, infraestrutura de staging e autorização. |
| 12. Organização | Parcial | Preservar alterações locais e evidências. Remover implementações apenas quando as dependências estiverem verificadas. |
| 13. Entrega acadêmica | Parcial | Consolidar relatórios, atualizar contratos e propor unidades revisáveis de PR sem alterar Git remoto. |

Registre a retomada em [progresso](progresso-conclusao.md) e mantenha
[pendências](pendencias-conclusao.md) reproduzíveis. Avalie os módulos por
integração no app, UI, API, teste SQL, permissões, automação, teste funcional,
contrato, documentação e ausência de bloqueio no escopo declarado.

## Critérios de progresso

Cada módulo abaixo tem cinco marcos. A Sprint soma os pontos dos oito
módulos, com teto de 40. Um ponto exige evidência no escopo descrito.
O CRUD conserva a régua histórica de um ponto por marco operacional e
meio ponto por mutação ou ensaio de UI aceito apenas no laboratório.

| Módulo | Cinco marcos |
| --- | --- |
| CRUD | Leitura, cadastro, edição, inativação e ensaio dos formulários. |
| Catálogos | 37 RAs persistidas, vínculo cartográfico, inventário criminal reconciliado, APIs e filtros, regras e carga criminal oficiais. |
| Importação PCDF | Parser e origem, upload e histórico, promoção e vínculos, repetição e rollback, homologação de carga real e reprocessamento versionado. |
| Central | Listagem e filtros, detalhe e histórico, correção de campos habilitados, permissão e concorrência, correção dos demais campos e casos pós-consolidação. |
| Dashboard | Consulta real, agregados por ocorrência, filtros e variações, navegador com PostgreSQL no mesmo ensaio, leitor do destino operacional. |
| Mapa Criminal | Cartografia oficial, modos de camada, consulta compartilhada, navegador integrado e coerência com a listagem no recorte, validação espacial representativa no destino operacional. |
| Segurança | Sessões locais, permissões de interface/API, escopo SQL e autoria, auditoria de dependências, identidade e RLS hospedadas. |
| Publicação | Build e guarda de ambiente, separação de ambientes no guia, recuperação e rollback ensaiados, homologação privada hospedada, publicação autorizada e verificada. |

## Pacote para homologação privada

O [roteiro de release](../../database/release/README.md) identifica os
recursos descartáveis, a ordem do delta SQL, a comparação antes/depois e
os critérios para a janela de homologação. O progresso por módulo
continua usando a mesma régua para preservar a comparação com a Sprint.

O ponto de entrada do pacote final é `database/release/qualify-private.ps1`.
Ele encadeia os executores isolados existentes. O roteiro de Preview
separa o aceite do empacotamento da liberação futura de persistência
hospedada. As fontes externas de PCDF e os critérios para aprová-las
estão no [registro de decisões](pendencias-conclusao.md#decisões-de-dados-a-solicitar-ao-produtor).
