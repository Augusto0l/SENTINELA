# Importação demonstrativa — Sprint 3

Data: 28/10/2026 (America/Sao_Paulo). Escopo: Feature #10, PBIs #60/#63/#66/#69. Não representa aceite acadêmico nem fechamento de issues.

## Correção final do limite CSV — 28/10/2026

A auditoria encontrou contagem indevida de linhas vazias antes do cabeçalho no limite de 10 mil registros. O parser agora descarta essas linhas antes de armazená-las: elas não consomem a cota de registros, mas suas células e seu texto continuam nos contadores de segurança. As posições físicas do cabeçalho e dos registros são preservadas. Linhas vazias após o cabeçalho continuam contando e gerando erro, conforme as regras existentes.

Cinco testes de regressão foram acrescentados: aceitação de 10.000 registros com prefixos vazios (LF, CRLF, espaços e células vazias), rejeição de 10.001, contagem de vazias internas, controles de colunas/células no prefixo e fronteira XLSX. Os testes reproduziram a falha antes da correção e passaram depois. Os controles existentes de arquivo, tamanho de célula, texto, ZIP e tempo de processamento foram preservados.

Rodada após a correção: `corepack pnpm@10.34.3 typecheck`, `lint`, `test` e `build` aprovados; **51 testes Node, zero falhas**. O código XLSX não foi alterado e seus casos de limite foram exercitados com arquivos reais gerados em memória. Não houve nova rodada visual; os 46 testes e capturas descritos na validação original abaixo pertencem à entrega anterior à correção. Parecer técnico desta correção: apta para commit da Etapa 1 no escopo demonstrativo, sem aceite acadêmico ou conclusão integral da sprint. Nenhum commit, push ou alteração de autoria foi realizado.

## Fluxo entregue

1. Selecionar ou arrastar um CSV/XLSX de até 50 MB. Arquivos vazios, formatos não aceitos e seleção múltipla são recusados. Uma nova seleção limpa todos os resultados anteriores e encerra o Worker antigo.
2. No XLSX, escolher a planilha. Planilhas vazias ou acima dos limites mostram erro e permitem selecionar outra. A análise anterior não continua ativa.
3. Conferir o mapeamento sugerido e ajustar os sete campos. Data, horário, natureza(s), RA e local/endereço são obrigatórios; coordenadas são opcionais. Colunas ambíguas exigem seleção manual, e uma mesma origem não pode alimentar dois campos.
4. Validar e consultar a prévia paginada (25 linhas/página), filtros por situação, erros por linha/coluna e os valores originais. Voltar ao mapeamento invalida a análise anterior.
5. Preparar e confirmar explicitamente a simulação. O resumo mostra aptos, pendentes e rejeitados, sem mensagem de gravação. Lotes totalmente inválidos ou com mapeamento incompleto não podem ser confirmados.

## Formatos e regras

- CSV aceita vírgula, ponto e vírgula ou tabulação, aspas escapadas, quebras de linha dentro de aspas e BOM. UTF-8 é preferido; UTF-16 com BOM e Windows-1252 também são interpretados. A codificação usada aparece na tela.
- Linhas vazias antes do cabeçalho são desconsideradas; vazias entre registros são inválidas. Quebra de linha final não cria registro artificial. Linhas CSV com quantidade de colunas diferente do cabeçalho têm erro estrutural.
- Datas DD/MM/AAAA e AAAA-MM-DD são validadas pelo formulário existente; anos bissextos e datas inexistentes são tratados. XLSX também aceita datas seriais nos sistemas 1900/1904 e frações de dia para horários com precisão de minuto. Não há inferência de mês/dia em formatos ambíguos.
- Horários textuais seguem HH:mm. Data/hora representam os campos civis da ocorrência; esta entrega não cria timestamps de banco nem converte fuso.
- Naturezas usam os oito nomes do catálogo demonstrativo. Várias naturezas são separadas por `;` ou `|`, validadas individualmente e mantidas em uma única ocorrência. Repetições da mesma natureza não criam vínculos adicionais. Células com mais de 32 itens são inválidas, limitando a expansão de mensagens e preservando o bruto para correção.
- RAs aceitam nome/nome de exibição ou identificador interno existente. Normalização de caixa, acentos e separadores cria derivados; valores originais não são substituídos. Não há equivalência automática entre categorias criminais distintas ou códigos oficiais inventados.
- Endereço segue o limite de 5–240 caracteres do formulário. Coordenadas fornecidas usam decimais (vírgula ou ponto), latitude −16,2 a −15,4 e longitude −48,3 a −47,3. São limites demonstrativos existentes, não um teste de pertencimento ao polígono da RA.
- Ausência de uma ou das duas coordenadas gera pendência de localização se os demais campos forem válidos. Valores fornecidos inválidos são erros. Não são criados centroides, coordenadas sintéticas ou chamadas de geocodificação.
- Fórmulas e erros de célula no XLSX geram erro por linha/coluna; fórmulas não são executadas. Cabeçalhos com fórmulas/erros são recusados.
- Possíveis duplicatas são apenas candidatas dentro da planilha selecionada, usando data/hora, lista de naturezas, RA, local normalizado e coordenadas. As contagens de válidos/pendentes já incluem essas linhas. Não há exclusão automática, comparação com base persistida ou comprovação de identidade.

## Modelos e catálogos

Modelos: [CSV](../public/modelos/ocorrencias-demonstracao.csv) e [XLSX](../public/modelos/ocorrencias-demonstracao.xlsx). O XLSX pode ser regenerado com `node scripts/generate-import-template.mjs` a partir do CSV. Eles contêm apenas dois exemplos sintéticos, um apto e um com pendência de localização. Os catálogos podem ser consultados na própria tela. Modelos, aliases, identificadores e categorias não são homologados institucionalmente.

## Memória e cancelamento

O parsing e a validação são executados em um Worker; o thread principal recebe metadados e resultados limitados. Há limites explícitos de 10 mil linhas, 64 colunas, 200 mil células, 4 mil caracteres por célula e 16 Mi caracteres de texto. XLSX faz preflight do diretório ZIP, com até 100 MB declarados descompactados, até 2.048 entradas e até 50 planilhas. ZIP64 e criptografia não são suportados. Limites excessivos geram erro, sem importação parcial silenciosa.

Cancelar, substituir o arquivo ou desmontar a tela encerra o Worker e libera suas referências. Operações acima de 60 segundos também o encerram. O arquivo pode ser menor que 50 MB e ainda exceder limites de conteúdo. Esses controles não constituem garantia formal de consumo máximo de heap para arquivos hostis; uma futura API precisa de controles próprios.

Na Etapa 4, o ciclo de vida foi isolado em `importWorkerClient` e o processamento em `importWorkerProcessor`, mantendo o empacotamento pelo Next.js e o parsing fora da thread principal. Cada operação recebe um ID interno; somente a resposta do Worker e da operação atuais pode atualizar a tela. Há no máximo uma tarefa pendente por Worker. Uma leitura assíncrona ultrapassada não substitui a tabela atual. O protocolo é interno, sem mudança nos contratos HTTP da Etapa 3.

O watchdog mantém exatamente `IMPORT_LIMITS.timeout` (60.000 ms) por operação de leitura/planilha/validação; uma nova operação tem seu próprio prazo. Esse é um limite demonstrativo já existente, não uma estimativa de duração por tamanho. Não houve redução arbitrária nem novos timeouts no parser. Falha explícita de execução, envio ou desserialização encerra imediatamente os recursos e apresenta erro recuperável. Workers silenciosamente encerrados são detectados pelo watchdog, pois não há evento de encerramento equivalente ao do Node no cliente implementado. Cancelamento invalida a operação antes de remover handlers/timer e chamar terminate; não atualiza estado no cleanup de desmontagem.

Novos testes usam relógio controlado para verificar a fronteira de 60 segundos sem esperar esse tempo real; o Chrome executa o Worker nativo com CSV real, controlando somente entrega/falhas. Não é benchmark ou medição de heap. Resultados atuais, distintos das evidências históricas abaixo: [homologação da Etapa 4](homologacao-sprint-03.md).

## Isolamento e preservação

Nenhum arquivo da PCDF foi alterado. Não foram modificados Dashboard, mapas, autenticação ou banco. A seleção inicial não commitada foi reaproveitada (`validateImportFiles` e seus testes). O componente antigo permanece como `LegacyImportarDados`; a rota ativa usa `ImportWorkflow`. Históricos e prévias fixas do componente antigo não aparecem no novo fluxo.

## Validação

- Instalação congelada: Node 22.23.2 / pnpm 10.34.3, `install --frozen-lockfile` aprovado.
- TypeScript e ESLint sem avisos aprovados na revisão final; contratos e rotas estáticas aprovados.
- 46 testes Node aprovados, incluindo 16 novos cenários de leitura/mapeamento/validação/confirmação, além dos dois testes existentes de seleção.
- Build Next.js aprovado após a revisão final. Roteiro Chrome aprovado nos temas claro/escuro em 1366, 768, 390 e 320 px: arquivos inválidos, CSV/XLSX reais, troca de planilhas, mapeamento manual, prévia, confirmação, paginação, drag-and-drop e foco por teclado. Zero erros JavaScript de página e zero requisições de gravação capturados. [Evidências preservadas](evidencias/importacao/README.md).
- Reprodução: `corepack pnpm@10.34.3 typecheck`, `lint`, `test`, `build` e `check:import`. O runner Node/Chrome/build podem exigir execução fora do sandbox por `spawn EPERM`; nenhuma política do Windows foi desativada.
- `check:import` reutiliza o servidor disponível; não inicia outro. URL padrão `http://127.0.0.1:3000`, alternativa por `SENTINELA_TEST_URL`. Saída completa em `tmp/import-evidence/`, ignorada pelo Git.

As tentativas anteriores do roteiro incluíram timeout de navegação por dependência de fonte remota, seleção de alertas que também capturava o anunciador do Next.js e uma checagem de foco sem navegação por teclado. Esses resultados não foram contados como aprovação. O roteiro final bloqueia somente as fontes externas, seleciona as mensagens esperadas e usa Tab/Shift+Tab para verificar foco. A aplicação mantém sua configuração de fontes original.

## Inventário de arquivos da entrega

Modificados: `package.json`, `pnpm-lock.yaml`, `sprints/sprint-03.md` e `src/features/ImportarDados.tsx`. O pnpm 10.34.3 também normalizou resoluções de peers no lockfile ao incluir a distribuição oficial do SheetJS; a instalação congelada foi verificada.

Criados nesta continuação:

- `src/data/importTypes.ts`
- `src/data/importParser.ts`
- `src/data/importValidation.ts`
- `src/features/import/ImportWorkflow.tsx`
- `src/features/import/ImportWorkflow.module.css`
- `src/features/import/import.worker.ts`
- `tests/import-workflow.test.mjs`
- `scripts/check-import.mjs`
- `scripts/generate-import-template.mjs`
- `public/modelos/ocorrencias-demonstracao.csv`
- `public/modelos/ocorrencias-demonstracao.xlsx`
- `docs/importacao-demonstrativa.md`
- `docs/decisoes/adr-importacao-demonstrativa-local.md`
- `docs/evidencias/importacao/README.md`
- `docs/evidencias/importacao/resultados.json`
- `docs/evidencias/importacao/BUILD_ID.txt`
- `docs/evidencias/importacao/page-claro-390.png`
- `docs/evidencias/importacao/page-escuro-1366.png`
- `docs/evidencias/importacao/preview-claro-390.png`
- `docs/evidencias/importacao/preview-escuro-1366.png`

Já estavam não commitados e foram preservados sem alteração nesta continuação: `src/data/importFile.ts` e `tests/import-file.test.mjs`. As alterações anteriores em `sprints/sprint-03.md` e `src/features/ImportarDados.tsx` também foram preservadas e estendidas. Artefatos temporários de build/teste não integram o inventário versionável.

## Limitações e próxima etapa

Não há persistência, processamento transacional, histórico durável, fila de localização, auditoria, RBAC no servidor ou deduplicação institucional. A simulação é isolada nesta tela. Não há suporte a XLS, XLSM, ZIP64, arquivos com senha ou planilhas acima dos limites. Apenas a planilha selecionada participa do lote; planilhas não são unidas automaticamente. Não houve homologação em Firefox/Safari, teste de carga operacional ou certificação de acessibilidade.

A próxima etapa é revisar e homologar esquema/modelos, aliases e catálogos com o grupo, revisar a entrega e continuar os contratos OpenAPI da Sprint 3. Persistência/importação transacional e deduplicação ficam para as etapas de backend previstas, referenciando os contratos homologados. Ver [ADR da importação](decisoes/adr-importacao-demonstrativa-local.md).
