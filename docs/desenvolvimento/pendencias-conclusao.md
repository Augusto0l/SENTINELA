# Pendências e dependências da conclusão

| Criticidade | Dependência | Evidência e procedimento |
| --- | --- | --- |
| Alta | Homologação externa do mapeamento PCDF | A matriz local cobre 41 descrições, duas relações documentadas e 39 pendentes. Confirmar os pares com o produtor, incluindo tentativa, vigência e evidência, antes de aprovar regras de carga. |
| Alta | Homologação externa da identidade entre extrações | O laboratório bloqueia colisões pendentes e já consolidadas. Validar unicidade e precedência com o produtor e aprovar a política de reprocessamento antes de resolver colisões reais. |
| Alta | CRS e vínculos históricos de RA da PCDF | Confirmar a referência espacial, a vigência dos aliases e a transformação. Manter geometria ausente sem evidência espacial. |
| Alta | Escrita, importação e correção operacionais | Autorizar identidade individual, escopo, roles/RLS, revisão de migrations, backup e janela específica. Preservar baseline e carga RA existentes até a aprovação. |
| Alta | Implementação condicionada a regras de revisão | O laboratório cobre horário, local e flagrante antes da promoção e mostra o vínculo posterior. Aprovar regras para reprocessamento versionado e correções de identidade, classificação, data, geografia e ocorrências consolidadas. |
| Média | Aceite combinado com leitor operacional | O recorte PCDF integrado usa uma role e dados sintéticos em cluster descartável. Homologar o leitor do destino autorizado com dados e filtros representativos. |
| Alta | Auth e publicação | Validar Auth, isolamento do destino, segredos e proteção do Preview antes de autorizar Vercel e acesso ao Supabase operacional. |
| Média | RPO/RTO atuais | Validar metas com responsável e ensaiar restore separado de novo backup autorizado. O recibo pré-RA é histórico. |

A próxima liberação exige autorização de uma homologação privada em banco
distinto, com regras de identidade e classificação aprovadas, escopo de
leitura/escrita, conta vinculada e plano de recuperação. O acesso ao
operacional, o Supabase Auth definitivo e o deploy requerem aprovações
separadas.

| Tipo | Próxima atividade verificável |
| --- | --- |
| Implementação pendente | Depois das decisões de negócio, versionar reprocessamento e revisão pós-consolidação, definir roles, autoria e deltas de escrita operacionais. |
| Homologação pendente | Validar a matriz conjunta, CRS e casos ambíguos com o produtor. Exercitar reader, API e mapa no ambiente privado aprovado e aferir RPO/RTO do destino. |
| Autorização externa | Aprovar recursos e credenciais da homologação privada. Conceder separadamente as janelas de backup, migrations operacionais e publicação. |

## Decisões de dados a solicitar ao produtor

| Questão | Fonte necessária | Risco | Alternativas técnicas | Critério de aprovação | Consequência até aprovação |
| --- | --- | --- | --- | --- | --- |
| Quais pares das 41 naturezas, 19 categorias PCDF e 20 categorias SENTINELA podem virar regras? | Extração agregada conjunta e dicionário versionado com natureza, categoria, tentativa, vigência e assinatura do responsável. | Classificar incorretamente ocorrências e indicadores. | Manter o bruto e revisar manualmente ou registrar regras exatas por versão com vigência. | Pares reproduzíveis, totais reconciliados e ambiguidades registradas. As duas relações documentadas precisam de tentativa e vigência confirmadas antes da ativação. | Staging preserva os originais. Regras pendentes ficam fora da carga oficial. |
| Qual chave identifica a mesma ocorrência entre meses e extrações? | Especificação de unicidade, unidade de numeração, reabertura e precedência, com exemplos autorizados de colisão. | Duplicação ou fusão indevida de casos. | Usar ID estável fornecido pelo produtor ou aprovar tupla com regras explícitas de colisão e reprocessamento. | Confirmar escopo e estabilidade em amostra autorizada, preservando uma associação por linha e zeros à esquerda. | Reenvio exato é idempotente. Colisões e chaves incompletas permanecem em staging. |
| Qual é a referência dos campos GEO e UTM? | Metadados oficiais com EPSG ou datum, ordem dos eixos, unidades, zona, hemisfério e vigência. | Deslocar pontos, atribuir RA incorreta e publicar indicadores espaciais enganosos. | Receber série já convertida com metadados ou transformar no PostGIS a partir da origem confirmada. | Comparar pontos de controle e limites aplicáveis, com tolerância, casos ambíguos e versão territorial aprovados. | Preservar dados brutos. A geometria permanece nula enquanto a referência estiver pendente. |

O hash do relatório agregado disponível no projeto irmão foi conferido
contra o [artefato rastreável](../catalogos/pcdf-correspondencias-v1.json).
O relatório sustenta duas relações textuais. As demais dependem da fonte
conjunta descrita acima.
