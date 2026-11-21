# Preparação do receptor PCDF v1.0

21/11/2026 · SENTINELA · Qualificação exclusivamente sintética

## Objetivo e arquitetura

O receptor preserva o CSV candidato de 34 campos e seus vínculos com a extração XML. O teste usa o parser de transporte existente, uma camada de verificação do manifesto e uma operação de staging em banco descartável. O desenho usa as tabelas existentes em `sentinela` e mantém a consolidação fora dessa operação. A auditoria de compatibilidade que antecedeu esta implementação está em `docs/desenvolvimento/auditoria-integracao-pcdf-real.md` no checkout original. [Contrato v1.0](../contratos/importacao-pcdf-v1.0.md)

| Fluxo | Entrada | Destino e autorização |
| --- | --- | --- |
| Demonstração | Tela e worker de importação demonstrativa | Resultado local da sessão, com os sete destinos demonstrativos. |
| PCDF sintético existente | `/importar` e `/api/v1/importacoes/pcdf` com modo local habilitado | Parser de 34 campos, identidade de fixture e guardas SQL existentes. Administrador e Operador enviam no escopo previsto. Analista consulta a Central. |
| Qualificação do formato de origem | Fixtures geradas localmente, em memória e na pasta privada de evidências | Mesmo parser de transporte, manifesto no formato de origem, SHA do XML e IDs no algoritmo v1.0. Função fixture isolada, executada por papel próprio sem login e sem bypass de RLS. |
| Futuro piloto real | Operação administrativa dedicada, com lote previamente autorizado | A ativação depende de destino, papel de serviço, canal privado e manifesto aprovados. O verificador está disponível como módulo interno. Sua chamada para dados reais não está exposta por rota, comando público ou sinalizador da aplicação. |

O módulo `manifest_receiver.py` recebe bytes do manifesto e do CSV, a competência, o hash SHA-256 aprovado por canal independente e um iterador dos bytes XML. Ele não abre arquivos nem resolve caminhos do manifesto. O SQL de ensaio exige conexão local ao cluster descartável na porta 55432, marcador de sandbox, papel específico e a versão de tratamento própria da fixture. A função recebe a entrega preparada pelo verificador do lado do serviço. As contas locais da aplicação não podem executar essa função. Nenhuma alteração foi feita na API ou na UI existentes. [Verificador](../../database/local/pcdf-sandbox/manifest_receiver.py) · [Revisão SQL exclusiva para ensaio](../../database/local/pcdf-sandbox/receiver-staging-fixture.sql)

## Proveniência, integridade e staging

1. Comparar o hash do manifesto recebido com o aprovado fora do canal de entrega. Exigir UTF-8, chaves JSON únicas, layout e algoritmo esperados, um estado aceito, contagens e distribuição coerentes. Nomes mensais são restritos ao padrão de competência e os dois artefatos auxiliares têm caminhos fixos aceitos como metadados. O nome declarado do XML não é usado para ler um arquivo.
2. Conferir hash, tamanho e contagem do CSV da competência selecionada, mais cabeçalho e largura por registro. Uma data civil inequivocamente de outro mês impede registrar aquele arquivo nessa partição. Ausência ou invalidez de campos da associação permanece em staging com diagnóstico.
3. Recalcular SHA-256 em JSON compacto UTF-8 de `["pcdf-linha-v1", sha256_xml_minúsculo, "NATUREZAS", índice_inteiro]`. Verificar a aba, a versão e a posição lógica entregue. Comparar a chave candidata com a tupla literal de origem, em paralelo ao snapshot. A chave ainda depende de homologação. Vínculo por hash comprova concordância com os bytes e com o manifesto aprovados. A correspondência do conteúdo de cada posição com o XML continua dependendo da reconciliação do produtor e da conferência autorizada antes do piloto.
4. Conferir tamanho e hash dos bytes originais do XML por leitura incremental, com interrupção se a contagem ultrapassar a declarada. A versão do manifesto e as referências por hash são registradas. Em homologação, os artefatos sintéticos ficam na área privada do cluster. A futura operação deve arquivar os bytes antes de confirmar o staging, manter referência resolvível por hash e comprovar ACL e retenção. O digest fixado é um controle de integridade a partir de uma aprovação confiável. Uma assinatura institucional futura poderá agregar autenticação criptográfica do emissor.

### Estados aceitos no manifesto v1.0

O processamento integral do SENTINELA-DADOS produz `reconciliado` após conferir o conteúdo dos CSVs com o XML. O controlador gera o manifesto de publicação com `validado` após aprovar o preflight, comparar a estrutura do XML observada nas duas etapas e registrar a reconferência do hash da fonte. O manifesto `validado` conserva a evidência de reconciliação integral. A incompatibilidade vinha da comparação do receptor apenas com o estado da etapa intermediária.

O receptor aceita exclusivamente `reconciliado` e `validado` no layout 1.0. Ambos exigem reconciliação integral, zero erros de transformação e consistência entre distribuição mensal, associações, IDs técnicos, originais, quarentena e linhas físicas. `validado` exige ainda preflight `aprovado`, `execucao.hash_fonte_reconferido` igual a `true` e coincidência entre o preflight e a entrega para SHA-256 e tamanho do XML, associações lidas e linhas estruturais vazias. As três verificações independentes de bytes, para manifesto, CSV e XML, e a validação da proveniência de cada linha continuam obrigatórias para preparar a entrega. A aceitação do estado do produtor não concede autorização de carga.

`extracoes_origem` identifica o XML e o manifesto, `lotes_importacao` identifica os bytes mensais e `execucoes_importacao` registra os estados e os contadores. As FKs compostas vinculam a extração, o lote, a execução, a origem e o ordinal CSV. `linhas_origem` guarda os 18 textos. `linhas_staging` guarda os 34 textos, os derivados efetivos e os diagnósticos. `pendencias_revisao` recebe pendências de regra versionada por linha. `eventos_auditoria` registra a tentativa, a execução ou a falha sem copiar conteúdo bruto para o evento. `ocorrencias`, `ocorrencia_naturezas` e `historico_correcoes` permanecem sob as proteções da baseline. O ensaio de manifesto não cria registros nessas três tabelas.

### Matriz de preservação

**S** = `linhas_staging.campos_csv` com a chave da primeira coluna, sempre como string. **O** = `linhas_origem`, para o qual os 18 valores originais também seguem como texto literal. **E** = `linhas_staging.derivados_efetivos`, quando há avaliação separada. Os nomes de tabela se referem ao schema `sentinela`. O CSV conserva seus bytes fora do JSONB. A estrutura de célula omitida ou vazia pertence ao XML arquivado.

| Coluna CSV | Classe | Destino e tratamento |
| --- | --- | --- |
| `ano_registro` | Original | S e O.`ano_registro`. Texto usado na chave candidata. |
| `unidade_registro` | Original | S e O.`unidade_registro`. Espaços e Unicode preservados. |
| `numero_registro` | Original | S e O.`numero_registro`. Zeros, sinais e espaços preservados. |
| `ocorrencia_chave` | Derivado | S e comparação da tupla com `candidate` em E. Divergência vira pendência. |
| `ano_fato` | Original | S e O.`ano_fato`. Comparado à data civil sem sobrescrever. |
| `data_inicio_fato_original` | Original | S e O.`data_inicio_fato_original`. Preservado inclusive quando inválido. |
| `data` | Derivado | S e E quando coerente com a origem. |
| `horario` | Derivado | S e E quando comprovado com segundos no original. |
| `natureza_original` | Original | S e O.`natureza_original`. |
| `natureza_padronizada_pcdf` | Original | S e O.`natureza_padronizada_pcdf`. Prefixo preservado. |
| `crime_tentado` | Original | S e O.`crime_tentado`. Triestado efetivo separado em E. |
| `natureza_sentinela_codigo` | Derivado | S. Aplicação do código depende de homologação. |
| `classificacao_status` | Derivado | S. E permanece pendente até regra verificada. |
| `versao_mapeamento` | Técnico | S. Versão efetivamente aplicada dependerá de artefato homologado. |
| `cidade_endereco_original` | Original | S e O.`cidade_endereco_original`. |
| `ra_original` | Original | S e O.`ra_original`. Desconhecido permanece literal. |
| `area_endereco_original` | Original | S e O.`area_endereco_original`. Sem truncamento dentro do limite técnico de célula. |
| `quadra_endereco_original` | Original | S e O.`quadra_endereco_original`. Espaços distintos de vazio. |
| `ra_codigo` | Derivado | S. Vínculo territorial depende de catálogo e vigência. |
| `local` | Derivado | S e comparação auxiliar de conflito. |
| `latitude_geo_original` | Original | S e O.`latitude_geo_original`. |
| `longitude_geo_original` | Original | S e O.`longitude_geo_original`. |
| `latitude_utm_original` | Original | S e O.`latitude_utm_original`. |
| `longitude_utm_original` | Original | S e O.`longitude_utm_original`. |
| `latitude` | Derivado | S. Projeção espacial vazia enquanto o CRS e a regra estiverem pendentes. |
| `longitude` | Derivado | S. Projeção espacial vazia enquanto o CRS e a regra estiverem pendentes. |
| `coordenada_status` | Derivado | S e diagnóstico com o estado de entrada quando admissível. O receptor não ratifica validade geográfica. |
| `flagrante` | Original | S e O.`flagrante`. Triestado efetivo separado em E. |
| `unidade_apuracao` | Original | S e O.`unidade_apuracao`. |
| `fonte` | Técnico | S. A extração da qualificação tem namespace segregado. |
| `linha_origem_id` | Técnico | S e O.`linha_origem_id`. Hash verificado. A FK interna usa O.`id`. |
| `linha_xml` | Técnico | S e O.`linha_xml` como bigint positivo. |
| `aba_origem` | Técnico | S e O.`aba_origem`. |
| `versao_tratamento` | Técnico | S e `lotes_importacao.versao_tratamento`, coerentes com o manifesto. |

String vazia, espaço sem informação e marcador desconhecido são estados distintos em E. Valor inválido e informação pendente geram diagnósticos distintos e continuam recuperáveis em S. Booleanos policiais só são efetivos no vocabulário explícito. A validação lexical de datas e horários não certifica informações policiais. A operação não calcula coordenadas nem atribui classificações criminais.

## Reenvio, concorrência e recuperação

O staging usa uma transação por competência. Sob lock transacional, o mesmo hash mensal da mesma extração, com competência, versão, tamanho e contagem coerentes, devolve o lote e a execução existentes. A tentativa já tem um evento durável por UUID antes da transação de staging. Finalizar ou reconhecer o replay acrescenta um evento correlacionado. Falha conhecida registrada pelo ensaio gera evento com SQLSTATE. Uma interrupção sem confirmação pode deixar só o evento inicial. A retentativa verifica o estado durável e reinicia a competência inteira se não houve commit. Não há checkpoint de sublote. Essa escolha é apropriada aos limites atuais e deve ser reavaliada se o volume ou o tempo de retomada comprovado exigir processamento por blocos.

Repetir o mesmo ID ou a mesma posição dentro do arquivo falha na validação. Colisão de ID ou posição entre entregas falha em constraints de origem e reverte o lote todo. Uma mesma chave policial pode ter várias naturezas ou até conteúdo idêntico com posições diferentes. O ensaio preserva as linhas e registra conflito de contexto dentro do lote ou coincidência candidata com outra entrega. O mesmo XML com novo manifesto e a mesma competência com bytes diferentes exigem revisão de versões. O modelo atual não cadastra dois meses de cabeçalho idêntico como dois lotes da mesma extração, pois o hash é único por extração. O histórico documentado contém 68 meses com dados.

## Segurança e limites operacionais

O ensaio usa PostgreSQL 17.11 e PostGIS 3.6.2 no sandbox identificado, com RLS forçada em 19 tabelas e 34 FKs. O papel de teste é `NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT`, com grants limitados ao escopo de staging e auditoria. O trigger de revisão requer que o papel possa preparar uma consulta às três colunas `id`, `ativo` e `perfil` de `usuarios`. Esse grant é por coluna e a RLS mantém as linhas de usuários invisíveis para o papel. A revisão SQL de ensaio não é uma migration da aplicação. Foi aplicada apenas à base descartável. Preservar essa separação e reavaliar os grants com o principal autenticado do piloto.

O manifesto tem limite de 1 MiB, o CSV de 16 MiB, cada competência de 10.000 registros e cada célula de 16.384 caracteres. O parser mantém texto Unicode e registro CSV lógico. O XML é conferido por fluxo, limitado pelo tamanho autenticado no manifesto. O CSV e seu JSON de staging são materializados por competência. O ensaio de volume mede o processamento de uma competência representativa, sem inferir capacidade para fila de 68 competências ou carga simultânea em produção.

## Homologação e evidências

No worktree, com Python 3.12, Node 22 e pnpm 10.34.3:

```powershell
python -B database/local/pcdf-sandbox/qualify-manifest.py -v
python -B database/local/pcdf-sandbox/qualify-manifest.py --isolated-only
pnpm test
pnpm validate:contracts
pnpm check:routes
pnpm lint
pnpm build
pnpm typecheck
```

O ensaio PostgreSQL usa o controlador de sandbox existente, exige a porta 55432 livre, atesta cluster e ACL e encerra apenas o PostgreSQL que iniciou. Os artefatos ficam na área privada ignorada pelo Git sob `.cache/pcdf-receiver-qualification`. O leitor da homologação persistente e a entrada funcional sintética têm procedimentos documentados separadamente. [Guia de homologação existente](../../database/local/persistent-homologation/README.md)

Para repetir a verificação HTTP, iniciar `qualify.mjs --serve-functional` com as contas sintéticas já provisionadas, gerar uma fixture com `syntheticPcdfFixture()` e enviá-la pela tela com a competência da fixture. Conferir o recibo 201, o histórico, o replay 200 e as permissões com uma conta de Analista. Para qualificar somente a recepção, encerrar o servidor Next após a conferência e manter a execução recebida em staging.

| Verificação | Resultado |
| --- | --- |
| Testes de manifesto, parser e proveniência | 7 de 7 aprovados. Incluem transporte inválido, contagens e hashes divergentes, cabeçalho vazio de registros, limites, textos literais e separação em relação à fixture legada. |
| PostgreSQL descartável | 7 verificações aprovadas. A recuperação integral comparou os 34 campos e os 18 originais contra o CSV sintético. Erro após staging reverteu a transação, com tentativa e erro auditáveis. Reenvio concorrente resultou em um lote e uma execução. Uma competência de 6.393 registros e 4.148.708 bytes foi aceita. Ao final havia 6.399 linhas em staging e zero promoções. O cluster confirmou estado `STOPPED`. |
| Regressão de aplicação | 253 de 253 testes Node aprovados. Contratos/OpenAPI, rotas estáticas, ESLint, build Next.js de produção e typecheck aprovados. |
| Regressão do sandbox | 132 de 132 testes Python do controlador, RLS e recuperação aprovados. A verificação do parser sintético existente também passou. |
| API e navegador | A tela `/importar` enviou um CSV sintético no Edge headless pelo fluxo funcional existente. A API retornou 201 e a tela mostrou duas linhas em staging, oito pendências e o lote no histórico. O reenvio retornou 200 com os mesmos IDs, e o histórico manteve um lote com duas linhas e zero consolidação. A Central respondeu para o Analista. Foram verificadas as recusas para sessão ausente, Analista tentando enviar, Origin incorreto, cabeçalho inválido e versão de proveniência do novo ensaio na API legada. |

Na revisão de preservação, os 392 testes Node e Python e as sete verificações em um novo PostgreSQL descartável passaram novamente. O recibo SQL mais recente é `receiver-result.json` no sandbox `rls-sandbox-8f97edec-267d-46ef-b709-a53df14c6bbd`. O recibo HTTP da homologação inicial é `.cache/pcdf-receptor-http-b55bf52a-e04a-41fb-8475-a9d155459ee9.json` no checkout original onde o serviço preexistente foi executado. Os logs da revisão estão em `node_modules/.preservacao-*.log` no worktree. Os recibos e logs ficam fora do Git.

Na revisão de compatibilidade de estados, passaram os 10 testes de manifesto e parser, o parser sintético legado e as sete verificações no PostgreSQL descartável. O ensaio usou manifesto `validado` para o teste de preservação e reenvio e `reconciliado` para o teste de volume. O recibo `receiver-result.json` do sandbox `rls-sandbox-f4f76132-58fe-42f2-a796-86d60feebec9` registra 6.399 linhas sintéticas em staging e zero promoções. ESLint, build e typecheck também passaram nessa revisão.

## Preservação e versionamento

A branch `feat/integracao-pcdf-real` parte de `ceub/main` no commit `69a8bde`. A proposta é manter a implementação, a homologação e este documento em um único commit, `feat(pcdf): prepara e homologa receptor de manifesto v1.0`. A inclusão deve usar a lista explícita abaixo. Os arquivos de ensaio são gerados pelo código. As credenciais temporárias, os recibos, os logs e os diretórios do PostgreSQL descartável ficam na área local ignorada. A auditoria de compatibilidade do checkout original e as mudanças do redesign ficam fora deste conjunto.

| Arquivo | Conteúdo |
| --- | --- |
| `database/local/pcdf-sandbox/manifest_receiver.py` | Validação do manifesto, da proveniência e dos campos do lote. |
| `database/local/pcdf-sandbox/receiver-staging-fixture.sql` | Staging transacional, idempotência, auditoria e guardas exclusivas do banco descartável. |
| `database/local/pcdf-sandbox/qualify-manifest.py` | Fixtures geradas, testes do contrato e qualificação em PostgreSQL isolado. |
| `docs/desenvolvimento/preparacao-receptor-pcdf-real.md` | Limites da homologação, evidências e requisitos do piloto. |

### Mudança do worktree

O destino sugerido é `D:\Projetos\SENTINELA-PCDF`, na mesma unidade e fora de `.cache`. Um ensaio em clone local comprovou que `git worktree move` preserva os bytes de arquivos modificados, não rastreados e ignorados. O Windows manteve o alvo absoluto de uma junction apontando para o caminho antigo. O worktree PCDF tem junctions absolutas em `node_modules`. A mudança física e a reconstrução do ambiente são etapas distintas.

1. Encerrar processos do worktree e conferir que o destino continua livre. Guardar o estado do Git e os SHA-256 dos quatro arquivos em local privado fora da origem. Preservar também os recibos e a área de evidências, com suas ACLs.
2. Executar a mudança pelo repositório principal, com `git -C D:/Projetos/SENTINELA worktree move D:/Projetos/SENTINELA/.cache/pcdf-receptor-worktree D:/Projetos/SENTINELA-PCDF`. Conferir `git worktree list`, branch, HEAD, status, SHA-256 e ACLs no destino.
3. Preservar os logs antes de recriar `node_modules` e os caches de build. Reinstalar com a versão fixada do pnpm e `--frozen-lockfile` e repetir as verificações principais no novo caminho. Tratar diretórios antigos de ensaio PostgreSQL e seus manifestos com caminhos absolutos como evidência histórica. Para nova rodada, criar outro sandbox com o controlador.

## Primeiro piloto real em janeiro de 2021

O fluxo real permanece sem ponto de entrada. A próxima implementação deve criar uma operação administrativa dedicada que receba os bytes do canal privado, obtenha o hash aprovado por fonte independente e use um principal de serviço restrito ao staging no destino atestado. A função SQL de fixture continua reservada à homologação sintética.

O manifesto integral do SENTINELA-DADOS registra **6.393 associações** para `pcdf_naturezas_2021-01.csv`, contagem também indicada na distribuição mensal. O tamanho registrado é de **2.948.416 bytes** e o SHA-256 do CSV é `e202df3622fbd5f0b4ae53e7a8f435bce9ad58ff30a43a3c248ce2d369fd3770`. Esses metadados foram consultados no manifesto. A conferência dos bytes do CSV fica para a execução autorizada.

1. Obter autorização específica para o piloto em staging PostgreSQL isolado e dedicado. Atestar o destino e a RLS e aprovar conta de serviço restrita à operação de staging, sem bypass. Definir acesso aos brutos e diagnósticos, retenção, trilha de auditoria e backup verificável. Obter, por canal independente, a aprovação do SHA-256 do manifesto original. A compatibilidade do estado `validado` foi conferida em leitura contra o manifesto e o relatório do produtor.
2. Disponibilizar o XML, o manifesto aprovado e somente o CSV da competência 2021-01 por canal privado controlado, com permissão de leitura para o operador autorizado. Conferir hash e tamanho nos bytes originais. A assinatura ou forma institucional de aprovação, a fonte de artefatos e o principal de serviço são pendências para a ativação.
3. Preparar a entrega, verificar versão, ordem, competência, contagem, ID e posição lógica. Arquivar os bytes originais em área privada com referência por hash antes de confirmar a gravação em staging. Comparar as 34 células por linha, os 18 originais, a posição, o ID e os vínculos. Revisar amostra de concordância bidirecional com o XML no ambiente privado.
4. Aceitar com 6.393 origens e snapshots novos no primeiro envio, zero perda, zero divergência, zero consolidação, zero ponto publicado e replay estável com auditoria correlacionada. Contabilizar pendências sem tratá-las como exclusões ou publicar seus valores. O Dashboard e os mapas permanecem fora dessa etapa.
5. Após a homologação do piloto, considerar os arquivos posteriores em ordem cronológica, a partir de fevereiro de 2021. Avaliar cada competência antes de avançar.
6. A consolidação exige autorização e regras adicionais para identidade policial e precedência entre extrações, mapeamentos criminais, códigos e vigência de RA, CRS, datum, eixos e marcador `NULL` em coordenadas. A camada de consulta, a Central em escala real e a exposição de dados dependem de política institucional específica.

A verificação de um arquivo sintético não autoriza o uso de registros reais. Registros reais, XML e CSVs do SENTINELA-DADOS não foram usados pelos ensaios.
