# Classificação PCDF v2 no SENTINELA hospedado

Integra a classificação criminal da Etapa 3 ao Supabase hospedado e à Vercel, sem protótipo paralelo.
A proposta (23 categorias, 43 regras) é instalada **pendente**. Nenhuma regra é homologada pela migration:
a homologação é uma decisão institucional registrada pelo Administrador, com responsável, evidência e vigência.

## Componentes

| Camada | Arquivo | Função |
| --- | --- | --- |
| Banco | `database/supabase/pendentes/0015_classificacao_pcdf_v2.sql` | Proposta pendente, registro versionado de homologação, versão ativa, aplicação e reversão auditadas por lote |
| Banco | `database/supabase/pendentes/0016_reverte_0015.sql` | Reversão compensatória do esquema (após reverter os lotes) |
| Ensaio | `database/supabase/tests/rehearse_0015.py` | Cluster PostgreSQL 17 descartável, dados sintéticos com as 36 triplas reais de janeiro/2021 |
| API | `src/app/api/v1/classificacao/route.ts` | GET situação; POST `homologar`, `ativar`, `aplicar`, `reverter` |
| Servidor | `src/lib/db/classificacao.ts` | Regras montadas a partir do JSON canônico; identidade pela sessão Auth verificada |
| Importação | `src/lib/db/pcdf-direct.ts` | Aplica a versão ativa ao lote confirmado na mesma transação, antes do `COMMIT` |
| Telas | Configurações › Classificação PCDF; Ocorrências (filtro "Categoria agrupada"); Dashboard e Mapa (categoria homologada com rótulo PCDF de reserva) |

## Identidade e segurança

- `sentinela_classificacao.ator()` = Administrador ativo cuja sessão Supabase Auth o servidor verificou
  (`sentinela_ambiente.ator_operacional()`), no login `sentinela_local_admin`, em instalação vinculada.
  Nenhum UUID enviado pelo cliente é aceito; o comando não tem campo de aprovador (o contrato é estrito).
- Funções de escrita pertencem ao papel `sentinela_classificacao_owner` (NOLOGIN, NOINHERIT, NOBYPASSRLS).
  Cada função verifica `ator()` na entrada e grava o ator verificado e o marcador da transação; policies e
  gatilhos usam `verificado()`, que só responde com `current_user` = dono e marcador da transação corrente.
- `EXECUTE` de escrita só para `sentinela_local_admin`; `situacao()` para Administrador e Operador; Analista sem acesso.
- RLS forçada nas 19 tabelas de `sentinela` e nas 3 de `sentinela_classificacao`. Histórico e eventos são imutáveis.
- Escrita pela API exige `SENTINELA_SUPABASE_CLASSIFICACAO_WRITE=1`, modo hospedado, mesmo host/origem e perfil Administrador.

## Regras de aplicação

- Regra homologada da versão ativa → `mapeada`, com dois registros em `historico_correcoes` e as pendências de
  classificação abertas da associação (por associação ou por linha de origem) resolvidas, cada uma com evento.
- Regra conflitante/sem correspondência → status próprio, sem categoria; par sem regra → permanece `pendente`.
  Em ambos, uma pendência é criada somente se não houver outra aberta na mesma linha.
- Associações manuais nunca são tocadas. Ocorrências, linhas de origem, naturezas e lotes não são alterados.
- `pg_advisory_xact_lock` por lote: chamadas concorrentes se serializam (com `lock_timeout` a API devolve 409).
- Sem versão ativa a aplicação devolve `{aplicada:false, motivo:"sem_versao_ativa"}` e nada muda.

## Evidências do ensaio isolado (45 verificações)

PostgreSQL 17.11 descartável na porta 56015, baseline + 0006…0011 + **0014 (já em produção)** + pacote da 0015.

- Backup `pg_dump` restaurado em banco separado com os mesmos SHA-256 de dados e pendências.
- Pacote com `ROLLBACK` sem efeito; guarda recusa histórico físico divergente; 0015 registrada nos dois históricos.
- Perfis: Operador lê a situação e recebe 42501 ao escrever; Analista sem acesso; sessão ausente ou de outro perfil: 42501.
- Janeiro: **6.378 classificadas, 14 conflitantes (PORTE DE ARMA), 6.378 pendências resolvidas, nenhuma criada**;
  restam 15 pendências de classificação (14 conflitantes + 1 de linha sem associação); coordenadas e endereço/RA intactas.
- Concorrência: segunda chamada com `lock_timeout` recebe 55P03; a que espera é idempotente.
- Rollback atômico: falha posterior na mesma transação desfaz a aplicação.
- Lote seguinte: 70 classificadas, 2 conflitantes, 1 par desconhecido mantido pendente; 3 pendências; reaplicação sem duplicar.
- Reversão (6.392 revertidas, 6.378 pendências reabertas) e reaplicação idênticas (6.378/14).
- 0016 recusada com lotes classificados; após reverter os lotes, restaura o catálogo anterior (funções, policies, ACLs, RLS, papéis).
- Tempo local: aplicação de janeiro ≈ 20–26 s; reversão ≈ 18–19 s; migration < 1 s.

Executar: `python -B database/supabase/tests/run_import_local.py --install-only …` e
`python -B database/supabase/tests/rehearse_0015.py --pg-bin … --port … --data-directory … --output-root … --prior <0014>`.

## Aplicação em produção

1. Backup criptografado verificável de `sentinela*`, `auth`, `extensions`, `supabase_migrations` e papéis.
2. Pré-voo em leitura: históricos (último físico `20261127100810` = 0014), 41 naturezas PCDF, nenhum catálogo v2.
3. Pacote único da 0015 renderizado por `prepare_0012_application.render` (guarda + histórico físico), conferido por SHA-256.
4. Pós-verificação: 23 categorias e 43 regras pendentes, nenhuma versão ativa, nenhuma associação alterada, RLS 19 + 3, privilégios.
5. Código publicado na Vercel; `SENTINELA_SUPABASE_CLASSIFICACAO_WRITE=1` habilita somente a classificação.
6. Homologação pelo Administrador em Configurações › Classificação PCDF (versão `pcdf-classificacao-v2.0`, evidência,
   vigência), ativação e aplicação ao lote de janeiro `84908630-bd04-4a03-923d-616649c8de74`.

## Reversão

1. Dados: `reverter` (API/tela) por lote — histórico preservado, pendências reabertas.
2. Operação: sem versão ativa ou com a flag desligada, nada é aplicado em importações futuras.
3. Esquema: 0016 após reverter os lotes. As linhas da proposta v2 permanecem (pendentes e inertes).
4. Último recurso: restauração do backup criptografado.

## Decisões institucionais pendentes

- Aprovação das categorias complementares SEN-CAT-21 (associação para o tráfico), SEN-CAT-22 (artefato explosivo)
  e SEN-CAT-23 (roubo em propriedade rural), e das regras de nível "revisada".
- PORTE DE ARMA permanece conflitante até haver informação sobre o tipo de arma.
- Os IDs SEN-CAT-xx e PCDF-N-xx são internos e dependem de homologação; não são códigos oficiais.
