# Consulta persistente de ocorrências — Etapa 2.10

A rota `/ocorrencias` utiliza GET `/api/v1/ocorrencias`, GET
`/api/v1/ocorrencias/{id}` e os dois [catálogos persistentes](catalogos-persistentes.md), com cookies da sessão local. A autorização continua no
servidor e nos handlers. Não há conexão PostgreSQL no navegador, fallback para
mocks, escrita nem alteração das APIs homologadas.

## Contrato e controles

- Busca por identificação → `identificacao`; localização → `local`.
- RA → `raId`; natureza → `naturezaId`, ambos UUIDs reais. Desde a Etapa 2.11,
  seletores por nome consultam os catálogos persistentes autorizados. Não são
  utilizados IDs dos catálogos fictícios nem entrada manual de UUID.
- Período → `startDate` e `endDate`, datas civis ISO inclusivas; extremos são
  opcionais. Datas impossíveis, período invertido e UUIDs inválidos são recusados
  antes da requisição, além da validação independente da API.
- Aplicar envia todos os filtros, retornando à página 1. Digitar não consulta.
  Limpar remove os filtros, preservando a ordenação escolhida.
- Ordenação permitida: `data`, `horario`, `identificacao`, `local`, `ra`, com
  `direction=asc|desc`. Identificação ordena pelo número do registro conforme o
  contrato existente, não pelo UUID exibido. O backend desempata por UUID.
  Naturezas não são ordenáveis; o contrato não oferece essa opção.
- Paginação no backend: `page` e `pageSize=25`, máximo contratual 100. Total e
  quantidade de páginas vêm da API; uma página que deixe de existir é ajustada
  para a última válida. Total zero não fabrica páginas nem registros.
- O filtro demonstrativo de inativas não foi mantido: a consulta atual não
  oferece esse parâmetro. Nenhuma semântica adicional foi inventada no cliente.

As respostas são validadas com Zod. Categoria mapeada pode ter
`codigo: null`, conforme a coluna opcional `categorias_criminais.codigo_interno`.
UUIDs, nulos e múltiplas naturezas são
preservados, sem duplicar ocorrências por associação. Consultas obsoletas são
canceladas e ignoradas. O diálogo usa o UUID real, consulta sob demanda e mantém
Escape, fechamento por botão, foco e estados independentes de erro/carregamento.

## Limite entre consulta e escrita

O modo local isolado disponibiliza cadastro em `/ocorrencias/nova`,
edição pela listagem e inativação confirmada pelo detalhe em
`/ocorrencias`. A seleção preenche o formulário com valores persistidos e
envia o UUID e a versão exibida. Depois da mutação o Next.js atualiza a lista.
A projeção isolada usa uma conexão de leitura própria. Os GETs operacionais
continuam na reader original.

Para homologar, execute `python -B database/local/write-sandbox/run-mutations.py --execute --next`.
O ensaio cria um cluster novo, inicia o Next.js apenas em loopback,
gera contas descartáveis e valida cadastro, edição e inativação pelo
navegador, com cookies emitidos pelo Next.js.
O recibo `next-write-tests.json` fica na pasta privada de evidências do cluster.

O ensaio com catálogo e ocorrências sintéticas executa os handlers HTTP
de leitura e as consultas SQL da aplicação com a reader autenticada de
um cluster descartável. Os principais dos três perfis são fixtures do
ensaio. O servidor HTTP de ensaio é separado do Next.js.

O escritor experimental em `database/local/write-sandbox` atesta um
cluster descartável e usa credenciais de escrita exclusivas do laboratório.
`003_individual_address.sql` vincula o login SQL a um UUID individual
sintético e acrescenta versões com endereço, bairro/setor e ponto PostGIS
SRID 4326. O local, a RA e as coordenadas permanecem na ocorrência.
O registro por versão exige o UUID vinculado a `session_user` e o evento
de auditoria da mesma transação. O provisionamento vale somente para as
contas descartáveis. Dados anteriores conservam o local original e mostram
endereço ausente até uma edição. `004_workspace_read.sql` acrescenta a
projeção de até 100 ocorrências sintéticas sob RLS. A baseline operacional
continua exigindo vínculo humano aprovado. A Central mantém autorização própria.

## Estados e segurança

Carregamento, base vazia, filtros sem correspondência, rede indisponível e contrato
inesperado têm mensagens distintas. HTTP 401 orienta novo login; 403 informa falta
de autorização; 404 informa registro indisponível; 400/422 informam filtros
inválidos; 503 informa indisponibilidade. Mensagens técnicas do servidor não são
exibidas. Nova ocorrência, Editar e Inativar estão desabilitados nesta listagem.
A rota de cadastro demonstrativo permanece identificada como simulação e informa
que não alimenta a listagem persistente. Dashboard e Mapa mantêm seus mocks.

## Verificação reproduzível

Sem senha PostgreSQL:

```powershell
pnpm check:occurrences
```

Esse comando cria um servidor Next.js exclusivo em IPv4 loopback na porta 3317,
com contas sintéticas e artefatos isolados. Recusa porta ocupada. Valida sessões e
HTTP reais sem conexão ao banco: 503 é o resultado esperado. Em seguida, o
Playwright utiliza respostas HTTP contratuais **somente no teste** para exercitar
lista preenchida, filtros, concorrência, detalhes, erros, paginação e temas nos
tamanhos 1366, 768, 390 e 320 px. Não insere fixtures no banco. O processo criado
pelo teste é identificado antes de encerrado. Evidências e screenshots ficam em
`%USERPROFILE%\.sentinela-local\http-qualification\<UUID>`, fora do Git.

Com a senha operacional existente, em PowerShell local:

```powershell
.\scripts\test-local-reader.ps1 -Interface
```

A senha é solicitada com entrada oculta e passada somente no ambiente do processo;
não é gravada no `.env.local`, em argumentos ou relatórios. O teste confirma a
identidade PostgreSQL/PostGIS, executa a matriz HTTP e verifica a **tela vazia real
com HTTP 200** nos três perfis. Falhas não recorrem à conexão administrativa. O
ambiente anterior é restaurado ao final. Nenhuma fixture é inserida. As respostas
preenchidas seguem simuladas no navegador e identificadas como tal no relatório.

Uma execução sem credencial não comprova integração PostgreSQL desta tela. A
homologação manual inicial da Etapa 2.9 informada pelo usuário permanece uma
evidência histórica distinta. A execução posterior com PostgreSQL real e interface
foi confirmada pela leitura do relatório privado descrito abaixo. Não declarar
restaurabilidade, escrita ou RLS não vazio a partir desse ensaio HTTP de base
vazia. Cadastro, edição e inativação persistentes exigem uma etapa própria de
autorização, contratos, privilégios mínimos e auditoria.

## Evidências desta implementação

138 testes automatizados aprovados, incluindo oito novos testes do cliente.
Qualificação histórica sem banco: 165 verificações aprovadas, zero falhas; um grupo de
semântica PostgreSQL/RLS não vazia explicitamente não exercitado. Foram 26 grupos
visuais com respostas HTTP contratuais e três verificações visuais de erro 503
real sem configuração PostgreSQL. Os dois temas nos quatro tamanhos passaram,
assim como o Header compartilhado no Dashboard/Mapa. O servidor exclusivo foi
encerrado e as contas/sessões sintéticas removidas.

TypeScript, ESLint, contratos/OpenAPI, rotas, build Next.js isolado e
`git diff --check` aprovados. Nenhum marcador de URI administrativa ou operacional
foi encontrado nos bundles do navegador. Nesse primeiro ensaio a credencial
operacional não estava disponível e a tela vazia com HTTP 200 ainda estava
pendente. Nenhuma conexão PostgreSQL/Supabase foi feita naquele ensaio sem banco.

## Homologação real posterior

Em 11/11/2026, a regularização documental conferiu por leitura o relatório privado
`2fcf4784-a48e-4d46-abc4-4f53d248e472`, modo `HTTP_AND_REAL_POSTGRESQL`,
`databaseTested=true`: **166 PASS, zero falhas e 54 respostas HTTP 200**. Os testes
`ui_Administrador_real_postgresql_empty_screen`,
`ui_Operador_real_postgresql_empty_screen` e
`ui_Analista_real_postgresql_empty_screen` estão aprovados. A antiga pendência de
tela vazia com PostgreSQL real foi, portanto, suprida por evidência posterior.

O operacional permaneceu vazio, sem fixtures. Um grupo ficou `NOT_EXERCISED`:
dados persistentes não vazios, múltiplas naturezas e linhas ocultas por RLS via
HTTP. As telas preenchidas continuaram sendo exercitadas por respostas contratuais
somente no teste, inclusive nos dois temas e quatro tamanhos. Isso não é um teste
de ocorrência não vazia recuperada do banco operacional.

A homologação SQL positiva/negativa das seis policies ocorreu separadamente, com
20 fixtures sintéticas em cluster isolado, conforme [relatório RLS](../database/local/sandbox/HOMOLOGACAO.md).
Unitários, simulados e testes Windows também permanecem classes distintas. O
[resumo consolidado das APIs](postgresql-leitura-local.md#homologação-real-confirmada-em-11112026)
registra a proveniência e o SHA-256 do relatório, sem copiar artefatos privados.

Não houve repetição de testes com senha ou alteração de bancos nesta atualização
documental. Relatório bruto, screenshots, contas e sessões não foram incluídos no
Git. Consulte o [ADR de leitura local](decisoes/adr-leitura-postgresql-local-homologacao-isolada.md)
e o [relatório acadêmico](../sprints/sprint-04.md). A avaliação institucional dos
ADRs, os critérios das issues e as operações persistentes de escrita continuam
pendentes; o teste de leitura não encerra toda a Sprint 4.

## Requalificação de leitura — Desenvolvimento Autônomo 01

Listagem e detalhe foram exercitados pelo handler HTTP com PostgreSQL/PostGIS
real e reader em cluster descartável. As duas ocorrências sintéticas visíveis
retornaram em páginas distintas, com ordenação explícita. Um filtro combinou
RA, natureza, data e local, e o detalhe preservou o vínculo de natureza.
A fixture fora da policy retornou `404`. Parâmetro inválido retornou `400`
e requisição sem principal retornou `401`. O repositório de ocorrências
agora também recusa identidades não locais ou desconhecidas antes do pool.

A integração da listagem, dos filtros e do detalhe foi preservada.
Dashboard, mapa e importação mantêm os fluxos demonstrativos. A credencial
da reader continua ausente do Next.js. [Evidência e escopo](catalogos-persistentes.md#requalificação-do-desenvolvimento-autônomo-01)

## CRUD no ambiente descartável

A listagem sintética em `/ocorrencias` abre o detalhe pelo identificador.
Administrador e Operador podem abrir o formulário preenchido de um registro
elegível. O formulário envia a versão carregada e a justificativa. A
inativação lógica pede confirmação explícita e motivo. Após a confirmação
da API a listagem é recarregada. HTTP 409 indica que a versão atual precisa
ser consultada antes de repetir a operação. O Analista tem acesso de leitura.
O cadastro entra em revisão. Os ensaios de edição e inativação usam registros
sintéticos já consolidados e elegíveis. A etapa de revisão e consolidação
fica fora desse roteiro de aceitação.

O cookie identifica uma sessão local validada no servidor. A conta contém
um UUID sintético provisionado no laboratório. A função SQL confere esse UUID
contra o vínculo de `session_user` e exige o evento da mesma transação para
registrar a versão. A auditoria técnica original e a autoria individual
sintética ficam correlacionadas pelo identificador do evento. O papel SQL
da conexão é técnico e o UUID representa a conta local de teste.

O local do fato, a RA e as coordenadas usam os campos-base da ocorrência.
Endereço e bairro ou setor ficam separados no histórico por versão, junto
ao ponto PostGIS `geometry(Point,4326)`, construído com longitude em X e
latitude em Y. Registros anteriores podem ter endereço e setor ausentes.
A inativação preserva o último endereço estruturado disponível.

[Evidências e limites da retomada](../sprints/sprint-04.md#retomada-do-crud-persistente)
