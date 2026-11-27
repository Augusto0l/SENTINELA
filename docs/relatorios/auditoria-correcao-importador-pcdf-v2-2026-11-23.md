# SENTINELA — Auditoria e correção do importador PCDF v2

23 de novembro de 2026 · `feat/redesign-interface` · Base `3e1b3adb8b59`

## Escopo e estado inicial

A árvore de trabalho já continha alterações locais, inclusive o validador de 26 colunas, o Worker, a prévia v2 e o receptor PostgreSQL sintético. A auditoria preservou esse trabalho. O contrato do produtor, a conferência dos 68 meses e os relatórios anteriores de persistência serviram como referências para a verificação do código atual. [Contrato PCDF v2](../../../SENTINELA-DADOS/docs/contratos/importacao-pcdf-v2.0.md) · [Integração](../../../SENTINELA-DADOS/docs/INTEGRACAO_SENTINELA_V2.md) · [Relatório da série](../../../SENTINELA-DADOS/docs/relatorios/conclusao-tratamento-pcdf-v2-68-meses-2026-11-23.md) · [Finalização anterior](finalizacao-tecnica-pcdf-v2-2026-11-23.md) · [Implementação sintética](implementacao-persistencia-pcdf-v2-sintetica-2026-11-23.md) · [Auditoria de idempotência](auditoria-persistencia-idempotencia-pcdf-v2-2026-11-23.md)

| Caminho auditado | Comportamento e limites |
| --- | --- |
| Importação geral | O Workflow usa o Worker geral para CSV e XLSX, separador automático ou manual, seleção de planilha e sugestão editável de mapeamento. A revisão preserva linhas originais, pendências e possíveis duplicatas. A demonstração calcula a simulação na sessão. O modo persistente é específico de ambiente local autorizado e tem confirmação, histórico e rotas próprias. |
| PCDF v1 | O CSV de 34 colunas segue a ordem histórica. O receptor direto usa o parser Python, aceita manifesto técnico opcional, apresenta prévia paginada e vincula a confirmação aos hashes conferidos. O ensaio legado de staging mantém seu fluxo próprio. |
| PCDF v2 | O navegador identifica o cabeçalho ordenado e um Worker valida a competência, a integridade, a proveniência e as associações. O validador é compartilhado com a confirmação sintética. A etapa final visível é a revisão paginada. |
| Histórico e perfis | As rotas e serviços persistentes exigem sessão e verificam permissões. Administrador e Operador têm permissão de importação, e Analista tem acesso recusado. Histórico geral e PCDF v1 registram tentativas e recibos persistentes. A prévia v2 fica na sessão do navegador. O ensaio sintético v2 registra resultado na auditoria e preserva a entrega na custódia. |

Pontos de entrada inspecionados. [Rota](../../src/app/(sistema)/importar/page.tsx) · [Workflow](../../src/features/import/ImportWorkflow.tsx) · [Worker geral](../../src/features/import/importWorkerProcessor.ts) · [Análise geral](../../src/data/importValidation.ts) · [Recepção v1](../../database/local/pcdf-sandbox/direct_input.py) · [Receptor direto](../../src/lib/db/pcdf-direct.ts) · [Histórico](../../src/features/import/ImportHistory.tsx) · [Política de perfis](../../src/lib/auth/policy.ts)

## Problemas e correções

| Problema encontrado | Correção aplicada |
| --- | --- |
| A detecção v2 dependia do modo integrado, e o fluxo geral da demonstração encaminhava esse layout ao bloqueio do importador genérico. | O Workflow reconhece v2 pelo cabeçalho antes do parser geral. O receptor direto e a tela legada de ensaio também oferecem acesso à prévia v2. O reconhecimento v1 permanece nos modos que têm o receptor correspondente. |
| A tela exigia o CSV primeiro e uma segunda seleção dos cinco anexos. Agrupar os seis arquivos por arraste produzia erro de seleção. | Seleção múltipla pelo botão dedicado ou por arraste para uma competência. A seleção parcial indica os arquivos faltantes e permite completar ou substituir anexos pelo nome. Arquivos extras, nomes repetidos e múltiplos CSVs mensais são recusados. |
| A troca de anexo após revisão podia deixar o acesso à etapa de revisão habilitado para uma seleção ainda sem validação. | A troca invalida a prévia e desabilita a retomada da revisão até nova conferência. A seleção inteira pode ser substituída ou removida, encerrando o Worker anterior. |
| As etapas e o resumo dificultavam distinguir conferência do pacote, pendências da fonte e confirmação. | O stepper v2 tem seleção, validação e revisão. O resumo identifica competência, associações, candidatas distintas, ocorrências com múltiplas naturezas, repetições para revisão e ausência de chave. A mensagem de bloqueio aparece antes e durante a revisão. Pendências de localização e quarentena têm contagens próprias. Falhas de integridade bloqueiam a prévia. |
| O teste estático de SQL reprovava as funções `SECURITY DEFINER` da revisão sintética v2 que ainda estava fora da lista qualificada. | A revisão instalada e testada no cluster sintético recebeu pin SHA-256 no padrão do repositório e passou a ter limites de transação verificados. A proteção geral para SQL novo e os controles da migration seguem ativos. |

Arquivos de aplicação alterados. [Rota de importação](../../src/app/(sistema)/importar/page.tsx) · [Workflow e estilos](../../src/features/import/ImportWorkflow.tsx) · [CSS](../../src/features/import/ImportWorkflow.module.css) · [Estado e seleção](../../src/features/import/useImportWorkflow.ts) · [Prévia v2](../../src/features/import/PcdfV2Preview.tsx) · [Receptor direto na interface](../../src/features/import/DirectPcdf.tsx) · [Entrada legada de ensaio](../../src/features/import/PersistentPcdf.tsx) · [Validador compartilhado](../../src/data/pcdfV2.ts)

Arquivos de verificação alterados ou adicionados. [Regressões da prévia](../../tests/pcdf-v2-preview.test.mjs) · [Conferência integral](../../scripts/check-pcdf-v2-series.mjs) · [Roteiro Playwright v2](../../scripts/check-pcdf-v2-browser.mjs) · [Roteiro de qualificação integrada](../../database/local/pcdf-sandbox/qualify-direct.mjs) · [Teste estático de SQL](../../database/local/tests/test_static.py)

## Contrato, qualidade e rastreabilidade

O pacote mensal contém `pcdf_naturezas_AAAA-MM.csv`, `manifesto.json`, `proveniencia.jsonl`, `pendencias_temporais.jsonl`, `validacao.md` e `sha256sums.txt`. A quarentena mensal integra o pacote inclusive com zero bytes. O manifesto integral, o índice de hashes da série e a quarentena sem competência ficam na raiz da entrega.

A validação confere UTF-8 sem BOM, delimitador `;`, aspas, CRLF entre registros, exatamente 26 colunas ordenadas, versões, competência, tamanhos e SHA-256. No CSV, data e horário são civis e conferidos contra o literal da proveniência. Ano de registro, unidade e número preservam o texto, inclusive zeros e espaços. A chave candidata é recalculada e a linha original é associada à proveniência por ID e posição XML. O ID é recalculado a partir do SHA-256 declarado do XML, da aba NATUREZAS e da posição. A junção tolera ordenação diferente no JSONL e exige correspondência integral.

Natureza original, natureza padronizada pela PCDF, tentativa, flagrante, unidade de apuração, cidade, RA, área, quadra, local e coordenadas são apresentados conforme recebidos. A classificação analítica permanece pendente. Os 26 campos têm acesso pela tabela completa e pelos detalhes de cada associação, que acrescentam o literal temporal, a aba e a versão de tratamento. Vazio, espaços e marcadores literais de origem permanecem recuperáveis. O verificador compara a reserialização das 26 colunas ao SHA-256 do CSV e confere o 18º texto de origem, a data/hora literal, diretamente no JSONL.

Uma repetição de ID ou posição dentro do pacote é erro de integridade. Uma repetição de chave candidata e natureza em posições distintas é pendência de revisão. Uma natureza diferente para a mesma chave continua como associação própria. Reenvio, origem previamente recebida e divergência de originais exigem comparação com a custódia. O PostgreSQL sintético testa identidade da fonte, 18 originais, idempotência, concorrência e replay nos dois sentidos entre versões. A chave candidata tem finalidade analítica de prévia. Sua consolidação exige revisão de identidade.

Coordenadas originais mantêm precisão textual. GEO é avaliada lexicalmente e pelos limites globais de latitude e longitude. UTM é avaliada lexicalmente, com indicador próprio quando GEO está ausente. Pontos fora do DF só podem ser avaliados após definição de CRS, datum, eixos e zona, conforme a fonte e a vigência. A validação da prévia preserva as pendências e as coordenadas para revisão. A promoção geográfica e a alimentação do Mapa Criminal permanecem condicionadas à homologação espacial.

## Validação dos 68 pacotes

O roteiro processa um pacote de cada vez com o mesmo seletor e validador da prévia. Entre meses, acumula totais e conjuntos de identificadores, chaves candidatas e naturezas para conferir unicidade e cardinalidade global. Ele só lê os arquivos e imprime agregados. [Roteiro reproduzível](../../scripts/check-pcdf-v2-series.mjs)

| Medida | Resultado observado |
| --- | ---: |
| Competências aprovadas, de janeiro/2021 a agosto/2026 | 68 de 68 |
| Colunas em cada CSV | 26 |
| Artefatos conferidos por SHA-256 no índice integral | 410 |
| Associações e IDs técnicos distintos | 369.660 |
| Chaves candidatas distintas na série | 349.582 |
| Naturezas originais distintas | 41 |
| Valores originais preservados pelo leitor | 6.653.880 |
| Referência geográfica pendente | 360.989 |
| Coordenadas ausentes | 8.671 |
| Candidatos à revisão UTM sem GEO | 83 |
| Estados gerais inválido ou incompleto | 0 |
| Quarentena temporal mensal e sem competência | 0 |
| Repetições de chave e natureza dentro de um pacote | 0 |
| Associações sem chave candidata | 0 |

Os totais mensais conferiram com o índice. O CSV reconstituído a partir da prévia reproduziu o SHA-256 de cada mês. A comparação do literal temporal usou a proveniência entregue. O XML original ficou fora da execução e a reconciliação independente contra o XML permanece registrada pelo produtor. Os 410 artefatos são os 408 arquivos dos pacotes mensais e dois arquivos da raiz enumerados pelo índice de hashes.

```powershell
node --experimental-strip-types scripts/check-pcdf-v2-series.mjs 'D:/Projetos/SENTINELA-DADOS/dados_restritos/pcdf-v2-integral-2021-2026'
```

## Verificações automatizadas

| Verificação | Resultado observado |
| --- | --- |
| `pnpm test` com pnpm 10.34.3 e Node 22 | 274 aprovados, zero falhas, uma integração PostgreSQL separada. Leitura real de janeiro habilitada. Inclui parser, Worker geral, CSV/XLSX, pendências, prévia e autorização. |
| Integração dedicada `pcdf-v2-persistence.test.mjs` | 10 itens TAP aprovados. Sessão, papéis, bloqueio antes de conectar, custódia, staging, concorrência, reenvio, divergência, quarentena, auditoria e rollback. |
| Parser e manifesto v1 em Python | 14 aprovados. |
| Suíte SENTINELA-DADOS | 21 aprovados com fixtures sintéticas. |
| SQL e RLS em análise estática, mais baseline independente | 11 testes aprovados. O baseline passou a comparação por AST com as migrations-base. |
| `pnpm validate:contracts` e `pnpm check:routes` | Aprovados, com 649 imports locais resolvidos. |
| `pnpm typecheck`, `pnpm lint` e `git diff --check` | Aprovados. |
| Build final de produção | Aprovado com Next.js 16.4.6 e Webpack em saída de validação, com credenciais operacionais suprimidas. A geração estática processou 20 páginas e `/importar` saiu como rota dinâmica. |

A primeira tentativa da suíte Node encontrou `spawn EPERM` na sandbox Windows. A execução aprovada para subprocessos confirmou a linha de base e passou novamente com as regressões adicionadas. A suíte estática encontrou uma falha preexistente de pin da migration sintética v2, corrigida e reexecutada com a dependência `pglast` já instalada no repositório.

## Evidência de navegador

- PCDF v2 no Edge headless em 1366 e 390 px. O teste usou 28 associações sintéticas, 14 candidatas e duas páginas. Conferiu seleção agrupada, arraste, complemento de pacote parcial, recusa de manifesto adulterado, bloqueio da revisão após troca de anexo, competência, contagens, precisão e valores originais nos detalhes. A tabela completa expôs as 26 colunas com rolagem própria. No mobile, a página manteve a prévia resumida legível. O navegador registrou zero requisições de escrita e zero erros de JavaScript no roteiro. [Validação desktop](../evidencias/pcdf-v2-importador-2026-11-23/validacao-1366.png) · [Prévia desktop](../evidencias/pcdf-v2-importador-2026-11-23/previa-1366.png) · [Validação mobile](../evidencias/pcdf-v2-importador-2026-11-23/validacao-390.png) · [Prévia mobile](../evidencias/pcdf-v2-importador-2026-11-23/previa-390.png)
- CSV/XLSX pelo `pnpm check:import` em 1366, 768, 390 e 320 px, nos temas claro e escuro. Aprovados o mapeamento manual e automático, seleção de planilha, revisão, paginação, cenários de erro, arraste, foco e simulação sem rede de escrita.
- Qualificação integrada com `direct_runtime.py --qualify-main` aprovada. O roteiro verificou sessão e três perfis, PCDF v1 de 34 colunas, diálogo de detalhes, histórico e filtros, gravação sintética de CSV/XLSX geral, reenvio, rollback e recuperação do histórico após reiniciar o Next.js. A reconciliação conferiu 217.566 valores no staging e 115.182 valores de origem para o conjunto v1, com 6.399 linhas sintéticas em três lotes e zero ocorrências consolidadas. O geral gravou três registros sintéticos em duas execuções. Duas expectativas do roteiro foram ajustadas à instrução de arraste e à mensagem de cabeçalho v1/v2 antes da execução aprovada. [Histórico sintético](../evidencias/pcdf-v2-importador-2026-11-23/historico-sintetico.png)

As capturas usam dados sintéticos. A conferência dos 68 pacotes reais rodou separadamente em leitura local.

```powershell
node --experimental-strip-types scripts/check-pcdf-v2-browser.mjs
python -X utf8 -B database/local/pcdf-sandbox/direct_runtime.py --qualify-main
```

## Staging e riscos operacionais

A auditoria estática cobriu o baseline PostgreSQL/PostGIS, o receptor v1 e a revisão v2 na instalação de qualificação. A projeção v2 guarda os 26 textos e o literal temporal, e a custódia preserva os seis artefatos. O backend exige aprovação independente do digest e da projeção, modo sintético explícito, sessão, papel autorizado e atestação do cluster. O SQL usa privilégios restritos e RLS forçada na custódia. O lock e a transação em `READ COMMITTED` serializam os reenvios e mantêm a revisão, o recibo e a auditoria consistentes. A falha tardia injetada na auditoria reverteu as escritas da entrega.

O ensaio ocorreu apenas no cluster descartável PostgreSQL 17 com PostGIS 3.6.2, em loopback na porta 55488. A revisão v2 foi aplicada somente nesse cluster. A escrita operacional v2 permanece bloqueada. O estado das migrations, dos papéis, da RLS, dos backups e da capacidade de restauração do destino operacional aguarda verificação autorizada.

Antes da homologação operacional, falta comprovar a aprovação institucional da fonte e do XML, qualificar e atestar o destino dedicado, verificar backup e restauração, obter autorização específica e executar um piloto restrito com evidência de idempotência e rollback. Também falta decidir o tratamento de divergências entre extrações, o histórico de recibos v2 na interface operacional e a homologação de classificação e geografia. Os hashes conferidos em conjunto atestam consistência dos bytes entregues. A autoridade sobre a fonte e a custódia do XML requer evidência independente.
