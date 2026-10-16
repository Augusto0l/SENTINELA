# Contrato de deduplicação, permissões e RLS

Versão: 0.1.0. Revisão: 09/10/2026. Status: proposta documentada para implementação e homologação posterior. Escopo da ISSUE-11: contrato; não há Supabase Auth, SQL ou RLS operacional nesta sprint.

## Fontes e catálogos

Referências: `docs/requisitos_v1.md`, `docs/arquitetura.md`, `src/data/mockData.ts` e `catalogos-v0.1.0.json` neste diretório. IDs do JSON são internos e não devem ser apresentados como códigos oficiais. Naturezas são categorias demonstrativas e precisam de homologação institucional. Não interpretar RA-S/Ponte Alta como Região Administrativa oficial sem confirmação.

Cada registro deve manter identificador interno imutável, fonte, identificador original quando disponível, método de entrada, versão de catálogo, versão da regra de validação, estado de validação, timestamps e usuário/serviço responsável. Datas e horas precisam de contexto temporal explícito; instantes são armazenados em UTC e exibidos em America/Sao_Paulo. Data de ocorrência e data de ingestão são campos distintos.

## Matriz de deduplicação

| Cenário | Identificação proposta | Tratamento | Revisão |
| --- | --- | --- | --- |
| Reimportação do mesmo arquivo | Hash do conteúdo + fonte + versão do importador | Lote idempotente; retornar resultado anterior e registrar tentativa | Reprocessamento deve ser solicitado e versionado |
| Mesmo registro individual na mesma fonte | Fonte + identificador original, quando confiável | Não inserir nova ocorrência; distinguir atualização de reenvio | Resolver alterações conflitantes sem sobrescrever original |
| Mesmo identificador entre fontes distintas | IDs com namespace da fonte | Não assumir equivalência | Revisão ou chave institucional de correspondência |
| Registro sem ID confiável | Candidatos por data/hora, RA, endereço normalizado, coordenadas e natureza | Sinalizar possível duplicidade; não excluir automaticamente | Operador autorizado revisa; decisão sensível pode exigir Administrador |
| Dados incompletos ou precisão temporal diferente | Comparar com tolerâncias declaradas por fonte | Manter pendência e evitar falsa equivalência | Limiares de distância/tempo dependem de homologação; não inventar valores |
| Múltiplas naturezas na mesma ocorrência | ID canônico da ocorrência + lista de naturezas | Uma ocorrência, várias relações em `ocorrencia_naturezas` | Não criar várias ocorrências apenas pela quantidade de naturezas |
| Base agregada mensal e registros individuais | Fonte, cobertura territorial, mês, natureza, unidade de contagem e granularidade | Manter conjuntos distintos; nunca somar coberturas sobrepostas automaticamente | Curador homologa precedência e cobertura |
| Agregados repetidos/revisados | Chave de cobertura + fonte + versão/publicação | Versionar revisões e apontar versão ativa | Preservar versões anteriores e justificativa |

Normalização deve criar campos derivados, preservando valores brutos; acentos, aliases e coordenadas originais não são descartados. Um hash de atributos normalizados auxilia candidatos, mas não comprova identidade. Nome, natureza ou endereço isolados não bastam para deduplicar.

## Contagem e múltiplas naturezas

- Total de ocorrências: contar IDs canônicos distintos dentro do conjunto de cobertura escolhido.
- Filtro por natureza: contar uma ocorrência apenas uma vez, mesmo com várias naturezas selecionadas.
- Distribuição por natureza: pode contar vínculos e ultrapassar o total de ocorrências; informar essa unidade. Se um gráfico exigir categorias exclusivas, definir natureza principal com regra homologada, sem escolha arbitrária.
- Dados mensais não devem receber pontos individuais inventados nem ser convertidos em ocorrências individuais fictícias para análises reais.
- Para uma mesma cobertura, selecionar uma fonte/granularidade ou reconciliar com regra aprovada. Fonte individual não é automaticamente completa nem sempre prevalece sobre fonte agregada.
- Relatórios devem explicitar cobertura, fontes, período, unidades, versões, pendências e regra de inclusão; análises entre coberturas incompletas devem apresentar suas limitações.

## Preservação e rastreabilidade

Cada importação deve possuir ID de lote, hash, nome original seguro, fonte, usuário, datas, versão de mapeamento/validação, contagens aceitas/rejeitadas/duplicadas/pendentes e estado final. Cada linha mantém posição original, payload bruto protegido, erros, decisão de revisão e referência à ocorrência canônica quando houver.

Mesclagem exige registro de origem/destino, revisor, motivo e horário; manter tombstone ou vínculo histórico e possibilidade de reversão autorizada. Inativação é preferível a exclusão física; retenção e acesso aos brutos dependem de política institucional ainda a definir. Logs não contêm senhas, tokens ou descrições sensíveis desnecessárias.

Processamento definitivo deve ser idempotente e transacional, ou ter rollback equivalente por estágio. Revisor não pode promover registro inválido silenciosamente: exceções exigem motivo e trilha de auditoria. Erros ou rejeições não devem produzir mensagem de sucesso genérica.

## Perfis oficiais e matriz de permissões

Administrador: funções administrativas e operacionais, sujeito a auditoria e segurança. Operador: cadastro e gerenciamento de registros autorizados, consulta e análise. Analista: consulta e análise; não modifica registros. A tela de Usuários apresenta somente uma prévia desta matriz e não protege recursos.

| Recurso/ação | Administrador | Operador | Analista |
| --- | --- | --- | --- |
| Dashboard, mapa, filtros e consulta | Permitido conforme escopo | Permitido conforme escopo | Permitido conforme escopo |
| Exportar análise autorizada | Permitido | Permitido | Permitido; sem dados além do escopo |
| Cadastrar ocorrência | Permitido | Permitido no escopo atribuído | Negado |
| Editar ocorrência | Permitido, com histórico | Permitido no escopo atribuído e estado editável | Negado |
| Inativar registro | Permitido com confirmação e motivo | Proposta: solicitar revisão; autorização específica a homologar | Negado |
| Importar arquivos | Permitido | Permitido para fontes/unidades autorizadas | Negado |
| Revisar possíveis duplicidades | Permitido | Permitido no escopo; conflitos sensíveis escalados | Negado |
| Gerenciar usuários e perfis | Permitido | Negado | Negado |
| Alterar catálogos/regras administrativas | Permitido via versão homologada | Negado | Negado |
| Consultar auditoria administrativa/brutos restritos | Permitido conforme necessidade | Somente resultados dos lotes autorizados | Negado; apenas indicadores permitidos |
| Alterar preferências próprias | Permitido | Permitido | Permitido |
| Alterar senha/MFA próprios | Pelo serviço de identidade | Pelo serviço de identidade | Pelo serviço de identidade |
| Escrever/apagar diretamente logs de auditoria | Negado | Negado | Negado |

Escopo atribuído (unidade, fonte, território ou autoria) precisa de definição institucional. Até haver concessão explícita, negar modificações e acesso a registros restritos. Ser autor não concede automaticamente acesso irrestrito. O Administrador também não deve apagar trilhas de auditoria nem receber credenciais de serviço no cliente.

## Proposta Supabase/RLS (implementação futura)

1. Usar `auth.uid()` como identidade autenticada; relacionar perfil ativo e atribuições em tabelas protegidas. Nunca confiar em perfil enviado pelo formulário, localStorage ou metadado editável pelo usuário.
2. Habilitar RLS nas tabelas expostas; acesso anônimo negado para ocorrências, importações, usuários e auditoria. Catálogos públicos só após decisão explícita; não presumir publicidade de dados institucionais.
3. `SELECT`: usuário ativo + ação permitida + atribuição ao registro. Agregações e views devem preservar políticas e minimizar dados pessoais; revisar `security_invoker` e permissões de funções.
4. `INSERT`: apenas Administrador/Operador autorizados; autoria derivada da identidade no servidor. `WITH CHECK` valida escopo, autoria e estado. Analista nunca recebe escrita em registros de ocorrência/importação.
5. `UPDATE`: combinar `USING` para registro existente com `WITH CHECK` para estado novo; impedir mover dados para escopo não autorizado e falsificar autor/fonte. Alteração de registros já validados segue regra homologada.
6. `DELETE`: negar exclusão física ordinária; operações controladas de inativação/retenção via serviço autorizado e auditado. Não usar bypass por conta do perfil administrativo.
7. Perfis: atualização somente por operação administrativa confiável; usuário não pode promover a si mesmo nem modificar atribuições sem autorização. Desativação precisa bloquear sessão e futuras operações.
8. Auditoria: inserir exclusivamente por processo confiável e imutável para clientes; leitura administrativa restrita. Operação de negócio e evento de auditoria devem ser consistentes.
9. Storage: buckets privados para arquivos/anexos; políticas por lote/autoria/escopo, limites e tipos permitidos. URLs temporárias restritas e expirantes; nenhum payload bruto público por padrão.
10. Chave `service_role`: exclusiva do servidor, fora do bundle e do Git. Funções com privilégios devem validar autorização, reduzir permissões e fixar `search_path`.
11. Testar usuários anônimos/inativos, cada perfil, acesso entre unidades, promoção indevida, alteração de autoria, exportações e escrita indireta por funções/views. RLS não substitui validação de entrada, integridade e autorização de ações no servidor.

## Pendências de homologação

Responsável previsto no planejamento da Sprint 1: Pedro Augusto. Aprovação institucional não foi verificada nesta revisão. Devem ser decididos antes da implementação: fontes/cartografia oficiais; catálogo criminal; aliases; regras de natureza principal; tolerâncias de deduplicação; abrangência entre fontes; escopos e inativação pelo Operador; retenção; política de dados sensíveis; revisão e reversão; relação usuário/unidade; termos de acesso e exportação.

Mudanças do contrato devem registrar versão, responsável e motivo; futuras migrações referenciam a versão homologada. As pendências acima não autorizam tratar a proposta como política de produção.
