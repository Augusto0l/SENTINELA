# Matriz institucional de naturezas para cadastro manual

Os 41 registros se destinam à decisão sobre uso no cadastro manual. Em todos, o código original e a versão institucional aguardam confirmação, a situação é **pendente**, o uso manual permanece **bloqueado** e a coluna de correspondência analítica homologada está vazia. Os `PCDF-N-*` são identificadores internos de revisão. A versão do inventário é `pcdf-inventario-v1`, seção *Naturezas criminais* do relatório agregado de recebimento PCDF. [Fonte agregada](pcdf-inventario-v1.json) · [Inventário rastreável](naturezas-manuais-candidatas-v1.json)

| Identificador da candidata | Descrição original | Observada em janeiro de 2021 |
| --- | --- | --- |
| PCDF-N-01 | ASSOCIACAO PARA O FIM DE TRAFICO DE SUBSTANCIA ENTORPECENTE | Sim |
| PCDF-N-02 | DESCUMPRIR DECISÃO JUDICIAL QUE DEFERE MEDIDAS PROTETIVAS DE URGÊNCIA PREVISTAS NA LEI 11.340/2006 | Sim |
| PCDF-N-03 | ESTUPRO | Sim |
| PCDF-N-04 | ESTUPRO COLETIVO | — |
| PCDF-N-05 | ESTUPRO COM RESULTADO MORTE | — |
| PCDF-N-06 | ESTUPRO CORRETIVO | — |
| PCDF-N-07 | ESTUPRO DE VULNERÁVEL | Sim |
| PCDF-N-08 | FEMINICIDIO | Sim |
| PCDF-N-09 | FURTO DE MOTOCICLETA | Sim |
| PCDF-N-10 | FURTO DE VEICULO | Sim |
| PCDF-N-11 | FURTO EM COMERCIO | Sim |
| PCDF-N-12 | FURTO EM INTERIOR DE VEICULO | Sim |
| PCDF-N-13 | FURTO EM RESIDENCIA | Sim |
| PCDF-N-14 | HOMICIDIO | Sim |
| PCDF-N-15 | LATROCINIO | Sim |
| PCDF-N-16 | LEI MARIA DA PENHA (Lei 11.340/06) | Sim |
| PCDF-N-17 | PORTE DE ARMA | Sim |
| PCDF-N-18 | PORTE DE SUBSTANCIA ENTORPECENTE PARA CONSUMO PESSOAL | Sim |
| PCDF-N-19 | PORTE ILEGAL DE ARMA DE FOGO DE USO PERMITIDO (L.10826/03) | Sim |
| PCDF-N-20 | POSSE IRREGULAR DE ARMA DE FOGO DE USO PERMITIDO (L.10826/03) | Sim |
| PCDF-N-21 | POSSE OU PORTE ILEGAL DE ARMA DE FOGO DE  USO RESTRITO (L.10826/03) | Sim |
| PCDF-N-22 | POSSUIR, DETIVER, FABRICAR OU EMPREGAR ARTEFATO EXPLOSIVO OU INCENDIÁRIO, SEM AUTORIZAÇÃO OU EM DESACORDO COM DETERMINAÇÃO LEGAL OU REGULAMENTAR | Sim |
| PCDF-N-23 | ROUBO A BAR | Sim |
| PCDF-N-24 | ROUBO A CASA LOTERICA | — |
| PCDF-N-25 | ROUBO A DROGARIA | Sim |
| PCDF-N-26 | ROUBO A PANIFICADORA | Sim |
| PCDF-N-27 | ROUBO A SUPERMERCADO E ATACADISTA | Sim |
| PCDF-N-28 | ROUBO A TRAILLER | Sim |
| PCDF-N-29 | ROUBO A TRANSEUNTE | Sim |
| PCDF-N-30 | ROUBO DE VEICULO | Sim |
| PCDF-N-31 | ROUBO EM CHÁCARA, SÍTIO OU FAZENDA | Sim |
| PCDF-N-32 | ROUBO EM COLETIVO | Sim |
| PCDF-N-33 | ROUBO EM OUTROS ESTABELECIMENTOS COMERCIAIS | Sim |
| PCDF-N-34 | ROUBO EM PARADA DE ONIBUS | Sim |
| PCDF-N-35 | ROUBO EM RESIDENCIA | Sim |
| PCDF-N-36 | ROUBO NA PROXIMIDADES DE BANCO | Sim |
| PCDF-N-37 | ROUBO NAS PROXIMIDADES DE CAIXA ELETRONICO | Sim |
| PCDF-N-38 | TRÁFICO DE DROGAS PREVALECENDO-SE DE FUNÇÃO PÚBLICA | — |
| PCDF-N-39 | TRÁFICO DE SUBSTANCIA ENTORPECENTE | Sim |
| PCDF-N-40 | TRÁFICO INTERNACIONAL DE SUBSTANCIA ENTORPECENTE | — |
| PCDF-N-41 | TRÁFICO PRIVILEGIADO | — |

## Decisão e evidências a fornecer

O inventário contém **41 pendentes**, **zero aprovadas** para cadastro manual e **20 categorias analíticas pretendidas**. As referências de `PCDF-N-03` e `PCDF-N-07` registram relações analíticas observadas na documentação agregada, ambas pendentes de homologação formal. [Matriz de correspondências](pcdf-correspondencias-v1.json)

Para cada item aprovado, o responsável institucional deve fornecer o código do emissor, a descrição literal e a autorização expressa de uso manual. O responsável deve identificar a fonte, a versão, a vigência quando aplicável e o ato que aprovou o conjunto e seu SHA-256. Eventual decisão sobre equivalência analítica pertence ao processo de classificação e deve ter evidência própria.

Preencher `versao`, `fonte`, `evidencia` e `registros` no [modelo de manifesto](naturezas-manuais-aprovacao-modelo.json). Cada registro entregue deve conter `codigo`, `descricao`, `situacao` com valor `homologada` e `usoManual` com valor booleano `true`. Conservar em diretório privado a evidência institucional, seu hash publicado e o arquivo efetivamente aprovado. O modelo vazio é intencionalmente recusado pelo gerador.
