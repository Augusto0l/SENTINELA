# Consulta local de ocorrências

A tela /ocorrencias usa GET /api/v1/ocorrencias/consulta no ambiente integrado
em localhost:3000. O serviço exige sessão local e conexão atestada com
sentinela_pcdf_local, em 127.0.0.1:55484. Os demais ambientes mantêm as rotas e
contratos existentes. O OpenAPI descreve o esquema por modalidade em
x-query-schema.

| view | Parâmetros | Resultado |
| --- | --- | --- |
| resumo | Nenhum | Contagens abrangentes e opções de filtro por modalidade |
| importados | identificacao, ra, natureza, competencia, situacao, dataInicial, dataFinal, pagina, ordenar, direcao | Associações PCDF de execuções concluídas em origem e staging |
| consolidadas | identificacao, raId, naturezaId, dataInicial, dataFinal, pagina, ordenar, direcao | Ocorrências ativas com consolidação registrada |
| detalhe | area e id | Uma associação com 34 campos e pendências ou uma ocorrência consolidada com seus dados e naturezas vinculadas |

Na homologação sintética de gestão, a aba Arquivos importados abre a consulta
`importados` com `lote` (UUID). A filtragem ocorre no PostgreSQL antes da
paginação. Com `lote`, o filtro opcional `busca` procura texto literal em
identificação policial, número da linha, natureza, RA, local e ID da associação.
Quando a correção administrativa é enviada por essa aba, a mutação também
recebe `lote` e verifica sua correspondência com a associação na transação.

As duas listas usam 25 linhas por página. A ordenação padrão é por data
decrescente, com datas ausentes por último e UUID crescente como desempate.
A busca por identificação compara texto literal sem distinção de maiúsculas com
a composição do registro policial e o UUID da linha. RA e natureza importadas
correspondem exatamente aos valores originais disponíveis. As datas de consulta
são os valores civis aceitos pelo receptor, com intervalo inclusivo. Os valores
originais de data e horário ficam disponíveis no detalhe mesmo quando a
validação da data impede seu uso como filtro.

Cada linha importada representa uma associação no CSV. O indicador de pendências
conta registros de revisão vinculados às linhas de origem visíveis no
escopo PCDF. O detalhe apresenta o estado atual de cada pendência. Os campos
originais permanecem como strings do arquivo, inclusive vazios, zeros à esquerda
e espaços. A natureza padronizada exibida no staging é a coluna recebida da
PCDF. A lista consolidada usa o catálogo efetivamente vinculado às ocorrências.

O código mantém Administrador e Operador como perfis de leitura do staging
PCDF. O Analista tem acesso à consulta de ocorrências consolidadas. A
autorização é verificada na aplicação e nas políticas RLS do PostgreSQL. Os
logins comuns executam apenas funções específicas e não recebem acesso direto
às tabelas. As sessões de consulta são abertas como transações READ ONLY e
validam host, porta, identidade do cluster, versão, RLS e privilégios.

## Instalação local

A migration database/local/pcdf-sandbox/occurrences-read.sql é separada da
recepção PCDF. Ela cria um papel sem login, políticas de leitura e funções
restritas em uma transação. O arquivo deve ser aplicado por um administrador
após atestar o cluster e obter aprovação explícita. O parâmetro psql
expected_uuid deve corresponder ao UUID do manifesto do cluster. Antes da
aplicação, gere um backup lógico privado e restaure-o em um cluster
descartável atestado na porta 55486. Confirme a ausência do papel, do schema e
das políticas de leitura antes de executar o SQL com ON_ERROR_STOP.

O conjunto de recuperação inclui um pg_dump custom com CREATE DATABASE, os
papéis exportados por pg_dumpall com --roles-only --no-role-passwords e os
grants da função de sistema pg_control_system. Na restauração isolada, preserve
o papel postgres usado para criar o cluster, restaure os demais papéis antes
do pg_restore --create --exit-on-error e reaplique os grants de sistema no
banco restaurado. Use credenciais novas no clone. Compare o schema completo,
os hashes das tabelas e os vínculos do lote antes de testar a migration.

O lançador database/local/pcdf-sandbox/serve-import-3000.py carrega as
credenciais dos três perfis a partir da configuração privada existente. A
aplicação atesta a identidade do cluster em cada conexão e executa as
consultas em transações somente leitura. Com o cluster já em execução, use
--next-only para reiniciar apenas o Next com as contas locais ordinárias.
O lançador local desativa os traces de desenvolvimento do Next para evitar
que parâmetros de busca sejam gravados em disco. Depois da instalação,
valide o resumo, a primeira e a última páginas de janeiro de 2021 e a recusa
do Analista ao consultar staging.

A leitura de pendências usa o drawer da associação. O fluxo de correções da
Central de Revisão permanece sob seu próprio escopo de autorização. Este
contrato oferece apenas GET.
