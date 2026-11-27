# SENTINELA — Finalização da edição e inativação de ocorrências

## Escopo e auditoria

A etapa cobre `/ocorrencias` com sessão local e PostgreSQL sintético atestado. A revisão do código incluiu as duas etapas de Nova Ocorrência, as consultas e os detalhes das três origens, as operações de gestão, a Central de Revisão, o contrato de persistência e as permissões PostgreSQL.

| Área | Encontrado na auditoria | Resultado |
| --- | --- | --- |
| Nova Ocorrência | Formulário com mapa, cartografia, catálogo e validação de múltiplas naturezas. Descrição e informações adicionais eram mantidas no navegador durante o cadastro. | A edição usa as duas etapas, o mapa, o seletor de naturezas e o contrato de cadastro. O formulário abre com os valores persistidos e exige nova confirmação do ponto. |
| Cadastros manuais | Detalhe com endereço estruturado e classificações. A edição persistia data e horário. | O detalhe inclui dados complementares gravados pela edição. A operação mantém o identificador, o estado de revisão e a chave do recibo de cadastro. |
| Registros PCDF importados | A consulta distinguia dados de staging e dados de origem. A gestão já registrava correções por associação e projetava valores efetivos a partir da auditoria. | O detalhe identifica a quantidade real de campos recebidos, 26 ou 34 conforme o contrato. O histórico administrativo mostra campo, valor anterior, valor corrigido, justificativa, responsável e data/hora do DF. |
| Ocorrências consolidadas | A consulta e o detalhe exibiam registros ativos. Havia inativação administrativa por identificador e versão. | A lista exibe a ação quando o registro é elegível. A confirmação apresenta data, horário, local e contagem de vínculos. |
| Inativação individual | A operação usava justificativa, confirmação por identificador e verificação de impacto ou versão. | Ações nomeadas pela operação real. O servidor informa elegibilidade por registro. O resultado aparece após confirmação do commit. |
| Central de Revisão | A página e os endpoints da Central usam os serviços já existentes, sujeitos a modo e autorização administrativa. O staging do piloto local possui seu próprio histórico de gestão sintética. | A correção da associação em `/ocorrencias` usa o mecanismo auditado de staging e a mesma atribuição administrativa. A decisão de pendências da Central continua no serviço próprio. |

## Campos e validação

**Ocorrência manual em revisão.** São editáveis data, horário, CEP, endereço, bairro ou setor, RA, latitude, longitude, número, complemento e referência. A edição também grava natureza e tentativa por vínculo, descrição do fato, meio empregado, quantidade de vítimas e autores e observações adicionais. O backend aceita CEP ausente para cadastros legados e permite campos complementares vazios. Quantidades aceitam inteiros entre 0 e 999.999. Descrição e observações têm limites de 3.000 e 1.500 caracteres.

O formulário destaca erros e mantém o rascunho. A validação de localização exige um ponto confirmado, dentro de uma única RA do catálogo, com a RA indicada válida na data do fato. O PostGIS confere a cobertura, a contenção no interior da área e a vigência. A API também exige justificativa, confirmação do identificador, versão atual e pelo menos uma combinação válida de natureza e tentativa. A migration mantém os vínculos inalterados e marca logicamente os vínculos removidos. Alterar a tentativa encerra o vínculo anterior e cria um novo, com classificação pendente.

**PCDF.** É possível revisar data, horário, natureza textual e local nas associações ainda elegíveis em staging. Cada evento preserva o snapshot de origem e inclui valores efetivos anteriores e corrigidos, justificativa, conta local e data/hora. O detalhe mostra os 100 eventos mais recentes. `linha_origem_id`, `ocorrencia_chave`, identificadores técnicos, snapshots, lotes e custódia dos pacotes v1/v2 permanecem preservados. O fluxo de correção do staging fica bloqueado para associações já vinculadas à consolidação. A inativação de uma associação mantém as demais e é bloqueada quando a associação sustenta um vínculo consolidado exclusivo.

**Persistência limitada ao ambiente sintético.** Todos os campos acima são persistidos na edição manual sintética. Descrição, meio empregado, quantidades e observações continuam como dados de preenchimento no fluxo de criação. Cadastros anteriores começam com esses campos vazios. A edição manual em `/ocorrencias` está disponível para registros ativos da fonte `SENTINELA_MANUAL` em revisão. A gestão de consolidadas nesta etapa oferece visualização e inativação administrativa.

## Permissões e integridade

| Perfil local | Consulta | Gestão |
| --- | --- | --- |
| Administrador | Manuais, consolidadas, staging, lotes e histórico de correção | Edita e inativa manuais. Corrige staging e inativa associações, lotes e consolidadas elegíveis. |
| Operador | Manuais, consolidadas, staging e lotes segundo o escopo existente | Edita e inativa manuais elegíveis. |
| Analista | Manuais e consolidadas no escopo existente | Acesso de consulta. |

A API aplica as permissões, exige sessão local e valida Host e Origin para gravação. A migration mantém RLS forçada nas tabelas de apoio e concede escrita por função a um papel interno sem login nem `BYPASSRLS`. A gravação usa transação única e verifica versão ou revisão. Endereço, ponto, naturezas e auditoria são confirmados juntos. Retiradas de vínculos têm chave estrangeira para o evento de auditoria. A ocorrência inativada sai das consultas ativas e conserva o histórico.

## Arquivos desta etapa

- **Interface** · `src/features/occurrences/ManualCreate.tsx`, `ManualCreate.module.css`, `OccurrenceManagement.tsx`, `OccurrenceWorkspace.tsx` e `OccurrenceWorkspace.module.css` no mesmo diretório. `src/features/import/ImportUi.tsx` fornece o tamanho do painel de edição.
- **Serviço e contratos** · `src/app/api/v1/ocorrencias/gestao/route.ts`, `src/lib/db/local-occurrences.ts`, `src/contracts/manual-occurrences.ts`, `local-occurrences.ts`, `occurrence-management.ts` e `openapi.ts` no mesmo diretório, e `docs/contratos/openapi-v0.1.0.json`.
- **Migration** · `database/local/pcdf-sandbox/0003_occurrence_editing_synthetic.sql`. Exige banco, loopback, porta 55488, UUID atestado, gestão 0002 e catálogo manual. Adiciona dados complementares, marcações de vínculos, projeções de leitura e escrita com auditoria. A migration 0002 e a baseline continuam como pré-requisitos.
- **Verificação** · `database/local/pcdf-sandbox/qualify-management.py`, `database/local/tests/test_static.py`, `tests/occurrence-management.test.mjs` e `scripts/check-occurrence-management-browser.mjs`.

## Verificações

| Verificação | Resultado |
| --- | --- |
| TypeScript e ESLint | Aprovados. |
| Build Next.js 16.4.6 | Aprovado com Webpack e diretório de validação isolado. |
| Suíte Node 22 | 274 aprovados e 3 cenários opt-in ignorados no comando padrão. |
| PostgreSQL 17.11 e PostGIS 3.6.2 | 9 testes aprovados no ambiente descartável. Cobertura de mudança de RA e geometria, confirmação do ponto, vínculos e tentativas, proteção de originais, auditoria, inativação, concorrência, rollback e bloqueios de perfil, RLS e privilégios. |
| Playwright com Edge | Aprovado em desktop de 1.366 px e celular de 390 px. Cobertura da revisão PCDF, validação do formulário, preservação de rascunho, confirmação do ponto, edição de naturezas e inativação. O analista pôde consultar um registro e recebeu apenas a ação de detalhes. |
| Regressão de Nova Ocorrência | Aprovada no PostgreSQL sintético da porta 55486. O Playwright verificou seis larguras, operação por toque, cadastro, recuperação após reinício, idempotência e rollback. |
| Verificações estáticas de SQL e segurança | 11 testes aprovados, incluindo sintaxe, permissões e integridade do SQL versionado. |
| Contratos e rotas | OpenAPI gerado e sincronizado. 26 operações validadas e 9 rotas previstas encontradas. |

O teste no navegador usou sessão local de teste, geometrias locais do DF e ocorrências fictícias. As requisições externas do navegador foram bloqueadas. As capturas locais de edição, revisão e inativação estão em `tmp/occurrence-editing-evidence/`.

## Condições para ativação operacional

A etapa executou gravações exclusivamente em dados de teste na instância descartável. O PostgreSQL operacional, os registros reais de janeiro de 2021 e os arquivos PCDF v2 foram preservados. A ativação operacional depende de autorização específica, homologação institucional dos catálogos e do contrato de dados complementares, migration revisada para o destino autorizado, validação das políticas e da autoria auditada no ambiente de homologação operacional e um plano verificado de backup e rollback. As operações da gestão continuam restritas ao modo sintético.
