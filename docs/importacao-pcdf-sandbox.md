# Pipeline PCDF — recebimento, revisão e consolidação em sandbox

## Fluxo integrado ao Next.js

Execute `python -B database/local/write-sandbox/run-mutations.py --execute --next --pcdf`
para reproduzir a homologação. O controlador cria e atesta um novo cluster
PostgreSQL 17.11/PostGIS 3.6.2, instala o catálogo sintético, prepara uma
aprovação de identidade e abre o navegador com contas efêmeras. Ao terminar,
o controlador encerra o servidor e o cluster.

- **Receber.** Administrador e Operador usam `/importar`. O Node limita o
  CSV a 16 MiB, chama o parser Python existente e persiste originais, staging,
  diagnósticos, recibo, bytes e UUID sintético. O parser exige a proveniência
  da fixture. O PostgreSQL confere hash e tamanho. O reenvio idêntico preserva
  o lote e a execução.
- **Revisar.** Os três perfis consultam a Central com filtros por tipo,
  prioridade e situação. A fila mostra até 100 pendências. Cada detalhe
  mostra origem e valor efetivo. O Administrador pode corrigir horário ou
  local antes da promoção, ou encerrar sem solução com justificativa. A
  decisão anexada conserva autor, versão, antes/depois e transação. Uma
  versão divergente retorna HTTP 409. O encerramento sem solução conserva
  os critérios de bloqueio e o dado de origem.
- **Consolidar.** Administrador e Operador podem solicitar a promoção de
  um lote. Cada grupo exige aprovação vinculada à execução e mapeamento
  homologado por texto original, categoria de origem, versão do mapa e
  tentativa. Inconsistências, falta de aprovação e chaves já consolidadas
  em outra entrega permanecem pendentes. Uma ocorrência canônica recebe
  uma associação por linha de origem, inclusive quando duas naturezas
  compartilham a categoria. A transação protege caso, associações e
  auditoria. O arquivo e o staging original ficam imutáveis. O estado de
  promoção é projetado pelo vínculo entre associação e linha de origem.
- **Consultar.** O recorte analítico PCDF lê ocorrências sintéticas
  consolidadas. A listagem identifica as linhas PCDF e o Dashboard usa a
  mesma unidade de contagem do Mapa. O recorte conserva geometrias e RA
  ausentes enquanto a referência espacial estiver pendente.

Para a carga real ainda são necessários a matriz de mapeamento, a regra de
identidade entre extrações, a referência espacial, o escopo do revisor e
uma janela de operação autorizada. O ensaio cobre reenvio e nova tentativa
após rollback. Uma nova versão de tratamento exige política separada.
[Testes e recibos](desenvolvimento/progresso-conclusao.md)

O [contrato PCDF](contratos/importacao-pcdf-v1.0.md) documenta um layout
candidato de 34 colunas. O parser SpreadsheetML está no projeto irmão
SENTINELA-DADOS. A inspeção confirmou que ele respeita posições de linhas e
células e gera amostras de inspeção. Sua rotina de amostragem altera valores
para proteção de planilha, portanto a amostra tem finalidade de inspeção.
O XML real e o histórico criminal permaneceram fora deste ensaio.

## O que o pipeline persiste

- Recebe bytes CSV UTF-8 com delimitador `;`, valida o cabeçalho na ordem
  documentada, a largura dos registros e os metadados de origem. Aceita
  aspas duplicadas e quebras de linha dentro de células. O ensaio tem
  limites de 16 MiB, 25 mil registros e 16.384 caracteres por célula.
- Preserva os 18 textos de origem e registra a linha inteira de 34 campos
  em staging. Analisa data, competência, hora, coordenadas e marcadores
  policiais em campos derivados separados. Registra ausências e conflitos
  como pendências, sem inferir classificação ou validar CRS sem evidência.
- Usa `extracoes_origem`, `lotes_importacao`, `execucoes_importacao`,
  `linhas_origem`, `linhas_staging`, `pendencias_revisao` e
  `eventos_auditoria` já definidos pela baseline. O lote, os originais,
  o staging, as pendências e o evento técnico compartilham uma transação.
- O hash dos bytes e o contexto do lote identificam o replay exato. A mesma
  entrega retorna o lote e a execução existentes. Colisões de linha de
  origem interrompem a transação. Um retry depois de rollback é possível.
  Reprocessamento por nova regra após uma execução concluída ainda requer
  um fluxo versionado com autorização e trilha próprias.
- A identidade candidata agrupa linhas para conferência e preserva cada
  associação potencial em staging. A chave ainda não é homologada para unir
  registros canônicos. As linhas ficam bloqueadas para consolidação.

## Revisão e segurança no ensaio inicial de staging

No laboratório, `sentinela_pcdf_lab.review` lista pendências com filtro
por tipo e prioridade, ordena primeiro as de prioridade alta e retorna
o valor original do campo diagnosticado. O limite por consulta é 100.
A RLS limita o papel técnico às extrações sintéticas. O papel de staging
tem acesso mínimo à referência do solicitante sintético exigida pelos
triggers. O ensaio não autentica um revisor humano.

A edição, confirmação e auditoria humana da Central dependem de identidade
administrativa verificável, escopo e backend auditado. A baseline continua
bloqueando atualizações de staging e pendências e inserção no histórico de
correções. A regra funcional continua exclusiva do Administrador. A UI
`/importar` mantém os fluxos demonstrativos e a Central persistente ainda
não está ligada à aplicação. Publicar os valores de origem exige escopo
de leitura e tratamento de dados adequados.

## Reproduzir o parser e a bateria SQL

```powershell
python -B database/local/pcdf-sandbox/qualify.py --parser-only
python -B database/local/pcdf-sandbox/qualify.py --isolated-only
```

O segundo comando usa as ferramentas PostgreSQL locais e cria um cluster
novo em loopback na porta 55432. Ele gera os CSVs e um pequeno XML sintético
somente para provenance do ensaio. A geração de CSV a partir do XML original,
a reconciliação de posições e hashes de um lote real, a homologação das
41 descrições e o mapeamento às 20 categorias continuam condições
de liberação. A migration do laboratório nunca deve ser aplicada ao banco
operacional.

## Resultado da homologação isolada

O PostgreSQL 17.11/PostGIS 3.6.2 aceitou o CSV de 34 colunas, preservou
acentos, espaços, quebras de linha, delimitadores entre aspas e zeros à
esquerda. Foram rejeitados cabeçalho inválido, bytes fora de UTF-8,
quantidade incorreta de colunas e origem duplicada. Reenvio de bytes
idênticos devolveu a mesma execução. Uma colisão entre lotes abortou a
transação. Uma falha injetada após inserções reverteu o staging e o mesmo
lote foi recebido com sucesso em seguida.

No lote sintético de 10.000 linhas e 3.130.551 bytes, geração do CSV,
preparação e preservação do arquivo levaram 0,780 s. O envio ao cliente
psql e a transação levaram 8,897 s. O lote manteve 5.000 grupos
candidatos. A bateria inteira terminou com 10.005 originais, 10.005 linhas
de staging, 30.019 pendências, cinco execuções e cinco eventos de auditoria.
As 19 tabelas continuaram com RLS forçada. Nenhuma ocorrência ou associação
canônica foi criada. O ensaio confirmou a consulta filtrada e rejeitou
tanto correção pelo papel de ingestão quanto leitura bruta pela reader.

O cluster terminou parado e teve zero conexões operacionais.
[Recibo local](../tmp/pcdf-sandbox/rls-sandbox-bf758f4a-bbe1-44f7-91b6-d63f97577560/evidence/pcdf-staging.json)
com SHA-256 `78bb2639482744310d42778d38a4dcfa14db57afe5e11e45bfa04498b6c16a27`.
As medidas descrevem este ensaio, incluindo custos do cliente local.
