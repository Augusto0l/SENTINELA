# SENTINELA — Editar registros e excluir arquivos na aplicação

24 de novembro de 2026 · `/ocorrencias` · **Arquivos importados**

## Causa do bloqueio

A configuração local aponta para `http://localhost:3000`, no modo integrado com provedor local. Esse modo seleciona a porta PostgreSQL 55484 e admite a consulta, separada da escrita administrativa. A página passava `management=false` para a aba porque `occurrenceManagementMode()` exige, entre outras verificações, o modo sintético na porta 55488 e `SENTINELA_OCCURRENCE_MANAGEMENT=1`. Quando a aba usava o histórico de leitura, ela passava uma string como ação aos botões. O componente aplicava `aria-disabled` e o clique retornava sem disparar o endpoint. No início, havia processos em 3000 e 55484 e nenhuma instância sintética em escuta em 3318 ou 55488. A identificação foi feita pela configuração e pelas portas locais, sem conexão ao banco operacional.

O indicador **PostgreSQL conectado** atestava somente a leitura. Permissão de escrita, funções de gestão instaladas e impacto no lote exigiam verificações próprias.

## Correção

- A aba agora consulta `GET /api/v1/ocorrencias/gestao?view=disponibilidade`. O servidor distingue ambiente bloqueado, perfil sem permissão, banco sem escrita e gestão disponível. A consulta verifica a sessão local, atesta a conexão sintética e confere a possibilidade de abrir uma transação de escrita e executar as funções instaladas. Falhas técnicas ficam explícitas na interface.
- A lista de lotes devolve a elegibilidade da consulta para edição e os bloqueios da exclusão. A checagem de exclusão reaproveita a função de prévia do PostgreSQL. O diálogo volta a consultar o impacto no clique, e a transação recalcula e valida a revisão do plano antes de excluir.
- A edição reaproveita a consulta por UUID e a revisão auditada PCDF. A exclusão chama a função transacional de remoção física e exibe o comprovante administrativo depois do commit. Permanecem os controles de perfil, Host, Origin, atestação do banco, RLS, confirmação e integridade referencial.

## Abrir a homologação manual

Pré-requisitos no Windows: Node 22 e pnpm 10.34.3 conforme `.mise.toml`, dependências instaladas com `pnpm install --frozen-lockfile`, Python 3 e PostgreSQL 17.11 com PostGIS 3.6.2. O lançador usa os binários em `C:/Program Files/PostgreSQL/17/bin` e exige as portas de homologação 3318 e 55488 livres.

Na raiz `D:\Projetos\SENTINELA`, em um terminal interativo, execute:

```powershell
python -B database/local/pcdf-sandbox/qualify-management.py --serve
```

Defina uma senha exclusiva para esta sessão, de 12 a 1024 caracteres, no prompt sem eco. Abra `http://127.0.0.1:3318/ocorrencias` e entre como `admin.homologacao@example.test`. Abra **Arquivos importados**. Dois lotes PCDF sintéticos são preparados no PostgreSQL descartável pelo receptor existente. É possível corrigir um registro, recarregar a página, abrir a prévia de outro lote e excluí-lo. Use **Comprovantes de exclusão** para consultar a baixa administrativa.

O lançador cria contas e credenciais próprias de homologação, instala o schema em um cluster novo, atesta a identidade e mantém o PostgreSQL e o Next.js ativos até `Ctrl+C`. A aplicação de leitura da porta 3000 usa sua configuração própria.

O comando interativo foi verificado no Windows. Após autenticar a conta de homologação, o lançador confirmou a disponibilidade dos dois lotes. Depois de `Ctrl+C`, o log confirmou o encerramento do PostgreSQL e as portas 3318 e 55488 ficaram livres. Os arquivos temporários de credenciais e o lock de validação foram removidos.

Para reproduzir o ensaio integrado com Edge instalado:

```powershell
python -B database/local/pcdf-sandbox/qualify-management.py --browser
```

## Prova no navegador e no PostgreSQL

O ensaio abriu o formulário de login do Next.js e navegou até a aba com a sessão criada pelo provedor local. O Edge exerceu as ações a 1440 e 390 px. Os pedidos de edição e exclusão chegaram diretamente ao servidor em `127.0.0.1:3318` e a aplicação gravou no PostgreSQL 17.11 com PostGIS 3.6.2 em `127.0.0.1:55488`. [Botões no desktop](../evidencias/correcao-botoes-editar-excluir-2026-11-24/arquivos-1440.png), [menu mobile](../evidencias/correcao-botoes-editar-excluir-2026-11-24/arquivos-390.png).

- **Edição**. Os dois tamanhos salvaram uma alteração de local com justificativa e reencontraram o valor após recarregar a página. Consultas SQL confirmaram os eventos de auditoria e a preservação do conteúdo original em staging. [Formulário desktop](../evidencias/correcao-botoes-editar-excluir-2026-11-24/pcdf-1440.png), [formulário mobile](../evidencias/correcao-botoes-editar-excluir-2026-11-24/pcdf-390.png).
- **Exclusão física**. O desktop confirmou que cancelar preserva o lote. No mobile, o Administrador abriu a prévia e excluiu um pacote PCDF v2. SQL encontrou zero lotes, execuções, linhas de staging, origens, pendências, entregas e eventos exclusivos após o commit. Uma segunda conexão confirmou a ausência e o único comprovante. O indicador de associações ativas passou de 11 para 9. [Prévia mobile](../evidencias/correcao-botoes-editar-excluir-2026-11-24/exclusao-previa-390.png), [comprovante](../evidencias/correcao-botoes-editar-excluir-2026-11-24/comprovantes-390.png), [resultado e contagens SQL do ensaio](../evidencias/correcao-botoes-editar-excluir-2026-11-24/exclusao-navegador.json).
- **Bloqueios**. Operador e Analista receberam 403 para as duas mutações. Um lote consolidado sem suporte suficiente teve exclusão bloqueada na linha e recebeu 409 do servidor. Na confirmação, justificativa ausente e UUID diferente mantiveram o envio indisponível. Uma execução do Next.js sem autorização de gestão exibiu os botões desabilitados e rejeitou as duas escritas com 403, enquanto consultava o histórico PCDF sintético. [Ambiente bloqueado](../evidencias/correcao-botoes-editar-excluir-2026-11-24/ambiente-bloqueado.png).

## Verificações e regressões

| Validação | Resultado |
| --- | --- |
| `pnpm test` com Node 22 | 274 aprovados e 3 pulados por dependerem de ambientes específicos. |
| PostgreSQL 17.11 e PostGIS 3.6.2 | 16 testes de gestão no cluster descartável. As verificações incluem reaproveitamento de origem compartilhada, RLS, auditoria, perfil somente leitura e atestação divergente. |
| `pnpm typecheck`, `pnpm lint` e `pnpm validate:contracts` | Aprovados. |
| `node scripts/build-validation.mjs` | Build Next.js aprovado com saída separada da instância de desenvolvimento da porta 3000. |
| `git diff --check` | Aprovado. O Git sinalizou conversões futuras de final de linha nos arquivos já modificados da árvore local. |
| Playwright no Edge, 1440 e 390 px | Edição PCDF, exclusão física, perfis e ambiente sem autorização verificados. Os ensaios também verificaram a prévia PCDF v2, a consulta no dashboard e no mapa, a edição e inativação de ocorrência manual e a auditoria. |
| `python -B database/local/pcdf-sandbox/qualify-management.py --manual-browser` | Cadastro, edição e consulta após reinício do Next.js aprovados. A execução dedicada repetiu a verificação do formulário após ampliar o tempo limite do teste. [Resultado da verificação](../evidencias/correcao-botoes-editar-excluir-2026-11-24/regressao-cadastro-manual.json) |

## Autorização operacional

A instalação de leitura da porta 3000 permanece sujeita ao bloqueio do servidor. Qualquer ativação operacional exige aprovação específica do destino e do lote, revisão das permissões e migrações, além da comprovação de backup e capacidade de recuperação. O ensaio foi limitado ao PostgreSQL/PostGIS sintético e a arquivos de origem fabricados.
