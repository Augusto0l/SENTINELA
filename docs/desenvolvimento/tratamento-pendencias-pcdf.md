# Tratamento auditado das pendências PCDF v2

**27/11/2026.** Aplicado no Supabase de produção às 14:16 (Brasília) pela migration `0019`, versão física `20261127171526`. O tratamento é automático nas próximas importações mensais.

## Resultado por competência

Contagens lidas no PostgreSQL de produção após a aplicação. "Funcionais" é o que a tela Ocorrências mostra a Administrador e Operador. As pendências físicas não foram apagadas e nenhum status foi alterado.

| Competência | Associações | Ocorrências únicas | Pendências físicas | Funcionais antes | Tratadas | Conflitantes | Restantes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2021-01 | 6.393 | 6.090 | 26.714 | 8.091 | 0 | 0 | 8.091 |
| 2021-02 | 5.490 | 5.221 | 13.593 | 13.593 | 4.737 | 0 | 8.856 |
| 2021-03 | 5.496 | 5.205 | 13.616 | 13.616 | 4.773 | 0 | 8.843 |
| 2021-04 | 5.606 | 5.322 | 13.871 | 13.871 | 4.916 | 0 | 8.955 |
| 2021-05 | 5.721 | 5.431 | 14.232 | 14.232 | 4.891 | 0 | 9.341 |
| 2021-06 | 5.536 | 5.240 | 13.695 | 13.695 | 4.773 | 0 | 8.922 |
| 2021-07 | 5.524 | 5.264 | 13.812 | 13.812 | 4.708 | 0 | 9.104 |
| 2021-08 | 5.628 | 5.330 | 14.092 | 14.092 | 4.801 | 0 | 9.291 |
| 2021-09 | 5.822 | 5.549 | 14.438 | 14.438 | 5.019 | 0 | 9.419 |
| 2021-10 | 6.332 | 6.043 | 15.553 | 15.553 | 5.446 | 0 | 10.107 |
| 2021-11 | 5.974 | 5.686 | 14.959 | 14.959 | 5.137 | 0 | 9.822 |
| **Total** | **63.522** | **60.381** | **168.575** | **149.952** | **49.201** | **0** | **100.751** |

Janeiro já tinha 18.623 pendências fora da fila funcional antes desta etapa: 12.230 ausências de componente (regra de janeiro) e 6.393 de classificação. Nenhuma pendência foi registrada como conflitante. Os 14 casos de PORTE DE ARMA só passam a conflitantes quando a classificação v2 for aplicada.

### Restantes por tipo

| Tipo | Pendências | Por que permanecem |
| --- | ---: | --- |
| Coordenadas | 63.563 | O CRS de origem da PCDF não foi confirmado. São 56.087 com GEO completo e referência pendente, 7.435 sem GEO e 41 marcadores de UTM sem GEO. |
| Região Administrativa | 9.706 | `RA 01_BRASÍLIA` (6.142), `RA 32_SOL NASCENTE/POR DO SOL` (1.665), `RA 25_ESTRUTURAL` (1.511), `RA 22_SUDOESTE` (311) e `RA 98_NÃO INFORMADA` (77). O catálogo de RAs veda aliases históricos automáticos, e a RA 32 está "aprovada com ressalva". |
| Endereço | 27.481 | Área ou quadra "NÃO INFORMADO" na origem. |
| Identificação | 1 | Registro anterior ao fato (janeiro). |
| Classificação | 6.393 (já fora da fila) | A migration de classificação ainda não foi instalada nem homologada. |

## Regra aplicada

Somente a regra homologada em janeiro (`clone-pcdf-coordenadas-ausencia-0001`) foi aplicada: uma ausência de coordenada que repete um estado geográfico já registrado sai da revisão funcional.

De fevereiro em diante, o receptor registra essa ausência como `coordenada_status / utm_ausente`, que é a ausência do par UTM. Cada uma das 49.201 pendências tratadas tem evidência objetiva no próprio registro:

- latitude e longitude UTM originais vazias ou `NULL`;
- `coordenada_status` do CSV igual ao snapshot da pendência;
- estado GEO bloqueante no diagnóstico do staging;
- pendência `geo_*` aberta na mesma associação.

O estado `geo_*` continua aberto, e o ponto continua sem publicação.

Ficou de fora a redundância de área e quadra com `endereco_pendente` (14.824 pendências). É o mesmo princípio, mas janeiro não tinha esse caso e a regra não está homologada.

## Mecanismo

| Objeto | Função |
| --- | --- |
| `sentinela_pcdf_historico.tratamentos` | Ledger por lote e versão (`pcdf-tratamento-v1`): estado, processo, executor, usuário, tentativas, contagens, SHA-256 da coorte, evidência por regra e erro. Linhas concluídas são imutáveis. |
| `sentinela_pcdf_historico.tratamento_pendencias` | Coorte auditada (49.201 UUIDs). É a única fonte da retirada funcional e é imutável. |
| `tratar_lote(lote, processo)` | Calcula a coorte, grava o ledger, a coorte e o evento `pcdf.tratamento.concluido`. É idempotente e usa advisory lock por lote. |
| `iniciar_tratamento`, `registrar_falha_tratamento`, `lotes_pendentes_tratamento` | Estados `processando` e `falha_recuperavel`, além da retomada. Um `processando` com mais de 10 minutos volta a ser elegível. |
| `situacao_tratamento()` | Situação por competência para Administrador e Operador. O Analista não tem acesso. |
| Policy `pendencias_pcdf_utm_ausente_leitura` | RESTRICTIVE para `sentinela_ocorrencias_reader`, no mesmo escopo da policy de janeiro. |

O dono é `sentinela_pcdf_historico_owner` (`NOLOGIN NOINHERIT NOBYPASSRLS`), e as duas tabelas novas têm RLS forçada. Classificação, RA, endereço e geografia ficam registrados na evidência com `aplicada: false` e o motivo.

### Importação automática

[`runPcdfTreatment`](../../src/lib/db/pcdf-treatment.ts) roda depois do `COMMIT` de cada CSV mensal confirmado, em [`pcdf-direct.ts`](../../src/lib/db/pcdf-direct.ts). Cada lote é tratado em transação própria, de modo que uma falha não desfaz a importação. A competência fica como **Falha recuperável** e é retomada na próxima confirmação ou pelo botão **Retomar tratamento** (`POST ?modalidade=historico&etapa=tratar`, só Administrador).

Na fila mensal, cada competência mostra uma destas situações: Aguardando, Processando, Concluído, Concluído com pendências ou Falha recuperável.

Sem a 0019, ou depois da reversão, o importador não executa nada. Novas pendências continuam sendo criadas pelo receptor para todo diagnóstico, e os originais PCDF são preservados.

## Evidências

| Item | Evidência |
| --- | --- |
| Backup | `D:\Backups\SENTINELA\SENTINELA-PRODUCTION-2026-11-27T16-20-28-633Z\database.dump`, 37.663.852 bytes, 2.287 entradas, SHA-256 `e3cc6701657791a2ff34f1aec4ebb34a86fbd192bae30ccc659e8d7b695416fd` |
| Restauração | Cluster PostgreSQL 17 descartável, com papéis exportados sem senha. As 70 assinaturas (tabelas `sentinela*`, `auth`, `supabase_migrations`, 144 policies e 125 funções) ficaram idênticas à produção. Os 24 erros do `pg_restore` são de `supabase_vault` e de funções da PostGIS 3.3.7. |
| Pré-voo | As assinaturas `sentinela*` em produção eram iguais às do backup imediatamente antes da aplicação. Só `auth` mudou, por atividade de login. |
| Pacote | Fonte SHA-256 `a085642ac9f1080bb27f36308dd8e518b402cdde4e5c1f72784bcd71e57d05d1`, renderizada por `prepare_0012_application.render`, com guarda de versão física e PostGIS |
| Pós-aplicação | Mudaram só os eventos (+11), os dois ledgers, as tabelas novas, as policies (+9) e as funções (+9). Pendências, staging, ocorrências, associações e `pcdf_pontos` permaneceram idênticos. Há 19 + 4 tabelas com RLS forçada e zero FKs não validadas. |
| Auditoria | 11 eventos `pcdf.tratamento.concluido`, de `8c5bb35e…` (2021-01) a `b8d24274…` (2021-11), cada um com os UUIDs e o SHA-256 da coorte |

### Ensaio no clone restaurado

| Cenário | Resultado |
| --- | --- |
| Pacote com `ROLLBACK` | As 70 assinaturas ficaram iguais à linha de base. |
| Aplicação | 9,6 s. Os três perfis foram conferidos pelo `resumo()`: Administrador e Operador 149.952 → 100.751, Analista sem acesso, como antes. |
| Reaplicação | O pacote foi recusado pela guarda física. `tratar_lote` repetido devolve `replay` sem novo evento. |
| Nova competência (dez/2021, receptor real) | Importação com o tratamento bloqueado por outra sessão: **Falha recuperável**, com as 14.254 pendências novas abertas. Rollback sem efeito. A retomada concorrente por duas sessões gerou um tratamento e um evento: 4.999 tratadas e 9.255 restantes. O reenvio do CSV não duplicou ocorrências, associações, pendências, tratamentos nem eventos. |
| Reversão | A fila voltou a 164.206 e a execução ficou revogada. Ledger, coorte, eventos e pendências foram preservados. A segunda reversão foi recusada. |
| Desempenho | `resumo()` passou de 18–19 s para 19–20 s. A base lenta vem da policy de janeiro, que já existia. Uma primeira versão, que avaliava a evidência por linha, excedeu 120 s e foi substituída pela coorte persistida. |

### Testes do repositório

TypeScript, ESLint, contratos/OpenAPI, rotas e build de produção aprovados. A suíte Node teve 347 testes: 343 aprovados, 4 ignorados e 0 falhas, incluindo 5 novos em [`pcdf-treatment.test.mjs`](../../tests/pcdf-treatment.test.mjs).

O SQL estático teve 10 de 11 aprovados. A falha restante (hash de um catálogo manual) é idêntica na branch base.

## Reversão

[`reverter_0019_projecao_utm_ausente_pcdf.sql`](../../database/supabase/pendentes/reverter_0019_projecao_utm_ausente_pcdf.sql) remove a policy e revoga a execução do tratamento. Ela preserva o ledger, a coorte, os eventos e as pendências, e registra `pcdf.tratamento.revertido`. Deve ser renderizada pelo mesmo `render`, com a versão física corrente.

Último recurso: restaurar o backup acima.

## Pendências para decisão

1. Homologar a redundância de área/quadra com `endereco_pendente` (14.824).
2. Homologar e instalar a classificação v2 (branch `feat/classificacao-pcdf-v2`). O tratamento registra a classificação como não aplicada até lá.
3. Obter da PCDF o CRS das coordenadas e uma equivalência histórica e vigente para as RAs 01, 22, 25 e 32.
4. Otimizar a policy de janeiro (`pcdf_componente_ausente_v1`), responsável pelos ~18 s do resumo.
