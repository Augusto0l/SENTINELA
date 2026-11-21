# Primeiro piloto PCDF em staging — janeiro de 2021

**PREPARAÇÃO TÉCNICA CONCLUÍDA — AGUARDANDO AUTORIZAÇÕES.**

A ativação do piloto depende de três decisões institucionais. O responsável pelos dados aprova o manifesto por canal independente, a área de segurança autoriza a identidade de operação e a autoridade competente libera a carga de janeiro. O destino é `127.0.0.1:55481/sentinela_pcdf_piloto`, PostgreSQL 17.11 e PostGIS 3.6.2. A instância tem diretório, credenciais, listener e backups próprios.

| Metadado | Valor do manifesto original |
| --- | --- |
| Competência | Janeiro de 2021 |
| Arquivo | `pcdf_naturezas_2021-01.csv` |
| Associações | 6.393 |
| Tamanho | 2.948.416 bytes |
| Layout | PCDF v1.0, 34 campos, incluindo 18 originais, 10 derivados e seis técnicos |
| SHA-256 do CSV | `e202df3622fbd5f0b4ae53e7a8f435bce9ad58ff30a43a3c248ce2d369fd3770` |

O custodiante deve fornecer o SHA-256 do manifesto original pelo canal de aprovação. A confirmação dos bytes do CSV e do XML pertence à execução autorizada. [Contrato v1.0](../contratos/importacao-pcdf-v1.0.md) · [Histórico do receptor](preparacao-receptor-pcdf-real.md)

## Executor e privilégios

| Identidade | Acesso |
| --- | --- |
| `pcdf_pilot_executor` | Identidade institucional reservada. Permanece `NOLOGIN` e sem senha até registro da autorização. Quando habilitada, autentica por SCRAM em loopback somente neste banco e herda `pcdf_pilot_service` com `INHERIT TRUE, SET FALSE, ADMIN FALSE`. |
| `pcdf_pilot_service` | Papel `NOLOGIN`. Tem `CONNECT` no destino, `USAGE` no schema `sentinela_pcdf_pilot` e `EXECUTE` nas três funções expostas pelo serviço. |
| `pcdf_pilot_writer` | Proprietário `NOLOGIN` e sem membros das três funções `SECURITY DEFINER`, com `search_path = pg_catalog, pg_temp` e referências internas qualificadas. Tem leitura e inserção nas tabelas de origem, lote, execução, staging e auditoria conforme RLS, inserção de pendências e leitura de colunas da identidade autorizada. |
| `pcdf_pilot_qualification` | Login de ensaio, efêmero e com validade. Usa a mesma herança de permissões e as mesmas funções. A autorização sintética, a competência, a fonte e o serviço de auditoria têm valores próprios. O teste exige estado anterior ao registro da âncora institucional e é encerrado com a remoção do papel, do ator e do registro sintético. |

O instalador é aplicado por administrador sobre a baseline atestada. Ele exige o banco, endereço, porta e inventário de bancos esperados. A qualificação do destino confere o UUID e identificador de sistema, as configurações fixadas no manifesto local, o PID, o binário, o diretório, a disponibilidade da porta e a ausência de tablespaces externos. O controlador usa a credencial administrativa protegida com DPAPI e a ACL privada do diretório local. A conexão que recebe e reconcilia é autenticada como o executor restrito.

`record_attempt(document, request)` registra o operador, a identidade autenticada, a autorização, os hashes e o UUID de correlação. `receive(document, request)` exige essa tentativa e valida a autorização vigente no banco, o login, a competência e os hashes do manifesto, do CSV, do XML e do JSONB exato preparado pelo receptor. A gravação afeta somente origem, lote, execução, staging, pendências e auditoria. `reconcile(document, request)` exige o recibo auditado e devolve contagens e divergências do lote autorizado. A rotina comum de staging é `SECURITY INVOKER`, inacessível ao login e chamada internamente como `pcdf_pilot_writer`.

A RLS permanece habilitada e forçada nas 19 tabelas do núcleo. As políticas vinculam os registros ao serviço de origem, permitem pendências sem vínculo de consolidação e restringem a auditoria ao serviço correspondente. As 34 FKs do núcleo permanecem validadas, além da FK do novo registro de autorização para o ator cadastrado. O executor tem acesso recusado a tabelas, criação de objetos, schemas e tabelas temporárias, alteração de RLS, exclusões, truncamento, consolidação, catálogo de autorizações, funções internas, contas administrativas e outros bancos. O piloto tem escopo exclusivo de staging. Dashboard, mapas e promoção de ocorrências ficam fora da autorização.

## Provisão, verificação e backup

No worktree, use Python 3.12, Node 22 e PostgreSQL 17.11. `pilot_environment.py --provision` cria a baseline somente em diretório novo. Use o manifesto privado do cluster de origem da porta 55481 nos comandos abaixo. O verificador do executor atesta a baseline, o schema instalado e as permissões antes de abrir o fluxo de autorização. Cada comando inicia apenas sua instância configurada e confirma seu encerramento.

```powershell
python -B database/local/pcdf-sandbox/pilot_runtime.py --cluster <manifesto-local> --provision
python -B database/local/pcdf-sandbox/pilot_runtime.py --cluster <manifesto-local>
python -B database/local/pcdf-sandbox/pilot_preflight.py --cluster <manifesto-local>
python -B database/local/pcdf-sandbox/pilot_qualify.py --cluster <manifesto-local>
python -B database/local/pcdf-sandbox/pilot_recovery.py --dedicated-backup <manifesto-local>
```

A qualificação usa exclusivamente fixtures geradas em memória, login SCRAM temporário e transações revertidas. O teste entre duas conexões observa espera pelo lock transacional e demonstra a retentativa após a reversão da primeira. O teste de idempotência na mesma transação compara o recibo repetido e confirma o reaproveitamento do lote e da execução. O teste no laboratório 55432 cobre o reenvio concorrente com commit. A assinatura Ed25519 de ensaio é validada em escopo sintético, recusado pelo verificador institucional.

O backup usa `pg_dump -Fc` com origem atestada e recibo privado de tamanho e SHA-256. A restauração usa `pg_restore --exit-on-error --single-transaction` em um cluster novo com identidade e diretório próprios na porta 55483. Antes de restaurar o schema, o procedimento recria os papéis sem copiar senhas, com a identidade operacional desativada, e reaplica as regras de conexão. A verificação compara ACLs, herança, privilégios efetivos, funções, gatilhos, índices, constraints, RLS e conteúdo ordenado das 22 tabelas. Um login sintético temporário repete as recusas no destino restaurado. O objeto de autorização recuperado conserva o UUID original, e as funções permanecem bloqueadas no endpoint de restauração. Qualquer uso após recuperação requer reatestação do destino e autorização vinculada à sua identidade efetiva.

Preserve o dump, o recibo e os logs em diretório privado fora do Git. Em falha de início, encerramento ou recuperação, use os eventos de atestação, PID e identificação do sistema para confirmar o estado antes de iniciar novamente. Preserve a origem e os backups existentes. Execute a restauração de verificação somente no cluster isolado. [Controlador](../../database/local/sandbox/control.py) · [Restauração](../../database/local/pcdf-sandbox/pilot_recovery.py)

## Checklist de autorização

| Decisão e responsável | Evidência a fornecer | Resultado no destino atestado |
| --- | --- | --- |
| Aprovar o manifesto. Custodiante e aprovador independente | JSON assinado `pcdf-2021-01-staging` com SHA-256 dos bytes do manifesto original e referência formal ao parecer. Entregar a chave pública PEM institucional e seu SHA-256 ao DBA por canal independente da entrega de dados. | `PENDENTE`. Âncora institucional ausente e assinatura independente indisponível para validação. |
| Autorizar a identidade. Segurança e DBA | JSON assinado `pcdf-2021-01-identidade`, com objeto, identidade e janela específicos, nome do responsável, UUID do cadastro ativo `Operador` e login `pcdf_pilot_executor`. O DBA registra a âncora e entrega a credencial SCRAM pelo cofre institucional. | `PENDENTE`. Decisão nominativa indisponível para validação e executor `NOLOGIN`. |
| Autorizar a execução. Autoridade do piloto | JSON assinado `pcdf-2021-01-execucao-staging` com o CSV exato de janeiro, os hashes indicados e a vinculação às duas decisões anteriores. Permite validação, recepção, auditoria e reconciliação em staging. | `PENDENTE`. Autorização de carga ausente do registro do destino. |

Vincule as três decisões ao cluster `bd54f847-4c26-487a-b74d-5f626570ce14` em `127.0.0.1:55481/sentinela_pcdf_piloto`. Cada JSON contém `escopo`, `destino` (UUID), `aprovado_em` e `expira_em` (ISO 8601 com fuso), `referencia`, `aprovador`, `versao_layout` (`1.0`) e `manifesto_sha256`. Os dois JSONs de identidade e carga incluem `operador`, `ator_id` (UUID), `login` (`pcdf_pilot_executor`), `banco` (`sentinela_pcdf_piloto`), `porta` (55481) e `competencia` (`2021-01`). O operador deve ser distinto dos aprovadores do manifesto e da identidade.

O JSON da carga inclui `aprovacao_sha256` e `identidade_sha256` dos bytes dos respectivos JSONs, `autorizacao_identidade` igual à `referencia` da decisão nominativa, `arquivo` igual a `pcdf_naturezas_2021-01.csv`, `csv_sha256` e `consolidacao` igual a `false`. Cada assinatura Ed25519 separada tem 64 bytes brutos e cobre os bytes exatos do seu JSON. A instituição mantém as chaves privadas. O DBA guarda os três documentos, os três arquivos de assinatura, a evidência de origem da âncora e o resultado do preflight no registro privado de mudança. O banco conserva os vínculos com o manifesto e com a carga, cujo hash assinado vincula também a decisão nominativa.

## Execução futura e reconciliação

1. O DBA confere as evidências de autorização e registra a âncora obtida por canal independente com `pilot_runtime.py --cluster <manifesto-local> --enroll-key-sha256 <sha256-institucional>`. Guarde os três artefatos da entrega em área privada imutável referenciada pelos hashes. Os logs e recibos devem registrar metadados de controle e contagens.
2. Execute `pilot_preflight.py` com `--cluster`, `--manifesto`, `--aprovacao`, `--assinatura`, `--chave`, `--identidade`, `--assinatura-identidade`, `--autorizacao`, `--assinatura-autorizacao`, `--csv` e `--xml`. A chave confere com a âncora instalada pelo DBA. A opção `--chave-sha256` permite uma conferência adicional. O programa abre CSV e XML após conferir as três assinaturas, os vínculos entre as decisões, o escopo, a interseção das vigências e o manifesto. Valida hash, tamanho, competência, cabeçalho, 34 campos, 6.393 associações, IDs, aba e posição lógica.
3. O DBA usa os mesmos argumentos com `--registrar` e fornece ao processo a credencial SCRAM aleatória ASCII emitida pelo cofre, por meio da variável `SENTINELA_PCDF_EXECUTOR_PASSWORD`. O registro vincula as decisões aos bytes preparados e à identidade ativa no cadastro. A ativação tem prazo de validade e é revertida se a conexão de conferência falhar. As sessões de serviço usam configuração de log restrita para evitar que SQL de entrega seja copiado em diagnósticos.
4. Com `APROVADO`, execute o preflight com os mesmos argumentos, `--executar` e `--requisicao <uuid>`. A função de tentativa é registrada em uma transação separada. A recepção e a reconciliação usam a conexão SCRAM restrita e a mesma transação de staging. Uma divergência interrompe o commit. Guarde o recibo privado com os IDs de lote, execução e correlação, hashes e contagens.
5. Aceite apenas 6.393 IDs técnicos distintos, 34 campos preservados, os 18 originais literais, vínculos de proveniência conferidos, zero perda, zero divergência, zero consolidação e zero publicação. Confira pendências e evidências de auditoria com o custodiante. Use `pilot_runtime.py --cluster <manifesto-local> --deactivate` ao final da janela para revogar o login e retirar a autorização ativa, preservando a trilha de auditoria.
6. Em falha antes do commit, confirme a reversão pelo estado durável. Após queda sem recibo, retente com o mesmo UUID e a mesma entrega enquanto a aprovação estiver vigente. O reenvio retorna o recibo anterior ou reutiliza o mesmo lote e execução. Mudanças de hash, competência, autorização ou contexto exigem nova avaliação.

O preflight responde `APROVADO` com código 0 quando todos os requisitos aplicáveis são comprovados, `PENDENTE` com código 2 quando falta uma condição de operação, e `REPROVADO` com código 1 em caso de inconsistência ou falha de segurança. Um resultado aprovado da qualificação sintética tem validade exclusivamente para a demonstração técnica.

A reatestação encontrou as tabelas do piloto vazias, RLS e integridade aprovadas, âncora ausente e o executor inativo. O preflight retornou `PENDENTE` para as três decisões e bloqueou `--executar` antes de ler os caminhos da entrega. Janeiro continua aguardando a primeira recepção e seu aceite institucional. [Sequência histórica e integração funcional](preparacao-receptor-pcdf-real.md)

## Evidências da qualificação de 21/11/2026

- O recibo `pilot-executor-84e4a70f-996a-4a21-ac08-2944a2c28ccb.json` registra 20 verificações aprovadas na porta 55481, no cluster `bd54f847-4c26-487a-b74d-5f626570ce14`, identificador de sistema `7710716912058263580`. O login temporário autenticou por SCRAM. Houve 22 recusas SQL e quatro recusas em conexões para outros bancos. As 6.393 linhas sintéticas e seus 6.393 IDs distintos foram reconciliados com os 34 campos e os 18 originais, sem divergências. Origem, staging, auditoria e ocorrências voltaram às contagens iniciais de zero. O cluster foi encerrado.
- O recibo `pcdf-eda41c5a45c84fd4.json` registra a restauração em 55483 no cluster `78fa8e70-cb9c-4300-b441-b85050d4e11c`. O dump tem 174.332 bytes e SHA-256 `d0a9c9e1b79a49db3624a998171126e62fae51d68cef2bb71e674bf401fc0740`. Houve correspondência de schema, dados e grants nas 22 tabelas, 22 recusas SQL e três recusas de acesso a outros bancos no destino restaurado.
- O laboratório 55432 repetiu nove verificações, incluindo reenvio concorrente com commit e restauração em 55482. O recibo `receiver-result.json` em `rls-sandbox-a87a8730-c27f-462a-8b80-78ee65c96dd2` registra 6.393 linhas reconciliadas e zero consolidações.
- O preflight devolveu `PENDENTE` para a execução institucional no destino atestado sem aprovação, inclusive quando recebeu caminhos de CSV e XML indisponíveis. Um manifesto local de destino inexistente resultou em `REPROVADO`.
- A regressão aprovou 424 testes automatizados, com 253 no Node e 171 em Python. Também passaram verificação da baseline, TypeScript, ESLint, contratos/OpenAPI, rotas estáticas e build de produção.

## Evidências anteriores preservadas

- Laboratório 55432, `receiver-result.json` em `rls-sandbox-052a043b-987a-43f9-b364-5d2ec7fd2190` e `rls-sandbox-e303b629-7554-41f0-b726-d802bbae25f4`. Qualificação do receptor, assinatura sintética, 6.393 IDs distintos e zero divergências ou promoções.
- Laboratório 55432, `receiver-result.json` e `pcdf-ac52163bff4b0793.dump` em `rls-sandbox-0a33e111-06ff-4572-8e5b-99425dc41fae`. Login sintético efetivo, 15 recusas na origem e na restauração 55482, 6.399 linhas de staging e zero consolidações.
- Destino 55481, `pcdf-2dc7f67517078523.dump` e recibo homônimo. A restauração anterior em 55483 comparou as 19 tabelas, antes da instalação do executor.
