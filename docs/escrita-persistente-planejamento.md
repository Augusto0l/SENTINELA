# Escrita persistente de ocorrências — proposta da Etapa 2.12

Data: 11/11/2026. **Status: especificação para revisão; escrita não autorizada nem implementada.**
Nenhum endpoint, botão, role, grant, policy ou migration é habilitado por este documento.
As alterações locais anteriores da Etapa 2.11 e os artefatos privados são preservados.

### Consolidação das decisões — revisão documental de 11/11/2026

Esta revisão não homologa migrations nem concede acesso. As classificações abaixo
separam a intenção funcional confirmada da disponibilidade técnica. Em caso de
conflito, a exclusividade da Central prevalece sobre a proposta antiga de revisão
por Operador; nenhum contrato demonstrativo substitui autorização no servidor.

| Classe | Regra e proveniência | Consequência |
| --- | --- | --- |
| Confirmada — diretriz funcional | Pedido atual: Administrador cadastra, edita regularmente e inativa; Operador cadastra; Analista lê. | Matriz-alvo de produto, condicionada a identidade, escopo e controles; não habilita as operações hoje. |
| Confirmada — autorização específica | Contrato da Central: somente Administrador corrige, resolve ou reabre; todos consultam no escopo autorizado. | Edição regular não pode contornar esse fluxo. |
| Confirmada — preservação | Contratos PCDF/Central: manter originais, múltiplas naturezas, histórico e inativação lógica; nenhuma fusão automática por semelhança. | Não apagar proveniência nem preencher campos desconhecidos. |
| Fato de implementação | Provider local, `policy.ts`, reader e baseline inspecionados: só leitura persistente; trava de escrita e autoria humana bloqueada. | Manter bloqueio inclusive para Administrador; não é uma decisão de negar-lhe a função futura. |
| Recomendação técnica | Funções transacionais mínimas, CAS por versão, idempotência durável, validação territorial e auditoria atômica. | Especificação a revisar; mecanismos ainda não instalados ou homologados. |
| Questão aberta | Escopo, edição/inativação do Operador, condições de regularidade, localização/consolidação, associações e retenção. | Requer aprovação do responsável pelo projeto; negar caminhos não aprovados. |

Os detalhes das seções 4–8 são **recomendações de implementação**, mesmo quando
escritos como requisitos do futuro contrato. Schemas executáveis comprovam forma,
não aprovação institucional ou autorização. Nenhuma recomendação desta revisão
altera os contratos PCDF/Central, as permissões atuais ou os ADRs históricos.

## 1. Fontes, arquitetura e limites da inspeção

Fontes prioritárias: [contratos de ocorrências](../src/contracts/occurrences.ts),
[projeção persistente](../src/contracts/persistent-occurrences.ts),
[baseline consolidada](../database/supabase/baseline/0001_modelo_inicial.sql),
[leitura local](../database/local/migrations/0001_read_only.sql),
[deduplicação e permissões](contratos/deduplicacao-permissoes-v0.1.0.md),
[Central de Revisão](funcionalidades/central-revisao-ocorrencias-v1.0.md) e
[importação PCDF](contratos/importacao-pcdf-v1.0.md).
Esta revisão inspecionou arquivos, não reconfirmou catálogos do servidor por SQL.
A homologação dos catálogos foi informada no contexto do pedido; não foi repetida.

O Next.js expõe GET de ocorrências/detalhes e catálogos, com sessão no servidor,
permissão `analisar`, pool `readOperational`, transação READ ONLY e identidade
literal `127.0.0.1:5432/sentinela_dev_operacional/sentinela_local_reader`.
As seis policies permitem apenas o marcador sintético `SENTINELA_TESTE_LOCAL_V1`;
a de ocorrências também exige `ativo` e `consolidacao_status='consolidada'`.
Ela não permite ler registros inativos ou em revisão. Não ampliar esse pool.

`NovaOcorrencia.tsx` permanece demonstrativo: catálogos e responsável selecionável
não são autorização nem identidade. `occurrenceForm.ts` usa limites retangulares
demonstrativos e HH:mm, enquanto o contrato PCDF preserva segundos. A listagem
persistente mantém cadastro/edição/inativação desabilitados; não há editor
persistente homologado. O futuro formulário deve receber adaptador próprio,
sem reutilizar IDs fictícios, geocodificação simulada ou responsável do cliente.

ADRs relacionados: [contratos executáveis](decisoes/adr-contratos-executaveis-api.md),
[baselines](decisoes/adr-baselines-local-supabase.md),
[Auth fechado](decisoes/adr-auth-inicial-acesso-fechado.md),
[Auth local temporário](decisoes/adr-auth-local-temporario.md) e
[leitura/sandbox](decisoes/adr-leitura-postgresql-local-homologacao-isolada.md).
São registros datados, com decisões/limitações próprias; não autorizam escrita
por inferência. Um ADR de escrita e atribuição SQL deve ser aprovado antes dela.

## 2. Bloqueios existentes comprovados no SQL

| Objeto existente | Efeito para a escrita futura |
| --- | --- |
| `escrita_correcao_bloqueada` / `bloquear_correcao_sem_backend()` | Bloqueia UPDATE/DELETE de ocorrências, associações, staging e pendências, inclusive sem linhas atingidas; bloqueia INSERT no histórico. |
| `autoria_manual_bloqueada` / `bloquear_autoria_manual_sem_auth()` | Bloqueia eventos de auditoria com ator humano e atribuição/decisão manual em pendências. |
| `correcao_exige_historico` / `exigir_historico_correcao()` | Ao COMMIT, cada campo alterado exige antes/depois, versão anterior, alvo e `transacao_id` correspondentes. |
| `exigir_revisor_administrador()` | Nova autoria de correção exige `usuarios` ativo com perfil Administrador. Não comprova sozinho que o solicitante é esse usuário. |
| `identidade_preservar` / `proteger_identidade_ocorrencia()` | Impede alterar identidade, origem, fonte, evidência e criação. |
| `destino_preservar` / `proteger_destino_associacao()` | Impede transferir associação entre ocorrências/origens. |
| `atualizar_versao()` | Incrementa `versao` e atualiza `atualizado_em`; cliente não define esses campos. |
| `carimbar_auditoria()` | Carimba a transação; não gera automaticamente toda a auditoria de negócio. |

A migration Supabase 0006 integra vínculo/Auth, mas não remove essas travas.
Grants, GUC, UUID de Administrador ou `SECURITY DEFINER` não são solução para
contorná-las. Mesmo o Administrador continua sem escrita ativa neste estágio.
Qualquer substituição futura exige migration incremental explicitamente
autorizada, com proteção equivalente e teste em sandbox; não editar 0001–0006.

## 3. Matriz de autorização proposta

| Operação | Administrador | Operador | Analista |
| --- | --- | --- | --- |
| Consultar/analisar | Sim, no escopo | Sim, no escopo | Sim, no escopo |
| Cadastrar manualmente | Diretriz funcional confirmada, no escopo | Diretriz funcional confirmada, no escopo | Não |
| Editar ocorrência regular | Diretriz funcional confirmada, com histórico | Condicional: escopo/estado e separação do histórico ainda exigem aprovação; negar até lá | Não |
| Inativar regular | Diretriz funcional confirmada, com motivo | **Negado por padrão**: contrato anterior deixa autorização pendente | Não |
| Consultar Central | Sim, no escopo autorizado | Sim, no escopo autorizado | Sim, no escopo autorizado |
| Corrigir/resolver/reabrir pela Central | Exclusivamente Administrador ativo | Não | Não |
| Alterar original, apagar histórico, DELETE físico | Não | Não | Não |

`policy.ts` não tem permissões específicas de editar/inativar: `cadastrar` não
deve ser usado como substituto. Escopo por fonte/unidade/território e relação do
ator com o registro ainda não foram definidos. Até aprovação, negar escrita.
Definição conservadora **recomendada, ainda sujeita à aprovação** de regular:
ativa, consolidada, dentro do escopo, sem pendência aberta ou
em análise em qualquer campo/associação/linha vinculada, e validação completa do
estado resultante. Pendência encerrada sem solução exige avaliar o defeito
material remanescente; não vira regular apenas por encerrar o diagnóstico.

A edição regular não corrige campos ausentes, não resolve diagnósticos, não
reidentifica nem muda consolidação. Administrador também usa o fluxo próprio da
Central nesses casos. A redefinição da trava/histórico para permitir edição por
Operador é uma decisão de modelo, não ajuste incidental de permissão.

## 4. Contratos REST planejados

Schemas executáveis: [planned-occurrence-writes.ts](../src/contracts/planned-occurrence-writes.ts).
São propostas puras, sem consumidores de execução. Os modelos demonstrativos
antigos permanecem para seus consumidores; os GETs não mudam. O OpenAPI marca
somente estas operações com `x-implementation-status: planned`, mantendo os
GETs locais como implementados. Os exemplos novos de escrita usam metadado
`mode=proposto, persisted=false`; nenhum exemplo comprova gravação.

| Rota futura | Entrada | Saída esperada |
| --- | --- | --- |
| POST `/api/v1/ocorrencias` | `PlannedManualCreate` | 201, ocorrência persistente manual completa, `Location` apontando ao UUID |
| PATCH `/api/v1/ocorrencias/{id}` | `PlannedManualUpdate` | 200, projeção persistente atualizada |
| POST `/api/v1/ocorrencias/{id}/inativacao` | `PlannedInactivation` | 200, projeção persistente com `ativo=false` |

As rotas seguem o namespace e a inativação lógica já propostos. Não há DELETE.
`id` é UUID persistente; não aceita `#00001`. Cookies/sessão e defesa CSRF/origin
serão obrigatórios conforme o provedor aprovado. Bearer no OpenAPI é uma
referência futura, não uma credencial que o servidor atual aceite para escrever.

Todos os comandos exigirão `Idempotency-Key` UUID no header. PATCH/inativação
exigem `versaoEsperada` como string decimal positiva até o máximo bigint SQL,
sem conversão por Number. PATCH tem `justificativa` e `alteracoes` estritos, não
vazios; inativação tem `motivo` de 1–500 caracteres após trim. Não aceitar perfil,
ator, origem, fonte, ID, timestamps, versão nova ou status gerados pelo cliente.

Exemplo de PATCH (apenas contrato, não comando de execução):

```json
{"versaoEsperada":"1","justificativa":"Ajuste autorizado","alteracoes":{"local":"Endereço atualizado"}}
```

Omitido preserva o campo. `coordenadas:null` significa ausência explícita, não
zero; é forma estrutural válida, mas o domínio deve recusar esse rebaixamento na
edição regular e encaminhá-lo ao procedimento administrativo. Revalidar o estado
combinado, não apenas o PATCH. PATCH com valores iguais retorna 409 sem aumentar
versão nem inventar histórico. `naturezas` representa o conjunto final desejado,
com pares únicos `(naturezaId, crimeTentado)`, não operações arbitrárias de SQL.
O limite 100 é uma **proposta técnica**, não o número oficial de naturezas.

Erros: 400 UUID/header/JSON malformado; 401 sessão ausente/expirada; 403 ação ou
origem de identidade proibida; 404 alvo inexistente ou fora do escopo, sem revelar
sua existência; 422 conteúdo/RA/natureza/geografia inválidos; 409 versão, estado,
duplicidade exata ou chave idempotente incompatível; 503 indisponibilidade;
500 falha interna sanitizada. Usar envelope `ApiError`, caminhos de campos e
códigos estáveis; não retornar SQL, nome de constraint, URI ou payload de terceiros.
Não converter todo SQLSTATE 23505 em ocorrência duplicada: mapear apenas a
constraint/índice conhecido e o contexto; conflitos internos permanecem internos.

## 5. Cadastro e mapeamento para o modelo físico

| Campo/regra | Definição proposta e destino existente |
| --- | --- |
| Identificação | UUID gerado pelo banco; `origem='manual'`, `identidade_status='manual'`. `fonte` e `versao_identidade` vêm de configuração versionada aprovada no servidor, ainda sem valores homologados. Ano/unidade/número não são fabricados nem exigidos para identidade manual. |
| Data/hora do fato | `data` ISO civil 1900–9999 e `horario` HH:mm:ss, obrigatórios; `data_fato`, `horario_fato`. O formulário HH:mm precisa adaptação explícita de precisão, não inventar segundos de fonte histórica. |
| Data/hora do registro | Não há colunas equivalentes em `ocorrencias`; `criado_em` é instante técnico, não registro policial. Originais pertencem à proveniência PCDF. Não criar campos/valores silenciosamente; mudança de projeção exige decisão/migration própria. |
| RA | `raId` UUID obrigatório; FK `ra_id`; existência, vigência para data do fato, versão e escopo verificados em SQL. Não inventar código oficial. |
| Endereço | `local` obrigatório, trim 5–240, preservando o limite do cadastro já proposto. Bairro/setor entram no texto; não há colunas próprias. Não impor esse limite retroativamente a endereços históricos/importados, cuja coluna é text. |
| Naturezas | Uma ou mais naturezas originais existentes; UUIDs reais, tentativa true/false/null explícita por associação. Não usar as oito opções demo nem criar catálogo por digitação. |
| Categoria | Derivação por mapeamento vigente/homologado, natureza e tentativa compatíveis; cliente não escolhe categoria nem `mapeamento_id`. Sem evidência: `classificacao_status='pendente'`, mapeamento nulo e pendência; nunca categoria presumida. |
| Coordenadas | Par WGS84 numérico finito, longitude −180..180/latitude −90..90; ambos ou null/omitido. Sem coordenada sintética. `geometria`, referência, transformação e status são exclusivos do servidor. |
| Estado | Ativa; consolidação calculada após regras versionadas, nunca fornecida pelo cliente. Na ausência de regra aprovada, não promover para consolidada. Cadastro completo e validado poderá consolidar; incompleto preserva pendências/em revisão conforme efeito. |
| Responsável | Identidade autenticada confiável e vínculo ativo, obtidos pelo servidor/SQL; nunca o seletor demonstrativo. |

O índice `ocorrencias_identidade_homologada_unica` cobre somente identidade
homologada com fonte/versão/ano/unidade/número; **não deduplica cadastro manual**.
Semelhança de endereço, hora ou natureza gera candidato para revisão, nunca
fusão automática. Aprovar regra de alerta/confirmação e política de duplicidade
manual antes de implementar; chave idempotente não é deduplicação de negócio.

### Geografia e PostGIS

O retângulo demonstrativo do formulário não comprova DF. A baseline possui
`extensions.geometry(Point,4326)` e `avaliar_pertencimento_territorial(uuid)`,
que usa `ST_Covers(r.limite,o.geometria)` quando há referência utilizável.
Planejar `ST_SetSRID(ST_MakePoint(longitude,latitude),4326)` somente para entrada
declarada WGS84; não atribuir CRS aos dados PCDF desconhecidos. Validar tipo,
SRID, ponto não vazio e coerência X/Y. Conferir RA e limite DF versionados,
vigência e evidência cartográfica; `ST_Covers` inclui a fronteira.

Ponto comprovadamente fora do DF/RA: rejeitar cadastro regular com 422 e
orientação de revisão, sem mover o ponto. Sem cartografia oficial suficiente:
não declarar localização validada nem reduzir segurança para passar o teste;
registrar `referencia_pendente` e impedir a dimensão/mapa ou consolidação de
acordo com regra aprovada. Ausência de par pode criar pendência sem inventar
dados, conforme contrato anterior. Política exata de consolidação por dimensão
e a cartografia admitida continuam decisões pendentes.

## 6. Edição, associações e inativação

Editáveis propostos: data/hora do fato, RA, endereço, coordenadas e vínculos de
natureza, sujeitos a estado, escopo e domínio. Imutáveis: identidade/proveniência
enumeradas em `proteger_identidade_ocorrencia`, criação, IDs, origem e linhas
originais; cliente também não controla status, evidência, versão ou autoria.

Alterar natureza/tentativa requer diff do conjunto sob lock da ocorrência:
preservar IDs de vínculos mantidos; toda alteração conta na versão do agregado.
Não apagar associações importadas nem transferi-las; `linha_origem_id` e a
ausência de UNIQUE por ocorrência/categoria preservam descrições distintas.
A baseline não tem indicador de inatividade da associação: remoção/substituição
sem perda não está resolvida. **Bloquear remoções** até aprovar versionamento ou
modelo incremental; não emitir DELETE nem inventar coluna `ativo` nessa tabela.
Inclusões/ajustes exigirão trilha e regra para não contornar a Central.

Inativar muda somente `ocorrencias.ativo=false`, com motivo, versão e auditoria;
preserva natureza/origem/histórico. Já inativa: replay da mesma chave devolve o
resultado anterior; novo comando retorna 409. Não há reativação contratada.
Ocorrência com pendências não usa edição/inativação regular: procedimento
administrativo distinto, ainda não especificado como endpoint ativo.

## 7. Identidade e arquitetura SQL proposta

Não reutilizar `sentinela_local_reader`, postgres ou a URI de backup. A role
técnica de escrita futura, nome a aprovar, terá NO SUPERUSER/BYPASSRLS/CREATEDB/
CREATEROLE/REPLICATION, sem memberships, ownership ou DDL/TEMP, com HBA/host/
banco estritos e pool separado exclusivo do servidor. Começar NOLOGIN; senha e
ativação exigem autorização operacional própria. Rever CONNECT/PUBLIC e grants
EXECUTE de PUBLIC; NOINHERIT não elimina privilégios de PUBLIC.

Preferência: role de entrada com EXECUTE apenas em funções transacionais de
cadastro/edição/inativação, sem DML direto em tabelas, histórico ou eventos.
Funções SECURITY INVOKER exigiriam DML direto do chamador, que amplia superfície;
SECURITY DEFINER só se demonstrada a necessidade, com proprietário dedicado
NOLOGIN/NOBYPASSRLS, não dono das tabelas, search_path pg_catalog fixo, nomes
qualificados, sem SQL dinâmico e EXECUTE revogado de PUBLIC. FORCE RLS preservado.
O proprietário funcional também deve ter escopo mínimo e policies próprias;
definer não deve virar bypass de autorização nem chamar funções privilegiadas
publicamente executáveis. Revisar todas as chamadas transitivas/triggers.

RLS futura: SELECT limitado ao escopo de validação; INSERT WITH CHECK para fonte,
origem/estado/ator aprovados; UPDATE USING **e** WITH CHECK para manter a linha
no escopo. Conferir papel/ação nas funções além da RLS. Acesso à linha após
inativação deve ocorrer no contexto transacional autorizado: a policy reader
atual deixa de vê-la, portanto não fazer a resposta depender desse GET/role.
Nenhum acesso a brutos, usuários ou auditoria é entregue à role de entrada.

Também não presumir que o cadastro aparecerá na listagem atual: fonte diferente
do marcador sintético ou estado `em_revisao` ficam fora da policy reader. Não
rotular dados reais como fixtures para fazê-los aparecer. A compatibilidade entre
escopo de escrita e leitura exigirá desenho e autorização específicos antes da
integração da UI, mantendo os dados de revisão em fluxo próprio.

### Limitação da identidade atual — bloqueio de liberação

O provedor local retorna `id=LOCAL-<perfil>`, `authUserId=''`, com sessão contendo
perfil/fingerprint, não UUID humano provisionado em `sentinela.usuarios`.
Contas demonstrativas não comprovam autoria SQL individual. Não mapear todas as
operações para um Administrador fixo, criar auth fictício nem usar `ator_tipo=servico`
para disfarçar ação humana. A assinatura da função privada 0006 não é autorização
de escrita de negócio; não chamá-la como atalho.

Decisão recomendada: manter esse provedor somente leitura e resolver identidade
confiável antes de escrever. Para hospedagem, retomar Auth real/vínculo ativo,
com contexto JWT validado pelo gateway e autorização SQL correspondente. Se a
implementação local precisar preceder Auth, aprovar um modelo próprio de atores
individuais e sua autenticação SQL: por exemplo logins PostgreSQL individuais
mapeados por `session_user`, ou contexto assinado verificável por componente SQL
confiável com nonce, audiência e expiração. Não há esses mecanismos instalados;
dependências/gestão de chaves e revogação precisam de revisão própria.

Uma conexão técnica compartilhada não autentica por si só o humano. GUCs como
`app.user_id`, `SET ROLE`, perfil/UUID no body/header ou `auth.uid()` alimentado
por claims arbitrários numa conexão direta **não são prova**. Backend confiável
é uma fronteira de segurança explícita; comprometimento de sua credencial/contexto
é risco residual que deve ser documentado, não ignorado. Nunca aceitar identidade
local para destino remoto. Ensaios sintéticos só no sandbox autorizado, com ator
de serviço explicitamente sintético, sem apresentá-los como autoria humana real.

### Caminho recomendado de identidade individual — não implementado

Para eliminar a ambiguidade entre as alternativas acima, a recomendação principal
é retomar identidade individual real compatível com Supabase Auth. Logins SQL
individuais ou contexto assinado são alternativas **não escolhidas**, que exigem
outra decisão caso a equipe queira escrita local antes dessa integração.
O provedor local atual permanece exclusivamente de leitura persistente: e-mails
distintos, hashes e cookie válido não resolvem o ID por perfil nem a ausência de
vínculo humano estável. Não basta acrescentar um UUID vindo do formulário.

Fluxo futuro recomendado e suas fronteiras de confiança:

1. O backend valida a sessão/identidade no provedor real, inclusive validade,
   emissor e audiência aplicáveis. Falha de validação nega a escrita; não usar
   apenas decode de JWT, estado do navegador ou nome/e-mail como identidade.
   Assinatura válida não comprova por si só que logout/revogação já foi observado:
   definir verificação de sessão/revogação e sua janela de validade em D01,
   comprovar o comportamento em testes e negar quando a prova necessária falhar.
2. O UUID autenticado é associado ao `usuarios.auth_user_id`; obter `usuarios.id`,
   perfil ativo e escopo de fonte/unidade/território em dados protegidos. Perfil
   vem desse vínculo, nunca de metadados editáveis pelo usuário. Mudança de
   perfil/inativação deve valer para novos comandos, não depender só da cópia
   antiga de claims. Revalidar antes de revelar replay idempotente.
3. No caminho hospedado, encaminhar o token do próprio usuário ao gateway Auth/
   Data API confiável para a futura RPC transacional, sem service_role nem URI
   administrativa. O gateway verifica o token e estabelece o contexto SQL;
   `auth.uid()` só é confiável nessa fronteira controlada. A role de execução
   compartilhada do gateway não é o ator humano e não recebe BYPASSRLS.
4. A função SQL futura deriva o ator do contexto verificado, reconsulta vínculo
   ativo/escopo e valida a ação, além da autorização feita no backend. Não recebe
   `usuario_id` ou perfil como autoridade fornecida pelo cliente. A role de
   entrada terá somente EXECUTE aprovado, sem DML direto ou capacidade de
   alterar funções/policies. A role reader local continua sem escrita.
5. O comando e a auditoria são atômicos: `ator_tipo='usuario'`, UUID interno
   derivado do vínculo, antes/depois, motivo e carimbos do banco. Conta técnica
   aparece como contexto operacional, sem substituir a autoria humana.

Esse fluxo não torna as RPCs existentes de leitura capazes de escrever nem
autoriza expor schemas ou instalar 0006 no PostgreSQL local. As permissões da
role de entrada e do proprietário funcional precisam de revisão específica.
Uma conexão PostgreSQL direta com senha técnica e GUC definido pela aplicação
**não equivale ao gateway autenticado**; fica bloqueada até existir mecanismo
independente aprovado para provar o ator e impedir sua falsificação no SQL.
O backend comprometido ou token roubado permanece risco residual: proteger
tokens/chaves, restringir superfície e escopo, revogar sessões e auditar acessos.
Não prometer impossibilidade absoluta de impersonação após comprometer essa
fronteira; exigir testes de falsificação antes de liberar qualquer caminho.

## 8. Auditoria, concorrência e transações

Cada comando futuro, após autenticação/CSRF e validação estrutural:

1. Validar destino e identidade técnica/humana; iniciar transação com timeouts.
2. Reservar chave idempotente de modo atômico por ator, método, alvo e hash
   canônico do payload. Registro durável/índice único ainda **propostos**, não
   existentes; retenção e armazenamento protegido da resposta exigem decisão.
3. Para alteração, obter lock da ocorrência e validar escopo/estado/versão;
   usar compare-and-swap com `id` e `versaoEsperada`. Zero linhas não é sucesso.
4. Validar RA, naturezas, mapeamentos e geografia, bloquear mudanças concorrentes
   relevantes dos catálogos ou usar versões explícitas. Ordem fixa de locks:
   ocorrência, associações por UUID, dependências; prevenir deadlocks.
5. Aplicar agregado e reavaliação. Atualização só de associações também altera
   exatamente uma vez a versão da ocorrência; não somar incremento manual ao
   trigger `atualizar_versao`. Regra precisa de implementação/teste específico.
6. Inserir histórico por campo SQL alterado com valores JSON exatos antes/depois,
   alvo e versão anterior, respeitando os triggers diferidos. Para criação,
   evento com antes nulo e depois do agregado. Para alteração/inativação, evento
   resumido referencia a correção quando aplicável, sem duplicar snapshots já
   preservados por campo. Justificativa de criação pode ser derivada do comando
   pelo servidor; alteração/inativação recebem texto validado do solicitante.
7. Auditoria usa `ator_tipo='usuario'`, `usuario_id` validado, `request_id` gerado
   pelo servidor, instante UTC e origem/ação identificadas; carimbo de transação
   vem de `carimbar_auditoria`. Nunca aceitar os carimbos do cliente.
8. Registrar resultado idempotente na mesma transação, validar constraints
   diferidas e COMMIT. Só então retornar sucesso/Location/versão nova.

Repetição idêntica e mesmo ator devolve status/corpo original, sem nova ocorrência,
versão ou evento. Mesmo UUID de chave com conteúdo/alvo diferente: 409. Revalidar
sessão e autorização antes de revelar replay. Falha antes do COMMIT reverte tudo,
inclusive reserva; rejeições tentadas podem gerar telemetria de segurança
sanitizada separada, não um evento de sucesso numa transação abortada.
Perda de conexão no COMMIT: resultado desconhecido, consultar pela chave segura
antes de repetir; não gerar nova chave/repetir comando cegamente. Falha de
auditoria aborta todo o comando. Não prometer exactly-once sem ledger durável.

Históricos/eventos já possuem imutabilidade e `transacao_id`; reutilizá-los,
não criar trilha concorrente sem necessidade. Não registrar tokens, senhas,
endereços completos ou JSON bruto em logs comuns. Retenção, minimização e acesso
à auditoria exigem aprovação. Operador não ganha acesso direto ao histórico por
poder editar; a função futura faz a escrita protegida conforme modelo aprovado.

## 9. Central e importação PCDF

Qualquer campo ausente pode produzir elegibilidade à Central, inclusive em
ocorrência consolidável; gravidade e efeito são separados. Filtros por tipo,
estado, prioridade, período, RA, natureza e lote seguem o contrato da Central.
Somente Administrador corrige, resolve/reabre ou encerra sem solução, com motivo,
preservação dos originais, reavaliação e histórico. Cadastro regular exige cinco
atributos, mas importação/revisão preservam ausências e diagnósticos: não impor
obrigatoriedade do formulário a todas as linhas históricas nem preenchê-las.

Importação é outro comando/contrato/escopo: extração e lote, hashes, execução,
staging, 18 valores originais PCDF e layout candidato de 34 campos. Preservar 41
descrições originais, 19 categorias PCDF e as 20 categorias SENTINELA previstas,
com mapeamento versionado homologado, nunca as oito demonstrativas como catálogo
oficial. Naturezas múltiplas não multiplicam ocorrências nem desaparecem por
categoria igual. Chave candidata não é identidade homologada e não autoriza
fusão; reprocessamento e importação não reutilizam a idempotência manual sem
desenho próprio. Nada de importação persistente é implementado nesta etapa.

## 10. Testes futuros e critérios de aceite

| Grupo | Evidência exigida antes da liberação |
| --- | --- |
| Cadastro | Caso válido, cinco atributos ausentes um a um, horário/UUID/limites, origem e autoria forjadas recusadas; resposta corresponde ao agregado e só após COMMIT. |
| Catálogos | RA/natureza inexistentes, fora de escopo ou versão/vigência incompatível rejeitados; mapa de categorias não é escolhido pelo cliente. |
| Geografia | Longitude/latitude trocadas, NaN, par incompleto, ponto fora do DF/RA, fronteira, cartografia ausente/CRS desconhecido; nenhum ponto sintético. |
| Duplicidade/idempotência | Concorrência na mesma chave, replay após COMMIT desconhecido, payload distinto, atores distintos e candidato semelhante sem fusão. |
| Concorrência | Dois PATCH na mesma versão: um sucesso e um 409; alterações só de natureza também invalidam versão anterior; nenhuma atualização perdida. |
| Autorização | Matriz por identidade real. Analista não escreve. Operador não corrige pendências. Mutações regulares de Administrador e Operador exigem escopo aprovado. Body/header/GUC não elevam perfil. |
| Estado | Inativa, pendente, bloqueada, campos ausentes, correção administrativa via PATCH regular e tentativa de mudar proveniência recusados. |
| Associações | Múltiplas naturezas, tentativa null preservada, diffs sem perda; remoção não é liberada antes do modelo aprovado. |
| Auditoria | Antes/depois exatos, ator autenticado, motivo e versão/transação; ausência/inconsistência causa rollback integral, inclusive erro diferido no COMMIT. |
| SQL | Autenticação real da role futura, sem SET ROLE administrativo como substituto; policies WITH CHECK, UPDATE USING, grants mínimos, execução indireta, função PUBLIC, DDL/TEMP e DML direto recusados. |
| Resiliência | Timeout/deadlock, rede antes/durante COMMIT, falha de catálogo/auditoria; sem sucesso fictício, sem fallback de pool administrativo ou mocks. |
| Isolamento | Sandbox independente atestado; nenhuma credencial local usada no Supabase; snapshot anterior/posterior e limpeza aprovada sem afetar operacional. |

Nesta entrega os testes são de contrato e inspeção estática, **não** de SQL,
PostGIS real, auditoria executada ou autorização operacional. Os testes de
integração só poderão usar um sandbox e fixtures autorizados futuramente.

## 11. Plano incremental A–G — execução futura condicionada

| Etapa | Entrega e dependências | Critérios de aceite | Testes exigidos |
| --- | --- | --- | --- |
| A. Identidade e autorização | Aprovar identidade individual, vínculo ativo, escopo e permissões específicas. Depende de D01/D02/D03 abaixo e homologação do provedor real. | Backend e SQL reconhecem a mesma pessoa e ação; local/preview não escrevem; conta técnica não é ator humano; nenhum bypass administrativo. | Sessão ausente/expirada/revogada, perfil forjado, troca de vínculo, usuário inativo, acesso entre escopos e Administrador local recusado. |
| B. Segurança SQL e auditoria | Após A e autorização de sandbox, revisar migrations incrementais e funções mínimas; substituir travas apenas com controles completos. Depende de D04/D07. | RLS ENABLE/FORCE preservado, USING/WITH CHECK efetivos, DML direto negado, antes/depois e autoria atômicos; nenhuma alteração nas migrations originais ou no reader. | Autenticação real da role de entrada, EXECUTE/PUBLIC, encadeamento definer, spoof de contexto, INSERT/UPDATE direto e auditoria sem ator recusados; erro diferido aborta tudo. |
| C. Cadastro persistente | Após A/B e regras aprovadas de catálogos/geografia/estado/duplicidade. Depende de D05/D06/D08. | Ocorrência e naturezas, auditoria e resposta idempotente na mesma transação; fonte aprovada, sem dados fabricados; sucesso só após COMMIT. | Cinco atributos, RA/natureza inexistentes, coordenadas/DF/cartografia, múltiplas naturezas, replay simultâneo, payload divergente e falha de auditoria. |
| D. Edição persistente | Após C e aprovação da regularidade, permissões do Operador e estratégia de associações. | CAS impede atualização perdida; mudanças só em vínculos também mudam versão do agregado; identidade/originais preservados; Central não é contornada. Remoção fica bloqueada enquanto D04 não tiver solução. | Dois editores na mesma versão, pendência ativa ou defeito não resolvido, reidentificação, tentativa de remoção/transferência de vínculo e rollback de alterações parciais. |
| E. Inativação persistente | Após B/D; D03 exige homologação do escopo e da identidade SQL. | Apenas ativo=false, versão/auditoria/motivo; sem DELETE ou reativação implícita; resposta não depende da policy reader que oculta inativas. | Motivo ausente, versão antiga, registro inativo, replay da mesma chave, novo comando conflitante, Analista ou perfil fora de escopo recusado e falha no COMMIT. |
| F. Homologação em sandbox | Isolamento autorizado antes de qualquer ensaio SQL de B–E; homologação completa após E. | Identidade do cluster atestada; equivalência estrutural e definições verificadas; testes positivos/negativos por pessoa/role; evidência sanitizada e estado final conhecido. | RLS/grants reais, adulteração de ator, auditoria, concorrência, idempotência, timeout/COMMIT desconhecido, limpeza autorizada e preservação do operacional. |
| G. Integração da interface | Somente após F e autorização específica de disponibilização dos handlers e da conexão de escrita no destino aprovado. | UUIDs reais, responsável derivado da sessão, estados de conflito/pendência claros, sucesso somente confirmado; demo não escreve; leitura de novos/inativos compatível com escopo. | Fluxos dos três perfis, CSRF/origin, sessões inválidas, retry, CAS, filtros/leitura após cadastro e inativação; regressões visuais/GET e build. |

A ordem lógica é A → B → C → D → E → F → G; a preparação do ambiente de F
antecede B e sua validação é contínua em B–E. Nada é aplicado primeiro ao banco
operacional para depois tentar homologar. Definir critérios e testes não autoriza
criar cluster, usuários, roles, chaves ou migrations. Toda mudança operacional
futura exige autorização própria do destino/escopo, backup e recuperação revistos.

## 12. Registro de questões para aprovação

Responsável pelas decisões: responsável pelo projeto/equipe designada, sem
atribuir aprovação a integrante específico. Registrar decisão, data, evidência
e versão em revisão/ADR antes da implementação; ausência de resposta não aprova.

| ID | Questão aberta | Recomendação e condição de liberação |
| --- | --- | --- |
| D01 | Qual mecanismo comprovará a pessoa no backend e SQL, inclusive revogação de sessão? | Priorizar Auth individual real/vínculo ativo e gateway verificado; aprovar verificação e janela de revogação. Provedor local atual permanece bloqueado; alternativa local requer projeto/ADR próprios, não identidade simulada. |
| D02 | Qual escopo por fonte/unidade/território e onde registrar concessões? | Modelo e revogação explícitos, aplicados no backend e SQL; não há tabela de escopo aprovada que possa ser presumida existente. |
| D03 | Em que estados Operador edita ou inativa? | A diretriz funcional autoriza cadastro, edição e inativação regular pelo Operador. A simulação exige ocorrência manual, ativa e consolidada. Escopo e identidade no SQL exigem homologação antes de liberar escrita persistente. Correção pela Central segue exclusiva do Administrador. |
| D04 | Como separar edição regular e correção administrativa, e preservar vínculos removidos? | Migration incremental com trilha equivalente, nunca relaxamento geral de `exigir_revisor_administrador`; sem remoção/DELETE até modelo aprovado de associação/versionamento. |
| D05 | Qual cartografia/versionamento, fronteira e efeito de ausência de coordenadas/mapeamento? | Não validar DF por retângulo; reter pendência sem ponto inventado. Aprovar condições de consolidação e critérios conservadores de regularidade. |
| D06 | Quais fontes/versões, limites, precisão e regra de duplicidade manual? | Não fabricar identificação policial; preservar precisão PCDF; limite 100 de vínculos e a política de 409 para no-op são propostas, não regras homologadas. |
| D07 | Qual retenção e proteção para auditoria/idempotência e estratégia de recuperação? | Reutilizar trilha existente, armazenar chave/resultado atomicamente e revalidar acesso no replay. Aprovar retenção, minimização e acesso, sem apagar evidências por iniciativa da aplicação. |
| D08 | Como novos registros aprovados aparecem nas consultas sem usar o marcador de fixtures? | Rever separadamente o escopo de leitura e escrita; não ampliar silenciosamente reader/RLS nem rotular dado real como teste. |

### Riscos e dependências remanescentes

As travas SQL continuam ativas e são um bloqueio técnico real, não uma questão
apenas documental. Nenhuma aprovação funcional substitui a implementação de A/B.
O contexto de identidade confiável depende de provedor/gateway e vínculo ativo;
token roubado ou backend comprometido continuam riscos residuais a mitigar.
Definer mal configurado, EXECUTE de PUBLIC, dados sem cartografia/mapeamento e
replay que ignore revogação podem expor dados ou permitir escrita indevida.
Concorrência do agregado, histórico por campo e retenção precisam de ensaio real:
testes de schema não comprovam nenhum deles. As decisões D01–D08 permanecem
abertas nesta revisão; não foram promovidas a aprovadas por este documento.

**Decisão de liberação atual: NÃO habilitar escrita.** A especificação e seus
contratos estão preparados; identidade SQL, substituição segura das travas,
escopo, associação removida e decisões de domínio continuam gates explícitos.

## 13. Validação inicial dos contratos

- 38 testes aprovados: oito novos grupos de escrita planejada e 30 regressões
  de contratos/API e catálogos, sem banco operacional.
- TypeScript e ESLint aprovados; OpenAPI sincronizado e validado por Zod/AJV:
  35 schemas, 13 paths, 15 operações e 31 payloads. Não foram criadas novas rotas.
- Verificação estática de rotas/imports e 13 links locais deste documento
  aprovados; `git diff --check` aprovado.
- Nenhuma conexão SQL ou Supabase nesta etapa; nenhum ensaio de escrita,
  concorrência real, PostGIS ou auditoria executada foi declarado como homologado.
- Não foi necessário iniciar servidor, repetir testes com senha privada ou
  executar build de aplicação para esta alteração de especificação/contratos.

### Validação da consolidação documental

Na revisão seguinte, 39 testes de contrato/inspeção estática passaram, incluindo
o novo inventário AST recursivo de todos os `route.ts` em `src/app/api/v1`.
Ele verifica funções, variáveis e exports nomeados, recusando POST/PUT/PATCH/DELETE
e reexports indiscriminados. Os endpoints de domínio continuam somente GET;
os POST próprios de login/logout fora desse namespace não são operações de
escrita de ocorrências e não foram alterados.

ESLint do teste, validação Zod/OpenAPI, rotas/imports, links documentais e
`git diff --check` aprovados. Schemas, exemplos, código de autenticação, handlers,
ADRs históricos e migrations não foram alterados nesta consolidação. Apenas
este documento e o teste estático foram ampliados. Não houve conexão SQL,
Supabase, aprovação de questões D01–D08 ou alteração operacional.
