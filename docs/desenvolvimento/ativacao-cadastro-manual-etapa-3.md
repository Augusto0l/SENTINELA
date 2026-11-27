# Pacote de ativação do cadastro manual

O cadastro operacional está pendente de duas decisões. A instituição deve homologar um catálogo de naturezas para uso manual. O responsável pelo ambiente deve autorizar a execução do pacote no PostgreSQL `127.0.0.1:55484/sentinela_pcdf_local`. A ativação reúne migrations e catálogos em uma transação, com validações do destino e do conteúdo antes do `COMMIT`.

## Banco de origem e migrations

A inspeção somente leitura encontrou PostgreSQL 17.11 e PostGIS 3.6.2, as versões de base `0001` a `0005`, a função `sentinela_ocorrencias_local.identidade()` e a consulta consolidada já ativas. O schema `sentinela_ocorrencias_manual` ainda está ausente. `regioes_administrativas` e `naturezas_criminais` estão vazias. Administrador, Operador e Analista foram verificados com os papéis locais e sem `SUPERUSER` ou `BYPASSRLS`.

| Estrutura | Vínculos e proteções |
| --- | --- |
| `sentinela.ocorrencias` | UUID persistente, data e horário, RA por FK, endereço textual, latitude, longitude e `geometry(Point,4326)`. Constraints de estado e geometria, índice GiST e triggers de identidade, versão e histórico. |
| `sentinela.ocorrencia_naturezas` | FKs de ocorrência e natureza. A combinação de natureza e tentativa identifica cada associação manual. A classificação inicial é `pendente`. Triggers preservam vínculo, validade e estado. |
| `sentinela.regioes_administrativas` | UUID, código de origem por versão, nome, vigência, procedência e `MultiPolygon` com GiST. |
| `sentinela.naturezas_criminais` | UUID, fonte, descrição literal e chave por fonte, descrição e categoria de origem. `mapeamentos_natureza` liga naturezas a `categorias_criminais` por FKs e possui aprovação própria. |
| `sentinela.eventos_auditoria` | Registro imutável, com vínculos validados, ator de serviço, login, identificador opaco da conta e identificador da requisição. |
| `sentinela_ocorrencias_manual.cadastros` | Tabela complementar com FK para o mesmo UUID da ocorrência, endereço estruturado e recibo com hash. Chave única por login, conta e chave da requisição. |

As tabelas de origem usam RLS forçada. As 19 tabelas protegidas da base são preservadas. As funções novas `SECURITY DEFINER` usam `search_path=pg_catalog,pg_temp`, objetos da aplicação com schema explícito e proprietários técnicos sem login, superusuário ou bypass. Os três logins não ganham escrita direta nessas tabelas. Administrador e Operador recebem execução das funções de cadastro e catálogo. Analista mantém execução das funções de consulta, inclusive detalhe de manuais conforme o perfil. A auditoria fica disponível no banco para manutenção autorizada.

| Ordem e arquivo | Objetos, dependências e impacto |
| --- | --- |
| `local-manual-0001` · [`manual-occurrences.sql`](../../database/local/pcdf-sandbox/manual-occurrences.sql) | Requer identidade da consulta existente, UUID atestado e 19 tabelas com RLS. Cria dois papéis técnicos, schema, recibo e funções de catálogo, cadastro, lista e detalhe. Acrescenta políticas e grants delimitados. A revisão da Etapa 3 exige `localizacaoConfirmada: true` na função e na API, registra a confirmação na auditoria e confere a elegibilidade da natureza antes do primeiro `INSERT`. |
| `local-manual-0002` · [`manual-catalog-codes.sql`](../../database/local/pcdf-sandbox/manual-catalog-codes.sql) | Depende de `0001`. Adiciona código manual opcional, restrição de formato e índice único sem distinção de caixa. |
| `local-manual-0003` · [`manual-catalog-release.sql`](../../database/local/pcdf-sandbox/manual-catalog-release.sql) | Depende de `0002`. Acrescenta procedência cartográfica e de homologação, índices normalizados e a leitura `catalogo(text)`. Torna elegíveis apenas o snapshot revisado de RAs e as naturezas manuais com evidência válida. |
| Seeds | O [gerador de catálogo](../../database/local/pcdf-sandbox/manual_catalog_seed.py) preserva as chaves e recusa registros divergentes. O [gerador de ativação](../../database/local/pcdf-sandbox/manual_activation.py) verifica os hashes do SQL, encadeia as três migrations e ambos os seeds sob um único `BEGIN` e valida o resultado antes do `COMMIT`. Sua execução gera um arquivo SQL sem conexão ao PostgreSQL. |

| Artefato revisado | SHA-256 |
| --- | --- |
| `manual-occurrences.sql` · versão Etapa 3 | `baa6f5f782c3c3949fa1b0e0d1260807c32bbdacf99c9b042503e074eebec972` |
| `manual-catalog-codes.sql` | `47fbe06a78bbeb0ab1bbeb87c0500c5280cf52aff4232d5a5ddbbcb02a5b2529` |
| `manual-catalog-release.sql` | `ea34257bcd2971a43ebdb9adc6a9c2210577a1ff84a80df9c49e8d05deb2bc02` |
| Seed territorial avulso UTF-8 | `a5ff249b24b4f6b8d2aaeb4039d8e282fe6859424288c6f72ac39446801630f9` |

O cadastro opera em uma transação de aplicação. O PostgreSQL serializa reenvios para a mesma conta e chave por lock transacional. A gravação envolve ocorrência, associações, geometria, recibo e auditoria. A API retorna o UUID após commit. A confirmação é declarada pelo operador e o PostGIS verifica de forma independente a região e a unicidade espacial. O estado inicial `em_revisao` aparece em **Cadastro manual**, separado das associações importadas e das consolidadas. O fluxo permanece fora dos indicadores e do Mapa Criminal.

As migrations estruturais são de aplicação única. A repetição do pacote integral é recusada se o schema, a ledger, os papéis ou os catálogos divergirem do estado inicial. Os seeds avulsos aceitam reexecução quando o conteúdo existente for idêntico. Em erro antes do commit, a sessão reverte o pacote inteiro. Uma interrupção perto do commit exige verificar a ledger, os schemas e os catálogos por leitura antes de qualquer reenvio.

## Catálogos

A preparação territorial pode ser gerada com `manual_activation.py --somente-catalogo-territorial --saida <arquivo>`. Ela instala a estrutura de consulta e a referência IDE/DF. O pacote revoga o cadastro legado para os perfis da aplicação. Após essa preparação, use o seed avulso `manual_catalog_seed.py natureza` para a carga de um manifesto oficial. A gravação institucional exige a rotina autenticada de cadastro completo.

- **RAs.** O pacote possui 37 UUIDs e números administrativos rastreáveis. Códigos `RA-I` a `RA-XXXVI` e `XXXVII` para Ponte Alta, preservados conforme o GeoJSON IDE/DF de 13/11/2026. A geometria permanece em EPSG:4326. A vigência jurídica dos polígonos não foi comprovada. [Matriz revisada](../catalogos/ras-revisao-2026-11-13-v1/matrix.md) · [GeoJSON e procedência](../../public/data/cartography/provenance.json)
- **Naturezas.** 41 pendentes, 34 presentes no lote de janeiro, zero aprovadas para cadastro manual. Duas referências analíticas foram documentadas e seguem fora da carga, assim como as 20 categorias analíticas. A aprovação precisa identificar emissor, versão, código, descrição, uso manual e hash do manifesto. [Matriz para aprovação](../catalogos/naturezas-manuais-matriz-aprovacao.md) · [Modelo do manifesto](../catalogos/naturezas-manuais-aprovacao-modelo.json)

## Backup e recuperação

O backup lógico foi gerado em leitura no diretório privado `%USERPROFILE%\.sentinela-local\pcdf-backup-manual-etapa3-a60be7e5-ca6c-4569-b158-fde31f160df4`. O recibo `backup-verified.json` permanece nesse diretório e a cópia local de evidência está em `tmp/ocorrencias-persistentes/backup-manual-etapa3.json`.

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| `sentinela_pcdf_local.dump` | 3.079.949 | `b62421fd4f1921ae794f715fde6a1aecd60cfedf9b5b0e52354f0dbd243a1856` |
| `roles-sem-senhas.sql` | 1.474 | `f4cd9281f6dd60dc9700f50de02178389dbb5d28809e7a076b9d55cd41168376` |
| `system-grants.sql` | 262 | `09461821c6dac5a86704cc023fae3abb7bd434896f48175d11d38523afdc175d` |

O arquivo foi validado por hash, TOC e restauração na porta isolada `55486`. A verificação comparou o schema completo, funções, RLS, privilégios, hashes de todas as tabelas aplicáveis e as leituras dos três perfis. O clone foi parado ao fim. Em uma futura janela, repetir a atestação, o backup e o teste de restauração se houver divergência após a fotografia ou mudança de ambiente. Preservar as cópias anteriores e os artefatos em diretório privado. [pg_dump 17](https://www.postgresql.org/docs/17/app-pgdump.html) · [pg_restore 17](https://www.postgresql.org/docs/17/app-pgrestore.html)

```powershell
# Sessão administrativa separada e credencial fornecida por meio seguro.
# Os caminhos abaixo apontam para arquivos novos no diretório privado.
$opcoesPgAnteriores = $env:PGOPTIONS
try {
    $env:PGOPTIONS = '-c default_transaction_read_only=on'
    pg_dump -h 127.0.0.1 -p 55484 -U postgres -d sentinela_pcdf_local --format=custom --create --encoding=UTF8 -f $dumpPrivado
    if ($LASTEXITCODE) { throw 'Falha no backup do banco' }
    pg_dumpall -h 127.0.0.1 -p 55484 -U postgres --roles-only --no-role-passwords -f $papeisPrivados
    if ($LASTEXITCODE) { throw 'Falha no backup de papéis' }
} finally {
    $env:PGOPTIONS = $opcoesPgAnteriores
}
Get-FileHash -Algorithm SHA256 -LiteralPath $dumpPrivado,$papeisPrivados,$grantsPrivados
pg_restore --list $dumpPrivado
# Provisionar primeiro o cluster vazio e atestado de recuperação, com PostGIS compatível.
# Em uma cópia privada dos papéis, revisar e omitir somente CREATE ROLE postgres; o bootstrap já criou esse papel.
psql -X -h 127.0.0.1 -p 55486 -U postgres -d postgres -v ON_ERROR_STOP=1 -f $papeisRevisadosDoClone
pg_restore -h 127.0.0.1 -p 55486 -U postgres -d postgres --create --exit-on-error $dumpPrivado
psql -X -h 127.0.0.1 -p 55486 -U postgres -d sentinela_pcdf_local -v ON_ERROR_STOP=1 -f $grantsPrivados
# Usar credenciais novas no clone para comparar schema, RLS, dados e perfis.
```

Para recuperação após commit, primeiro suspenda o cadastro e preserve uma nova fotografia. Uma revogação autorizada de `EXECUTE` de `sentinela_ocorrencias_manual.cadastrar(jsonb,uuid,text)` para os dois papéis bloqueia novos registros. Restaure em outro cluster atestado, compare integridade e reconcilie as transações posteriores à fotografia. A troca do destino requer decisão própria. A restauração da homologação foi feita exclusivamente em `55486`.

## Comandos de ativação futura

1. Obter o manifesto institucional e conferir o SHA-256 contra o ato independente. Obter autorização expressa para as três migrations e a carga das 37 RAs e das naturezas aprovadas no destino atestado.
2. Estabelecer uma janela sem escritas concorrentes. Confirmar `127.0.0.1:55484`, versão 17.11, PostGIS 3.6.2, UUID do manifesto, `system_identifier`, RLS e zero registros manuais. Conferir os fingerprints da PCDF, o backup privado e o recibo da restauração. Interromper se a identidade, o schema, a ledger, os catálogos ou os hashes divergirem.
3. Gerar o pacote a partir do manifesto aprovado em diretório privado. Conferir o arquivo e registrar o hash do pacote autorizado. O script abaixo é para a janela futura.

   ```powershell
   python -B database/local/pcdf-sandbox/manual_activation.py $manifestoAprovado --sha256 $sha256DoAto --saida $sqlPrivado
   Get-FileHash -Algorithm SHA256 -LiteralPath $sqlPrivado
   psql -X -h 127.0.0.1 -p 55484 -U postgres -d sentinela_pcdf_local -v ON_ERROR_STOP=1 -v "expected_uuid=$uuidAtestado" -v "expected_system=$sistemaAtestado" -f $sqlPrivado
   ```

4. Após commit, verificar as três entradas na ledger, 37 RAs, a quantidade do manifesto e RLS dos objetos. Validar os GETs de catálogo e consulta com os perfis permitidos e a recusa ao Analista no catálogo manual. Conferir novamente hashes, 6.393 associações, 34 campos, 20.020 pendências e zero consolidada. A homologação com gravação continua em ambiente sintético. Em caso de divergência, manter a janela fechada e decidir pela recuperação antes de disponibilizar a funcionalidade.

## Homologação técnica

- Em PostgreSQL/PostGIS sintético, foram aplicados o pacote integral e os seeds de 37 RAs e duas naturezas exclusivamente sintéticas. A falha injetada logo antes do commit reverteu DDL, papéis, ledger e os dois catálogos. Uma segunda execução do pacote após sucesso foi recusada. A reexecução dos seeds idênticos foi aceita.
- Administrador e Operador gravaram dois registros no estado `em_revisao`, com quatro vínculos de natureza, dois recibos, dois eventos de auditoria e pontos `4326` iguais às coordenadas. O Analista recebeu `403` para gravação e consultou os detalhes. Os três papéis não puderam gravar diretamente nas tabelas nem ler os recibos diretamente.
- API e SQL recusaram ponto sem confirmação, RA incompatível, coordenadas ausentes ou fora do DF e natureza ausente ou inapta. O teste de falha tardia forçou a rejeição do registro na auditoria depois dos `INSERT`s anteriores e verificou a ausência da ocorrência e dos efeitos parciais. Reenvio concorrente devolveu o mesmo UUID e conteúdo alterado com a chave anterior gerou `409`.
- O Edge validou `/ocorrencias/nova`, a aba **Cadastro manual** em `/ocorrencias` e a abertura de `/importar`. As capturas foram feitas em 1920, 1440, 1366, 1024, 768 e 390 px. O fluxo de mapa e tema foi preservado. O detalhe foi consultado após recarregar a página e comparado após reiniciar o Next.js. O reinício do PostgreSQL preservou as contagens de persistência e o catálogo. As evidências sintéticas estão em `tmp/manual-ativacao-stage3-evidence/`.
- No ambiente operacional, foram verificadas as três telas em leitura. O ViaCEP e o IPEDF reais centralizaram o mapa com o CEP público `70070-010` em desktop e mobile. `/ocorrencias` exibiu 6.393 associações e `/importar` exibiu o histórico. A API do catálogo manual retornou `503`, e o formulário manteve a gravação desabilitada.
- Passaram 264 testes Node, 11 testes estáticos SQL/Python, TypeScript, ESLint, contratos/OpenAPI, verificação estática de rotas, build e `git diff --check`.
- Os fingerprints operacionais anteriores e posteriores foram idênticos. O lote preservou 6.393 associações com 34 campos, 20.020 pendências e zero ocorrências consolidadas. O banco operacional foi usado somente para leitura e backup.

## Arquivos e estado do checkout

Os novos arquivos são `manual_activation.py`, este pacote e a matriz e o modelo de aprovação de naturezas. Foram revisados `manual-occurrences.sql`, `qualify-manual.py`, `database/local/tests/test_static.py`, `scripts/check-manual-occurrence-browser.mjs`, `ManualCreate.tsx`, a rota de gravação manual, os contratos e o OpenAPI gerado. Os guias das etapas anteriores apontam para o procedimento revisado.

Checkout principal `feat/redesign-interface`, HEAD `3e1b3adb8b597c393a3bb3fe0d18c38f1166c9f0`. As alterações existentes foram preservadas. A etapa ficou em alterações locais.

## Limitações da ativação

- O IPEDF e o ViaCEP dependem de conectividade. A localização pode ser confirmada ou ajustada com o GeoJSON local, inclusive durante falhas de busca.
- O catálogo territorial serve à referência geométrica. A data de extração não determina a vigência jurídica de cada limite.
- A identidade local é registrada pela sessão autenticada e pelo identificador opaco da conta. A integração de identidade institucional permanece fora desta etapa.
- A aprovação de naturezas para cadastro, a homologação de correspondências analíticas e qualquer liberação futura de consolidação dependem das respectivas autoridades.
