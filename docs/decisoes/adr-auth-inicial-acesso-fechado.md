# ADR — Auth inicial com vínculo próprio e dados de negócio fechados

## Status

Adotado na implementação local da Sprint 4 — Etapa 2.2. Sem aplicação remota ou homologação de Auth hospedado. Provisionamento, escopo dos dados e infraestrutura de e-mail dependem de revisão/aprovação operacional.

## Data

2026-10-29.

## Contexto

A baseline Supabase 0001–0005 foi homologada localmente, mas não foi instalada remotamente nesta tarefa. O frontend usava login ilustrativo, perfil selecionável em sessionStorage e identidade fixa. A equipe autorizou Auth real com Administrador, Operador e Analista, consulta à Central pelos três e correções exclusivas do Administrador. Escopo de ocorrências/territórios/unidades e autorização transacional ainda não foram aprovados.

## Decisão

Integrar supabase-js e supabase/ssr com clientes separados e sessão em cookies. Proxy renova/verifica tokens; cada página autenticada e endpoint também verifica a identidade no servidor. getUser confirma a identidade no provedor; o backend consulta o vínculo ativo pela RPC meu_acesso, sem confiar em metadados fornecidos pelo usuário.

A nova migration Supabase 0006 mantém as baselines intactas e introduz somente:

- FK opcional UNIQUE existente auth_user_id -> auth.users.id, com ON DELETE RESTRICT; mantém o UUID interno e impede cascata sobre histórico.
- SELECT limitado às cinco colunas necessárias do próprio vínculo ativo, com RLS por auth.uid. Nenhum UPDATE/INSERT/DELETE concedido ao usuário.
- Schema de API mínimo sentinela_api, com RPC SECURITY INVOKER sem parâmetros, somente leitura. Não expor sentinela ou sentinela_private na Data API.
- Função de manutenção privada SECURITY INVOKER, sem grants às roles da aplicação, para provisionar/atualizar vínculo explicitamente aprovado. Exige identidade Auth existente, perfil explícito e justificativa; audita antes/depois e preserva IDs. Serializa alterações para proteger o último Administrador ativo.

O migrador/provisionador precisa de privilégios de manutenção já existentes; a migration não concede BYPASSRLS nem remove FORCE RLS. A função privada não cria usuários Auth. Não existe promoção do primeiro usuário, atribuição de perfil pelo frontend ou endpoint público de provisionamento.

Os três perfis podem consultar a Central conforme futuro escopo de leitura; somente Administrador possui a permissão nominal corrigir. Essa permissão **não habilita** correções: triggers da 0005 permanecem intactos, sem RPC de escrita ou bypass. Operações de dados ainda sem escopo ficam fechadas inclusive para Administrador.

As telas continuam com dados fictícios e simulações explicitamente identificadas, agora sob uma conta real quando configurada/aprovada. Remover o seletor demonstrativo das rotas autenticadas; nunca usar sessionStorage como autoridade. Não atribuir a dados em memória sucesso de persistência.

Login/logout são POSTs de mesma origem; recuperação usa resposta genérica para não enumerar contas. Confirmação aceita recovery/invite ou troca PKCE, com destinos fixos. Atualizar senha exige identidade verificada e encerra refresh sessions depois do sucesso. JWTs de acesso já emitidos podem continuar válidos até expirar; não prometer revogação instantânea.

## Alternativas consideradas

- Abrir todas as tabelas a authenticated: rejeitado por falta de escopo aprovado.
- Usar service_role em todas as consultas: rejeitado por ignorar RLS e ampliar risco de vazamento.
- JWT user_metadata ou perfil do formulário como autoridade: rejeitado por permitir autopromoção e metadados editáveis.
- Trigger automático promovendo primeiro usuário/cadastrando todo signup: rejeitado por falta de aprovação administrativa.
- SECURITY DEFINER para ler o perfil: desnecessário com policy própria sem recursão, grants por coluna e SECURITY INVOKER.

## Consequências

Sem configuração, migration, schema exposto ou vínculo ativo, o acesso permanece fechado. A consulta da própria identidade tem escopo definido; isso não libera análises ou importação persistidas. A API de geocodificação, que envia endereços a terceiros, exige identidade e continua bloqueada por falta de aprovação do escopo/provedor. O handler legado foi preservado e continua testado separadamente.

Não existe cadastro público no aplicativo. Desabilitar signup no serviço Auth é requisito de configuração hospedada ainda não executado; mesmo que terceiros criem conta diretamente num projeto mal configurado, não recebem vínculo nem acesso à aplicação automaticamente.

Manutenção privilegiada pode ultrapassar proteções do aplicativo e exige operador confiável, aprovação registrada e credencial isolada. A função oferecida não torna DDL ou SQL administrativo arbitrário seguro. Reconciliação de identidades históricas sem vínculo deve ser explícita e revisada, nunca por nome/e-mail presumido.

## Referências

- [Relatório e operação](../banco/autenticacao-supabase-etapa2-2.md)
- [Migration incremental](../../database/supabase/migrations/0006_auth_vinculo_acesso.sql)
- [ADR das baselines](adr-baselines-local-supabase.md)
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Sessões/cookies](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Dados do usuário](https://supabase.com/docs/guides/auth/managing-user-data)
