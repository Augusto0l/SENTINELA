# Consulta persistente de ocorrências — Etapa 2.10

A rota `/ocorrencias` utiliza exclusivamente GET `/api/v1/ocorrencias` e GET
`/api/v1/ocorrencias/{id}`, com cookies da sessão local. A autorização continua no
servidor e nos handlers. Não há conexão PostgreSQL no navegador, fallback para
mocks, escrita nem alteração das APIs homologadas.

## Contrato e controles

- Busca por identificação → `identificacao`; localização → `local`.
- RA → `raId`; natureza → `naturezaId`, ambos UUIDs reais. Como não existem
  endpoints autorizados para listar catálogos, os seletores demonstrativos foram
  substituídos por campos de UUID. Não são utilizados IDs dos catálogos fictícios.
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

As respostas são validadas com Zod. UUIDs, nulos e múltiplas naturezas são
preservados, sem duplicar ocorrências por associação. Consultas obsoletas são
canceladas e ignoradas. O diálogo usa o UUID real, consulta sob demanda e mantém
Escape, fechamento por botão, foco e estados independentes de erro/carregamento.

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
homologação manual da Etapa 2.9 informada pelo usuário permanece uma evidência
anterior distinta. Não declarar restaurabilidade, escrita ou RLS não vazio a
partir deste teste da interface. Cadastro, edição e inativação persistentes exigem
uma etapa própria de autorização, contratos, privilégios mínimos e auditoria.

## Evidências desta implementação

138 testes automatizados aprovados, incluindo oito novos testes do cliente.
Qualificação isolada: 165 verificações aprovadas, zero falhas; um grupo de
semântica PostgreSQL/RLS não vazia explicitamente não exercitado. Foram 26 grupos
visuais com respostas HTTP contratuais e três verificações visuais de erro 503
real sem configuração PostgreSQL. Os dois temas nos quatro tamanhos passaram,
assim como o Header compartilhado no Dashboard/Mapa. O servidor exclusivo foi
encerrado e as contas/sessões sintéticas removidas.

TypeScript, ESLint, contratos/OpenAPI, rotas, build Next.js isolado e
`git diff --check` aprovados. Nenhum marcador de URI administrativa ou operacional
foi encontrado nos bundles do navegador. A credencial operacional não estava
disponível; a tela vazia com HTTP 200 do PostgreSQL real permanece pendente do
comando interativo acima. Nenhuma conexão PostgreSQL/Supabase foi feita neste
ensaio; nenhum dado ou configuração de banco foi alterado.
