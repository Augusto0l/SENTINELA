# Importação persistente de arquivos no SENTINELA

## Escopo

Em `localhost:3000/importar`, o fluxo geral usa o mesmo PostgreSQL 17/PostGIS dedicado do receptor PCDF e as contas locais do SENTINELA. O frontend reutiliza seleção e arraste, Worker de leitura, mapeamento automático e manual, prévia paginada e filtro por situação. O navegador envia os bytes do arquivo geral na confirmação. A migração local reaproveita as funções de staging, auditoria, reconciliação e detalhe homologadas no laboratório. [Início e uso da aplicação integrada](piloto-pcdf-2021-01.md)

O seletor compartilhado encaminha o CSV com nome ou cabeçalhos PCDF para o receptor especializado antes de abrir o Worker geral. O manifesto técnico é opcional. As funções do laboratório 55432 ficam disponíveis para o ensaio sintético isolado descrito abaixo. [Importação PCDF v1.0](../contratos/importacao-pcdf-v1.0.md) · [Recepção direta PCDF](piloto-pcdf-2021-01.md)

## Formatos e limites

| Formato | Fluxo geral |
| --- | --- |
| CSV | UTF-8 e BOM, UTF-16 com BOM e Windows-1252. Suporta vírgula, ponto e vírgula e tabulação, aspas escapadas, quebras em campos citados e linhas iniciais em branco. Quando o cabeçalho admite mais de um separador, escolha manualmente. |
| XLSX | Seleção de planilha, cabeçalho e células reais. Datas seriais usam o calendário da planilha, sem mudar o valor bruto. Zeros à esquerda são preservados quando armazenados como texto. Fórmulas e erros de célula são diagnosticados, e fórmulas ficam apenas como texto de origem, sem avaliação. |
| XLS | Exporte no aplicativo de origem como CSV ou XLSX. O fluxo qualificado usa o leitor OOXML com inspeção ZIP e limites de expansão. |
| XML SpreadsheetML | O receptor PCDF direto recebe os CSVs mensais produzidos a partir do XML. O manifesto técnico permite conferir o vínculo declarado com a extração. |

O upload geral aceita um arquivo de até 8 MiB, até 10 mil linhas por planilha, 64 colunas, 200 mil células, 4 mil caracteres por célula e 16 Mi caracteres por planilha. XLSX tem limites de 50 abas, 2.048 entradas ZIP e 100 MiB expandidos. A expansão real é conferida antes de entregar o conteúdo ao leitor. O Worker faz a prévia fora da thread da interface. O servidor limita os bytes enquanto lê o corpo e processa um arquivo por requisição. Divida os arquivos gerais que excedam os limites em partes.

## Mapeamento, validação e staging

O reconhecimento ignora acentos, caixa e separadores nos nomes de cabeçalho. Associações ambíguas exigem escolha manual. Cada campo de destino recebe no máximo uma coluna, e a prévia indica todas as posições de origem. A seleção de aba e separador e o mapeamento são conferidos novamente no servidor, que executa o mesmo parser e a validação sobre os bytes recebidos. Colunas desconhecidas, espaços, vazios, números e textos adicionais permanecem no snapshot posicional.

A prévia distingue linhas válidas pelo validador, pendentes, inválidas e possíveis duplicatas no arquivo. A confirmação informa o total persistido e as linhas estruturalmente válidas. Linhas de largura irregular, vazias ou com valores inválidos permanecem em staging com diagnósticos quando a estrutura do arquivo permite recuperá-las. Um arquivo ilegível ou um mapeamento inválido é recusado antes de registrar tentativa. Chaves de comparação são alertas e as contagens se referem a linhas. Nenhuma linha é promovida por esta funcionalidade.

## API local

| Método e caminho | Operação |
| --- | --- |
| `POST /api/v1/importacoes/geral` | Recebe bytes CSV/XLSX, `Content-Type`, UUID em `Idempotency-Key` e JSON codificado em URI em `X-Sentinela-Import`. O JSON contém `name`, `sheet`, `mapping` e, para CSV, o separador quando informado. Responde 201 no primeiro commit ou 200 em reenvio, com lote, execução, contagem e resumo. |
| `GET /api/v1/importacoes/geral` | Até 100 tentativas recentes com arquivo, formato, aba, perfil responsável, horário, situação e recibo quando concluída. |
| `GET /api/v1/importacoes/geral/{id}?pagina=1` | Até 25 linhas por página da execução, com originais e diagnósticos. |
| `GET /api/v1/importacoes/geral/revisao?pagina=1` | Pendências gerais com filtros de tipo, prioridade e situação e busca textual. |
| `PATCH /api/v1/importacoes/geral/revisao/{id}` | Registro versionado de decisão do Administrador, com justificativa. |

Os contratos Zod da API local ficam em `src/contracts/general-import.ts`. A API reutiliza a sessão local e o envelope privado do laboratório. As leituras usam transação somente leitura. Envio e correção exigem Origin e Host esperados. Reenvio com outro mapeamento para os mesmos bytes e aba retorna conflito. Uma planilha diferente do mesmo XLSX constitui uma seleção distinta.

## Banco, auditoria e recuperação

A migration local `database/local/write-sandbox/005_general_import.sql` cria o schema `sentinela_import_lab`, as tabelas `requests` e `decisions` com RLS forçada e o proprietário técnico `sentinela_general_importer` sem login ou privilégios administrativos. O instalador usa a guarda de identidade do laboratório. A aplicação exige a marca `general_import` no manifesto atestado e a opção `SENTINELA_SANDBOX_GENERAL_IMPORT=1` no ambiente autenticado de escrita local. As políticas novas limitam o proprietário à fonte `IMPORTACAO-GERAL-LOCAL`. Os logins de aplicação recebem somente as funções previstas. As 19 tabelas do núcleo continuam com RLS forçada.

A tentativa autenticada é registrada antes da transação de staging. O banco verifica tamanho e SHA-256 dos bytes recebidos e vincula a tentativa ao hash da estrutura validada no servidor. A transação seguinte grava extração, lote, execução, linhas de origem, staging, pendências e auditoria. A reconciliação compara contagens e snapshots antes de confirmar o commit. A referência de extração usa o hash derivado dos bytes e da aba, e o lote guarda o SHA-256 exato do arquivo. Nas colunas legadas de proveniência, o nome e a posição correspondem ao arquivo e à aba recebidos. O mês do lote é o mês da recepção, e as datas do arquivo continuam nas respectivas linhas. O fluxo conserva os snapshots selecionados e hashes. O arquivo binário integral não integra o histórico.

O bloqueio transacional por origem de arquivo e aba serializa reenvios. Uma falha de staging reverte toda a gravação. Se a conexão permitir, o backend registra `falhou` em transação separada. Se a aplicação for interrompida, o histórico mantém a tentativa recebida sem confirmação. Consulte o histórico e reenvie os mesmos bytes e mapeamento para recuperar o lote confirmado ou repetir a gravação. O resultado só aparece como concluído após o retorno do commit.

Cancelar a prévia encerra o Worker e permite escolher outro arquivo. Durante o envio a interface exibe atividade indeterminada e desabilita a troca do arquivo. Uma desconexão do cliente após o início do processamento requer consulta do histórico antes de repetir o envio.

Administrador e Operador podem importar e consultar o histórico do laboratório. Analista pode consultar pendências da Central. A correção de horário e endereço e o encerramento com justificativa exigem Administrador. Decisões ficam em tabela separada e são auditadas. Originais, staging bruto e as regras de consolidação permanecem protegidos.

## Homologação reproduzível

A partir do worktree, com Python, Node 22, pnpm 10.34.3, PostgreSQL 17.11 e PostGIS 3.6.2:

```powershell
python -B database/local/write-sandbox/run-general-import.py --isolated-only
```

O comando cria um cluster privado novo em loopback na porta 55432, aplica a baseline e as migrations locais, autentica identidades temporárias distintas, executa navegador e API, reinicia o Next.js e consulta a persistência. Os artefatos sanitizados ficam no subdiretório `evidence` do cluster excluído do Git. O controlador atesta e encerra somente o cluster que criou. As credenciais de teste são efêmeras.

### Evidência da execução em 21/11/2026

O recibo `general-import-tests.json` do cluster `374d4864-8b3d-42d6-b9a4-c6a077622d97` registra seis grupos aprovados pelo navegador e pela API. O cenário CSV conferiu seleção, cancelamento da prévia, mapeamento manual, commit, refresh, detalhe e zeros à esquerda. O cenário XLSX selecionou uma segunda aba de um arquivo comprimido e validou datas. A tela foi exercitada em 390, 768 e 1.440 pixels. A segunda instância do Next.js recuperou o histórico e os originais do mesmo banco.

A inspeção autenticada do banco registrou quatro lotes, quatro execuções, 2.506 linhas de origem e 2.506 snapshots equivalentes em staging, 5.012 pendências, 19 eventos de auditoria e uma decisão de revisão. Uma carga de 2.500 linhas recebeu dois envios concorrentes e produziu um lote. Uma transação que gravou dados antes de falhar na reconciliação foi revertida, e a retentativa persistiu a linha uma única vez. O ensaio também confirmou conflito de mapeamento, bloqueios de escrita direta, autenticação, RLS e recusa de arquivos PCDF no fluxo geral. O cluster terminou encerrado, com zero promoções.

A regressão aprovou 259 testes Node, 177 testes Python, TypeScript, ESLint, contratos e OpenAPI, baseline, rotas estáticas e build do Next.js. O inventário de rotas de escrita inclui explicitamente os dois novos métodos protegidos da importação geral e continua recusando métodos não autorizados.

A recepção direta PCDF foi implementada em ambiente local dedicado. A consolidação e a publicação de registros reais ficam fora da recepção.
