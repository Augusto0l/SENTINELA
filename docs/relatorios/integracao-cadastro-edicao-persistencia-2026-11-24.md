# SENTINELA — Integração entre Nova Ocorrência e Editar Ocorrência

## Auditoria e contrato final

A auditoria partiu da branch `feat/redesign-interface`, do relatório de finalização da edição, da Sprint 4 e dos contratos de cadastro, gestão e consulta. A tela de cadastro mantinha a descrição e as informações adicionais no rascunho. O corpo do POST excluía `dadosCrime`, e o SQL de criação também o excluía do contrato. A edição já usava `sentinela_ocorrencias_manual.cadastros.dados_crime`, criada na migration sintética `0003`. O CEP era obrigatório na tela de cadastro e opcional no POST e no SQL. O cadastro permitia avançar para a Etapa 2 antes de confirmar o ponto. [Relatório de edição](finalizacao-edicao-ocorrencias-2026-11-24.md) · [Sprint 4](../../sprints/sprint-04.md) · [Cadastro manual local](../desenvolvimento/cadastro-manual-local.md)

| Campo | Antes | Contrato integrado |
| --- | --- | --- |
| Data e horário | Gravados no cadastro e na edição | Data civil ISO e hora `HH:mm:ss`, no passado ou presente no DF. São recuperadas na consulta e na edição. |
| CEP | Gravado quando preenchido, com divergência entre a interface e a API | Oito dígitos, obrigatório para novos cadastros. Um CEP presente segue obrigatório em edições. |
| Endereço e bairro/setor | Gravados no endereço estruturado | Textos obrigatórios, até 240 e 100 caracteres respectivamente. |
| Número, complemento e referência | Gravados quando enviados | Opcionais, até 24, 120 e 240 caracteres, respectivamente. Campo vazio no formulário de cadastro é omitido. |
| Região Administrativa, latitude e longitude | RA persistente e ponto PostGIS WGS84 gravados | UUID de RA do catálogo institucional. O ponto precisa pertencer ao interior de uma única RA válida na data do fato. A cartografia de referência ajuda a preencher a RA e o servidor resolve a elegibilidade do UUID. |
| Confirmação do ponto | Exigida para a gravação, mas o cadastro podia avançar sem confirmação | A Etapa 1 exige confirmação explícita antes de avançar. A API e o SQL exigem `localizacaoConfirmada: true`. A confirmação está na auditoria e a consulta manual exibe o estado validado. A edição mantém a reconfirmação explícita. |
| Naturezas e tentativa por vínculo | Gravadas no cadastro e na edição | De 1 a 100 vínculos elegíveis, sem combinação repetida de natureza e tentativa. `true` é Tentado, `false` é Consumado e `null` é a opção explicitamente selecionada Não informada. A ausência da chave é inválida. |
| Descrição do fato e meio empregado | Descartados no cadastro, gravados na edição | Obrigatórios para novos registros em `dadosCrime`. A descrição tem até 3.000 caracteres e deve conter conteúdo. O meio é uma das cinco opções do catálogo do formulário. |
| Quantidades de vítimas e autores | Descartadas no cadastro, gravadas na edição | Obrigatórias para novos registros em `dadosCrime`. Cada quantidade é um inteiro de 0 a 999.999. Zero é recuperado como valor preenchido. |
| Observações adicionais | Descartadas no cadastro, gravadas na edição | Opcionais em `dadosCrime`, até 1.500 caracteres. Campo vazio no formulário é omitido. |

O cadastro envia o formulário completo. A edição também envia o formulário completo, incluindo versão, justificativa e confirmação do identificador. Campos de CEP e dados do crime ausentes em registros anteriores podem continuar ausentes. Ao preencher um deles, aplica-se a mesma validação do cadastro e o banco impede que o valor volte a ficar ausente. Omissão de um campo opcional ao salvar a edição permite limpar aquele valor. O formulário carrega as informações persistidas antes de editar. As ausências legadas são preservadas sem preencher valores retroativamente.

Na tela de 320 px, o botão de busca do CEP fica abaixo do campo para manter o valor completo visível.

## Persistência e autorização

A migration `0004` é aditiva e exige administração no banco sintético atestado `127.0.0.1:55488/sentinela_pcdf_local`, UUID correspondente, edição `0003` e catálogo manual. Ela reaproveita o endereço estruturado e `dados_crime` e acrescenta a função de cadastro completo e a validação de inserções e edições na tabela complementar. A função de cadastro anterior deixa de ser executável pelos logins da aplicação após a migration no sintético. [SQL da migration](../../database/local/pcdf-sandbox/0004_manual_occurrence_persistence_synthetic.sql)

Ocorrência, geometria, vínculos, recibo e evento de criação são gravados em uma transação. O hash da idempotência cobre o formulário completo. Reenvios são serializados por login, conta e chave. O mesmo corpo recupera o mesmo UUID, inclusive após alteração do registro. Alterar o corpo com a mesma chave retorna conflito. O evento de criação guarda responsável, horário, chave e valores gravados. A edição mantém a auditoria de antes e depois, a validação de versão e o histórico de vínculos retirados.

Administrador e Operador usam as funções autorizadas de cadastro e edição manual. O Analista consulta ocorrências permitidas pelo seu perfil. A correção administrativa PCDF continua no contrato próprio. RLS permanece ativa e forçada. A função de cadastro tem como proprietário um papel técnico sem login ou `BYPASSRLS` e os logins da aplicação não têm escrita direta nas tabelas. O POST exige modo sintético, sessão local, Host e Origin esperados, além da identidade PostgreSQL atestada. A interface mantém os botões disponíveis para validação sob demanda e bloqueia o envio se o catálogo, o ponto ou a capacidade de escrita não estiverem qualificados.

## Arquivos da entrega

| Área | Arquivos |
| --- | --- |
| Formulário e detalhes | `src/features/occurrences/ManualCreate.tsx`, `ManualCreate.module.css`, `OccurrenceWorkspace.tsx` |
| API, contratos e roteamento | `src/app/api/v1/ocorrencias/manuais/route.ts`, `src/proxy.ts`, `src/contracts/manual-occurrences.ts`, `local-occurrences.ts`, `openapi.ts` e `docs/contratos/openapi-v0.1.0.json` |
| Migration | `database/local/pcdf-sandbox/0004_manual_occurrence_persistence_synthetic.sql` |
| Ensaios SQL e HTTP | `database/local/pcdf-sandbox/qualify-management.py`, `qualify-manual.py`, `database/local/tests/test_static.py`, `tests/occurrence-management.test.mjs` e `scripts/validate-api-contracts.mjs` |
| Playwright | `scripts/check-manual-occurrence-browser.mjs` e `scripts/check-occurrence-management-browser.mjs` |

## Verificações

O ensaio `python -B database/local/pcdf-sandbox/qualify-management.py --browser` provisiona um cluster descartável, cria um registro legado antes da migration e valida a recusa da instalação com UUID divergente. Usa catálogo e ocorrências de teste. As instâncias ficam em loopback. Os casos de persistência verificam o resultado por novas conexões PostgreSQL.

| Verificação | Resultado |
| --- | --- |
| PostgreSQL 17.11 e PostGIS 3.6.2, porta 55488 | 11 testes aprovados. Incluem cadastro completo e com opcionais omitidos, campos obrigatórios, zero, quantidades inválidas, natureza e tentativa, RA e ponto, leituras após gravação, edição pontual, alteração de RA e natureza, auditoria, idempotência concorrente, rollback tardio e RLS. |
| Regressão do pacote de ativação anterior, porta 55486 | Aprovada. Dois cadastros, quatro vínculos, dois recibos e duas auditorias foram recuperados após reiniciar o PostgreSQL descartável. |
| Verificações estáticas SQL e RLS | 11 testes aprovados, com sintaxe das migrations, integridade do SQL, privilégios e regras de HBA. |
| Suíte Node 22 | 274 aprovados e 3 cenários opt-in fora da execução padrão. A suíte de contratos, reexecutada após o ajuste do OpenAPI, passou nos 21 casos. |
| TypeScript e ESLint | Aprovados com Node 22 e pnpm 10.34.3. |
| Build Next.js 16.4.6 | Aprovado com Webpack e diretório de saída isolado. |
| Contratos e rotas | 26 operações OpenAPI validadas e 9 rotas do roteiro estático presentes. |
| Playwright com Edge | As duas etapas passaram em 320, 390, 768, 1024 e 1440 px, incluindo a largura do CEP e o bloqueio de envio com rascunho válido em ambiente não qualificado. Cadastro, detalhes, edição do mesmo registro, preservação dos demais campos e leitura após reinício do Next passaram. A gestão também passou em 1366 e 390 px. |
| `git diff --check` | Aprovado. |

A primeira rodada de Playwright regravou capturas geradas anteriormente em `tmp/occurrence-editing-evidence/`. O roteiro agora grava as evidências desta entrega em `tmp/occurrence-persistence-evidence/`.

## Condições para ativação operacional

As escritas, migrations e cargas de teste ficaram restritas às instâncias sintéticas. O PostgreSQL operacional e os 68 pacotes PCDF v2 ficaram fora da execução. A ativação requer autorização expressa sobre um destino identificado, aprovação institucional do catálogo de naturezas, das vinculações territoriais e do contrato de dados manuais. Também requer uma migration revisada para o destino autorizado, ensaios de permissões, RLS e autoria auditada nesse ambiente, e backup com restauração verificada e plano de reversão. O código atual exige o modo sintético para gravar pelo fluxo integrado.
