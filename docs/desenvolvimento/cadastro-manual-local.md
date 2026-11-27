# Cadastro manual local

O formulário usa ViaCEP ao concluir os oito dígitos e envia o endereço postal ao geocodificador quando há logradouro ou bairro. A busca no endereço e na barra do mapa aguarda 650 ms de inatividade. CEP com correspondência única posiciona um marcador aproximado. Endereço com resultado único e preciso posiciona um marcador pendente de confirmação. Pesquisas com mais de um resultado exigem seleção. Alterações no endereço ou nas coordenadas invalidam a confirmação anterior. A busca usa apenas os dados de endereço, e a validação da posição reaproveita o Leaflet e a cartografia IDE/DF de 13/11/2026.

O `POST /api/ocorrencias/geocode` exige sessão de Administrador ou Operador e a origem local. O [Geocode IPEDF](geocodificacao-local-etapa-2.md) foi selecionado para CEP e buscas explícitas de endereços públicos. Configure `SENTINELA_MANUAL_GEOCODER_URL=https://geocode.ipe.df.gov.br/api/` no `.env.local` e utilize `npm run dev:local`. A configuração também aceita um endpoint Nominatim compatível autorizado por HTTPS ou em `127.0.0.1`. Quando o provedor estiver indisponível, a resposta postal continua disponível e o operador pode ajustar o ponto manualmente.

O ponto e os dados de negócio seguem para o PostgreSQL local. O mapa usa tiles públicos até o nível nativo 12. Em níveis mais altos, o zoom e a seleção local usam a geometria da IDE/DF.

`GET /api/v1/ocorrencias/manuais` consulta as RAs elegíveis e as descrições da fonte `SENTINELA_MANUAL`. `POST` usa a mesma rota e valida sessão, origem, data, horário de Brasília, catálogo, coordenadas e a confirmação explícita `localizacaoConfirmada: true`. A chave de idempotência é vinculada à conta local autenticada. O estado inicial é `em_revisao`. A aba **Cadastro manual** consulta o mesmo registro por `/api/v1/ocorrencias/consulta?view=manuais`. O [pacote de ativação da Etapa 3](ativacao-cadastro-manual-etapa-3.md) define o procedimento operacional.

## Banco e implantação

O PostgreSQL operacional na porta 55484 foi consultado em leitura. Os catálogos de RA, de natureza e de categoria estão vazios nesse banco. Os registros em staging da PCDF têm sua própria proveniência. A elegibilidade de uma descrição para cadastro manual usa um catálogo institucional explícito; uma descrição de origem ou categoria padronizada não representa por si só essa aprovação.

A verificação encontrou zero naturezas de qualquer fonte e a função `sentinela_ocorrencias_manual.catalogo()` ainda ausente na porta 55484. A API distingue função ausente, catálogo vazio, acesso negado e falha de serviço. O catálogo manual lê `regioes_administrativas` e `naturezas_criminais`. A política da segunda tabela limita o leitor da função à fonte `SENTINELA_MANUAL`. A matriz com as 41 descrições PCDF e as 20 categorias do SENTINELA permanece com a homologação de carga pendente. [Situação da matriz PCDF](../contratos/importacao-pcdf-v1.0.md#11-pendências-de-homologação-e-sequência-da-sprint-4)

A migration aditiva `database/local/pcdf-sandbox/manual-catalog-codes.sql` acrescenta `codigo_manual` opcional em `sentinela.naturezas_criminais`. A coluna aceita códigos fornecidos pela instituição somente para `SENTINELA_MANUAL`, com unicidade insensível a caixa. A função expõe o código ao seletor existente, que pesquisa descrições e códigos sem diferenças de caixa ou acento. Catálogos antigos continuam retornando a descrição. A migration modifica a função e sua leitura por coluna. As políticas de RLS, os perfis e as permissões de execução existentes continuam aplicáveis.

A carga operacional aguarda a fonte institucional com a quantidade, os códigos e as descrições aprovadas para cadastro manual. A aplicação já aceita esses valores pelo contrato. A homologação usa exclusivamente `TESTE-A` e `TESTE-B` no cluster sintético, com ensaio de rejeição de código duplicado. Para reverter a exposição do código após uma implantação autorizada, restaure o corpo anterior da função `catalogo()` e preserve a coluna, o índice e seus valores. Uma falha na instalação reverte toda a transação.

A migration `database/local/pcdf-sandbox/manual-occurrences.sql` é aditiva e guardada pelo UUID do manifesto. Ela usa `ocorrencias`, `ocorrencia_naturezas`, `eventos_auditoria`, `regioes_administrativas` e `naturezas_criminais`. A tabela complementar guarda o endereço estruturado e o recibo com chave e hash. O serviço usa as credenciais locais de cada perfil, com funções cujo proprietário é um papel sem login nem bypass. RLS continua ativa e forçada. O PostGIS exige um único polígono que cubra o ponto e seu interior na RA selecionada. As associações ficam pendentes de classificação, e o evento de serviço registra o identificador opaco da conta local autenticada. O recorte em revisão fica fora da seleção do Dashboard e do Mapa Criminal.

1. Qualifique a migration no PostgreSQL sintético com `python -B database/local/pcdf-sandbox/qualify-manual.py`. O roteiro usa uma instalação vazia na porta 55486, cartografia oficial e naturezas sintéticas, e verifica as duas inclusões, os vínculos, a geometria, a auditoria, RLS e a recuperação após reinício.
2. Antes de qualquer ativação operacional, confira o backup lógico privado do banco e o inventário de roles sem senhas. Conserve os hashes, o UUID do manifesto, o arquivo de HBA e os registros de configuração. Confira o TOC com `pg_restore --list` e assegure uma restauração isolada com o procedimento de backup existente para o cluster PCDF.
3. Submeta à aprovação específica o SQL e a carga do catálogo de RA vinculada à mesma versão da cartografia, junto com as naturezas institucionais autorizadas para cadastro manual. Valide a contagem e os UUIDs do catálogo antes de habilitar o uso. Vincule a origem institucional de cada natureza no roteiro de carga aprovado.
4. Após aprovação, execute o SQL com `psql -X -v ON_ERROR_STOP=1 -v expected_uuid=<UUID do manifesto> -f database/local/pcdf-sandbox/manual-occurrences.sql` no destino atestado. A execução de DDL usa a conta administrativa do cluster. A aplicação usa os logins restritos. Compare os hashes de origem, staging, pendências, lotes, execuções e auditoria PCDF antes e depois. Faça a verificação de integridade de produção por leitura.
5. Em caso de falha transacional, o PostgreSQL reverte a migration. Se for necessário suspender o recurso após a instalação, revogue temporariamente o EXECUTE de `sentinela_ocorrencias_manual.cadastrar(jsonb,uuid,text)` para os dois logins de gravação. Preserve ocorrências, vínculos e eventos. Para recuperação do banco, restaure em cluster isolado, confira os hashes, as políticas e os roles, e use o procedimento de troca de destino atestado com autorização.

## Arquivos desta entrega

| Área | Novos | Modificados |
| --- | --- | --- |
| Interface | `src/features/occurrences/ManualCreate.tsx`, `ManualCreate.module.css`, `ManualLocation.tsx` | `src/features/NovaOcorrenciaEntry.tsx`, `src/features/occurrences/OccurrenceWorkspace.tsx`, `src/app/(sistema)/ocorrencias/page.tsx`, `src/components/NavigationIcon.tsx`, `src/components/occurrences/LocationPicker.tsx`, `AddressLocationSearch.tsx` |
| APIs e contratos | `src/app/api/v1/ocorrencias/manuais/route.ts`, `src/contracts/manual-occurrences.ts`, `src/lib/http/read-json.ts` | `src/app/api/ocorrencias/geocode/route.ts`, `src/lib/geocoding/handler.ts`, `src/data/addressLocation.ts`, `src/proxy.ts`, `src/lib/db/local-occurrences.ts`, `src/contracts/local-occurrences.ts`, `src/contracts/openapi.ts`, `docs/contratos/openapi-v0.1.0.json` |
| Banco e testes | `database/local/pcdf-sandbox/manual-occurrences.sql`, `qualify-manual.py`, `scripts/check-manual-occurrence-browser.mjs`, este guia | `database/local/tests/test_static.py`, `tests/api-contracts.test.mjs`, `tests/planned-occurrence-writes.test.mjs`, `scripts/validate-api-contracts.mjs` |

## Arquivos da correção de localização e naturezas

| Área | Novos | Modificados |
| --- | --- | --- |
| Interface | `src/features/occurrences/use-manual-location-search.ts`, `ManualNaturePicker.tsx` | `src/features/occurrences/ManualCreate.tsx`, `ManualCreate.module.css`, `ManualLocation.tsx` |
| API e banco | `database/local/pcdf-sandbox/manual-catalog-codes.sql` | `src/data/addressLocation.ts`, `src/app/api/v1/ocorrencias/manuais/route.ts`, `src/contracts/manual-occurrences.ts`, `docs/contratos/openapi-v0.1.0.json` |
| Homologação | | `database/local/pcdf-sandbox/qualify-manual.py`, `database/local/tests/test_static.py`, `scripts/check-manual-occurrence-browser.mjs`, este guia |
