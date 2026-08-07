<div align="center">

SENTINELA

Sistema Estratégico de Análise Territorial de Incidências, Níveis, Estatísticas, Localizações e Alertas

Plataforma web e mobile para cadastro, centralização, visualização e análise de ocorrências criminais.



</div>

Sobre o projeto

O SENTINELA é um sistema de informação voltado à análise e ao monitoramento estatístico de ocorrências criminais.

A proposta é reunir dados que normalmente se encontram distribuídos em arquivos, planilhas, sistemas e períodos distintos, transformando esses registros em informações organizadas, comparáveis e visualmente acessíveis.

A solução será composta por uma plataforma web e um aplicativo mobile, conectados ao mesmo ambiente de dados e submetidos a regras de autenticação, autorização e auditoria.

Problema identificado

A fragmentação dos dados dificulta a obtenção de uma visão ampla e confiável sobre a criminalidade de uma região.

Sem uma plataforma centralizada, tarefas como localizar áreas de maior incidência, comparar períodos, identificar horários críticos e acompanhar alterações estatísticas exigem esforço manual e podem produzir análises incompletas.

O SENTINELA pretende reduzir essa dificuldade ao organizar os registros em um único ambiente de consulta e análise.

Objetivo geral

Desenvolver um sistema web e mobile capaz de receber dados de ocorrências por importação em lote ou cadastro manual, transformando-os em mapas, indicadores, comparações, alertas analíticos e relatórios que auxiliem a compreensão estratégica da criminalidade.

Principais funcionalidades

Cadastro e centralização de dados

Cadastro manual de ocorrências por usuários autorizados;

Importação de arquivos CSV e planilhas padronizadas;

Validação de campos obrigatórios;

Identificação de possíveis registros duplicados;

Padronização de categorias e localidades;

Histórico de importações, cadastros e alterações;

Diferenciação entre registros manuais e registros importados.

Dashboard de indicadores

Total de ocorrências no período selecionado;

Tipos de crime mais registrados;

Regiões com maior quantidade de registros;

Variação em relação ao período anterior;

Evolução por dia, mês e ano;

Distribuição por horário e categoria;

Alertas estatísticos recentes.

Mapa criminal interativo

Visualização das ocorrências por localização;

Pontos individuais e agrupamentos por proximidade;

Mapa de calor;

Delimitação de regiões administrativas;

Consulta de indicadores por área selecionada;

Alteração de período diretamente no mapa;

Visualização da evolução da concentração criminal.

Filtros e comparações

Filtros por período, data, dia da semana e faixa de horário;

Filtros por região, área e localização;

Filtros por tipo, categoria e gravidade da ocorrência;

Comparação entre regiões;

Comparação entre períodos;

Análise de séries históricas;

Identificação de crescimento, redução e mudanças de padrão.

Alertas analíticos

Identificação de quantidades acima ou abaixo do comportamento histórico;

Detecção de alterações relevantes nos dados;

Indicação da região, categoria e período analisados;

Apresentação da referência utilizada na comparação;

Acesso aos dados que originaram o alerta.

Os alertas terão caráter estatístico e informativo. O sistema não afirmará que um crime necessariamente ocorrerá.

Relatórios

Relatórios diários, semanais, mensais ou personalizados;

Resumo executivo;

Indicadores consolidados;

Mapas, gráficos e tabelas;

Comparação entre regiões e períodos;

Crimes mais frequentes e horários críticos;

Exportações autorizadas.

Plataforma web

A versão web será o ambiente principal do SENTINELA e concentrará as funcionalidades mais completas de:

cadastro manual de ocorrências;

importação e validação de dados;

análise aprofundada;

aplicação de filtros avançados;

comparação entre regiões e períodos;

visualização de mapas com múltiplas camadas;

geração de relatórios;

administração de usuários e permissões;

consulta à trilha de auditoria.

Aplicativo mobile

O aplicativo mobile funcionará como uma interface complementar, priorizando rapidez, legibilidade e facilidade de uso.

Entre as funcionalidades previstas estão:

painel resumido de indicadores;

mapa simplificado;

filtros essenciais;

cadastro manual de ocorrências;

consulta do status dos registros enviados;

recebimento de alertas analíticos;

visualização e compartilhamento autorizado de relatórios.

Usuários e controle de acesso

O SENTINELA será destinado a usuários institucionais autorizados.

Cada usuário terá acesso somente às funções e informações compatíveis com seu perfil e suas responsabilidades.

Perfis inicialmente previstos:

Perfil

Responsabilidade principal

Administrador

Configuração, usuários, permissões e auditoria

Gestor

Consulta estratégica de indicadores, mapas e relatórios

Analista

Exploração detalhada dos dados e aplicação de filtros avançados

Supervisor

Consulta gerencial de indicadores e relatórios

Cadastrador

Registro e atualização autorizada de ocorrências

Auditor

Verificação de acessos, importações e alterações

Segurança, privacidade e rastreabilidade

O projeto considera como princípios essenciais:

autenticação e controle de acesso por perfil;

registro das ações relevantes realizadas no sistema;

identificação do responsável por cada cadastro ou alteração;

histórico de cadastros, importações, validações e correções;

minimização de dados pessoais;

proteção das informações armazenadas;

exclusão lógica e preservação do histórico quando aplicável;

uso de dados apenas conforme as permissões institucionais.

Dados pessoais de vítimas, testemunhas ou suspeitos não são necessários para demonstrar as funções analíticas do protótipo inicial.

Escopo da primeira versão

A primeira versão deverá permitir:

autenticar usuários e aplicar permissões;

cadastrar ocorrências manualmente;

importar ocorrências por planilha;

validar e padronizar os dados;

exibir indicadores em dashboard;

visualizar ocorrências em mapas;

aplicar filtros geográficos, temporais e criminais;

comparar regiões e períodos;

identificar alterações relevantes;

gerar relatórios;

registrar ações em trilha de auditoria;

disponibilizar funções essenciais no aplicativo mobile.

Fora do escopo inicial

Nesta primeira versão, o SENTINELA não será uma plataforma de despacho, comando operacional ou acompanhamento em tempo real.

Não estão previstos inicialmente:

acompanhamento de operações;

localização de viaturas, equipes ou agentes;

distribuição de patrulhamento ou rotas;

comunicação operacional em campo;

envio de ordens operacionais;

gerenciamento de ocorrências em andamento;

classificação automática de pessoas como suspeitas;

previsão determinística de crimes.

Fluxo geral

Cadastro manual ou importação de planilhas
                    ↓
        Validação e padronização
                    ↓
      Armazenamento centralizado
                    ↓
 Mapas, indicadores, filtros e comparações
                    ↓
       Alertas e relatórios analíticos

Etapas previstas

Definição detalhada dos requisitos;

Modelagem do banco de dados;

Protótipo das telas web e mobile;

Autenticação e perfis de acesso;

Cadastro manual de ocorrências;

Importação e validação de planilhas;

Dashboard de indicadores;

Mapa criminal interativo;

Filtros e comparações;

Alertas analíticos;

Relatórios;

Auditoria e histórico;

Testes e validação do MVP.

Status do projeto

Projeto em fase de planejamento, definição funcional e levantamento de dados.

As funcionalidades e regras poderão ser refinadas durante o desenvolvimento e a validação com usuários.

Autor

Desenvolvido por Pedro Augusto Lourenço da Silva como projeto acadêmico de sistema de informação.

<div align="center">

SENTINELA — dados organizados para análises mais claras, comparáveis e estratégicas.

</div>
