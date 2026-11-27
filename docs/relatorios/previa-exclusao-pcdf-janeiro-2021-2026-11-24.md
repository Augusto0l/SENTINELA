# Prévia de exclusão do lote PCDF de janeiro de 2021

A consulta foi executada em uma transação somente leitura no PostgreSQL operacional atestado. O plano está bloqueado pelo serviço SQL com o código `lote_protegido`.

| Campo | Resultado |
| --- | --- |
| Arquivo | `pcdf_naturezas_2021-01.csv` |
| Lote | `a88ac192-edef-4339-8381-106bbd1b391e` |
| Contrato e tratamento | `1.0` · `sentinela-dados-integral-1` |
| Tamanho | 2.948.416 bytes |
| SHA-256 do arquivo registrado no lote | `e202df3622fbd5f0b4ae53e7a8f435bce9ad58ff30a43a3c248ce2d369fd3770` |
| Revisão do plano | `e7de205ec3812ec78740c4041868f3982e3e964602c1b7a9c61f80d426e0ed71` |
| Backup mais recente restaurado e comparado com a origem | `fa4ed26293a1e09e49b35963fedd58a37f0f72c29e2bade7386d4bdd96b08108` · 27 tabelas · 24/11/2026 às 16h39 (Brasília) |
| Ocorrências candidatas e vínculos com ocorrências | 6.091 candidatas · 0 vínculos |

## Dados e dependências

| Tabela | Linhas no plano | Referências verificadas |
| --- | ---: | --- |
| `sentinela.lotes_importacao` | 1 | Referencia `extracoes_origem`. |
| `sentinela.execucoes_importacao` | 1 | Referencia o lote na mesma extração. |
| `sentinela.linhas_staging` | 6.393 | Referencia a execução com seu lote e extração e a linha de origem com sua extração. |
| `sentinela.linhas_origem` | 6.393 | Referencia a extração. |
| `sentinela.extracoes_origem` | 1 | Extração sem outros lotes vinculados. |
| `sentinela.pendencias_revisao` | 20.020 | Referencia a linha de origem. |
| `sentinela.eventos_auditoria` | 2 | Pode referenciar execução, linha de origem, pendência ou correção. |
| `sentinela.historico_correcoes` | 0 | Pode referenciar staging e pendência. |
| `sentinela.ocorrencia_naturezas` | 0 no escopo de remoção | A referência à linha de origem pode bloquear a operação. |
| `sentinela_import_local.requests` | 0 | Recibos verificados pelo lote e pela execução. |
| `sentinela_gestao_autorizacao.exclusoes` | 0 | A confirmação exigiria e consumiria a autorização específica. |
| `sentinela_exclusao.comprovantes` | 1 a inserir se houver execução futura e autorizada | Comprovante administrativo da transação. |

Foram verificadas 13 chaves estrangeiras, sem divergências. A consulta encontrou zero origens compartilhadas em staging e zero outros lotes que usam a extração. O plano preserva origens e extrações quando usadas por outros lotes. Vínculos de consolidação, titularidade incerta ou dependências desconhecidas bloqueiam a confirmação. Ocorrências, catálogos e arquivos no disco ficam fora do escopo de remoção.

Após o vínculo e a abertura da janela de edição, uma segunda consulta com o papel da aplicação confirmou a mesma revisão, `autorizada=false` e zero aprovações. Os fingerprints das 23 tabelas fora do provisionamento e de sua auditoria permaneceram iguais. Foram registrados dois eventos de manutenção, um de vínculo e outro de liberação. A capacidade de edição vence em 25/11/2026 às 15h59 no horário de Brasília. Para fechar antes desse prazo, a manutenção atestada pode executar `UPDATE sentinela_gestao_autorizacao.release SET aberta=false WHERE singleton` e verificar a recusa de novas gravações. Os eventos de provisionamento permanecem na trilha.

## Execução futura e rollback

### Proteção e autorização preparada

O bloqueio original usa a conjunção `fonte='PCDF'` e `competencia=DATE '2021-01-01'`, independente do nome do arquivo e do UUID. O serviço calcula o hash do plano bruto, exige a revisão informada e recusa qualquer bloqueio. Uma aprovação comum em `sentinela_gestao_autorizacao.exclusoes` por si só não autoriza esse lote.

O SQL preparado conserva o bloqueio no plano bruto. A única exceção exige o UUID e a revisão desta prévia, o Administrador institucional — usuário interno `29e7ec39-192b-4790-9180-3df950969bfc` e Auth UUID `00859431-29c9-499f-b64a-cbed32f03742` — e um registro de autorização especial válido com a prova de restauração indicada acima. O bloqueio `lote_protegido` deve ser o único e corresponder ao UUID exato. Outro lote PCDF de janeiro, qualquer revisão divergente, outro ator e qualquer dependência impeditiva continuam bloqueados. A revisão do plano não muda ao conceder a autorização.

A instalação do SQL é feita em sessão de manutenção atestada com `expected_uuid`, `expected_system` e `prova_restauracao` com o SHA-256 acima. Ela verifica as funções existentes, RLS, FKs, identidade e revisão e instala a capacidade de autorização. O Administrador emite a autorização na interface. O prazo é de até 15 minutos, limitado pela validade do vínculo. Somente o servidor lê e verifica o backup, na prévia, na autorização e na confirmação. Se o prazo institucional tiver vencido, renovar a janela pelo mecanismo auditado. Se a revisão ou o backup mudar, revalidar o escopo antes de habilitar uma nova exceção.

O ensaio anterior em transação revertida confirmou a prévia com a autorização pontual, a recusa sem aprovação e por UUID, revisão ou ator divergente, a preservação de aprovações comuns e o consumo único com rollback.

A homologação pelo navegador usou um clone isolado e restaurado na porta 55487. Em desktop, a edição do arquivo de ensaio persistiu após recarga e confirmou a auditoria e a recusa de revisão antiga. Em mobile, a autorização do lote protegido foi emitida na interface, recusada após expiração e emitida novamente. Foram recusados UUID e revisão divergentes, prova de backup inválida e os perfis Operador e Analista. Uma falha forçada no comprovante preservou o lote e a autorização. Com a confirmação `EXCLUIR`, o clone removeu todos os registros planejados, manteve o arquivo de ensaio independente, retirou o lote do Histórico e gravou um comprovante. Uma repetição recebeu HTTP 404 e as FKs permaneceram válidas.

A capacidade de autorização foi instalada na porta 55484 sem criar autorização ou comprovante. A comparação posterior confirmou os mesmos dados nas 27 tabelas, 6.393 associações, 20.020 pendências, a revisão original e a proteção ativa. O login real e o botão de autorização foram conferidos na porta 3000 em desktop e mobile. O clone foi encerrado.

Na tela **Importar → Histórico**, abra **Excluir arquivo**, confira a prévia e selecione **Autorizar exclusão deste lote**. Releia o impacto atualizado, forneça a justificativa, digite **EXCLUIR** e marque a confirmação de exclusão permanente. A remoção ocorre apenas quando o Administrador aciona **Excluir definitivamente**. O comprovante independente preserva o UUID, o responsável, o momento, a justificativa, as quantidades, a revisão e o hash do backup, inclusive após a remoção dos eventos antigos.

### Conferências após eventual exclusão autorizada

1. Antes da confirmação, guardar uma cópia privada do plano bruto `sentinela_exclusao.plano(uuid)`, junto com a revisão, o ato de aprovação e o SHA-256 do backup. Capturar os fingerprints dos registros fora de `escopo`, as contagens de consulta e o hash do CSV. Os identificadores internos de linhas ficam no material privado da manutenção.
2. Na confirmação futura, o serviço recalcula o plano sob os locks já existentes, consome a aprovação por UUID, ator e revisão e registra o comprovante na mesma transação. Uma falha antes do commit reverte as remoções, o consumo e o comprovante. Antes de confirmar, a manutenção também pode revogar a autorização pontual, fazendo a validade vencer, e conferir que a prévia volta a exibir `lote_protegido`.
3. Após o commit, usar uma nova conexão somente leitura. Conferir zero linhas para todos os identificadores capturados em `escopo`: lotes, execuções, staging, origens exclusivas, extrações exclusivas, pendências, correções, recibos e eventos vinculados. Conferir que o lote saiu do Histórico, que não há autorização restante para o UUID e que existe exatamente um comprovante com o Administrador vinculado e as quantidades da prévia.
4. Comparar os fingerprints dos dados fora do escopo e conferir que os identificadores em `apoio` continuam presentes. Validar as 13 FKs, a RLS, a ausência de vínculos com ocorrências consolidadas, o decremento de 6.393 associações e 20.020 pendências no resumo e o hash do CSV no disco. Uma exclusão pode alterar os indicadores somente pelo escopo efetivamente removido.
5. Se for necessária recuperação após commit, usar o backup mais recente comprovado, restaurar em ambiente isolado e conferir schema, FKs, RLS, fingerprints e histórico antes de qualquer intervenção no banco principal. O backup atualizado foi restaurado e comparado em um cluster independente.

[Consulta somente leitura](../../database/release/inspect-import-plan.psql) · [SQL de autorização pontual para revisão](../../database/release/authorize-pcdf-january-2021.psql) · [Procedimento e guardas de manutenção](backend-operacional-gestao-arquivos-2026-11-24.md)
