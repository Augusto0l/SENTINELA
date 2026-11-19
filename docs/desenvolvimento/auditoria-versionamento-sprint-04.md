# Auditoria de versionamento da Sprint 4

## Entrada e base institucional

A branch `feat/sprint4-auth-local-mapas` estava no HEAD
`fe874f68e4d6e36f9661fb00b683ecddad4c3ea9`, com 78 arquivos modificados,
167 não rastreados e índice vazio. A [lista completa por grupo](../../sprints/sprint-04-inventario-versionamento.txt)
preserva os caminhos e o estado de entrada.

As referências locais indicam que as entregas anteriores já estão
integradas a `ceub/main`. A ancestralidade foi conferida para a Sprint 1
(`6014e89`), as entregas de integração e analytics da Sprint 2
(`626ab00`) e os contratos e a homologação da Sprint 3 (`33f6bf5` e
`1747385`). As três fichas de Sprint anteriores estavam sem alterações.
As mudanças pendentes em peças compartilhadas da interface, analytics e
contratos pertencem à evolução da Sprint 4.

Na Sprint 4, `50a7c14` e `da861e0` são ancestrais de `ceub/main`.
A referência institucional local está em `2c4952b`. O segundo pai do
merge #224 é `0b58c38`. Os dez commits de `005f1f0` a `fe874f6`
já estão versionados na branch atual e o `git cherry ceub/main HEAD`
os indica como exclusivos nesse comparativo. A proposta usa o HEAD
atual como base e preserva esse histórico.

## Autoria comprovável

O histórico distingue autor de committer. A configuração Git efetiva
seleciona Pedro Augusto nos dois campos, como em `fe874f6`. Ela fornece
uma identidade técnica de assinatura, enquanto a autoria das alterações
pendentes exige evidência por entrega. As sessões de Codex documentam
etapas e evidências de execução. Elas não registram a contribuição humana
por arquivo ou por trecho dos grupos acumulados.

| Perfil indicado | Evidência no histórico local | Tratamento da árvore atual |
| --- | --- | --- |
| JPedra121 | João Pedro Roriz Costa figura como autor de `799fe92` (login local) e `132cf67` (interface de ocorrências). A ligação entre o handle e a identidade Git não aparece nos metadados consultados. | Autoria pendente por alteração. |
| BonnBon-stack | Arthur de Jesus L. Rojas figura em `33f6bf5`, com handle GitHub registrado no e-mail noreply como `BonnBonn-stack`; Arthur de Jesus Lira Rojas figura em `fe37213` (ensaio RLS) e `0b58c38` (mapas). A grafia fornecida difere do histórico. | Autoria pendente por alteração. |
| Augusto0l | Pedro Augusto figura em `04fde6c` (reader RLS), `e253cc3` (API de leitura) e `fe874f6` (relatório). A ligação entre o handle e a identidade Git não aparece nos metadados consultados. | Autoria pendente por alteração. |
| hrrega | Henrique Rabelo Rega figura em `992fdf9` (logout e CSRF), `50a7c14` (modelo PostgreSQL) e `63b3cdb` (recuperação). A ligação entre o handle e a identidade Git não aparece nos metadados consultados. | Autoria pendente por alteração. |
| pedro-f-barbosa | Pedro Felizardo Barbosa figura em `2e2c00e` (DACL) e `3346f59` (HBA). A ligação entre o handle e a identidade Git não aparece nos metadados consultados. | Autoria pendente por alteração. |

Os hashes permitem consultar nome e e-mail históricos com `git show`.
O histórico de um módulo não estabelece autoria das mudanças atuais.
Nenhum grupo tem evidência suficiente para assinatura ou
`Co-authored-by`. Nenhum arquivo foi preparado e nenhum commit foi criado.

## Ordem proposta dos commits

| Ordem | Mensagem proposta | Limite funcional |
| --- | --- | --- |
| 1 | `fix(sprint4): atualiza dependencias e protege builds hospedados` | Pacotes, lockfile, guarda e teste. Separar configuração comum de parâmetros que só existem no ensaio PCDF. |
| 2 | `feat(sprint4): prepara backup e recuperacao descartavel` | Scripts de recuperação, atestação, evidência resumida e testes de recuperação. |
| 3 | `feat(sprint4): versiona catalogo oficial das regioes administrativas` | Migration, catálogo, ledger, validação e atributos que preservam os hashes. Separar execução operacional da migration revisada. |
| 4 | `feat(sprint4): valida cartografia e vinculos das regioes` | GeoJSON oficial, fonte, manifesto, vínculos, validação territorial e testes. |
| 5 | `feat(sprint4): integra sessao local e permissoes` | Login, cookies, sessão, papéis e guardas de rota. Introduzir somente regras das rotas já presentes naquele commit. |
| 6 | `feat(sprint4): integra leitura e crud de ocorrencias` | SQL de laboratório e API com autoria, endereço, histórico e versão. Subdividir SQL e interface se cada commit mantiver suas dependências. |
| 7 | `feat(sprint4): integra staging e consolidacao pcdf` | Parser, correlações, lote idempotente, promoção e tela de importação. |
| 8 | `feat(sprint4): integra central de revisao` | Contrato compartilhado, API, correções administrativas, histórico e navegação. Pode entrar junto do PCDF quando a função SQL comum exigir. |
| 9 | `feat(sprint4): integra analytics e mapas persistentes` | Consulta, projeção, indicadores, filtros e UI. Integrar analytics PCDF com o banco de ensaio quando o contrato comum exigir. |
| 10 | `test(sprint4): automatiza homologacao e valida contratos` | Runners, validações e documentação gerada de OpenAPI. Levar testes unitários e seus contratos ao commit funcional quando forem parte do aceite. |
| 11 | `docs(sprint4): registra evidencias e roteiro de homologacao privada` | Guias, relatórios, inventários aprovados e procedimento de implantação. |

Arquivos compartilhados incluem `src/proxy.ts`, `src/lib/auth/policy.ts`,
`src/lib/db/isolated-write-mode.ts`, `src/lib/db/pcdf-workspace.ts`,
`src/contracts/openapi.ts`, o JSON gerado e o runner integrado. Revisar
por trecho e manter esquema, SQL, rota e fixture compatíveis. A ordem
acima é um plano de revisão. Os testes nesta auditoria são da árvore
completa. Cada commit futuro exige validação do próprio conteúdo.

## Exclusões e limites da inspeção

O índice permaneceu vazio. `.env.local`, arquivos de sessão, arquivos
de senha, chaves, dumps, logs, pastas temporárias e builds devem
permanecer locais. A busca por padrões conhecidos apontou duas URIs de
exemplo em testes e documentação, compatíveis com placeholders. O maior
arquivo não rastreado é o GeoJSON oficial das RAs, com 4.579.922 bytes.
Não apareceu arquivo histórico PCDF entre os candidatos.

Documentos de recuperação e de auditoria de RAs referenciam caminhos
privados e identificadores de infraestrutura. Revisar esses trechos e
os manifestos de destino antes de aprovar qualquer publicação.
`AGENTS.md` contém mudança no bloco gerado pelo Next.js e fica em revisão
separada. A inspeção por padrões e nomes não substitui a revisão do
diff preparado.

## Condição para versionar

Registrar, por grupo ou trecho, a pessoa que realmente contribuiu, o
nome e e-mail aprovados e a evidência da contribuição conjunta, quando
houver. Com essa confirmação, preparar só o conjunto correspondente,
conferir `git diff --cached` e `git diff --cached --check` e preservar
a identidade do committer que executar a ação. A preparação do banco
persistente de homologação continua dependente de autorização própria.

## Validações e fechamento

Passaram 241 testes Node e 11 SQL/HBA estáticos, com zero falhas.
TypeScript, ESLint, contratos, OpenAPI, verificação de rotas e build de
produção passaram. A validação de contratos contou 36 schemas, 18
caminhos, 21 operações e 32 payloads. A verificação de rotas encontrou
9 páginas previstas e resolveu 447 imports locais. As checagens de
whitespace da árvore e do índice passaram. O índice estava vazio.
As validações não executaram migrations ou ensaios em PostgreSQL.

O HEAD e as referências locais `ceub/main` e
`ceub/feat/sprint4-auth-local-mapas` mantiveram os mesmos valores.
A auditoria acrescentou este relatório e o inventário, que também ficaram
fora do índice.
