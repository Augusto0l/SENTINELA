# Expansão histórica PCDF — etapa 6

Homologação do lote de fevereiro de 2021 em cópia privada do PostgreSQL operacional em 25/11/2026. Janeiro de 2021 já estava consolidado na origem. O destino operacional da etapa futura é `127.0.0.1:55484/sentinela_pcdf_local`.

## Inventário de janeiro de 2021 a agosto de 2026

A [matriz mensal](./pcdf-inventario-mensal-2021-2026.csv) contém 68 competências, com nome de arquivo, tamanho, SHA-256, contagem de associações, chaves policiais, intervalo de datas, dias observados, distribuição literal de naturezas, repetição de origens e estados separados para GEO e UTM. SHA-256 da matriz `18c7584ecf3566870d0384afa0b32bdcf7193b6c4007cc5a798a5e7dc0e6ba6a`.

- Os 68 arquivos de entrega conferem com as cópias arquivadas e com os hashes e tamanhos dos manifestos. Todos têm o cabeçalho v2 de 26 campos e registros com 26 valores. Os identificadores das 369.660 linhas foram recompostos com o SHA-256 declarado do XML, a aba `NATUREZAS` e a posição lógica. Os arquivos foram lidos em UTF-8, sem BOM, com delimitador `;` e terminadores CRLF verificados.
- Foram reconciliadas 369.660 associações, 369.660 origens distintas, 349.582 chaves candidatas e 41 naturezas originais. Há 19.262 chaves com múltiplas associações dentro da competência. Nenhum hash, identificador de origem ou tupla policial literal se repete entre meses. Também houve zero colisão decorrente de espaços externos na tupla e zero repetição intermensal da combinação de chave e natureza.
- Todas as associações têm chave policial reproduzível pela tupla literal de ano, unidade e número de registro. Todas as datas do fato correspondem à competência e ao ano do fato declarados. Nenhuma chave tem datas de fato distintas no mesmo mês. Quatro associações têm ano de registro anterior ao ano do fato, distribuídas entre janeiro de 2021 (1), janeiro de 2024 (1) e janeiro de 2026 (2). As competências de 2024 e 2026 exigem conciliação explícita quando forem homologadas.
- As associações somam 69.259 em 2021, 70.389 em 2022, 67.081 em 2023, 63.867 em 2024, 63.045 em 2025 e 36.019 de janeiro a agosto de 2026. Agosto de 2026 contém 2.443 associações de 1 a 18 de agosto. A cobertura após o dia 18 precisa ser confirmada antes de comparar agosto com outro mês inteiro.
- O par GEO passa na verificação numérica de formato e domínio em 360.906 associações, e está ausente em 8.754. O par UTM tem dois valores numéricos em 166.321 e está ausente em 203.339. A coluna `crs_origem` está vazia nos 68 manifestos. O inventário certifica zero pontos para publicação. Para uma homologação geográfica é preciso obter da PCDF a referência espacial da extração, com datum, CRS, unidades, eixos, método de produção e pontos de controle verificáveis.

O comando abaixo reproduz a matriz com os arquivos de origem em leitura.

```powershell
python -B scripts/audit-pcdf-history.py D:/Projetos/SENTINELA-DADOS docs/desenvolvimento/pcdf-inventario-mensal-2021-2026.csv
```

## Homologação de fevereiro

O arquivo `pcdf_naturezas_2021-02.csv` tem 2.236.837 bytes e SHA-256 `da6ee640e44b627198deb253cbdb5d078f5af2f877d4a97b2fb092aac459fa8c`. Contém 5.490 associações, 5.221 chaves candidatas, 251 chaves com múltiplas associações e 29 naturezas originais. Há 4.881 pares GEO numericamente plausíveis e 609 associações sem GEO. Fevereiro e janeiro compartilham zero chaves policiais literais.

A recepção usa o validador CSV v2 e a função `sentinela_pcdf_local.receive_csv` instalados. A conciliação controla a competência, o hash e a execução, confere a tupla literal com staging e origem, segrega colisões e datas conflitantes e gera um vínculo por associação com a natureza original. O staging, os valores geográficos brutos e a autorização institucional existente servem de proveniência. Em clone, o ensaio reverte a recepção e a consolidação em transação, repete o lote e registra o resultado com o hash das origens vinculadas.

O clone consolidou **5.221 ocorrências únicas e 5.490 vínculos com 29 naturezas originais**. São 251 ocorrências com múltiplas naturezas, zero vínculos sem natureza no catálogo, zero chaves de fevereiro em revisão de identidade, zero datas ou horários nulos e zero ocorrências com RA ou geometria publicável. Na consolidação por ocorrência, há 4.620 estados `referencia_pendente` e 601 `ausente` para GEO.

| Pendências e avisos de fevereiro | Quantidade | Efeito |
| --- | ---: | --- |
| Par GEO aguardando CRS | 4.881 | Bloqueia a publicação geográfica |
| Par GEO ausente | 609 | Bloqueia a publicação geográfica |
| Revisão de UTM sem GEO | 4 | Aviso |
| Par UTM ausente | 4.737 | Aviso |
| Endereço pendente | 697 | Aviso |
| Informação complementar ausente | 1.857 | Aviso |
| RA pendente de correspondência | 808 | Aviso |
| **Total de diagnósticos abertos** | **13.593** | **5.490 de dimensão geográfica e 8.103 avisos** |

A apuração é por associação. Uma origem pode ter mais de um diagnóstico. O reprocessamento de janeiro preservou 12.230 diagnósticos redundantes de componente no histórico, fora da fila funcional. Fevereiro usa o receptor com estados de par, que já suprime ausências redundantes por componente na recepção. Os avisos UTM são mantidos no estado previsto pelo validador atual.

O lote do clone é `49a164e9-a14a-472c-ac41-9ae96dba5788`, com execução `6e276c88-c4cf-49de-b035-6d894615220d`. O evento da consolidação `cf094374-06ea-4cfe-8f7a-10f6e4288fea` registra o recibo e o SHA-256 das origens vinculadas `34826af6e49642b57bd916a55f858910ad45365f0619703eddab93f71556cc2f`. Houve uma recepção, uma consolidação e um reenvio auditado, com duas tentativas registradas. O reenvio manteve o lote, a execução, a coorte e os vínculos.

### Reprodução do piloto

Com a porta 55487 livre, execute na raiz do SENTINELA. A primeira instrução obtém o snapshot do operacional em leitura, restaura a cópia para a porta 55487 e testa a recepção e a consolidação apenas nela. A segunda roda a validação de autenticação, API e Dashboard em um servidor de teste na porta 3318, com credenciais descartáveis.

```powershell
python -B database/local/pcdf-sandbox/qualify-pcdf-history.py novo D:/Projetos/SENTINELA-DADOS
python -B database/local/pcdf-sandbox/qualify-pcdf-history.py <clone> D:/Projetos/SENTINELA-DADOS --browser
```

O SQL do piloto usa porta, identificadores do cluster, recibo, competência e hash como guardas. O executor de homologação usa o administrador do clone para conciliar os candidatos e o papel institucional existente para testar a recepção.

## Dashboard e comparativo mensal

| Métrica | Janeiro de 2021 | Fevereiro de 2021 |
| --- | ---: | ---: |
| Associações de origem | 6.393 | 5.490 |
| Ocorrências únicas | 6.090 | 5.221 |
| Vínculos de natureza | 6.392 | 5.490 |
| Naturezas originais no indicador | 34 | 29 |
| Chaves que permanecem em revisão de identidade | 1 | 0 |
| Pontos geográficos validados | 0 | 0 |

O recorte combinado tem 11.311 ocorrências únicas. A queda de 869 ocorrências corresponde a **−14,3%** para fevereiro frente a janeiro, pela regra atual de meses consecutivos e completos no Dashboard. O filtro exclusivo de fevereiro mostra 5.221 ocorrências. O filtro horário de fevereiro retorna 836 (0h–6h), 1.270 (6h–12h), 1.391 (12h–18h) e 1.724 (18h–24h). Os filtros por RA retornam zero e as respostas de pontos e calor são vazias.

| Natureza original PCDF | Janeiro | Fevereiro |
| --- | ---: | ---: |
| LEI MARIA DA PENHA (Lei 11.340/06) | 1.690 | 1.245 |
| ROUBO A TRANSEUNTE | 1.387 | 1.296 |
| FURTO EM INTERIOR DE VEICULO | 549 | 525 |
| FURTO EM RESIDENCIA | 473 | 360 |
| PORTE DE SUBSTANCIA ENTORPECENTE PARA CONSUMO PESSOAL | 429 | 407 |
| FURTO EM COMERCIO | 332 | 281 |

A série conta cada ocorrência uma vez. A distribuição por natureza conta ocorrências distintas dentro de cada natureza, então uma ocorrência com várias naturezas aparece nas respectivas linhas da distribuição. O resultado por natureza completo fica em `pcdf-history-result.json`.

## Testes e evidências

- O backup `15ce336cad1d82d3bfc4a359dda0b4bc920f312ecd9593a4717b396fb2c5a1b8` (4.502.657 bytes) foi criado em 25/11/2026 às 14h45 UTC. O clone `clone-576e9c091b1741ebbbbecc86bfc6a355` restaurou schema e dados com 27 tabelas conferidas, três perfis, PostgreSQL 17.11 e PostGIS 3.6.2.
- A conferência da origem em leitura devolveu os mesmos hashes de 27 tabelas antes e depois do piloto. No clone, oito conjuntos ligados a janeiro mantiveram contagens e hashes, incluindo ocorrências, staging, origens, vínculos, pendências, lote, extração e execução. Foram alteradas nove tabelas de dados no clone, no escopo de fevereiro e sua auditoria. O comparativo de esquema confirmou as mesmas permissões e políticas RLS. A auditoria das 12.230 pendências de janeiro preservou a assinatura `410fc2a72c5e439a2798494dfa4bf0ae5d1a1c89023693d3777ec9086de51a0a`.
- O piloto verificou rollback da recepção e da consolidação, rejeição de hash incorreto, conflito de segundo arquivo para a mesma competência, reenvio idempotente, chaves estrangeiras, RLS e acesso aos indicadores pelos papéis Administrador, Operador e Analista. A primeira rodada foi refeita em um novo clone após ajustar o teste de RLS para usar o identificador da tabela protegida.
- TypeScript, ESLint, contratos, rotas e build Next.js isolado com Webpack passaram. A suíte padrão teve 286 testes aprovados e quatro desabilitados por configuração. O cenário opcional de leitura do pacote real de janeiro passou em execução separada. A suíte SENTINELA-DADOS aprovou 22 testes.
- Edge em desktop (1.440 × 900) e mobile (390 × 844) confirmou 11.311 ocorrências no Dashboard, a tabela mensal, o recorte exclusivo de fevereiro e a regra de variação. O comparativo aparece com os dois meses inteiros e fica indisponível com um mês isolado ou com janeiro parcial. No Mapa Criminal, pontos, clusters e calor apresentaram zero ocorrências geográficas. Os parâmetros do calor seguem os do código existente, com raio 18, sigma 6 e opacidade 76% no Dashboard, e raio 24, sigma 8 e opacidade 88% no Mapa Criminal.
- A validação de autenticação no clone usou contas descartáveis para Administrador, Operador e Analista. Conferiu a recusa da API sem sessão, o login e o acesso permitido de cada perfil. Em `http://localhost:3000/dashboard`, a solicitação sem sessão recebeu redirecionamento para o login institucional. Supabase Auth e login institucional permanecem com a configuração existente.

O diretório privado de evidências é `%USERPROFILE%\.sentinela-local\homologacao-clone\clone-576e9c091b1741ebbbbecc86bfc6a355`. Contém o backup, os hashes de recuperação, o manifesto de restauração, `pcdf-history-result.json` e as capturas `historico-dashboard-1440.png`, `historico-dashboard-390.png`, `historico-mapa-criminal-1440.png` e `historico-mapa-criminal-390.png`.

## Ativação operacional de fevereiro

1. Obter autorização específica para o arquivo mensal, sua consolidação estatística e a janela autorizada. Registrar o hash do CSV, a competência, a revisão dos objetos instalados e a identidade atestada do banco operacional. Fixar no artefato operacional a porta 55484, os identificadores reais da instância e os resultados esperados desta homologação. O script da etapa 6 tem trava de clone.
2. Tirar backup consistente imediatamente antes da janela. Registrar SHA-256, grafo referencial, esquema, ACL, RLS, auditoria e hashes das tabelas relevantes. Restaurar esse backup em ambiente isolado e comprovar os 6.090 registros existentes de janeiro, a pendência de identidade e o reprocessamento anterior. O backup desta etapa prova o procedimento de restauração, enquanto o backup imediatamente anterior protege a janela autorizada.
3. Executar a recepção do arquivo e a conciliação da competência sob o mesmo controle transacional do piloto. Manter o bloqueio transacional de importações concorrentes e impedir a troca de hash em uma competência ocupada. Interromper antes do commit em caso de divergência de hash, contagem, coorte, origem, vínculo, auditoria, preservação de janeiro ou publicação de GEO indevida.
4. Conferir o recibo, os vínculos, a coorte em revisão e as pendências de dimensão. Validar a série e os filtros pela API com três perfis. Confirmar 6.090 ocorrências em janeiro, 5.221 em fevereiro, 11.311 no recorte combinado e zero pontos publicáveis para os dois meses. Registrar evidência e revisão pós-ativação.
5. Em falha pré-commit, usar `ROLLBACK` e confirmar hashes e presença exclusiva de janeiro. Em falha após commit, suspender novas cargas e preservar a auditoria. Ensaiar a recuperação do backup pré-janela em clone e avaliar gravações posteriores à janela antes de qualquer restauração operacional autorizada. A recuperação deve recobrir os arquivos e o conjunto de tabelas, vínculos, pendências e auditoria da operação.

## Expansão até agosto de 2026

Dos 67 meses posteriores a janeiro, fevereiro foi o piloto. Restam 66 competências para homologar após fevereiro, de março de 2021 a agosto de 2026. O processo é mensal e repetível.

| Passo | Evidência por competência |
| --- | --- |
| Receber e conferir | Nome e competência, SHA-256 e tamanho compatíveis com a matriz e o manifesto. Procurar competência já ocupada, hash já recebido, origens repetidas e colisões de tupla com staging e ocorrências consolidadas. |
| Recepcionar e conciliar em clone | Registrar recibo, regras e execução. Manter chave ambígua em revisão humana. Preservar cada natureza literal e cada origem. Conferir datas, checks e FKs, inclusive vínculos de natureza. |
| Validar e liberar | Conferir totais únicos, vínculos, diferenças por natureza, pendências e janela temporal. Verificar os filtros da série, o tempo de resposta com o volume crescente e o bloqueio geográfico dos dados sem CRS. Produzir evidência do rollback e do reenvio idempotente do mesmo hash. |
| Executar janela autorizada | Solicitar autorização operacional para a competência ou para um conjunto delimitado de competências já homologadas. Rodar uma transação por competência, com backup prévio e critérios de aceite por lote. Conservar recibos e prova de recuperação. |

A conciliação SQL aceita uma competência posterior a janeiro e usa o recibo do receptor. O executor de homologação desta etapa fixa fevereiro, seu hash e as contagens aceitas. Nas próximas homologações, fornecer os valores esperados da competência em revisão à partir da matriz e dos resultados validados em clone. Medir o tempo de carga e das consultas nas primeiras janelas e repetir com o volume crescente.
