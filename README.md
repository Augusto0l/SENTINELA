# SENTINELA

### Sistema Estratégico de Normalização, Tratamento e Inteligência de Níveis, Estatísticas, Localizações e Alertas

![Status](https://img.shields.io/badge/status-em%20prototipa%C3%A7%C3%A3o-1f4e79)
![Projeto](https://img.shields.io/badge/tipo-projeto%20acad%C3%AAmico-526d82)
![Plataforma](https://img.shields.io/badge/plataforma-web-2f7d68)

Repositório institucional de Projeto Integrador criado a partir do template do CEUB.

> **Professor(a):** Leia as AS DIRETRIZES INSTITUCIONAIS constantes no repositório [DIRETRIZES](https://github.com/CAMPUSCEUB/DIRETRIZES), em especial o [Guia dos Professores](https://github.com/CAMPUSCEUB/DIRETRIZES/guias/github-enterprise-campus-ceub.md) e o [checklist do GitHub Enterprise](https://github.com/CAMPUSCEUB/DIRETRIZES/guias/github-enterprise-campus-ceub.md).
>
> **Estudante:** Leia o [guia dos alunos](docs/guia-alunos.md).

---

## Identificação do repositório

| Campo                                  | Informação                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| Instituição                            | CEUB                                                                                 |
| Organização no GitHub                  | CampusCEUB                                                                           |
| Professor(a) responsável:              | Adriana                                                                               |
| Equipe                                 | A equipe está listada nos times ou inserida diretamente no acesso a este repositório |
| IDProjeto                              | Informar o ID do Projeto conforme consta no Portfólio de Projetos de TI do CEUB      |

---

# Sobre o SENTINELA

## Problema

Dados relacionados a ocorrências criminais podem estar distribuídos em planilhas, arquivos e sistemas distintos, dificultando a centralização, padronização e análise das informações.

Essa fragmentação pode tornar mais complexa a identificação de padrões territoriais e temporais, a comparação entre períodos e Regiões Administrativas e a produção de indicadores, gráficos e mapas capazes de apoiar uma análise mais estruturada dos dados relacionados à criminalidade.

Além disso, diferenças de nomenclatura, registros incompletos, duplicidades e ausência de padronização geográfica podem comprometer a qualidade das análises realizadas sobre essas informações.

---

## Solução proposta

O **SENTINELA** é um sistema web destinado à centralização, cadastro, tratamento, visualização e análise de dados relacionados a ocorrências criminais.

A solução permitirá reunir registros provenientes de diferentes fontes em uma base estruturada, possibilitando sua validação, padronização, consulta e transformação em informações analíticas.

Entre os principais recursos previstos estão:

* cadastro manual de ocorrências;
* importação de dados por arquivos estruturados;
* validação e padronização das informações;
* localização geográfica das ocorrências;
* mapa criminal interativo;
* mapa de calor;
* pontos individuais de ocorrências;
* dashboard de indicadores;
* filtros e comparações;
* controle de acesso por perfil;
* histórico e auditoria das ações realizadas.

O sistema será destinado a usuários institucionais autorizados e terá como objetivo transformar registros dispersos em informações organizadas, comparáveis e úteis para apoiar análises territoriais e estatísticas.

---

## Visão geral

O SENTINELA reunirá informações relacionadas a ocorrências criminais em um único ambiente, permitindo identificar áreas com maior incidência, compreender variações ao longo do tempo, analisar padrões geográficos e temporais e consultar indicadores consolidados.

A primeira versão do projeto será desenvolvida para ambiente **web**.

| Item                      | Definição                                                    |
| ------------------------- | ------------------------------------------------------------ |
| **Tipo de solução**       | Sistema de informação web                                   |
| **Finalidade**            | Análise e monitoramento estatístico de ocorrências criminais |
| **Escopo geográfico**     | Distrito Federal                                             |
| **Análise territorial**   | Regiões Administrativas do Distrito Federal                  |
| **Entrada de dados**      | Cadastro manual e importação de arquivos CSV/XLSX            |
| **Principais resultados** | Mapas, indicadores, gráficos, filtros e comparações          |
| **Acesso**                | Restrito a usuários institucionais autorizados               |
| **Situação atual**        | Prototipação e refinamento da versão web                     |

O escopo cartográfico inicial será baseado nas **Regiões Administrativas do Distrito Federal**.

Informações de bairro, setor, quadra ou outras referências poderão fazer parte do endereço/local da ocorrência, porém não haverá, nesta fase, subdivisão cartográfica analítica das RAs por bairros ou setores.

---

## Objetivo

Desenvolver uma solução capaz de receber dados de ocorrências criminais por cadastro individual ou importação em lote e transformá-los em informações visuais, territoriais e analíticas.

O sistema deverá permitir que usuários autorizados compreendam:

* onde as ocorrências estão concentradas;
* quais naturezas criminais aparecem com maior frequência;
* em quais períodos existe maior incidência;
* como os registros variam entre Regiões Administrativas;
* como os indicadores evoluem ao longo do tempo;
* quais áreas apresentam maior concentração de ocorrências.

---

# Como o SENTINELA funcionará

```mermaid
flowchart LR
    A[Cadastro manual] --> C[Validação e padronização]
    B[Importação CSV/XLSX] --> C
    C --> D[Localização geográfica]
    D --> E[Latitude e longitude]
    E --> F[Base centralizada]
    F --> G[Mapa Criminal]
    F --> H[Dashboard]
    F --> I[Consultas e filtros]
    G --> J[Análise]
    H --> J
    I --> J
