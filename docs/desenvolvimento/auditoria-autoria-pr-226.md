# Autoria e integração da Sprint 4

O PR #226 foi integrado por `f98ec07`, com base `e943ae4` e cabeça
`24bd59f`. A comparação dos dois pais do merge e a consulta ao GitHub
confirmam 12 commits de trabalho. Todos registram Pedro Augusto como
autor e committer no Git, resolvidos pelo GitHub como `Augusto0l` nos
dois campos. Os 12 não contêm trailers de coautoria. O commit de merge
registra Pedro Augusto como autor e GitHub como committer. A descrição
do PR informa 11 commits, número que antecede o último ajuste de CI.
[PR #226](https://github.com/CAMPUSCEUB/Sentinela/pull/226)

| Commit | Alterações efetivamente incluídas |
| --- | --- |
| `472fe94` | Recuperação e backup PostgreSQL, configurações de publicação e testes. |
| `de1353f` | Login local, permissões e elementos de interface e teste. |
| `1e32687` | Catálogo das 37 RAs, scripts de verificação, vínculos e cartografia. |
| `fd6af57` | APIs de ocorrências, contratos de mutação e SQL do laboratório. |
| `08be68c` | Cadastro, edição e inativação na interface local. |
| `fcb57ac` | Parser, staging, importação e rastreabilidade PCDF sintética. |
| `95ad411` | Central de Revisão, rotas e autorização de decisões. |
| `78a7f75` | Consulta analítica, Dashboard e componentes cartográficos compartilhados. |
| `50dc711` | Integração da tela do Mapa e verificação analítica no navegador. |
| `b79b9a9` | Ensaios integrados, autorização e atualização de contratos da API. |
| `c6b9372` | Roteiros, documentação técnica e registros da Sprint. |
| `24bd59f` | Encerramento da árvore de processos de recuperação no Linux e regressão correspondente. |

## Contribuições verificadas na base integrada

O PR #224 tem quatro commits com autores e committers diferentes, cada
um reconhecido pelo GitHub. No PR #225, há exemplos de autores distintos
com Pedro Augusto como committer. Os diffs e o `git blame` no merge do
#226 demonstram que partes dessas entregas fazem parte da base usada
pela integração. [PR #224](https://github.com/CAMPUSCEUB/Sentinela/pull/224) ·
[PR #225](https://github.com/CAMPUSCEUB/Sentinela/pull/225)

| Integrante | Trabalho verificável |
| --- | --- |
| João Pedro Roriz Costa (`JPedra121`) | `799fe92` introduziu o provedor de autenticação local com três perfis. `132cf67` integrou a interface à leitura de ocorrências e adicionou o executor HTTP. No merge do #226, o blame preserva 83 linhas de `799fe92` em `local-provider.ts` e 343 de `132cf67` em `Occurrences.tsx`. [Autenticação](https://github.com/CAMPUSCEUB/Sentinela/commit/799fe92) · [Ocorrências](https://github.com/CAMPUSCEUB/Sentinela/commit/132cf67) |
| Pedro Felizardo Barbosa (`pedro-f-barbosa`) | `2e2c00e` acrescentou a proteção DACL das contas locais. `3346f59` implementou a troca atômica de HBA e recuperação controlada. No merge do #226, o blame preserva as 59 linhas de `local-auth-acl.ps1` de `2e2c00e`. [DACL](https://github.com/CAMPUSCEUB/Sentinela/commit/2e2c00e) · [HBA](https://github.com/CAMPUSCEUB/Sentinela/commit/3346f59) |
| Henrique Rabelo Rega (`hrrega`) | `992fdf9` implementou a revogação de sessão no logout com proteção CSRF. `63b3cdb` adicionou o planejamento da recuperação. As 39 linhas de `LogoutForm.tsx` continuam atribuídas a `992fdf9` no merge do #226. [Logout](https://github.com/CAMPUSCEUB/Sentinela/commit/992fdf9) · [Recuperação](https://github.com/CAMPUSCEUB/Sentinela/commit/63b3cdb) |
| Arthur de Jesus Lira Rojas (`BonnBonn-stack`) | `0b58c38` corrigiu o referer dos tiles e testou os mapas no navegador. `fe37213` introduziu o executor isolado de RLS. No merge do #226, o blame mantém as três linhas de `tile-policy.ts` de `0b58c38` e as 154 de `complete_rls.py` de `fe37213`. [Mapas](https://github.com/CAMPUSCEUB/Sentinela/commit/0b58c38) · [RLS](https://github.com/CAMPUSCEUB/Sentinela/commit/fe37213) |
| Pedro Augusto (`Augusto0l`) | `e253cc3` implementou o caminho de leitura PostgreSQL, com 13 linhas preservadas em `occurrences.ts` no merge do #226. A integração dos 12 commits do #226 está registrada na mesma identidade. [API de leitura](https://github.com/CAMPUSCEUB/Sentinela/commit/e253cc3) · [Correção de CI](https://github.com/CAMPUSCEUB/Sentinela/commit/24bd59f) |

O histórico sustenta o crédito pelas contribuições acima nos seus
commits de origem. A discussão do #226 e os arquivos inspecionados
não apresentaram patches, trailers ou confirmação verificável que
justifiquem reatribuir um dos 12 commits ou incluir coautores neles.
Responsabilidades da Sprint e autoria anterior de um módulo servem
para orientar a investigação de um trecho.

## Texto proposto para o PR #226

> Esta entrega foi integrada em `f98ec07` e contém 12 commits, incluindo
> o ajuste de CI `24bd59f`. Ela usa como base as contribuições já
> registradas de João Pedro Roriz Costa para autenticação e ocorrências,
> Pedro Felizardo Barbosa para DACL e HBA, Henrique Rabelo Rega para
> logout e recuperação, Arthur de Jesus Lira Rojas para mapas e RLS e
> Pedro Augusto para leitura PostgreSQL. Os commits de origem estão
> vinculados no registro de autoria da Sprint 4.

## Critério para a entrega local

A sessão de trabalho registra a implementação assistida das mudanças
locais de homologação e limpeza, solicitadas pelo titular da conta
`Augusto0l`. A identidade Git de Pedro Augusto foi comparada com o
perfil autenticado e com a associação que o GitHub retorna para os
commits existentes. Nos novos commits locais, Pedro é a identidade da
entrega assistida e o committer, com a assistência registrada na
mensagem. Esse registro não atribui edição manual individual a outros
integrantes. Uma futura alegação de coautoria deve vir acompanhada de
um patch, versão de origem ou confirmação vinculada a um trecho.
