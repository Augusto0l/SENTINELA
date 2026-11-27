# SENTINELA — Implementação de persistência PCDF v2 em homologação sintética

**23 de novembro de 2026 · `feat/redesign-interface` · HEAD `3e1b3ad`**

## Resultado

O receptor PCDF v2 está implementado e qualificado no PostgreSQL descartável de homologação. O backend exige opt-in sintético, configuração local de desenvolvimento, sessão de Administrador ou Operador, origem HTTP canônica e atestação do PostgreSQL de loopback na porta 55488. A migration repete a guarda de banco e porta. A confirmação v2 permanece fechada no fluxo operacional e na interface. A prévia segue no navegador. Nenhuma conexão ou escrita foi feita no PostgreSQL operacional.

## Recepção, identidade e transação

- A confirmação sintética recebe as 26 colunas e os cinco artefatos auxiliares. Reusa a validação da prévia para conferir o layout, checksums, manifesto, ID, posição lógica, literal civil e correspondência CSV–proveniência. O servidor calcula um digest sobre nomes, tamanhos e hashes de todos os artefatos e confere o valor enviado com a confirmação.
- O banco exige aprovação independente do digest, do SHA-256 do XML e do hash da projeção validada. O papel da aplicação só executa as funções autorizadas. A aprovação sintética é carregada pelo administrador da fixture após a conferência do XML de teste. Os hashes de um pacote autoconsistente, por si sós, não habilitam o recebimento. Os artefatos de transporte ficam em custódia privada com RLS. O XML tem nome, tamanho, SHA e referência na extração. A custódia institucional do XML para operação continua pendente.
- O SQL serializa v1 e v2 pelo mesmo lock transacional. Verifica o ID técnico conforme o contrato e compara a extração autenticada, a aba, a posição e os 18 originais antes de reusar o UUID em staging. Cada versão preserva seu snapshot. Nova linha para candidata já observada na mesma extração é mantida como associação adicional. O mesmo pacote devolve o recibo da execução existente, com novo evento de reenvio.
- Uma divergência ou colisão com legado avulso entra em revisão com o pacote aprovado e o motivo, sem vincular staging a uma origem em disputa. Nenhuma ocorrência ou associação do domínio é criada. As pendências dos diagnósticos permanecem versionadas.
- No v2, custódia, extração, origem, staging, pendências, recibo e evento de resultado são atômicos. Um erro no evento de sucesso deixa todos esses registros sem commit. A revisão de um conflito reconhecido é um resultado explícito com sua própria evidência e sem execução de staging.
- O v1 conserva o parser, as 34 colunas, a prévia, o recibo, a auditoria de tentativa e o caminho legado. Só a instalação sintética encaminha envelopes v1 independentemente aprovados ao mesmo staging do v2. A tentativa v1 continua antes da transação e o resultado continua dentro dela.

## Arquivos

| Arquivo | Alteração |
| --- | --- |
| [pcdf-direct.ts](../../src/lib/db/pcdf-direct.ts) | Confirmação v2 sintética no handler existente, resposta de revisão e controle de transação. |
| [pcdf-v2-delivery.ts](../../src/lib/db/pcdf-v2-delivery.ts) | Validação e composição do envelope, projeção dos originais e diagnósticos. |
| [pcdf-direct-mode.ts](../../src/lib/db/pcdf-direct-mode.ts) | Opt-in explícito restrito ao modo e porta sintéticos. |
| [Contrato direto](../../src/contracts/pcdf-direct.ts) e [configuração Next.js](../../next.config.ts) | Limite de transporte do pacote aplicado somente no modo sintético v2. |
| [0001_pcdf_v2_synthetic.sql](../../database/local/pcdf-sandbox/0001_pcdf_v2_synthetic.sql) | Aprovações e custódia privadas, reuso transacional, RLS e adaptação do v1 na instalação de homologação. |
| [pcdf-v2-persistence.test.mjs](../../tests/pcdf-v2-persistence.test.mjs) | Integração do handler HTTP com PostgreSQL descartável, concorrência, rollback, auditoria, custódia e permissões. |
| [pcdf-v2-preview.test.mjs](../../tests/pcdf-v2-preview.test.mjs) e [fixture compartilhada](../../tests/fixtures/pcdf-v2-package.mjs) | Aproveitamento da fixture nas duas suítes sem alterar os cenários da prévia. |

## Verificações

| Verificação | Resultado |
| --- | --- |
| Integração nova | 9 itens TAP aprovados, incluindo pacote inválido, aprovação independente, sessão e papéis, v1 → v2, v2 → v1, replay concorrente, corrida entre versões, divergência, legado avulso e rollback por falha de auditoria. O teste usa `Request` no handler real e simula apenas a identidade local. |
| Regressões focadas | 47 testes de prévia, importação geral, CSV/XLSX e Worker aprovados. |
| Parser Python v1 | 14 aprovados. |
| XLSX PCDF persistente | 3 aprovados em execução isolada com subprocesso permitido. O sandbox restringiu a criação do subprocesso na primeira tentativa. |
| TypeScript | Aprovado. |
| ESLint | Aprovado com zero avisos. |
| Build | Aprovado com Webpack e SWC WASM, typecheck e 20 páginas estáticas. Saída isolada de validação. |
| Git | `git diff --check` aprovado e arquivos novos conferidos separadamente. A montagem inicial trocou duas saídas com o mesmo nome, o contrato local foi restaurado com conferência SHA-256 e o patch foi reaplicado. |
| Suíte completa | 270 itens TAP, 244 aprovados, 25 falhas e uma omissão esperada da integração PostgreSQL, executada separadamente. |

O teste com janeiro/2021 usou os bytes originais somente para leitura e prévia. A migration foi aplicada apenas ao PostgreSQL 17.11/PostGIS 3.6.2 descartável de homologação, que foi encerrado após o teste. O conjunto de 25 falhas é o mesmo da execução anterior por nome de subteste. São 16 já observadas sem o patch anterior e nove de criação de fixtures sob o sandbox. Os critérios dos testes correspondentes foram preservados.

## Condições antes de habilitar operação

1. Aprovar institucionalmente a fonte e o processo de registro de confiança. A aprovação da projeção é vinculada à versão atualmente qualificada do validador. Alterações de regra exigem revalidação da aprovação.
2. Homologar armazenamento privado e recuperação de XML e do pacote. O `bytea[]` transacional foi qualificado para fixtures. Antes de adotar esse armazenamento em operação, medir volume, WAL, retenção, backup e latência com volumes sintéticos representativos.
3. Inventariar lotes avulsos e republicações sob autorização específica. O estágio atual reusa IDs do mesmo XML autenticado. A equivalência entre XMLs diferentes e a política de identidade institucional de ocorrência dependem de decisão própria. O lock global compartilhado preserva coerência e serializa recepções durante a qualificação.
4. Estender histórico e revisão para operadores no fluxo operacional em tarefa de homologação. Nesta etapa, o recibo e a trilha v2 são verificáveis no ambiente sintético. O histórico da interface continua no contrato aprovado do v1.
5. Após aceite técnico e institucional, autorizar separadamente um piloto de staging em destino dedicado, com reconciliação e reversão. A consolidação demanda outra autorização.

Para reproduzir o ensaio, preparar um cluster novo na porta local 55488 com `sentinela_pcdf_local`, GUC de identidade, baseline com PostGIS e receptor v1 de qualificação. Aplicar a migration de revisão somente nesse cluster. O teste verifica o diretório real de dados no PostgreSQL contra o diretório temporário exclusivo informado em `SENTINELA_PCDF_V2_FIXTURE_ROOT` e requer a credencial do cluster sintético em `setup-password`. Executar `node --experimental-transform-types --test tests/pcdf-v2-persistence.test.mjs`. O teste cria seus próprios envelopes e aprovações sintéticos. Sem o diretório, a integração de banco é omitida e o teste estático do bloqueio segue executável. [Auditoria de referência](auditoria-persistencia-idempotencia-pcdf-v2-2026-11-23.md)
