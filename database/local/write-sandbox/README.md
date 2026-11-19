# Cadastro experimental — somente sandbox

Etapa 2.15: edição/inativação homologadas somente no sandbox. Consulte
[MUTACOES.md](MUTACOES.md) para a evolução controlada dos triggers, autoria técnica,
histórico de vínculos e limitações. Nenhuma escrita Next.js foi habilitada.

Para repetir integralmente cadastro e mutações em **outro cluster novo**:

```powershell
python -B database/local/write-sandbox/run-mutations.py --execute
```

`mutations.sql`, `mutation-fixtures.sql` e `qualify-mutations.mjs` são exclusivos
desse executor. A porta 55432 deve estar livre; credenciais efêmeras são geradas
privadamente. O executor usa referência estrutural preservada em arquivo, não
conecta ao operacional nem ao Supabase e não remove sandboxes anteriores.

Não execute `run.py` para a 2.15: ele consulta o operacional como referência.
As instruções de execução abaixo pertencem exclusivamente à Etapa 2.14.

Etapa 2.14. Serviço transacional de cadastro, sem route handler Next.js, sem
integração com formulário e sem escrita na aplicação principal. Não é migration
operacional nem solução de identidade humana. Consulte [HOMOLOGACAO.md](HOMOLOGACAO.md)
para a execução SQL real, distinta dos testes simulados.

## Artefatos e execução

- `service.ts`: validação, sessão sintética fornecida pelo adaptador confiável de
  teste, autorização pela matriz compartilhada, pool técnico separado, atestação
  por manifesto/arquivos e servidor, transação e resposta somente após COMMIT.
- `setup.sql`: configuração exclusiva de cluster novo, roles mínimas, policies,
  função protegida, catálogos sintéticos e ledger de idempotência experimental.
- `qualify.mjs`: testes reais via serviço e conexões técnicas autenticadas,
  incluindo negativas diretas SQL. Credenciais chegam por stdin; relatório
  contém somente resultados sanitizados, nunca senhas/URIs/payloads pessoais.
- `run.py`: único controlador da execução completa. Reutiliza o ciclo de vida
  aprovado do sandbox RLS, sem alterar seus arquivos ou manifestos anteriores.
- `tsconfig.json`: typecheck adicional, pois esse código está fora de `src`.
- `../../../tests/sandbox-create.test.mjs`: contratos e guardas offline, sem SQL.

Com PostgreSQL 17.11/PostGIS 3.6.2 e a autenticação administrativa privada já
configurada para a **referência somente de leitura** do operacional, executar no
PowerShell da raiz do projeto:

```powershell
python -B database/local/write-sandbox/run.py --execute
```

O comando cria SEMPRE outro cluster novo e exige porta 55432 livre. Não retoma
nenhum sandbox, não reutiliza senha existente, não exclui dados/evidências e não
instala objetos em 5432. A falta da credencial administrativa privada da referência
interrompe antes da criação; não há fallback para `.env.local` ou Supabase.
Nesta homologação a credencial privada existente funcionou, portanto não foi
necessário solicitar senha interativa adicional.

As credenciais administrativas e técnicas do cluster novo são aleatórias, próprias
e apenas transitórias. O bootstrap de initdb usa arquivo privado exclusivo sob
DACL restrita e o remove em finally. Verificadores SCRAM seguem por stdin; senhas
dos clientes ficam apenas na memória/ambiente dos processos, nunca em argumentos,
SQL em disco ou relatórios. Nenhuma senha preexistente é alterada. Ao finalizar,
as credenciais transitórias são descartadas e o cluster fica parado e preservado.
Não iniciar o cluster preservado com tentativa de senha ou reset automático.

## Contratos e domínio deliberadamente limitados

`sandboxCreateSchema` estende o contrato planejado sem alterá-lo: coordenadas são
agora obrigatórias e não nulas; data ISO e horário HH:mm:ss, UUID de RA, endereço
5–240 caracteres e lista de 1–100 vínculos são exigidos. Bairro/setor, quando
informados, compõem `local`; não há coluna nova para eles. IDs de ocorrência,
fonte, versão de identidade, estados e autoria não são recebidos do cliente.
Vínculos repetidos são recusados inclusive com variação de caixa no UUID.

O SQL usa UUID gerado no servidor, origem/identidade manual e fonte/versão
explicitamente sintéticas. As colunas policiais desconhecidas permanecem nulas.
São aceitos somente RA/naturezas do catálogo de ensaio; vigência e pertencimento
ao limite **sintético** são verificados. O retângulo não homologa cartografia DF:
`geometria` permanece nula, `localizacao_status='referencia_pendente'` e
`consolidacao_status='em_revisao'`. Coordenadas numéricas são preservadas, não
inventadas. Naturezas ficam `pendente`, sem categoria ou mapeamento fabricados.
Não há implementação da Central nem geração/resolução completa de diagnósticos.

Uma nova chave UUID de comando não representa uma identidade policial. A baseline
não contém regra aprovada de unicidade de cadastro manual por conteúdo: comandos
distintos não são fundidos por semelhança. A identificação duplicada coberta é o
reenvio do mesmo comando, com replay idempotente; chave repetida com conteúdo
divergente retorna conflito. UUID de ocorrência fornecido pelo cliente é recusado.
Deduplicação manual de negócio permanece pendente da decisão da Etapa 2.12.

## Identidade e privilégios

O adaptador de sessão existe apenas no harness de testes, com tokens opacos
aleatórios em memória. Não é novo login nem cria contas de aplicação. Sessão
ausente/adulterada/revogada e Analista são negados pelo serviço. Não conectar esse
adaptador ao login local para liberar escrita humana: a limitação da Etapa 2.12
continua válida. O cliente não escolhe callback, credencial, role ou manifesto.

| Role exclusiva do cluster novo | Capacidade |
| --- | --- |
| `sentinela_sbx_admin` / `sentinela_sbx_operator` | LOGIN SCRAM, limite 3; CONNECT/USAGE, metadados mínimos de atestação e EXECUTE somente no cadastro experimental. Sem DML direto. |
| `sentinela_sbx_analyst` | LOGIN SCRAM, limite 2, identidade mínima; sem EXECUTE no cadastro. Role negativa para ensaio, não usuário real. |
| `sentinela_sbx_owner` | NOLOGIN, proprietário apenas da função, não das tabelas; grants limitados e RLS para executar o comando. |

Todas têm NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOINHERIT,
sem memberships. A role reader não é reutilizada ou habilitada. O HBA novo permite
as roles técnicas somente em `127.0.0.1:55432/sentinela_rls_sandbox` e recusa outras
combinações. Não modifica o HBA operacional nem o de sandbox anterior.

A função SECURITY DEFINER tem search_path pg_catalog fixo e nomes qualificados;
PUBLIC e Analista não a executam. A entrada recebe somente JSON estrito e chave
de comando, sem ator/perfil. O ator é `session_user` autenticado nativamente;
GUC ou UUID no payload não o substitui. A auditoria é `ator_tipo='servico'`,
`usuario_id=NULL`, serviço igual à role SQL sintética, nunca pessoa de produção.
Possuir a senha técnica permite invocar o serviço sintético diretamente no SQL:
essa é uma capacidade privada de teste, não prova de sessão humana. A separação
de roles impede que a credencial do Operador simule a role do Administrador.

O owner recebe SELECT/INSERT mínimos para a função; não UPDATE/DELETE. As seis
policies reader existentes permanecem intactas. São acrescentadas seis policies
de sandbox em `sentinela` e três nas duas tabelas auxiliares, todas sob RLS
ENABLE/FORCE. Nenhum trigger/constraint é removido ou desabilitado. Os 19 objetos
de tabela da baseline, 34 FKs, 77 índices, 55 triggers e 17 funções originais
permanecem com definições idênticas. O ledger oficial não ganha 0006 ou versão
fictícia; o manifesto registra o propósito e os hashes dos novos artefatos.

## Atomicidade, auditoria e isolamento

Cada chamada usa BEGIN, atesta novamente servidor/role, chama a função com
parâmetros, valida o resultado e faz COMMIT. Erros recebem mensagem genérica;
somente SQLSTATE sanitizado pode aparecer em evidência privada. Conexão com erro
é descartada após tentativa de ROLLBACK; não há retry automático.

Advisory lock transacional serializa `(session_user, chave)`; SHA-256 do JSONB
detecta conteúdo divergente. Ocorrência, associações, evento e resultado
idempotente são gravados atomicamente. O evento guarda antes nulo e depois com
projeção e entrada sintéticas; `transacao_id`/instante vêm do trigger existente.
`request_id` correlaciona a chave de comando, não identifica a pessoa. Falha
após inserir o pai/primeiro vínculo não deixa linhas nem comando idempotente.
Perda de conexão no COMMIT é resultado desconhecido: não anunciar sucesso nem
gerar nova chave; o serviço não repete automaticamente. Esse cenário de rede
não foi injetado na homologação real desta entrega.

O runtime só conhece host literal 127.0.0.1, porta 55432 e banco de sandbox.
Exige `NODE_ENV=development`, flag exclusiva no processo, UUID explícito, propósito,
fase, caminho privado sem redirecionamento, marcador, PID, system identifier,
horário de start e atributos efetivos da role. Porta 5432, banco operacional,
host remoto, postgres e identidade divergente são recusados antes da escrita.
O controlador também atesta listener/HBA/PID e preserva todos os sandboxes antigos.

Só `operational_snapshot()` consulta 5432, explicitamente como referência READ
ONLY via autenticação privada existente. Compara metadados/ACLs/ledger e hashes
de linhas das 19 tabelas antes/depois; não guarda registros pessoais. Isso
comprova igualdade dos estados observados, não monitoramento contínuo de ações
de terceiros. As conexões administrativas desta execução são as referências
de leitura e a instalação no cluster novo, nunca o runtime de cadastro.

Qualidade reproduzível, sem executar novamente o ensaio SQL:

```powershell
pnpm typecheck
node node_modules/typescript/bin/tsc --project database/local/write-sandbox/tsconfig.json --noEmit
pnpm lint
pnpm test
pnpm validate:contracts
pnpm check:routes
node scripts/build-validation.mjs
```

O OpenAPI operacional continua marcando POST/PATCH/inativação como planejados.
Nenhuma rota, flag da aplicação principal, formulário ou permissão SQL operacional
é ativada. Edição, inativação, identidade humana e cartografia oficial continuam
fora deste ensaio.

## Carga canônica de RAs (2.17.2)

O ensaio opcional abaixo cria outro cluster privado e homologará a carga inicial,
UUID preexistente, reexecução idempotente, conflitos, rollback, vínculos e GET:

```powershell
python -B database/local/write-sandbox/run-geography.py --execute --bindings --catalog
```

Não é instalador operacional: banco/porta/identidade diferentes são recusados.
Não retirar os guards para usá-lo em 5432. A baseline é imutável; as fixtures de
conflito são inseridas e revertidas em subtransações. A carga gera UUIDs novos por
DEFAULT SQL e preserva os preexistentes, sem reutilizar os IDs da interface.

A evidência privada `catalog-get-tests.json` contém apenas a projeção pública
`{id,nome}`, testes e metadados, sem senha. Ela pode alimentar os GETs interceptados
do ensaio visual, por variável exclusiva do processo:

```powershell
$env:SENTINELA_BROWSER_CATALOG_EVIDENCE = '<pasta-de-evidencias-do-novo-sandbox>\catalog-get-tests.json'
node --experimental-strip-types scripts/check-occurrence-workflows-browser.mjs
```

Isso não conecta o Next ao sandbox nem altera o provedor de autenticação.
O cenário sintético explícito mantém suas fixtures estáticas; as cópias de GET
usam os UUIDs persistidos do novo ensaio e continuam pendentes no escopo operacional.
Veja [plano e limites](../../../docs/catalogo-ras-carga.md).
