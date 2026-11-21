# Procedimento do primeiro piloto real PCDF — janeiro de 2021

**PREPARAÇÃO DO PILOTO COM PENDÊNCIAS**

**APROVAÇÃO INDEPENDENTE DO MANIFESTO PENDENTE.**

O piloto deve provar recepção íntegra de uma competência em staging PostgreSQL/PostGIS isolado, com auditoria e recuperação. A execução exige autorização específica. Cada competência posterior depende de sua própria conferência e liberação.

| Metadado | Valor registrado no manifesto integral |
| --- | --- |
| Competência | Janeiro de 2021 |
| Arquivo | `pcdf_naturezas_2021-01.csv` |
| Associações | 6.393 |
| Tamanho | 2.948.416 bytes |
| Layout | PCDF v1.0, 34 campos, dos quais 18 originais, 10 derivados e seis técnicos |
| SHA-256 do CSV | `e202df3622fbd5f0b4ae53e7a8f435bce9ad58ff30a43a3c248ce2d369fd3770` |

A referência do relatório de encerramento do produtor coincidiu com os bytes do manifesto na conferência em leitura. Esse resultado documenta a integridade do artefato consultado. A autoridade institucional ainda precisa aprovar a combinação de manifesto, competência e ambiente para execução. A leitura do XML e do CSV como parte da preparação real permanece sujeita a essa autorização. [Contrato v1.0](../contratos/importacao-pcdf-v1.0.md) · [Preparação do receptor](preparacao-receptor-pcdf-real.md)

## Destino e provisão

- O sandbox na porta 55432 é recriado pelo controlador para qualificar com fixtures e é encerrado depois do ensaio. Reproduzir a qualificação de referência com `python -B database/local/pcdf-sandbox/qualify-manifest.py --isolated-only`, em loopback e com ACL privada. O SQL `receiver-staging-fixture.sql` é específico desse laboratório e depende do papel e da versão de tratamento da fixture. [Controlador](../../database/local/sandbox/control.py)
- A rodada de finalização confirmou as sete verificações no sandbox, com 6.399 linhas sintéticas em staging, zero promoções, 19 tabelas com RLS forçada e 34 FKs no núcleo. O recibo local é `receiver-result.json` no sandbox `rls-sandbox-052a043b-987a-43f9-b364-5d2ec7fd2190`.
- Na preparação da infraestrutura, um novo ensaio verificou uma aprovação Ed25519 de escopo sintético, distinta da aprovação de janeiro. Comparou no PostgreSQL as 6.393 linhas de volume com a fixture, campo a campo, incluindo os 18 originais em suas colunas próprias. Foram 6.393 IDs distintos, zero divergências e zero consolidações. O recibo desta rodada é `receiver-result.json` no sandbox `rls-sandbox-e303b629-7554-41f0-b726-d802bbae25f4`.
- A homologação persistente em 55473 permanece como referência sintética preexistente. O destino preparado para o piloto é `127.0.0.1:55481/sentinela_pcdf_piloto`, PostgreSQL 17.11/PostGIS 3.6.2, com diretório persistente próprio em `.cache/pcdf-pilot-dedicated` no worktree. O provisionamento instalou a baseline versionada, confirmou 19 tabelas com RLS forçada e 34 FKs e encerrou o cluster. Origem, staging, auditoria de carga e ocorrências ficaram vazios.
- O provisionamento bloqueia a reutilização automática de diretório existente. O controlador cria ACL privada, exige SCRAM, atesta a identidade do cluster pelo UUID, identificador de sistema, diretório, porta e PID e registra a configuração atestada. A credencial administrativa local está protegida com DPAPI para a conta Windows que provisionou o cluster. O recibo `pilot-environment.json` e o manifesto local ficam no diretório privado, fora do Git.
- O responsável PostgreSQL deve reservar instância e armazenamento exclusivos, provisionar com a baseline versionada aplicável ao destino, validar PostgreSQL/PostGIS, FKs, índices, gatilhos, ledger e RLS habilitada e forçada. Atestar identidade do banco e do cluster, endpoint, diretório privado e isolamento da rede, dos backups e das credenciais. Conferir as tabelas de extração, lote, execução, origem, staging, pendências e auditoria antes de habilitar a operação. Validar restauração do backup em ambiente separado. [Migrations](../../database/migrations) · [Modelagem](../banco/modelagem-postgresql-postgis-v1.0.md)
- O preflight administrativo atesta o ambiente e pode verificar a aprovação assinada, as evidências do manifesto e os bytes da entrega. A etapa de escrita real permanece bloqueada. Falta qualificar o executor autorizado no destino dedicado e definir sua ligação com a identidade efetiva do serviço. Reaproveitar a transação por competência e os vínculos da baseline ensaiados no sandbox. Papéis e operações das fixtures permanecem no ambiente sintético.
- O DBA e o responsável por segurança devem atribuir uma identidade técnica exclusiva e autenticação pelo mecanismo institucional de segredos, com entrega privada, rotação e revogação. O serviço deve poder executar apenas a recepção autorizada, leitura necessária à idempotência e reconciliação e gravação limitada a origem, staging, pendências e auditoria. Confirmar ausência de `SUPERUSER`, `BYPASSRLS`, privilégios de DDL, consolidação, publicação e acesso por contas demonstrativas. Testar concessões e recusas com a identidade efetiva antes de disponibilizar os dados reais.

### Comandos disponíveis

No worktree, com Python 3.12, Node 22 e PostgreSQL 17.11. A provisão é para um diretório novo. A verificação de ambiente inicia apenas a instância própria, verifica identidade e catálogo e a encerra. A inspeção pressupõe staging vazio, na fase anterior à ingestão.

```powershell
python -B database/local/pcdf-sandbox/pilot_environment.py --provision
python -B database/local/pcdf-sandbox/pilot_environment.py --verify <manifesto-local-do-cluster>
python -B database/local/pcdf-sandbox/pilot_preflight.py --cluster <manifesto-local-do-cluster>
```

A conta `pcdf_pilot_service` foi provida em estado `NOLOGIN`, sem membros, criação de schema, escrita no núcleo ou bypass de RLS. Sua habilitação e os privilégios efetivos de escrita dependem de autorização e da qualificação do executor do piloto. Para falha de inicialização ou encerramento, preservar diretório, manifesto local e evidências. O controlador atesta PID, marcador, diretório e identificador do sistema antes de parar. Em estado ambíguo, o DBA deve verificar a instância e preservar os arquivos antes de qualquer recuperação. O cluster dedicado ainda requer backup institucional e prova de restauração antes da carga.

## Aprovação e pré-importação

1. O custodiante do SENTINELA-DADOS identifica a versão da entrega e transmite por canal institucional autenticado, separado do canal de transferência, a referência SHA-256 do manifesto original. A autoridade responsável pelo uso dos dados aprova formalmente competência, origem, versão do manifesto, ambiente atestado, conta de serviço, janela e escopo de staging. Os nomes dos titulares responsáveis ainda precisam ser designados pela equipe.
2. O responsável institucional mantém a chave Ed25519 privada no canal de aprovação e fornece a chave pública PEM e seu SHA-256 por fonte confiável separada do pacote de dados. O registro JSON assinado contém `escopo` igual a `pcdf-2021-01-staging`, `destino` igual ao UUID atestado do cluster, `aprovado_em` e `expira_em` em ISO 8601 com fuso, `referencia`, `aprovador`, `versao_layout` igual a `1.0` e `manifesto_sha256`. A assinatura Ed25519 separada tem 64 bytes brutos e cobre exatamente os bytes do JSON. O operador fornece o hash da chave fixado pela instituição via `--chave-sha256`. O hash calculado do manifesto recebido serve como comparação de integridade. A igualdade com o relatório técnico, isoladamente, evidencia integridade documental.
3. Confirmar destino, papel efetivo, RLS, backup recuperável e auditoria. Obter pelo canal de transferência autorizado apenas o CSV mensal selecionado, o manifesto e o XML correspondente. Manter os originais em armazenamento privado imutável referenciado por hash, com controles de retenção e acesso. Limitar logs a metadados permitidos, contagens e diagnósticos sem dados de linha.
4. Validar o manifesto original contra o hash aprovado e exigir evidência de reconciliação e preflight conforme o estado. Conferir SHA-256 e tamanho do XML por fluxo e SHA-256 e tamanho do CSV original. Validar cabeçalho, ordem dos 34 campos, competência, 6.393 associações, IDs técnicos distintos, aba e posição lógica. Uma divergência bloqueia a operação antes de gravar.

Com as entradas autorizadas em área privada, fornecer `--manifesto`, `--aprovacao`, `--assinatura`, `--chave`, `--chave-sha256`, `--cluster` e, para conferir a entrega, `--csv` e `--xml`. O preflight abre CSV e XML somente após atestar o destino, verificar a assinatura, o vínculo e a vigência e aprovar o manifesto recebido. O JSON de saída indica `PENDENTE` (código 2) quando faltam entradas ou ativação, `REPROVADO` (código 1) em caso de divergência e `APROVADO` (código 0) somente quando todos os requisitos estiverem aprovados. Nesta versão a execução real continua pendente mesmo quando os controles de leitura passam. As chaves geradas pelo ensaio têm escopo exclusivo de fixture.

## Recepção e reconciliação

1. Registrar tentativa auditável com serviço, operador autorizado, referência da aprovação, competência, hashes, data e identificador de correlação. Registrar extração, lote, execução e suas referências aos originais. Gravar as associações da competência em uma transação até staging, com diagnóstico das pendências e vínculo de proveniência por linha.
2. Recuperar 6.393 snapshots e 6.393 IDs técnicos distintos. Comparar os 34 valores transportados e os 18 originais em suas colunas próprias, incluindo vazio, zeros à esquerda, Unicode e posições. Conferir vínculo reverso ao arquivo original e à posição lógica do XML. Verificar que as naturezas múltiplas e os registros incompletos foram preservados e que o estado de pendência corresponde às regras.
3. Emitir relatório privado com contagens esperadas e obtidas, hashes verificados, resultados de comparação, pendências, eventos de auditoria e resultado da transação. Aceitar somente com zero divergência, zero perda, zero consolidação e zero publicação para Dashboard ou mapas. A aprovação pós-piloto compete ao responsável pelos dados e à equipe técnica de homologação.

## Idempotência e recuperação

| Situação | Tratamento e evidência |
| --- | --- |
| Mesmo CSV ou lote já recebido | Conferir hash, competência, versão e contexto da extração. Devolver os IDs do lote e da execução existentes e auditar o reenvio. |
| Reenvio concorrente | Serializar sob lock transacional e validar unicidade. Verificar um lote e uma execução de sucesso, com resultado correlacionável para cada tentativa. |
| Manifesto, hash ou estrutura inválida | Bloquear o lote, registrar diagnóstico seguro e encaminhar a divergência ao custodiante. Uma linha incompleta mas estruturalmente válida permanece no fluxo de staging. |
| Falha de banco ou interrupção antes do commit | Garantir rollback da competência. Manter o evento de tentativa e registrar o SQLSTATE ou o desfecho conhecido. Confirmar se houve commit antes de tentar novamente. |
| Queda após commit, sem recibo do cliente | Consultar chave do lote e executar a regra de replay quando o contexto coincidir. |
| Nova tentativa após rollback | Confirmar ausência de staging parcial, confirmar a autorização vigente e repetir a competência na íntegra. Mudanças de bytes, versão ou contexto exigem tratamento explícito da divergência. |

Os procedimentos de recuperação preservam os artefatos, eventos e registros existentes. A estratégia normal é rollback, consulta do estado durável e retentativa idempotente.

## Bloqueios e continuidade

A execução depende do destino dedicado atestado, operação administrativa real qualificada e habilitada por autorização, identidade técnica provisionada e testada, aprovação independente do manifesto, canal privado, backup recuperável, auditoria e autorização formal para janeiro. Qualquer falha nesses requisitos ou divergência de pré-validação bloqueia a carga.

O teste do preflight retornou `PENDENTE` para o cluster dedicado atestado sem aprovação institucional e `REPROVADO` para um manifesto local de destino inexistente. O mecanismo de assinatura está preparado. O custódio da chave, a autoridade que assina e o DBA que libera a identidade efetiva devem ser designados antes da carga.

Fevereiro de 2021 é a próxima competência candidata. Considerá-la após o aceite documentado de janeiro e repetir integralmente os controles. Uma autorização futura para consolidar depende de homologação separada de identidade policial, classificações e critérios territoriais.
