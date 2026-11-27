# SENTINELA — Exclusão física de arquivos importados

24 de novembro de 2026 · `/ocorrencias` · **Arquivos importados**

## Interface e autorização

**Excluir arquivo** abre uma prévia calculada pelo PostgreSQL para o UUID selecionado. A tela mostra o arquivo, a competência, as associações, as chaves candidatas, as pendências, os registros compartilhados e, quando aplicável, os artefatos sob custódia. Dependências impeditivas aparecem com identificadores para revisão. Para confirmar, o Administrador informa a justificativa, digita o UUID e aceita explicitamente a exclusão permanente. As ações **Ver detalhes** e **Editar registros** continuam na mesma linha.

Lotes com baixa lógica anterior também podem ser removidos quando a prévia libera a operação. A exclusão remove as marcas e os eventos de baixa que pertencem àquele lote.

Após confirmação do commit, a tela volta a consultar os arquivos, as ocorrências e os indicadores. A aba oferece **Comprovantes de exclusão** como consulta administrativa. A API devolve o comprovante após o commit. O Dashboard e o Mapa Criminal consultam o PostgreSQL a cada abertura, com requisições sem cache. Essas telas contam ocorrências consolidadas, e a exclusão preserva as que têm vínculo válido e bloqueia os casos de titularidade ambígua.

A migration `0005_import_purge_synthetic.sql` exige o banco sintético atestado em `127.0.0.1:55488` e o UUID do cluster de teste. O servidor confere o modo, a sessão local, o perfil e o Host. A escrita também confere Origin. O PostgreSQL aplica privilégios específicos, usuário de sessão Administrador e RLS. O papel técnico da exclusão é `NOLOGIN` e `NOBYPASSRLS`.

## Dependências e decisão por tabela

| Tabela | Dependência e tratamento |
| --- | --- |
| `sentinela.lotes_importacao` | Raiz da operação. Referencia a extração e o usuário solicitante. A seleção usa o UUID do lote. |
| `sentinela.execucoes_importacao` | FK composta para lote e extração. Exclui as tentativas do lote. Execução em andamento impede a operação. |
| `sentinela.linhas_staging` | FKs para execução, lote e extração, para a linha de origem e, quando preenchidas, para ocorrência e associação consolidada. Exclui o staging do lote, inclusive os valores processados, diagnósticos e chaves candidatas no conteúdo da linha. A chave candidata é derivada do staging, sem tabela própria. |
| `sentinela.linhas_origem` | FK para extração. Exclui as linhas comprovadamente exclusivas. Preserva a linha quando outro lote ainda a referencia. Origem avulsa sem titularidade identificada impede a remoção da última extração. |
| `sentinela.extracoes_origem` | Raiz dos metadados XML/CSV. Exclui quando todos os lotes e linhas daquela extração pertencem ao escopo. |
| `sentinela.pendencias_revisao` | FKs opcionais para linha de origem, ocorrência e responsável. Exclui as pendências de origem exclusiva. Uma pendência dessas ligada a ocorrência exige revisão. Pendências de origens compartilhadas são preservadas. |
| `sentinela.ocorrencia_naturezas` e `sentinela.ocorrencias` | A associação consolidada referencia a ocorrência, a natureza, o mapeamento e, para importação, a linha de origem. O modelo não atribui cada campo consolidado a um lote. A ocorrência e sua associação são preservadas se a mesma origem tiver apoio ativo em outro lote. Vínculos exclusivos ou sem cobertura ativa suficiente bloqueiam a remoção. |
| `sentinela.historico_correcoes` | Referencia ocorrência, staging, associação e pendência. Exclui o histórico exclusivo do staging. Histórico dependente de outro alvo bloqueia. |
| `sentinela.eventos_auditoria` | FKs para usuário, ocorrência, origem, pendência, execução e correção. Também traz UUIDs de lote/execução/staging e identificadores de tentativa em JSON ou texto. Exclui os eventos associados ao material removido, incluindo tentativas PCDF correlacionadas, recibos, revisões administrativas e snapshots exclusivos. |
| `sentinela_gestao.inativacoes` e `naturezas_inativadas` | A primeira referencia lote ou staging e o evento original. As marcas exclusivas são removidas antes do evento. A segunda referencia uma natureza consolidada e seu evento. Se depender de evento do escopo, a remoção é bloqueada. |
| `sentinela_import_local.requests` | FK para a conta local. O recibo JSON liga a requisição, inclusive replay, ao lote e à execução. Os recibos e as chaves correspondentes são removidos. Tentativas independentes sem recibo do lote ficam fora do escopo. |
| `sentinela_pcdf_local.entregas_pacote` e `aprovacoes_pacote` | A entrega referencia a execução e a aprovação pelo digest. Exclui a entrega vinculada e sua aprovação. No PCDF v2 a entrega contém seis artefatos. Uma tentativa rejeitada com identidade independente fica fora do escopo. |
| `sentinela_ocorrencias_manual.cadastros`, catálogos e usuários | Cadastro manual referencia a própria ocorrência. Seus registros, catálogos e usuários são preservados. |
| `sentinela_exclusao.comprovantes` | Identificador do comprovante, UUID do lote, identificador da conta responsável, justificativa, momento e quantidades. A tabela tem RLS forçada e o UUID do lote excluído não referencia a tabela de lotes ativos. |

## Transação e reimportação

A prévia gera uma revisão SHA-256 do escopo, dos compartilhamentos e dos bloqueios. Ao confirmar, a função volta a calcular a prévia em uma transação `READ COMMITTED`, com as travas consultivas do receptor PCDF e, para CSV/XLSX geral, da planilha. Travas de tabela preservam a topologia das FKs durante a exclusão. A inspeção do catálogo recusa dependências desconhecidas e ações referenciais automáticas nos alvos do plano. A função exclui pelas chaves listadas, na ordem filho–pai, e confere cada número de linhas excluídas. A inserção do comprovante usa a mesma transação.

A reimportação emite um novo UUID. CSV/XLSX aceita a chave de idempotência liberada pela exclusão. PCDF v1 passa novamente pela validação do CSV. PCDF v2 exige nova aprovação do pacote e repete as validações dos artefatos e da proveniência. A origem ainda vinculada a outra importação é reutilizada por sua identidade. O comprovante antigo segue vinculado somente ao UUID removido.

## Homologação e evidências

O ensaio usa PostgreSQL 17.11 e PostGIS 3.6.2 descartáveis. As provas SQL registram contagens anteriores e posteriores e incluem uma consulta por nova conexão após o commit. O ensaio cobre exclusão de lote PCDF v2, reimportação v1/v2 e CSV/XLSX, preservação de origens compartilhadas, comprovante mínimo, integridade referencial, concorrência, rollback e bloqueios de perfil e consolidação. A criação de uma FK desconhecida com cascata também foi recusada na prévia.

Na amostra PCDF v2, o lote, a execução, as duas linhas de staging, as duas origens, as oito pendências, a entrega dos seis artefatos, a aprovação e os dois eventos exclusivos passaram a zero, inclusive após reconexão. Os indicadores da consulta passaram de 4 para 2 associações e de 16 para 8 pendências. Uma nova recepção validada recebeu outro UUID. O ensaio separado com compartilhamento também confirmou a reutilização da origem preservada pelo outro lote. [Evidências SQL antes e depois](../evidencias/exclusao-fisica-arquivos-importados-2026-11-24/exclusao-sql.json).

No Playwright integrado, o cancelamento a 1440 px deixou o lote disponível. A confirmação a 390 px retirou o lote e sua associação da consulta, reduziu de 9 para 8 o indicador de associações ativas e exibiu o comprovante retornado após o commit. [Prévia desktop](../evidencias/exclusao-fisica-arquivos-importados-2026-11-24/exclusao-previa-1440.png), [prévia mobile](../evidencias/exclusao-fisica-arquivos-importados-2026-11-24/exclusao-previa-390.png), [comprovantes](../evidencias/exclusao-fisica-arquivos-importados-2026-11-24/comprovantes-390.png), [resultados do navegador](../evidencias/exclusao-fisica-arquivos-importados-2026-11-24/exclusao-navegador.json).

| Verificação | Resultado |
| --- | --- |
| Node | 274 aprovados, 3 testes condicionados a fixtures. As suítes de banco sintético foram executadas separadamente. O caso com arquivos reais ficou fora do ensaio. |
| Gestão em PostgreSQL/PostGIS sintético | 15 aprovados, incluindo a validação por nova conexão e as proteções de escrita SQL direta. |
| Regressão de persistência PCDF v1/v2 em cluster separado | 10 aprovados. |
| Playwright com PostgreSQL persistente | Aprovado a 1440 e 390 px. Confirmação, cancelamento, atualização da lista, comprovante e perfis. |
| Apresentação complementar | Edge aprovado a 320, 390, 768, 1024 e 1440 px com leituras controladas. O servidor recusou escrita fora do ambiente sintético. |
| Checagens estáticas | TypeScript, ESLint, OpenAPI, contratos, rotas e `git diff --check` aprovados. |
| Build de produção | `pnpm build` aprovado com Next.js 16.4.6 e Turbopack. |

A homologação integrada é executada com `python -B database/local/pcdf-sandbox/qualify-management.py --browser`.

## Restrições para uso operacional

Qualquer ativação operacional exige aprovação da migration e das permissões, verificação de backup e recuperação adequados, autorização explícita para o destino atestado e autorização para o UUID específico. Backups, arquivos WAL e réplicas anteriores podem conter os dados. Esta homologação usa somente dados sintéticos e preserva os XML/CSV no disco.
