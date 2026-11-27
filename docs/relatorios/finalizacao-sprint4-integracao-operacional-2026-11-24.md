# SENTINELA — Finalização técnica e preparação operacional da Sprint 4

## Resumo executivo

Cadastro, consulta, edição, inativação e staging v1/v2 estão integrados no banco descartável. Esta rodada conectou Dashboard e Mapa ao leitor SQL atestado, reforçou as guardas de catálogo e preparou a recuperação lógica do schema integrado. Os 68 pacotes v2 foram conferidos em leitura. A infraestrutura está preparada para abrir uma janela de homologação controlada. A entrada em operação depende das autorizações e evidências do destino descritas neste relatório. A instância operacional histórica da porta 55484 ficou fora das conexões desta rodada.

## Estado inicial e matriz de pendências

Auditoria em 24/11/2026, na branch `feat/redesign-interface`, HEAD `3e1b3adb8b597c393a3bb3fe0d18c38f1166c9f0`. A árvore inicial continha 56 arquivos modificados e 81 arquivos não rastreados. A auditoria leu os relatórios das entregas de cadastro, edição, gestão de arquivos e PCDF v2, os contratos de API, as migrations e os manifestos de catálogo. A inspeção do SENTINELA-DADOS é somente leitura. [Cadastro e edição](integracao-cadastro-edicao-persistencia-2026-11-24.md) · [Edição e inativação](finalizacao-edicao-ocorrencias-2026-11-24.md) · [Gestão de arquivos](gerenciamento-arquivos-ocorrencias-2026-11-24.md) · [Pré-homologação v2](finalizacao-tecnica-pcdf-v2-2026-11-23.md) · [Auditoria v2](auditoria-persistencia-idempotencia-pcdf-v2-2026-11-23.md)

| Problema | Causa e arquivos | Impacto | Correção ou ação | Validação | Autorização |
| --- | --- | --- | --- | --- | --- |
| Dashboard e Mapa sem leitor integrado | A rota analítica usa `persistent-read.ts`, enquanto `direct_runtime.py` fornece a identidade e os papéis do ambiente PCDF local | Uma base vazia pode aparecer como indisponível | Reutilizar a conexão atestada com projeções SQL de leitura limitada a ocorrências consolidadas ativas | Vazio, contagem distinta, filtros, impacto da baixa e negação de acesso direto | Instalação real depende de destino e DDL autorizados |
| Manifesto de natureza ambíguo ou sintético no gerador avulso | `manual_catalog_seed.py` aceita chaves JSON repetidas e tem geração de SQL que inclui a porta de referência operacional | Uma mesma evidência pode ser interpretada de forma diferente ou destinada ao perfil errado | Rejeitar chaves duplicadas e restringir o manifesto de ensaio à porta sintética | Parser, geração, rejeição de alvos divergentes | Catálogo real depende de ato institucional independente |
| Recuperação do schema integrado | Os ensaios históricos comprovam recortes diferentes, anteriores à cadeia manual completa | Restauração parcial pode perder vínculos, regras ou custódia | Restaurar dump do banco integrado em outro cluster descartável e comparar schema, conteúdo e privilégios | SHA-256, leitura do arquivo, restore transacional, repetição recusada e comparação | Backup ou conexão real dependem de autorização específica |
| Edição/manual e custódia v2 compartilham dependência estrutural no laboratório | `0002` consulta `entregas_pacote`; `0003` e `0004` usam gestão | A ordem sintética inclui a estrutura v2 | Confirmar ordem e explicitar a fronteira entre DDL e autorização de carga histórica | Cluster limpo e cadastro legado antes de `0004` | DDL e ativação real exigem revisão de destino e perfis |
| Autoria institucional sem vínculo | `local-provider.ts` deriva `localAccountId` de papel e e-mail da conta local; SQL registra login de serviço e atribuição da aplicação | A trilha comprova o percurso local, com autoria institucional pendente | Preservar a guarda de desenvolvimento e exigir identidade vinculada na liberação | Três perfis e operações negadas via API e SQL | Identidade institucional adiada por decisão do projeto |
| Classificação e carga histórica ainda condicionadas | Manifestos de custódia e checksums verificam integridade interna. Matriz de naturezas e equivalências requer ato independente | Consolidação ou uso manual sem decisão seria indevido | Conferir inventários e preparar o pacote para decisão institucional | Reconciliação dos 68 pacotes e escrita simulada em banco descartável | Aprovação da fonte, regra, destino e escopo de escrita |

## Integração, migrations e segurança

| Conjunto | Ordem e dependências qualificadas | Integridade e comportamento |
| --- | --- | --- |
| Modelo PostgreSQL/PostGIS | Baseline Supabase, que incorpora `database/migrations/0001` a `0005`, com PostGIS 3.6.2 no schema `extensions`. Nas instalações que usam essa baseline, a cadeia base está incorporada. | PKs/FKs, identidade por origem, unicidade, índices espaciais e de período, revisão, triggers e RLS forçada nas 19 tabelas de domínio. |
| Recepção e consulta | `direct.sql` v1, história/integração gerada por `main_import_migration.py`, `occurrences-read.sql`. | A consulta seleciona a modalidade e o papel. Staging conserva originais, lote, execução, competência e diagnósticos. |
| Catálogo manual | `manual-occurrences.sql`, `manual-catalog-codes.sql`, `manual-catalog-release.sql`, depois os seeds atestados. | RA vinculada à extração IDE/DF, código interno único, código manual normalizado, vigência e evidência de homologação. A UUID da RA vincula endereço a geometria por FK. |
| Custódia v2 | `0001_pcdf_v2_synthetic.sql` após o receptor v1. | Guarda restrita a 55488, confirmação idempotente, seis partes privadas, aprovação sintética e transações concorrentes entre versões. |
| Gestão e integração manual | `0002_occurrence_management_synthetic.sql` depois da estrutura de custódia e do catálogo manual, `0003_occurrence_editing_synthetic.sql`, depois `0004_manual_occurrence_persistence_synthetic.sql`. | A migração `0004` foi aplicada com um registro legado já persistido. Dados complementares, vínculos, recibos e auditoria estão na mesma transação. Inativação lógica, vínculo exclusivo, versão do registro, justificativa e reconfirmação permanecem testados. |
| Analytics integrado | `occurrences-analytics.sql` depende do leitor local atestado. O arquivo exige sistema, UUID, banco, porta, versões e RLS. | Seis views de leitura sob o proprietário técnico existente com RLS. Apenas ocorrências consolidadas ativas entram nos agregados. Duas naturezas contam uma ocorrência. Mapeamentos e categorias exigem estado homologado. Os logins de aplicação receberam apenas `SELECT` nas views. |

As guardas de aplicação validam sessão, perfil, Host e Origin aplicáveis, tipo de comando e identidade do banco. O modo integrado do leitor analítico abre uma transação `READ ONLY` e reutiliza a consulta parametrizada de agregação. Uma instalação sem a extensão analítica responde com indisponibilidade. A ausência legítima de consolidadas responde com total zero. O SQL limita operações diretamente nas tabelas e mantém `search_path` explícito nas funções de serviço.

O fluxo manual grava endereço, CEP, bairro/setor, data, horário, RA, coordenadas e confirmação, detalhes complementares, naturezas e tentativas, descrição, meio, quantidades e observações. Um reenvio idêntico recupera o mesmo recibo. A edição preserva os campos carregados e recusa a remoção dos campos obrigatórios já presentes. Ocorrências legadas permanecem editáveis sem preencher ausências com valores artificiais. Testes da correção administrativa registraram campos corrigidos e originais imutáveis, com origem, ID de associação, revisão, motivo, conta e horário. A inativação remove o item da projeção ativa e conserva a trilha.

| Identidade | Permissões verificadas | Alcance da autoria |
| --- | --- | --- |
| Administrador local | Cadastro e gestão manual, revisão e correção PCDF autorizadas, baixa de lotes e de ocorrências elegíveis | O evento identifica o login SQL, a conta opaca da sessão local, a operação e o horário |
| Operador local | Cadastro, edição e inativação manual elegíveis, leituras conforme escopo e recepção permitida | A mesma identificação local, com correção administrativa PCDF recusada |
| Analista local | Consultas e análises autorizadas | Escrita, correção e acesso a staging privado recusados via API e SQL |

`localAccountId` é derivado do perfil e do e-mail da conta de desenvolvimento. A aplicação fornece esse identificador ao SQL depois de verificar a sessão. O login de banco é uma credencial de serviço por perfil. Essa trilha comprova a autoria no recorte de teste, e a identidade institucional depende de vínculo auditável próprio. As contas locais continuam restritas ao modo de desenvolvimento em loopback. Convites, Gmail, gestão definitiva de usuários e liberação pública seguem fora do escopo autorizado.

## Catálogos e PCDF v2

Foram validados 37 UUIDs, códigos e números administrativos distintos. O snapshot IDE/DF de 13/11/2026 foi conferido pelo SHA-256, pelos vínculos e pelo payload da revisão. As 37 geometrias são MultiPolygon válidos com SRID 4326. O PostGIS encontrou nove pares com interiores sobrepostos. A aplicação bloqueia pontos que não possam ser atribuídos de forma inequívoca. A extração e a revisão técnica estão documentadas. A comprovação da vigência jurídica e a decisão sobre sobreposições seguem pendentes. As 41 candidatas de natureza estão identificadas, com zero homologadas para uso manual nos artefatos consultados. As 20 categorias internas e as duas correspondências analíticas documentadas ficam sujeitas a aprovação própria. [Pacote, matrizes e modelo de aprovação](../catalogos/pacote-homologacao-sprint4-2026-11-24.md)

`check-pcdf-v2-series.mjs` conferiu a série de janeiro/2021 a agosto/2026 na pasta restrita do SENTINELA-DADOS. O índice e os seis artefatos por competência totalizaram 410 entradas verificadas por hash. A reconciliação encontrou 369.660 associações, 349.582 candidatas, 41 naturezas originais e 6.653.880 valores de origem conferidos. São 360.989 referências geográficas pendentes, 8.671 ausentes e 83 com UTM sem GEO. Os CSVs preservam 26 colunas. Os ensaios de escrita usaram pacotes fictícios e validaram preparação, custódia, conflito de versões e de legado, concorrência, reenvio, quarentena e rollback. A autorização de fonte e o piloto real de staging pertencem a um processo próprio. [Contrato e integração do produtor](../../../SENTINELA-DADOS/docs/INTEGRACAO_SENTINELA_V2.md)

O XML de 841.730.010 bytes foi conferido em leitura. O SHA-256 `faf82ae0620fa3ecc53bc002d9c2e49b24b6ec0126a44449510d12948dc0a022` coincide com a âncora do manifesto integral. Essa concordância dos bytes é uma evidência técnica de custódia. A autorização da fonte permanece documental e independente.

## Arquivos desta rodada

| Área | Arquivos |
| --- | --- |
| Leitura integrada | `src/app/api/v1/analytics/persistente/route.ts`, `src/lib/db/analytics-query.ts`, `database/local/pcdf-sandbox/occurrences-analytics.sql` |
| Catálogos | `database/local/pcdf-sandbox/manual_catalog_seed.py`, `manual_activation.py`, `qualify-manual.py`, `docs/catalogos/pacote-homologacao-sprint4-2026-11-24.md` |
| Infraestrutura e evidência | `database/release/preflight.psql`, `database/local/pcdf-sandbox/integrated_restore.py`, `qualify-management.py`, `database/local/tests/test_static.py` |
| Verificação | `tests/occurrence-management.test.mjs`, `scripts/check-occurrence-management-browser.mjs`, `scripts/check-manual-occurrence-browser.mjs`, `scripts/check-pcdf-v2-browser.mjs` |

## Verificações executadas

| Verificação | Evidência da rodada |
| --- | --- |
| Suíte Node e ferramentas | 274 aprovados, três opt-ins fora da suíte padrão e zero falhas. TypeScript, ESLint, build Next.js 16.4.6 com Webpack, 26 operações OpenAPI e 9 rotas verificadas. `git diff --check` sem erros. |
| Catálogo e atualização legada | PostgreSQL 17.11/PostGIS 3.6.2. Instalação da cadeia em cluster vazio, cadastro anterior à `0004`, atualização e leitura. Em 55486, a regressão do pacote manual validou dois recibos após reinício, recusa de JSON duplicado e bloqueio de catálogo sintético para a porta operacional. |
| Gestão e analytics com PostgreSQL real de teste | 12 itens TAP aprovados. Vazio válido, múltiplas naturezas com contagem distinta, ponto e RA, filtros, baixa refletida nos totais, sessão ausente e identidade incorreta recusadas. Cadastro completo, opcionais, legado, reenvio, edição, inativação, auditoria, rollback e três perfis. |
| PCDF v1/v2 em banco descartável | 10 itens TAP aprovados. Incluem custódia e seis partes, modo e perfil, replay, concorrência entre versões, conflito revisável, quarentena, proveniência e rollback após falha de auditoria. |
| Inspeção SQL/HBA e backup | 11 testes estáticos e 14 testes unitários de recuperação aprovados. Incluem isolamento, leitura do arquivo, incompatibilidade de versão/extensão e entrega privada de senha. |
| Restauração lógica integrada | Dump customizado da origem sintética 55488 restaurado no clone 55489. Schema e fingerprints de 27 tabelas coincidiram, incluindo `spatial_ref_sys`, dados manuais e custódia. A consulta dos três perfis foi exercitada com a identidade de sessão correspondente no clone. Uma segunda restauração sobre a base preenchida foi recusada e revertida. |
| Playwright com Edge | Gestão, prévia PCDF e sessão por perfil em 1366 e 390 px. Prévia incompleta reparada, manifesto adulterado recusado e paginação sem escrita. Dashboard e Mapa responderam HTTP 200 com vazio autorizado. Cadastro, consulta, edição do mesmo registro e releitura após reinício também passaram. As duas etapas manuais foram verificadas em 320, 390, 768, 1024 e 1440 px. |

O primeiro comparador de backup sinalizou divergência de schema por comparar a ordem textual dos papéis de duas políticas. A inspeção do diff confirmou os mesmos membros, apenas com ordem diferente por OID. O comparador agora ordena somente os nomes nessas listas e desconsidera a chave efêmera de restrição do `psql`. O restore também reaplica e confere os grants de `pg_control_system()` como artefato próprio, pois pertencem ao catálogo de sistema. O ensaio usa dois listeners locais, extensões idênticas e credenciais de fixture. O tempo do comando `pg_restore` não mede RTO de produção. [Ensaio versionado](../../database/local/pcdf-sandbox/integrated_restore.py)

Na prova final, o dump SHA-256 `29f0ccda0bb0b10676503020d1443271a1147878a3456450af3b4569dd2e7a22` levou 2,189 s para restaurar depois do provisionamento do clone. O recibo `integrated-restore.json` e os artefatos sem credenciais foram gerados na pasta temporária exclusiva do ensaio `52866079-7389-41a7-8f5e-0a7753bd124b`. Papéis exportados e grants de sistema foram conferidos por hash. As leituras no clone usaram `SET SESSION AUTHORIZATION` com RLS aplicável. Os testes com login da aplicação e permissões HTTP foram executados na origem sintética.

As capturas desta rodada foram gravadas em um diretório novo, `tmp/sprint4-qualificacao-096c46c6-a7d7-4e3c-a116-c91da2243e44/`. [Recibo da verificação manual](../../tmp/sprint4-qualificacao-096c46c6-a7d7-4e3c-a116-c91da2243e44/browser.json) · [Cadastro a 320 px](../../tmp/sprint4-qualificacao-096c46c6-a7d7-4e3c-a116-c91da2243e44/nova-ocorrencia-320.png) · [Prévia PCDF a 390 px](../../tmp/sprint4-qualificacao-096c46c6-a7d7-4e3c-a116-c91da2243e44/pcdf-v2/previa-390.png)

```powershell
python -X utf8 -B database/local/pcdf-sandbox/qualify-management.py --pcdf-v2
python -X utf8 -B database/local/pcdf-sandbox/qualify-management.py --recovery --browser
python -X utf8 -B database/local/pcdf-sandbox/qualify-manual.py
```

## Ativação controlada e recuperação

| Grupo | Ordem de liberação | Critério, responsável e contenção |
| --- | --- | --- |
| A · Cadastro e gestão manual | Fixar o contrato e o catálogo institucional, autorizar a conexão e a eventual instalação da leitura, preparar pacote de DDL de escrita para o estado efetivo, testar o pacote em clone, homologar três perfis e abrir piloto manual limitado. | A autoridade dos catálogos aprova RA e natureza. Segurança aprova autoria e papéis. DBA assina DDL, clone e resultados de cadastro, edição, baixa e auditoria. A estrutura de custódia é pré-requisito da gestão atual no laboratório. A execução de importação histórica não é condição para um piloto manual. |
| B · Importação PCDF | Aprovar a cadeia XML e SHA independente, custódia e retenção, destino dedicado e política de origem/equivalência. Revisar migration e receptores, ensaiar em clone e autorizar individualmente janeiro/2021 em staging. | Custodiante da PCDF autoriza origem e competência. DBA confere 6.393 snapshots e 6.091 chaves candidatas para o piloto descrito nos artefatos, compara os originais e testa reenvio e recuperação. A promoção e as demais competências exigem autorização própria. |
| C · Segurança e infraestrutura | Registrar destino e operações permitidas, vincular identidades institucionais, aprovar matriz/RLS, obter snapshot verificável, ensaiar restauração e monitoramento e revisar a janela de ativação e rollback. | Responsáveis pelo ambiente, segurança e operação aprovam execução, credenciais, TLS quando aplicável, backups e escritos autorizados. Administração confirma política de retenção de eventos e transição de papéis. |

### Procedimento para a janela autorizada

1. Formalizar autorização separada de conexão em leitura, backup, restore, DDL/seed e escrita real por grupo. Registrar host, porta, banco, `system_identifier`, UUID do manifesto, versão PostgreSQL/PostGIS, proprietário do destino, responsável e prazo. `127.0.0.1:55484/sentinela_pcdf_local` é uma referência histórica. A aprovação precisa identificar o destino efetivo, o escopo e a janela. O DBA fornece as identidades por evidência independente antes de qualquer conexão.
2. Iniciar com o preflight em `READ ONLY`, usando `psql -X` e credencial designada com acesso ao inventário. Preencher as variáveis abaixo com os valores documentados. A primeira linha `1` atesta identidade e versões. A segunda linha `1`, quando fornecido `expected_uuid`, atesta o marcador da instância. O JSON inventaria ledger, RLS, interfaces instaladas, logins e contagens. O campo `readerPodeGravar` do leitor histórico usa retorno conservador quando esse papel está ausente. Conferir em separado os grants efetivos dos perfis locais. Qualquer divergência suspende a janela. [Preflight](../../database/release/preflight.psql)

   ```powershell
   & $psql17 -X -w -h $hostAutorizado -p $portaAutorizada -U $loginDeInventario -d $bancoAutorizado `
     -v ON_ERROR_STOP=1 -v "destino=$bancoAutorizado" -v "host=$hostAutorizado" -v "porta=$portaAutorizada" `
     -v "system_id=$sistemaAtestado" -v "expected_uuid=$uuidAtestado" -v postgres_num=170011 `
     -v postgis=3.6.2 -f database/release/preflight.psql
   ```

3. Na janela de backup autorizada, suspender escritas ou usar snapshot consistente, manter o dump em diretório privado novo e atestado e usar credencial privada. Usar `pg_dump --format=custom --file` no banco selecionado e `pg_dumpall --roles-only --no-role-passwords` para os papéis. Exportar separadamente os grants adicionais de objetos do catálogo de sistema, em particular `pg_control_system()`, e a custódia externa quando existir. Conferir os SHA-256 de todas as partes com `Get-FileHash -Algorithm SHA256`, guardar a evidência da versão e examinar o TOC com `pg_restore --list`. Uma desserialização integral com `pg_restore --file NUL` ou destino nulo equivalente valida a leitura do arquivo. Em rede, exigir as condições de TLS e verificação de certificado da política do destino. [Backup e recuperação históricos](../backup-recuperacao-postgresql-local.md)
4. Atestar um novo cluster isolado, com outro `system_identifier`, diretório e credenciais, PostgreSQL compatível e a mesma versão PostGIS. Restaurar os papéis revisados antes do banco, preservando o papel bootstrap. Criar base vazia com locale/encoding aprovados, restaurar com `pg_restore --exit-on-error --single-transaction` e reaplicar os grants de sistema revisados. Comparar schema, owners, ACL/RLS, FKs, índices, triggers, fingerprints das tabelas, contadores e custódia. Repetir a restauração sobre o clone preenchido deve falhar e manter o mesmo estado. Provar os perfis e a aplicação lendo o clone. Medir RPO e RTO da configuração operacional no ensaio autorizado.
5. Revisar a ordem e hashes das migrations contra o inventário. A extensão de leitura analítica pode ser aprovada em janela própria após `occurrences-read.sql`. A versão sintética das migrations `0001` a `0004` é bloqueada no destino operacional. O gerador legado `manual_activation.py` prepara só os objetos e catálogos da Etapa 3 e não fecha o CRUD integrado desta entrega. A versão de escrita operacional depende da revisão da identidade, da matriz e do destino. Aplicar primeiro num clone, com `ON_ERROR_STOP`, timeouts, prova da instalação limpa ou incremental e comparação dos dados preservados. Repetir o preflight e os testes pós-migration antes de liberar o primeiro piloto.
6. Validar recebimento e releitura, idempotência, baixa lógica, trilha auditada e bloqueios do Analista. Para PCDF, reconciliar XML, competência, IDs, snapshots e pendências, com zero promoção no piloto de staging. Se houver falha antes do commit, verificar o rollback e o estado de origem. Depois de commit, bloquear novos comandos, capturar evidência e comparar recibos antes de repetir qualquer pedido. Autorizar a reversão por suspensão de execução e restauração em destino isolado, reconciliar os eventos posteriores ao snapshot e obter aprovação de troca do destino. Nenhum teste de reversão deve apontar para a base operacional.

### Checklist de prontidão

| Estado | Item | Evidência ou responsável |
| --- | --- | --- |
| CONCLUÍDO | Contrato manual, catálogo técnico de RA, CRUD, analytics e permissões no escopo sintético | Testes de integração e relatórios desta entrega |
| CONCLUÍDO | Verificação dos 68 pacotes PCDF e reprodução de transações e rollback v1/v2 | Leitura na custódia e ensaios com fixtures |
| CONCLUÍDO | Recuperação do schema integrado descartável | Restore transacional, 27 tabelas reconciliadas, leitura dos três perfis e repetição revertida |
| PENDENTE TÉCNICO | Versão do pacote de escrita para o destino e teste de aplicação nela | DBA e segurança após definição do destino, da matriz e da identidade institucional |
| PENDENTE TÉCNICO | Medição sustentada de desempenho, RPO/RTO operacional e aceite amplo das telas | Responsáveis por infraestrutura, QA e produtos após definição de perfil e dados do ensaio |
| BLOQUEADO POR AUTORIZAÇÃO | Aprovar RA/naturezas, matriz de classificação, fonte e competência PCDF | Autoridades territoriais, responsáveis por catálogo e custodiante da PCDF |
| BLOQUEADO POR AUTORIZAÇÃO | Conectar, executar backup/restore, migrations, seeds e piloto real | Proprietário do ambiente e DBA com escopo escrito por operação |
| BLOQUEADO POR AUTORIZAÇÃO | Autenticação e autoria institucionais, publicação e aceite institucional | Responsáveis por identidade, segurança e homologação |

## Progresso pelas seis sprints

Foram recontados 60 PBIs nos seis planejamentos, com 6, 8, 13, 11, 9 e 13 por sprint. A régua mantém um ponto por PBI concluído, meio ponto por implementação parcial comprovada e zero sem evidência. Itens bloqueados recebem meio ponto quando existe parcela verificada. Publicação sem implantação homologada permanece com zero. Aceite técnico usa PBIs integralmente evidenciados no seu escopo de verificação. O aceite institucional e a publicação são marcos próprios. Features e tarefas filhas servem de evidência, e trabalho antecipado fica na sprint do PBI. [Sprint 1](../../sprints/sprint-01.md) · [Sprint 2](../../sprints/sprint-02.md) · [Sprint 3](../../sprints/sprint-03.md) · [Sprint 4](../../sprints/sprint-04.md) · [Sprint 5](../../sprints/sprint-05.md) · [Sprint 6](../../sprints/sprint-06.md) · [Régua anterior](auditoria-geral-sentinela-2026-11-22.md#3-quadro-das-sprints)

| Recorte | Implementação ponderada | Aceite técnico evidenciado |
| --- | --- | --- |
| Sprint 1 | `██████████` 6/6 · **100%** | `██████████` 6/6 · **100%** |
| Sprint 2 | `██████████` 8/8 · **100%** | `██████████` 8/8 · **100%** |
| Sprint 3 | `██████████` 12,5/13 · **96%** | `█████████░` 12/13 · **92%** |
| **Sprint 4** | `████████░░` 8,5/11 · **77%** | `██████░░░░` 7/11 · **64%** |
| Sprint 5 | `███████░░░` 6,5/9 · **72%** | `████░░░░░░` 4/9 · **44%** |
| Sprint 6 | `█████░░░░░` 6/13 · **46%** | `██░░░░░░░░` 2/13 · **15%** |
| **Projeto** | `████████░░` 47,5/60 · **79%** | `███████░░░` 39/60 · **65%** |

Na Sprint 4, #154 e #157 saem da pontuação parcial porque o contrato completo, persistência, edição, inativação e auditoria têm prova integrada. Permanecem concluídos #116, #120, #123, #126 e #151. #113 e #145 seguem parciais pelo aceite amplo dos protótipos e da matriz institucional. #142 segue bloqueado com parcela local demonstrada. #148 continua a fazer. Na Sprint 5, #163 ganha aceite técnico no escopo de **recepção transacional em staging**, com persistência após validação, confirmação e rollback. As regras de consolidação e análise real dos demais PBIs continuam com sua classificação anterior. A recuperação sintética reforça #135 sem fechar RPO/RTO operacionais. #200 e #203 permanecem abertos, sem crédito pela carga de 68 meses. [Cadastro PostgreSQL #154](https://github.com/CAMPUSCEUB/Sentinela/issues/154) · [Edição e inativação #157](https://github.com/CAMPUSCEUB/Sentinela/issues/157) · [Permissões #145](https://github.com/CAMPUSCEUB/Sentinela/issues/145) · [Importação transacional #163](https://github.com/CAMPUSCEUB/Sentinela/issues/163) · [Recuperação #135](https://github.com/CAMPUSCEUB/Sentinela/issues/135)

As issues consultadas diretamente permaneciam abertas e ainda indicavam critérios detalhados sujeitos à homologação da equipe. A pontuação registra evidência técnica de engenharia. A Sprint 1 tem encerramento acadêmico registrado. A confirmação dos demais aceites e a situação ao vivo do campo Sprint no GitHub Projects ficaram sem evidência nesta rodada. [QA de interface #113](https://github.com/CAMPUSCEUB/Sentinela/issues/113) · [Integração final #207](https://github.com/CAMPUSCEUB/Sentinela/issues/207) · [Segurança e qualidade #210](https://github.com/CAMPUSCEUB/Sentinela/issues/210)
