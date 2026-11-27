# Homologação funcional local — Sprint 4

**Apto para uso local sintético.** A rodada final homologou XLSX de 34
colunas e a Central de Revisão com busca e paginação. A régua técnica
chegou a 10/10, e a Sprint 4 permanece em 30/40.
[Evidências da rodada final](#resultado-da-rodada-final)

## Estado inicial e escopo

A execução partiu de `feat/sprint4-homologacao-persistente`, HEAD
`f98ec07`, com alterações sem commit. O trabalho anterior em documentação,
leitura, configuração do Next.js, guardas e testes foi preservado. O alvo
atestado permaneceu `127.0.0.1:55473/sentinela_sprint4_homologacao`,
system identifier `7709847064550752852`, PostgreSQL 17.11 e PostGIS 3.6.2.

O inventário inicial confirmou as migrations de baseline `0001` a `0005`,
`homolog-persist-0001`, `homolog-persist-0002`, 37 regiões, três leitores e
19 tabelas com RLS forçada. A cópia inicial `pre-funcional-04acd52f41ee.dump`
foi restaurada em `sentinela_sprint4_pre_04acd52f41ee` e reconciliada por
ledger, versão, geometria e inventário RLS. SHA-256
`b57d6bce6a9ae74aba91c7e7dba768b5a09b60d102b4576d749cbe0d2e77c1a7`.

## Mudanças de banco

| Migration | Resultado validado em conexão nova |
| --- | --- |
| `homolog-persist-0003` | CRUD de escopo sintético, catálogo manual de ensaio, comandos idempotentes, vínculo de autoria, histórico de edições e retirada lógica de associações. |
| `homolog-persist-0004` | Concessão restrita dos metadados PostGIS necessários ao gatilho diferido de histórico. |
| `homolog-persist-0005` | Staging, origem, revisão e promoção restritos à proveniência sintética. |

Os logins `s4_hom_admin_write` e `s4_hom_operator_write` executam
comandos aprovados em transações de escopo restrito. As rotinas de CRUD e
PCDF usam proprietários `NOLOGIN` e RLS forçada. Os leitores continuam
segregados da instalação e dos escritores. A Central confere o vínculo
dos sujeitos sintéticos e limita correções ao Administrador. A
reconciliação inclui as tabelas `sentinela`, `sentinela_homolog_crud`
e `sentinela_homolog_pcdf`.
[Dicionário do banco](dicionario-postgresql-homologacao.md)

## Evidências SQL

- CRUD com Admin e Operador em conexões reais. Foram verificados cadastro,
  replay das três mutações, conflito de versão, endereço versionado,
  retirada de associação, inativação e auditoria. O Analista recebeu
  negação ao tentar executar o comando. Os escritores receberam negação
  ao editar diretamente as tabelas de negócio ou consultar auditoria.
  Recibo privado `crud-sql-qualified.json`.
- O primeiro ensaio de edição encontrou uma dependência do gatilho
  diferido à serialização PostGIS. A migration `0004` concedeu somente
  os metadados necessários aos dois escritores. Os ensaios foram repetidos
  após a correção. Os registros sintéticos já confirmados foram preservados.
- A primeira tentativa de instalação incluiu as fixtures embutidas no
  SQL descartável e foi revertida por conflito de chave. O renderizador
  passou a excluir esse bloco. O catálogo atestado de 37 RAs continuou
  como referência espacial do CRUD.
- PCDF SQL com upload idempotente, XML de proveniência divergente
  recusado, leitura da fila por Analista, correção de horário
  exclusiva do Administrador e promoção de duas associações para uma
  ocorrência. A primeira promoção foi revertida e repetida. O reenvio
  posterior preservou a ocorrência existente. O registro promovido
  ficou sem RA ou ponto, com o valor original preservado em staging.
  Recibo privado `pcdf-sql-qualified.json`, execução
  `2c220f2d-71d3-45cc-8339-4c695874aa12`.
- A cópia `funcional-4836813af42d6566.dump`, anterior ao PCDF, foi
  restaurada em `sentinela_sprint4_restore_4836813af42d6566`.
  Houve igualdade de conteúdo e inventário em 27 tabelas. SHA-256
  `933d20ef7448e6746ef7eab12e85c6d08e932d63995f207bce8059167b8c5fb8`.
- A cópia funcional `funcional-b0a88c5432c8bddf.dump` foi restaurada
  em `sentinela_sprint4_restore_b0a88c5432c8bddf`. Conteúdo, RLS,
  constraints, triggers e policies coincidiram nas 30 tabelas. SHA-256
  `956f7c3bf17833b23568686a1139b18b55ff46c6c327bba484ef5dff66af232b`.

## Resultado por fase

| Fase | Estado | Evidência e escopo |
| --- | --- | --- |
| A — Auditoria e backup | Concluída | Identidade, inventário, ledger, vínculos e restore inicial separados e reconciliados. |
| B — CRUD | Concluída no escopo sintético | SQL real com os dois escritores, cadastro pelo Edge, detalhe, edição concorrente, inativação, replay e histórico conferido no banco. A leitura e a escrita usam credenciais distintas. |
| C — Importação | Parcial | CSV de 34 colunas, competência do fato, original, staging, replay e erros testados. Ensaio de 10.000 associações com rollback. XLSX e a matriz integral de casos de colisão e categorias ainda exigem qualificação. |
| D — Central de Revisão | Parcial | Fila, filtros existentes, revisão de horário, preservação do original, histórico sintético e bloqueio do Operador testados. Busca, paginação integral, outras correções e decisões pós-consolidação permanecem pendentes. |
| E — Consolidação | Concluída no escopo sintético aprovado | Duas associações para uma ocorrência, aprovação explícita, transação, rollback, reenvio e ausência de ponto quando falta referência espacial. |
| F — Dashboard | Concluída no recorte ensaiado | Navegação no Edge e consulta analítica após cadastro, inativação e consolidação. Os totais são reconciliados com a listagem. |
| G — Mapa Criminal | Concluída no recorte ensaiado | Navegação no Edge com a mesma consulta do Dashboard, ponto manual validado em uma RA e ausência de ponto inventado para a importação. A matriz visual de camadas e filtros segue para aceite específico. |
| H — Telas e permissões | Parcial | 25 respostas HTTP verificadas em nove rotas, com acessos e redirecionamentos dos três perfis. A matriz de permissões de CRUD/PCDF foi exercitada por HTTP. A revisão visual responsiva e a cobertura exaustiva da interação em cada tela seguem pendentes. |
| I — End-to-end | Concluída no cenário sintético principal | Recibo `http-2967fa3d-2036-4521-adb8-523fdade300d.json`. O fluxo integra Edge, HTTP, SQL, reinicialização, histórico e auditoria. |
| J — Qualidade | Concluída | 246 testes Node, 11 SQL/HBA, 14 de recuperação, typecheck, ESLint, contratos/OpenAPI, rotas e build. A automação corrigiu a leitura do status da resposta do Playwright e a confirmação de pontos anônimos pelo contrato analítico. |
| K — Estabilização local | Concluída no escopo do guia | Partida do PostgreSQL a partir do estado parado, atestação por comando único e Next.js restrito a loopback. O verificador do Windows foi movido para após a resposta inicial do Next.js. A reexecução confirmou a partida, e o encerramento liberou 3317. |
| L — Preparação para redesign | Concluída | Nove telas e componentes compartilhados documentados. |
| M — Modelagem futura PCDF | Concluída | Proposta e dicionário revisados com o contrato e a leitura documental do SENTINELA-DADOS. |

## Persistência e progresso

O ensaio `2967fa3d-2036-4521-adb8-523fdade300d` confirmou a ocorrência
`1dd4735a-d83b-44df-a466-68269971c1a8` inativa na versão 3, com três
versões, dois eventos no histórico de mutação e um evento de cadastro.
A ocorrência `e59de6de-c5a1-49b8-b2e6-81fed3b00d6a` ficou ativa na versão 1.
O lote PCDF `ff9a1cd4-bbc7-426d-9ec6-9c7f043b2920` manteve duas decisões,
duas associações e um único registro consolidado. Os UUIDs, o catálogo
e a contagem de seis ocorrências ativas foram reconferidos após o reinício
de PostgreSQL e Next.js. O `503` com o PostgreSQL parado confirmou que
o caminho de leitura depende do banco.

SHA-256 do recibo HTTP
`7c1788110f97e0a684c6940be25ecdcf000871c510fa96b5cd5fe5ee30f1ce55`.

A auditoria das nove rotas está em
`rotas-85509183-b66a-4a2c-8aa6-9380ad05f278.json`. O ensaio adicional
confirmou quatro ocorrências tanto na listagem quanto nos indicadores
ao combinar data, RA e natureza. A asserção de navegação passou a
resolver o cabeçalho de redirecionamento contra a origem de loopback
para aceitar os caminhos relativos do Next.js.

O ensaio de carga processou 10.000 associações e 5.000 chaves candidatas
em um CSV de 2.970.551 bytes. O rollback foi explícito e uma consulta
nova confirmou a ausência do lote de carga. O primeiro ensaio de carga
leu o campo incorreto do recibo. A asserção foi ajustada para
`records` e `candidates` e a rodada passou.

A régua técnica passa de 3/10 para **8/10 (80%)**. Avançaram papéis e
RLS, CRUD, consolidação, Dashboard e Mapa, e auditoria/histórico. Os
marcos de importação e Central seguem parciais. A régua histórica da
Sprint 4 permanece em **30/40 (75%)**, pois o aceite desta execução
é restrito à homologação local sintética.

**Classificação — APTO COM RESTRIÇÕES.** O cenário sintético principal
tem prova SQL, HTTP, navegador, reinício e restore. Permanecem o suporte
a XLSX, os cenários adicionais de importação e revisão, a validação
exaustiva das telas e as decisões institucionais sobre dados PCDF reais.
Inicie pelo [guia de execução local](../../database/local/persistent-homologation/README.md#pcdf-sintético).

## Arquivos da rodada

| Área | Alterações |
| --- | --- |
| Migrations e verificadores | Criados `crud-sql.mjs`, `0004_crud_spatial_reference.sql`, `pcdf-sql.mjs`, `install-crud.mjs`, `install-pcdf.mjs` e `backup-verify.mjs` em `database/local/persistent-homologation`. `install.mjs`, `qualify.mjs` e o guia foram atualizados. |
| Servidor | Criado `src/lib/db/persistent-crud.ts`. Atualizados a atestação, a seleção do adaptador PCDF, os controles do proxy, o limite do upload no Next.js e a guarda de ambiente hospedado. |
| Telas | Adaptadas as entradas de ocorrências, importação e Central e a seleção de itens do formulário. Dashboard e Mapa usam a consulta analítica já compartilhada. |
| Testes e documentação | Criado `tests/persistent-crud.test.mjs`. Criados este relatório, o dicionário, o inventário de design e a proposta PCDF. Sprint 4 e progresso atualizados por adição. |

O HEAD final permanece `f98ec07` na branch de homologação. A entrega
está local na árvore de trabalho. Ao final, o PostgreSQL atestado
continuava em loopback na porta 55473 e o Next.js de ensaio estava
encerrado. As 30 tabelas do recibo funcional têm RLS habilitada e forçada.

## Finalização do XLSX e da Central — 19/11/2026

A baseline desta rodada foi a branch `feat/sprint4-homologacao-persistente`
no HEAD `f98ec07`, com alterações locais preservadas. Foram conferidos
o cluster `7709847064550752852`, o ledger `homolog-persist-0001` a
`homolog-persist-0005`, as 37 RAs e a regressão anterior de 246 testes Node.
A cópia pré-migration `funcional-467a09016b4c5c72.dump` foi restaurada
em `sentinela_sprint4_restore_467a09016b4c5c72`, com 30 tabelas
reconciliadas. SHA-256
`f790ccbabaad319dd436450884aa8d17245753bf2b50911c15741f195c97a77f`.

`homolog-persist-0006` adicionou `xlsx_originals` com RLS forçada,
chave por lote e SHA-256 e guarda de autoria sintética. A representação
CSV do XLSX passa pelo mesmo parser e staging. A Central ganhou consulta
paginada e busca literal. As decisões continuam versionadas e limitadas
ao Administrador. O SQL renderizado tem SHA-256
`64f584933fca5a18c319cf3915ad3db0bb7ff2104ee943fc8faf57f2ad403190`.

O recibo `completion-sql-qualified.json` registra:

- Upload e replay do XLSX com original conferido byte a byte.
- Rollback com lote ausente, reenvio divergente recusado com conflito,
  SHA de extração desconhecido recusado e leitura direta do original
  negada aos logins de aplicação.
- Colisão entre lotes e natureza sem correspondência preservadas em
  staging. Identificador incompleto visível na Central e bloqueado
  para correção.
- Paginação filtrada com itens estáveis entre as páginas, detalhe
  vinculado ao lote e duas decisões concorrentes que produziram
  exatamente um registro com histórico e um conflito de versão.

A colisão entre duas extrações admitidas e o reprocessamento histórico
dependem de aprovação de uma nova proveniência, da identidade entre
extrações e da política de versionamento. O ensaio desta rodada valida
a recusa de outra extração e a repetição idempotente dentro da extração
sintética admitida. Regras de correção de identificação, coordenadas,
classificação e outras decisões pós-consolidação continuam bloqueadas
até terem contrato de negócio explícito.

### Resultado da rodada final

| Fase | Aceite e evidência |
| --- | --- |
| 1 — Preservação | Baseline 0001–0005, arquivos locais e cópias anteriores conferidos. PostgreSQL 17.11 e PostGIS 3.6.2 atestados em `127.0.0.1:55473/sentinela_sprint4_homologacao`, cluster `7709847064550752852`. |
| 2 — XLSX | Contrato de 34 colunas, campos obrigatórios, erro por linha/célula, histórico de lotes, staging e consolidação aprovados. Três testes Node adicionais cobrem integridade de texto, diagnósticos, planilhas inválidas, o limite de 16 MiB do CSV convertido e o vínculo entre migrations. |
| 3 — Colisões | Replay, rollback, reenvio divergente, colisão entre lotes, múltiplas naturezas, classificação sem correspondência e identificação incompleta testados. Outra extração é recusada. A homologação entre duas extrações admitidas e o reprocessamento histórico dependem das decisões acima. |
| 4 — Central de Revisão | Busca, filtros combinados, ordenação, paginação, detalhe com original e lote, histórico, correção administrativa e conflito de versão verificados. Correções específicas sem regra aprovada permanecem bloqueadas. |
| 5 — Telas | As nove rotas foram abertas no Edge a 1280 e 390 px. Dashboard e Mapa consultaram a API persistente. Cadastro, detalhe, importação, busca da Central, histórico, navegação e retorno de foco foram exercitados no navegador. O aceite de Usuários e Configurações cobriu acesso administrativo e comportamento demonstrativo. |
| 6 — Regressão | PostgreSQL, HTTP e Edge aprovados. Com PostgreSQL parado, a listagem devolveu `503`. Após o reinício dos dois serviços, foram reconferidos os UUIDs, o catálogo, a auditoria e o original XLSX. Backup e restauração reconciliaram 31 tabelas. |
| 7 — Entrega | Relatório, guia local, dicionário, Sprint 4 e inventário de redesign atualizados. |

O diretório `database/local/persistent-homologation` recebeu `xlsx.py`,
`completion-sql.mjs` e `install-completion.mjs`. Os verificadores
`install.mjs`, `qualify.mjs` e `backup-verify.mjs` passaram a reconhecer a
revisão adicional. O adaptador PCDF, a guarda de ativação local, o
contrato OpenAPI e os componentes já existentes de importação e revisão
foram atualizados. O teste `persistent-pcdf-completion.test.mjs` foi
adicionado. A leitura XLSX usa a biblioteca padrão do Python e o parser
PCDF existente, sem dependência nova. A barra lateral passou a indicar
persistência no banco local quando o CRUD de homologação está ativo.
A alteração usa os componentes e estilos existentes.

O recibo privado `http-8af1f302-e06f-436e-9551-cb7ed925659a.json`
tem SHA-256 `b969f3729a05220adfb0a14d278dc1b96383f1fa609e22842be8158142585fea`.
A ocorrência `0f6c669e-3d93-4cb2-9616-f90de9898701` manteve três versões,
dois eventos de mutação e um de cadastro, inativa na versão 3. A
ocorrência `a49fe2ae-0b2c-4f78-89ca-04e462ebc995` manteve a versão 1.
O lote `df9c9e48-6d4f-47a3-8512-8baac50c88ec` manteve duas decisões e
uma ocorrência com duas naturezas. O hash do XLSX arquivado coincidiu
antes e depois da reinicialização. O CSV canônico reenviado depois do
reinício devolveu o mesmo lote e execução. A listagem, o Dashboard e
o Mapa reconciliaram o recorte de dez ocorrências sintéticas ativas,
com 37 RAs. Os registros dos ensaios foram preservados no cluster privado.

O recibo complementar `browser-acceptance-cd456210-c4de-4d03-b1c6-e954250061b6.json`
confirma login pelo formulário, menu conforme o perfil, atalho para o
conteúdo principal e retorno do foco após fechar o detalhe com `Escape`
nos três perfis. Administrador e Operador consultaram o histórico do
lote. A Central recuperou a consulta após falha simulada. O reenvio do
XLSX arquivado devolveu o mesmo lote por HTTP. O XLSX sintético que
excedia 16 MiB após conversão foi recusado com `422` e indicação da linha.

O backup `funcional-fd2d156e40446092.dump` foi restaurado em
`sentinela_sprint4_restore_fd2d156e40446092`. O recibo confirmou RLS
habilitada e forçada nas 31 tabelas, além da igualdade dos hashes de
conteúdo e das contagens de constraints, triggers e policies. SHA-256
`7c89c5d6de709076af1de275e4bd7e795a0513b33ee88927237e8ace22fcef2d`.
O SHA-256 da cópia funcional anterior também foi reconferido.

Passaram 249 testes Node, 11 SQL/HBA, 14 de recuperação, typecheck,
ESLint, contratos/OpenAPI, checagem de rotas, build de produção e
`git diff --check`. A rodada inicial encontrou o OpenAPI gerado
desatualizado e uma interferência de navegação ao reusar a mesma aba
no ensaio do Edge. A geração foi sincronizada e a auditoria passou a
usar uma aba por rota. Os seletores do ensaio complementar foram
ajustados ao menu compacto e ao parágrafo de histórico. As reexecuções
passaram.

A branch inicial e final é `feat/sprint4-homologacao-persistente`, HEAD
`f98ec07`. As mudanças estão na árvore de trabalho, sem commits ou envio.
O PostgreSQL de homologação ficou disponível somente no loopback e o
Next.js de ensaio foi encerrado. Os outros bancos e ambientes ficaram
fora da execução.

**Classificação — APTO PARA USO LOCAL SINTÉTICO.** A homologação
persistente chega a **10/10 (100%)** no cenário local de proveniência
sintética admitida, com importação e Central homologadas. A Sprint 4
segue em **30/40 (75%)**. O próximo passo funcional para ampliar o
recorte PCDF é aprovar identidade, classificações e reprocessamento
entre extrações. O inventário está pronto para orientar a repaginação
quando o responsável definir o design.

## Modelo e design

O inventário preserva as nove rotas e os componentes existentes. A
proposta PCDF usa o contrato de 34 colunas e a inspeção documental do
repositório de dados. O desenho futuro deixa vigência, CRS, identidade
entre extrações, matriz e regras de revisão sujeitos à decisão do
produtor. [Inventário de telas](inventario-telas-redesign.md) ·
[Proposta PCDF](modelagem-integracao-pcdf.md)
