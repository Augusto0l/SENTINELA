# Catálogo criminal: Etapa 3, classificação PCDF completa (ensaio em clone)

**Situação:** proposta revisada e ensaiada. **Nenhuma regra está homologada.** Não houve escrita no Supabase, no PostgreSQL operacional `55484` nem na Vercel, e não foi feito commit.

## 1. Matriz conjunta de 68 competências

O arquivo [`pcdf-matriz-conjunta-2021-2026.json`](../catalogos/pcdf-matriz-conjunta-2021-2026.json) foi extraído, só por leitura, dos 68 CSVs PCDF v2. Cada arquivo conferiu com SHA-256, bytes, linhas e naturezas da [matriz mensal auditada](pcdf-inventario-mensal-2021-2026.csv). O resultado tem 369.660 associações, 43 triplas, as 41 naturezas e as 19 categorias PCDF, com **nenhum par (natureza, tentativa) ambíguo**.

As 7 triplas que não aparecem em janeiro cobrem as 7 naturezas ausentes naquele mês:
- **Estupro:** ESTUPRO COLETIVO, COM RESULTADO MORTE e CORRETIVO.
- **Roubo:** ROUBO A CASA LOTÉRICA.
- **Tráfico:** TRÁFICO PREVALECENDO-SE DE FUNÇÃO PÚBLICA, INTERNACIONAL e PRIVILEGIADO.

Somente homicídio e feminicídio têm `crime_tentado = SIM`.

## 2. Matriz completa de classificação (proposta v2)

Fonte: [`sentinela-classificacao-v2.json`](../catalogos/sentinela-classificacao-v2.json). São 20 categorias do contrato e 3 complementares propostas: `SEN-CAT-21` Associação para o tráfico de drogas, `SEN-CAT-22` Artefato explosivo ou incendiário e `SEN-CAT-23` Roubo em propriedade rural.

| Nível | Regras | Associações |
| --- | ---: | ---: |
| direta | 30 | 349.493 |
| documentada | 2 | 5.827 |
| revisada (forma qualificada, causa de aumento ou crime da mesma lei) | 7 | 12.767 |
| complementar | 3 | 942 |
| ambígua (`conflitante`) | 1 | 631 |

**Revisão das regras diretas:** dentro de cada rótulo PCDF, as naturezas são o próprio crime nomeado, ou suas variantes de local e objeto. Exemplos: roubo em parada de ônibus e nas proximidades de banco são roubo a transeunte; furto de motocicleta é furto de veículo; posse ou porte de arma de fogo de uso permitido ou restrito é arma de fogo. As exceções foram tratadas como `revisada`, `complementar` ou `ambígua`.

**Limitação conhecida:** a natureza "LEI MARIA DA PENHA (Lei 11.340/06)" reúne crimes distintos sob um único rótulo. O dado original não permite separá-los.

| ID | Natureza original | Categoria PCDF | Tentativa | Associações 2021–2026 | Categoria proposta | Nível |
| --- | --- | --- | --- | ---: | --- | --- |
| PCDF-N-01 | ASSOCIACAO PARA O FIM DE TRAFICO DE SUBSTANCIA ENTORPECENTE | 89_TRAFICO DE DROGAS | NÃO | 799 | Associação para o tráfico de drogas | complementar |
| PCDF-N-02 | DESCUMPRIR DECISÃO JUDICIAL QUE DEFERE MEDIDAS PROTETIVAS DE URGÊNCIA PREVISTAS NA LEI 11.340/2006 | 112_LEI MARIA DA PENHA (Lei 11.340/06) | NÃO | 12.648 | Violência doméstica | revisada |
| PCDF-N-03 | ESTUPRO | 05_ESTUPRO | NÃO | 1.795 | Estupro | documentada |
| PCDF-N-04 | ESTUPRO COLETIVO | 05_ESTUPRO | NÃO | 14 | Estupro | revisada |
| PCDF-N-05 | ESTUPRO COM RESULTADO MORTE | 05_ESTUPRO | NÃO | 1 | Estupro | revisada |
| PCDF-N-06 | ESTUPRO CORRETIVO | 05_ESTUPRO | NÃO | 1 | Estupro | revisada |
| PCDF-N-07 | ESTUPRO DE VULNERÁVEL | 05_ESTUPRO | NÃO | 4.032 | Estupro de vulnerável | documentada |
| PCDF-N-08 | FEMINICIDIO | 123_FEMINICIDIO | NÃO | 141 | Feminicídio | direta |
| PCDF-N-08 | FEMINICIDIO | 123.1_TENTATIVA DE FEMINICIDIO | SIM | 540 | Tentativa de feminicídio | direta |
| PCDF-N-09 | FURTO DE MOTOCICLETA | 25_FURTO DE VEICULO | NÃO | 6.059 | Furto de veículo | direta |
| PCDF-N-10 | FURTO DE VEICULO | 25_FURTO DE VEICULO | NÃO | 12.667 | Furto de veículo | direta |
| PCDF-N-11 | FURTO EM COMERCIO | 26_FURTO EM COMERCIO | NÃO | 24.918 | Furto em comércio | direta |
| PCDF-N-12 | FURTO EM INTERIOR DE VEICULO | 28_FURTO EM INTERIOR DE VEICULO | NÃO | 37.474 | Furto em veículo | direta |
| PCDF-N-13 | FURTO EM RESIDENCIA | 27_FURTO EM RESIDENCIA | NÃO | 24.102 | Furto em residência | direta |
| PCDF-N-14 | HOMICIDIO | 01_HOMICIDIO | NÃO | 1.280 | Homicídio | direta |
| PCDF-N-14 | HOMICIDIO | 01.1_TENTATIVA DE HOMICIDIO | SIM | 2.952 | Tentativa de homicídio | direta |
| PCDF-N-15 | LATROCINIO | 21_LATROCINIO | NÃO | 85 | Latrocínio | direta |
| PCDF-N-16 | LEI MARIA DA PENHA (Lei 11.340/06) | 112_LEI MARIA DA PENHA (Lei 11.340/06) | NÃO | 116.262 | Violência doméstica | direta |
| PCDF-N-17 | PORTE DE ARMA | 87_PORTE/POSSE DE ARMA | NÃO | 631 | — (conflitante) | ambigua |
| PCDF-N-18 | PORTE DE SUBSTANCIA ENTORPECENTE PARA CONSUMO PESSOAL | 88_USO E PORTE DE DROGAS | NÃO | 19.565 | Uso e porte de drogas | direta |
| PCDF-N-19 | PORTE ILEGAL DE ARMA DE FOGO DE USO PERMITIDO (L.10826/03) | 87_PORTE/POSSE DE ARMA | NÃO | 2.530 | Posse/porte de arma de fogo | direta |
| PCDF-N-20 | POSSE IRREGULAR DE ARMA DE FOGO DE USO PERMITIDO (L.10826/03) | 87_PORTE/POSSE DE ARMA | NÃO | 1.299 | Posse/porte de arma de fogo | direta |
| PCDF-N-21 | POSSE OU PORTE ILEGAL DE ARMA DE FOGO DE  USO RESTRITO (L.10826/03) | 87_PORTE/POSSE DE ARMA | NÃO | 1.429 | Posse/porte de arma de fogo | direta |
| PCDF-N-22 | POSSUIR. DETIVER. FABRICAR OU EMPREGAR ARTEFATO EXPLOSIVO OU INCENDIÁRIO. SEM AUTORIZAÇÃO OU EM DESACORDO COM DETERMINAÇÃO LEGAL OU REGULAMENTAR | 87_PORTE/POSSE DE ARMA | NÃO | 21 | Artefato explosivo ou incendiário | complementar |
| PCDF-N-23 | ROUBO A BAR | 19_ROUBO EM COMÉRCIO | NÃO | 50 | Roubo em comércio | direta |
| PCDF-N-24 | ROUBO A CASA LOTERICA | 19_ROUBO EM COMÉRCIO | NÃO | 3 | Roubo em comércio | direta |
| PCDF-N-25 | ROUBO A DROGARIA | 19_ROUBO EM COMÉRCIO | NÃO | 335 | Roubo em comércio | direta |
| PCDF-N-26 | ROUBO A PANIFICADORA | 19_ROUBO EM COMÉRCIO | NÃO | 141 | Roubo em comércio | direta |
| PCDF-N-27 | ROUBO A SUPERMERCADO E ATACADISTA | 19_ROUBO EM COMÉRCIO | NÃO | 113 | Roubo em comércio | direta |
| PCDF-N-28 | ROUBO A TRAILLER | 19_ROUBO EM COMÉRCIO | NÃO | 20 | Roubo em comércio | direta |
| PCDF-N-29 | ROUBO A TRANSEUNTE | 13_ROUBO A TRANSEUNTE | NÃO | 64.430 | Roubo a transeunte | direta |
| PCDF-N-30 | ROUBO DE VEICULO | 18_ROUBO DE VEICULO | NÃO | 7.117 | Roubo de veículo | direta |
| PCDF-N-31 | ROUBO EM CHÁCARA. SÍTIO OU FAZENDA | 20_ROUBO EM RESIDÊNCIA | NÃO | 122 | Roubo em propriedade rural | complementar |
| PCDF-N-32 | ROUBO EM COLETIVO | 14_ROUBO EM COLETIVO | NÃO | 2.059 | Roubo em transporte coletivo | direta |
| PCDF-N-33 | ROUBO EM OUTROS ESTABELECIMENTOS COMERCIAIS | 19_ROUBO EM COMÉRCIO | NÃO | 1.893 | Roubo em comércio | direta |
| PCDF-N-34 | ROUBO EM PARADA DE ONIBUS | 13_ROUBO A TRANSEUNTE | NÃO | 6.233 | Roubo a transeunte | direta |
| PCDF-N-35 | ROUBO EM RESIDENCIA | 20_ROUBO EM RESIDÊNCIA | NÃO | 1.090 | Roubo em residência | direta |
| PCDF-N-36 | ROUBO NA PROXIMIDADES DE BANCO | 13_ROUBO A TRANSEUNTE | NÃO | 51 | Roubo a transeunte | direta |
| PCDF-N-37 | ROUBO NAS PROXIMIDADES DE CAIXA ELETRONICO | 13_ROUBO A TRANSEUNTE | NÃO | 11 | Roubo a transeunte | direta |
| PCDF-N-38 | TRÁFICO DE DROGAS PREVALECENDO-SE DE FUNÇÃO PÚBLICA | 89_TRAFICO DE DROGAS | NÃO | 3 | Tráfico de drogas | revisada |
| PCDF-N-39 | TRÁFICO DE SUBSTANCIA ENTORPECENTE | 89_TRAFICO DE DROGAS | NÃO | 14.644 | Tráfico de drogas | direta |
| PCDF-N-40 | TRÁFICO INTERNACIONAL DE SUBSTANCIA ENTORPECENTE | 89_TRAFICO DE DROGAS | NÃO | 18 | Tráfico de drogas | revisada |
| PCDF-N-41 | TRÁFICO PRIVILEGIADO | 89_TRAFICO DE DROGAS | NÃO | 82 | Tráfico de drogas | revisada |

## 3. Revisão de segurança do backend (`sql/0002_reclassificacao_backend.sql`)

| Achado na versão da Etapa 2 | Correção na v2 |
| --- | --- |
| `reclassificar()` aceitava qualquer UUID de Administrador ativo como aprovador, sem prova de identidade | Removida. `aprovador()` exige `session_user = sentinela_local_admin`, usuário Administrador ativo vinculado ao Supabase Auth e a conta `sha256(["sentinela-supabase", url, auth_user_id])` calculada pelo servidor. Também exige liberação aberta, presa à porta, ao UUID do cluster e ao `system_identifier`. É o mesmo modelo do cadastro manual. |
| Só o executor técnico `postgres` chamava a função | `EXECUTE` só para `sentinela_local_admin`. Operador, Analista e leitor analítico não têm acesso, e `postgres` é recusado como aprovador. |
| Versão de regra passada livremente por parâmetro | A versão vem só de `liberacao.versao_ativa`, explícita. Sem ela, ou com versão inexistente, nada é aplicado. |
| Sem serialização por lote | `pg_advisory_xact_lock` por lote |
| Gatilhos adiados disparados no commit, com o perfil da aplicação | `SET CONSTRAINTS ALL IMMEDIATE` dentro da função: as conferências de histórico e de evento rodam como o papel dono, sem ampliar a leitura do perfil |

**Mantido:**
- dono `NOLOGIN NOINHERIT NOBYPASSRLS`;
- `SECURITY DEFINER` com `search_path = pg_catalog, pg_temp`;
- RLS forçada, com policies mínimas para o dono;
- o ramo adicional nos dois gatilhos de bloqueio exige o dono, o `session_user` Administrador, a porta 55487 e a marca da transação corrente.

**Privilégios exigidos só para o PostgreSQL planejar as expressões dos gatilhos existentes:**
- `USAGE` em `sentinela_ocorrencias_manual` e `EXECUTE` na verificação somente leitura `verificar_evento`;
- `SELECT` em `execucoes_importacao` e `linhas_staging`, **sem policy**, de modo que nenhuma linha fica visível.

Esses privilégios estão registrados como ponto de revisão. O `0002` está fixado por hash em `database/local/tests/test_static.py`, como pendente de revisão institucional.

## 4. Resultados do ensaio (`ensaio-classificacao-v2.json`, 32 verificações)

| Indicador | Valor |
| --- | --- |
| Janeiro/2021 aplicado | 6.378 mapeadas, 14 conflitantes (PORTE DE ARMA), 0 desconhecidas |
| Pendências de classificação | 6.378 resolvidas com histórico e evento. Ficam 15 abertas: 14 conflitantes e 1 linha em revisão. Coordenadas, endereço/RA e identificação ficaram inalteradas. |
| Reversão compensatória | 6.392 revertidas e 6.378 pendências reabertas. O estado inicial de janeiro voltou e o histórico foi acrescido. A reaplicação reproduziu o resultado. |
| Fevereiro/2021, pelo receptor real | 5.490 associações entram pendentes. Versão ativa sem regras homologadas: nada é aplicado. Versão do ensaio: 5.476 mapeadas, 14 conflitantes, 0 desconhecidas. Janeiro não muda. |
| Contagens | Ocorrências 6.091 → 11.312 (+5.221). Associações 6.393 → 11.883 (+5.490). |
| Perfis | Administrador e Operador: 6.393 importadas e 6.090 consolidadas antes e depois. Analista: sem acesso à listagem, igual a antes. |
| Testes do repositório | Node: 339 aprovados, 4 ignorados. SQL estático: 11/11. ESLint, TypeScript e contratos aprovados. |

## 5. Decisões necessárias para a homologação definitiva

1. **Categorias complementares:** aprovar `SEN-CAT-21`, `SEN-CAT-22` e `SEN-CAT-23` ou indicar outro destino. A alternativa para roubo em chácara é manter `Roubo em residência`, como faz a PCDF.
2. **Descumprimento de medida protetiva:** confirmar a classificação em `Violência doméstica`.
3. **Variantes revisadas:** confirmar estupro coletivo, corretivo e com resultado morte em `Estupro`, e as três formas de tráfico em `Tráfico de drogas`.
4. **PORTE DE ARMA:** manter como `conflitante` até haver um campo que distinga o tipo de arma, ou definir outra regra.
5. **Homologação de cada regra:** responsável, evidência e vigência por regra, gravados numa versão nova, que não pode ser a `-ensaio`.
6. **Escopo de pendências:** o receptor atual não cria pendências de classificação para lotes novos. Decidir se isso permanece assim.
7. **Integração automática:** chamar `aplicar_lote` ao fim da confirmação de cada lote, usando a mesma sessão do Administrador. Hoje a chamada é explícita.
8. **Revisão de segurança institucional do `0002`** e migration autorizada para 55484 ou Supabase. No Supabase, a identidade virá de `sentinela_ambiente.ator_operacional()`.
9. **Classificação da associação manual:** ela está fora do lote e permanece `pendente`.
