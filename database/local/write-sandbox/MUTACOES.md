# Etapa 2.15 — edição e inativação exclusivamente em sandbox

## Desenvolvimento Autônomo 02 — interface HTTP do ensaio

O adaptador `http.ts` atende em loopback no processo de qualificação. Ele
usa os comandos do serviço já homologado e exige o ambiente de laboratório,
uma origem exata e uma sessão de teste. O PostgreSQL verifica novamente
identidade, permissões, referências, estado e versão dentro da transação.
O Next.js encaminha as três rotas ao laboratório somente no modo isolado.
As operações para implantação operacional continuam planejadas no OpenAPI.

| Método e caminho no laboratório | Permissão e dados |
| --- | --- |
| `POST /api/v1/ocorrencias` | Administrador e Operador. Data, hora, UUID de RA, local, bairro ou setor, latitude e longitude, vínculos de natureza com tentativa opcionalmente desconhecida e chave de idempotência UUID. |
| `PATCH /api/v1/ocorrencias/{id}` | Administrador ou Operador. UUID, versão esperada, justificativa e alterações. Ao mudar o local é obrigatório informar bairro ou setor. |
| `POST /api/v1/ocorrencias/{id}/inativacao` | Administrador ou Operador. UUID, versão esperada e motivo. A operação mantém as associações e acrescenta histórico. |

Bairro ou setor compõe a coluna `local`; o esquema não oferece persistência
estruturada desse componente. A validação da extensão total do endereço também
passa pelo contrato do serviço. O ensaio usa uma RA sintética com `ST_Covers`.
Isso comprova o caminho de validação; vigência jurídica e classificação
oficial dependem de homologação própria.

A bateria nativa registrou 45 verificações de cadastro e 48 de mutações,
incluindo o caso agrupado HTTP. O ensaio cobriu autorização, endereço,
múltiplas naturezas, referência incompatível, idempotência, edição, versão
obsoleta, inativação, trilha técnica, rollback, concorrência e RLS. O
cluster privado `38b53aac-8f02-42ac-b018-e62f88a1445b` terminou `STOPPED`.
SHA-256 do recibo de encerramento `mutation-completion.json`:
`35196907ab7ef6805a0a905461683d4d5e32a2374eede4d2bf7df98b3ef61330`.

O cadastro entra em revisão. Edição e inativação foram validadas em registro
sintético elegível, preservando o bloqueio de edição regular para pendências.
As contas de teste definem atores técnicos de laboratório. A interface
principal continua com leitura persistente e cadastro demonstrativo. A
liberação de escrita exige autoria humana vinculada e revogável,
escopo aprovado, cartografia e catálogos habilitados e revisão das migrations.

12/11/2026. **Homologação SQL real aprovada**, com autoria técnica sintética;
nenhuma escrita habilitada na aplicação principal ou no banco operacional.
Os bloqueios anteriores foram resolvidos por evolução incremental experimental,
sem alterar as migrations oficiais.

## Arquitetura e autorização

`mutations.sql` exige o guard de identidade do controlador e a tabela de identidade
da 2.14. Só instala em `127.0.0.1:55432/sentinela_rls_sandbox`. O runtime revalida
manifesto, caminho sem redirecionamento, marcador, PID, horário de start, UUID,
system identifier, endpoint e atributos da role. Exige development, flag explícita
e `mutation_revision=2`.

| Identidade técnica nativa | Cadastro | Edição / inativação |
| --- | --- | --- |
| `sentinela_sbx_admin` | Sim | Sim, registros sintéticos elegíveis |
| `sentinela_sbx_operator` | Sim | Sim, registros sintéticos elegíveis |
| `sentinela_sbx_analyst` | Não | Não |
| `sentinela_sbx_mutator` | Não | NOLOGIN, owner das funções protegidas |

Todas são NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOINHERIT,
sem memberships. Roles LOGIN não são proprietárias de tabelas e não recebem DML.
O mutator não é dono das tabelas, não tem senha, LOGIN, DELETE de vínculos ou
UPDATE de histórico. Recebe SELECT necessário, INSERT de associações e histórico,
UPDATE das sete colunas permitidas e gestão do contexto privado. Schemas não
permitem CREATE pelo runtime; PUBLIC não executa as novas funções.

`mutate(uuid,jsonb,text)` é SECURITY DEFINER, search_path `pg_catalog`, nomes
qualificados, EXECUTE para Administrador e Operador técnicos. Valida novamente o JSON
no SQL. `session_user` determina o ator; payload ou GUC de perfil não o substitui.
O serviço usa parâmetros SQL. `inspect(uuid)` expõe somente o escopo sintético ao
Administrador para inspeção experimental. Durante uma mutação do Operador,
a função só pode ser chamada internamente para o ID do contexto transacional.
A checagem diferida só enxerga histórico do próprio ator e transação para o
Operador. O adaptador Next.js autentica o cookie, verifica a origem e só
encaminha contas descartáveis do cluster atestado.

## Triggers preservados e evolução explícita

Os 55 triggers continuam ativos. As 19 tabelas originais, constraints, FKs,
índices e ENABLE/FORCE RLS permanecem com definições preservadas. Apenas duas das
17 funções originais evoluem, exclusivamente no cluster novo:

- `bloquear_correcao_sem_backend`: continua negando DELETE, INSERT no histórico
  humano e caminhos diretos. UPDATE de ocorrência exige current_user mutator
  NOLOGIN, session_user Administrador ou Operador técnico, endpoint correto e capacidade
  transacional em `mutation_context`, não gravável pelo cliente. A policy UPDATE
  também limita o ID ao contexto e o escopo sintético.
- `exigir_historico_correcao`: mantém o contrato humano original fora do escopo
  experimental. Para o escopo sintético exige conferência diferida de xid, ID,
  ator, versões e linhas completas OLD/NEW exatas no histórico técnico.
  `verify_technical_history` é definer somente de leitura: permite conferir no
  COMMIT sem dar acesso direto do cliente ao histórico.

Não se insere usuário humano nem se falsifica `responsavel_id`. Não se libera
`historico_correcoes`. A auditoria de produção continua dependente de identidade
humana verificada. Esta evolução não é migration operacional.

## Contratos, elegibilidade e transação

`mutation-contracts.ts` reutiliza as propostas Zod: UUID, versão bigint positiva
em string, motivo obrigatório, objetos estritos, coordenadas não removíveis e
1–100 pares de natureza sem duplicação, inclusive UUID com caixa diferente.
Campos policiais, origem, fonte, estados e ator não entram em alterações regulares.

Cada comando atesta identidade/atributos, inicia transação, chama a função,
valida a resposta e confirma COMMIT. SQL: contexto privado, SELECT FOR UPDATE,
versão esperada, elegibilidade, estado combinado, RA/vigência e limite sintético,
escrita, vínculos e histórico. O trigger existente incrementa versão uma única vez.
Versão obsoleta retorna 409, ausente 404, entrada/estado inválido 422, autorização
403 e conexão indisponível 503. Erros são sanitizados e não há retry automático.

Elegibilidade estreita: fonte sintética, origem/identidade manual, ativo,
consolidada, localização referencia_pendente e nenhuma pendência aberta. Não há
edição de revisão, importação PCDF, reativação ou promoção de cartografia.
Consolidação e validação espacial são campos independentes no schema: fixtures
inseridas assim desde o início, geometria NULL e referências explicitamente
sintéticas. Nenhum registro em revisão foi promovido para passar nos testes.
Esse recorte não homologa cartografia DF ou elegibilidade de produção.

Inativação altera apenas `ativo=false`, preserva dados/vínculos e recusa repetição.
Edição sem alteração efetiva também é negada.

## Associações e auditoria técnica

Associações nunca são apagadas ou sobrescritas. `retirements` registra vínculo,
ocorrência, versão, ator, instante e xid. O conjunto vigente exclui os retirados.
Substituição retira vínculos antigos e inclui novos IDs; reinclusão de um par cria
outro ID. O lock no pai e a validação impedem duplicação vigente. As FKs originais
continuam válidas.

`mutation_history` guarda operação, ocorrência, session_user técnico, instante,
xid, versões, OLD/NEW completos, vínculos antes/depois, campos e motivo. Histórico
e retiradas têm RLS forçado e triggers de imutabilidade. O contexto é removido
antes do retorno; a conferência diferida usa o histórico no COMMIT. Rollback não
deixa auditoria com aparência de confirmação. Eventos de cadastro da 2.14 ficam
separados, como ator servico, sem se confundir com autoria humana.

## Executor e isolamento

```powershell
python -B database/local/write-sandbox/run-mutations.py --execute
```

Cria cluster novo privado, não retoma anteriores. Usa referência estrutural da
2.14 em arquivo e registra seu hash. Não importa o helper que consulta o operacional,
não lê `.env.local`, não conecta a 5432 ou Supabase. O instalador administrativo
é separado do runtime; todas as conexões SQL usam 55432 atestado.

Credenciais aleatórias são efêmeras. Initdb recebe arquivo privado exclusivo,
removido em finally; verificadores SCRAM vão ao psql por stdin, nunca argumentos
ou SQL em disco. Filhos recebem ambiente sem variáveis PG herdadas ou URLs de
banco/Supabase. Nenhuma senha preexistente é alterada.

O executor compara definições iniciais com a referência preservada, aceita
exatamente as duas funções evoluídas e rejeita outras mudanças estruturais.
Compara catálogo e ACLs completos após os testes, verifica invariantes e hashes
dos manifestos anteriores e encerra somente o cluster novamente atestado.
Não remove clusters/evidências. Hashes registram a revisão executada; documentação
de resultados é atualizada depois, sem reescrever o manifesto privado histórico.

## Resultados reais

UUID `70816e39-bbe0-4522-bcd1-dde592b2387c`, system identifier
`7707256925270769960`, PostgreSQL 17.11/PostGIS 3.6.2, encerrado STOPPED.
**47 grupos de mutações + 45 de regressão de cadastro PASS.**

Cobertura: campos permitidos, inclusão/substituição/retirada/reinclusão de naturezas,
histórico exato, inativação, negativas de serviço e SQL, versão obsoleta, inexistência,
revisão/inativo, campos proibidos, motivo vazio, referências inválidas, DML direto,
histórico/ator forjado, GUC de perfil, row_security off, injection como literal,
falha de autenticação e produção. Duas edições concorrentes com versão 1 produzem
um COMMIT, um 409, versão final 2 e um histórico.

Rollback comprovado após alteração do pai e vínculos, falha de constraint de
auditoria e erro do chamador após o comando, com snapshots iguais.
`mutation-fixtures.sql` inclui a constraint de injeção de falha para motivo reservado
`SYNTHETIC_AUDIT_FAILURE`, somente no cluster de ensaio, não regra de produção.
Resultado: 13 ocorrências (seis fixtures/sete cadastros), seis históricos, três
retiradas, contexto vazio, zero usuários humanos, reader NOLOGIN/senha NULL.

Primeira tentativa `0c04f865-c0e8-433e-b6d3-2063e96883c1`: SQLSTATE 42702 por
variável `a` ambígua, corrigida para `existing_link`. Encerrada e preservada;
correção testada em outro cluster, sem substituir evidências anteriores.

## Limitações

Persistência na interface principal, identidade humana, escrita operacional,
cartografia oficial, classificação homologada e migração para produção não foram
habilitadas. Perda de conexão durante COMMIT não foi injetada: resultado é
desconhecido e não se repete automaticamente. Mutações usam CAS, sem replay
idempotente; consultar estado antes de reenvio quando o resultado for desconhecido.
Não utilizar estes artefatos como autorização de produção.

Evidências, hashes e qualidade estão em [HOMOLOGACAO.md](HOMOLOGACAO.md).
