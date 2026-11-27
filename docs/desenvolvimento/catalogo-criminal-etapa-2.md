# Catálogo criminal: Etapa 2, classificação de janeiro/2021 em clone descartável

**Situação:** proposta ensaiada. Nenhuma regra está homologada. Não houve escrita no Supabase, no PostgreSQL operacional `55484` nem na Vercel.

## Matriz conjunta

O arquivo [`pcdf-matriz-conjunta-2021-01.json`](../catalogos/pcdf-matriz-conjunta-2021-01.json) foi extraído, só por leitura, de um clone do operacional local (lote `84908630…`). Ele reúne 36 triplas natureza original × categoria PCDF × tentativa. As triplas cobrem 6.392 associações importadas, 34 das 41 naturezas e as 19 categorias PCDF. A 6.393ª associação é a ocorrência manual. Cada par (natureza, `crime_tentado`) tem uma única categoria PCDF. HOMICIDIO e FEMINICIDIO se dividem sem exceção pela tentativa: SIM vai para `01.1`/`123.1`, NÃO vai para `01`/`123`.

## Proposta v1

O arquivo [`sentinela-classificacao-v1.json`](../catalogos/sentinela-classificacao-v1.json) define 20 categorias pendentes (`SEN-CAT-01` a `20`, códigos internos e não oficiais) e uma regra por par. Cada regra mantém o ID `PCDF-N-xx`.

| Nível | Regras | Associações | Ativável no ensaio |
| --- | ---: | ---: | --- |
| direta: rótulo PCDF igual ao rótulo previsto (seção 5.2) | 29 | 6.131 | sim |
| documentada: Estupro e Estupro de vulnerável (relatório PCDF) | 2 | 116 | sim |
| semântica: agrupamento PCDF a decidir | 5 | 145 | não |
| não observada em 2021-01 | 7 | 0 | não |

## Implementação no clone (`database/local/catalogo-criminal`)

- `0001_catalogo_proposta.sql`: 20 categorias e 36 mapeamentos com status `pendente`, sem categoria, porque o schema só aceita categoria em regra homologada.
- `0002_reclassificacao_backend.sql`: papel `NOLOGIN` sem bypass de RLS, policies mínimas e a função `SECURITY DEFINER` `reclassificar()`. O bloqueio de correções ganha um terceiro ramo, restrito a esse papel, à porta 55487 e a uma marca da própria transação. Cada campo alterado gera um registro em `historico_correcoes`, e o reprocessamento gera um evento de auditoria.
- `0003_homologacao_ensaio.sql`: versão `…-ensaio` com 31 regras. A evidência declara que **não** é homologação institucional.
- `ensaio_classificacao.py`: 22 verificações, gravadas em [`ensaio-classificacao-2021-01.json`](../catalogos/ensaio-classificacao-2021-01.json).

| Indicador | Antes | Depois |
| --- | ---: | ---: |
| Associações | 6.393 pendentes | 6.247 mapeadas + 146 pendentes (145 semânticas + 1 manual) |
| Histórico de correções | 0 | 12.494 (2 por associação) |
| Eventos de auditoria | 21 | 23 (proposta + reprocessamento) |
| Origem, staging, ocorrências, naturezas, pendências | fingerprints | idênticos |
| Tabelas com RLS forçada | 19 | 19 |

**Confirmado no ensaio:**
- Cada script aplicado duas vezes produz o mesmo estado (idempotência).
- A execução encerrada com `ROLLBACK` não deixa efeito.
- A repetição do reprocessamento reclassifica 0.
- Os três perfis da aplicação e o executor técnico continuam sem escrita direta. A marca de transação sozinha não libera nada.
- Aprovadores Operador ou Administrador inativo são recusados.
- Os receptores PCDF v2 não gravam classificação: novos lotes entram `pendente` e só mudam por reprocessamento explícito.

## Decisões pendentes antes de produção

1. **As 5 regras semânticas:**
   - descumprimento de medida protetiva → Violência doméstica;
   - associação para o tráfico → Tráfico;
   - artefato explosivo → arma de fogo;
   - "PORTE DE ARMA", rótulo genérico;
   - roubo em chácara → Roubo em residência.
2. **Tentativas de outros crimes:** não ocorreram em 2021-01. Decidir se seguem a categoria do crime consumado.
3. **Nome "Violência doméstica" para o rótulo 112:** a Lei Maria da Penha cobre a violência contra a mulher.
4. **Naturezas sem evidência:** as 7 não observadas e as outras modalidades de `05_ESTUPRO` dependem de outras competências.
5. **Homologação:** responsável, evidência e vigência por regra. A versão `-ensaio` não pode ser promovida.
6. **Backend em produção:**
   - **Revisão:** revisão de segurança do `0002`, que está fixado por hash em `test_static.py` como pendente de revisão.
   - **Escopo:** extensão para 55484 ou Supabase, o que significa uma migration nova e autorizada.
   - **Associação manual:** classificação da associação manual.
7. **Reversão depois de um commit:** o histórico é imutável, então desfazer exige uma reclassificação compensatória (`mapeada` → `pendente`), que ainda não existe. No ensaio, a reversão é descartar o clone.
