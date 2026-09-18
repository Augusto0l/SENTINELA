# **Cronograma Integrado, Arquitetura, EAP e Detalhamento de Sprints \- SENTINELA**

**Projeto:** SENTINELA \- Sistema de Análise e Monitoramento de Ocorrências Criminais do Distrito Federal (CAMPUSCEUB)

**Versão Unificada:** Consolidada com Visão Geral, Contexto, Proposta e Critérios de Aceite por Issue

**Duração Total Prevista:** 8 Semanas | **Total de Sprints:** 6 Sprints | **Total de Issues:** 22 Issues

**Stack Tecnológica Integrada:** Next.js 14+ (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Leaflet, Supabase (Auth/PostgreSQL/RLS/Storage), Vercel, OpenStreetMap/Nominatim, Python/Node.js ETL Scripts.

## ---

**1\. Estrutura Analítica do Projeto (EAP / WBS)**

A Estrutura Analítica do Projeto (EAP) reflete a decomposição do projeto integrando a arquitetura oficial do sistema e a stack tecnológica selecionada (Next.js 14, Tailwind, Supabase, PostgreSQL/PostGIS e Vercel):

### **Estrutura dos 5 Eixos da EAP:**

* **1.1 Gestão e Governança do Projeto:** Requisitos v0.4, Matriz RBAC Supabase Auth (RLS), Tabela de Perfis e Regras de Deduplicação.  
* **1.2 Front-end Web (UI/UX \- Next.js 14 / Tailwind / shadcn):** Design System, Autenticação, Tabela de Ocorrências, Formulário/Mapa Leaflet, Drag-and-Drop Excel/CSV, Recharts Dashboard e Mapa Criminal (GeoJSON RAs).  
* **1.3 Backend e Serviços BaaS (Supabase / Vercel):** Schemas OpenAPI, Supabase Auth/JWT, RLS Policies, Engine de Importação/Erros, Geocodificação Nominatim/Leaflet e APIs de Analytics.  
* **1.4 Banco de Dados Relacional/Geospacial (PostgreSQL / PostGIS):** Modelagem DDL (8 tabelas base), Functions/Triggers/Views, RLS e Pipeline ETL de Carga Histórica (5 anos PCDF/SSP-DF).  
* **1.5 Infraestrutura, DevOps e Segurança:** Hospedagem Vercel (Build Automático GitHub), HTTPS/TLS, Supabase Storage e Políticas de Backup.

## **2\. Arquitetura do Sistema e Especificação Tecnológica**

Com base no diagrama oficial de Arquitetura do Sistema (v0.1), o SENTINELA organiza suas camadas e tecnologias da seguinte forma:

* **Usuários & Perfis:** Administrador (Acesso total), Operador (Cadastra/Analisa) e Analista (Apenas consultas). Dispositivos: Desktop, Notebook e Tablet via navegador Web.  
* **Front-End Web (Vercel):** Next.js 14+ React TypeScript Tailwind CSS shadcn/ui Recharts Leaflet. Hospedado na Vercel com CI/CD via GitHub.  
* **Backend & BaaS (Supabase):** Supabase Auth para gerenciamento de sessão/login e controle de perfis via Row Level Security (RLS). API REST/PostgreSQL nativa com Triggers, Functions e Views.  
* **Banco de Dados (PostgreSQL / Supabase):** Tabelas principais: usuarios, perfis\_usuario, naturezas\_crime, regioes\_administrativas, ocorrencias, importacoes, erros\_importacao e auditoria. Uso de PostGIS para georreferenciamento.  
* **Serviços Externos & Mapas:** OpenStreetMap via Leaflet, GeoJSON oficial das RAs do DF e Geocodificação de endereços via Nominatim.

## **3\. Quadro Geral e Matriz do Cronograma de Sprints**

| Sprint | Período | Duração | Foco / Objetivo Principal | Épicos Alocados | Qtd. Issues   |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Sprint 1** | Semana 1 | 1 Semana | Setup Next.js 14, Tailwind, shadcn/ui, Design System e Mapeamento de Regras | EP01, EP05 | 4 |
| **Sprint 2** | Semana 2 | 1 Semana | Interface Operacional de Ocorrências, Leaflet UI (Pino/Mapa) e Guards de Perfil | EP02, EP03 | 4 |
| **Sprint 3** | Semanas 3 e 4 | 2 Semanas | Módulo Upload (Excel/CSV), Mapa de Calor/GeoJSON RAs, Recharts e Swagger | EP03, EP04, EP05 | 4 |
| **Sprint 4** | Semanas 5 e 6 | 2 Semanas | QA Front-end, Schema PostgreSQL (8 Tabelas), PostGIS, Supabase Auth e CRUD REST | EP05, EP06, EP07 | 4 |
| **Sprint 5** | Semana 7 | 1 Semana | Engine Importação Supabase (erros\_importacao), Geocodificador Nominatim e Views SQL | EP07 | 3 |
| **Sprint 6** | Semana 8 | 1 Semana | Módulo de Auditoria (RLS), Pipeline ETL PCDF/SSP-DF (5 anos) e Deploy Vercel Produtivo | EP06, EP07, EP08 | 3 |

## **4\. Detalhamento Consolidado das Issues por Sprint**

### **Sprint 1 (Semana 1\) \- Fundação Web e Regras de Negócio**

#### **Épico 01: Fundação Front-end e Identidade Visual (EP01)**

**ISSUE-01: Setup inicial do projeto Web, Next.js 14+ e Design System**

**Stack/Tecnologias:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui.

**Requisitos Associados:** RNF-14, RNF-24 | **Prioridade:** MVP

**Visão Geral:** Configuração do repositório front-end, suporte a rotas, componentes base de layout (Sidebar e Topbar) e implementação da identidade visual do SENTINELA.

**Contexto:** O desenvolvimento do SENTINELA iniciará pelo front-end web, exigindo uma base arquitetural padronizada para reutilização de componentes antes da integração com a camada de serviços.

**Proposta:** Inicializar repositório no GitHub, configurar Next.js 14+ com App Router, Tailwind CSS e componentes shadcn/ui para o layout base (Sidebar \+ Topbar).

**Critérios de Aceite:**

* Projeto criado, estruturado e versionado no Git.  
* Layout base (Sidebar \+ Topbar) funcionando em formato SPA/rotas.  
* Estilos de botões, formulários e fontes alinhados ao guia visual do SENTINELA.

**ISSUE-02: Páginas e Mocks do Layout Base**

**Stack/Tecnologias:** Next.js 14, JSON Mocks.

**Requisitos Associados:** RF-01, RF-03, RF-05, RF-10, RF-17, RF-28 | **Prioridade:** MVP

**Visão Geral:** Implementar a navegação e a estrutura visual básica das páginas principais utilizando dados simulados (mocks).

**Contexto:** Para validar a navegação antecipadamente, o front-end precisa renderizar todas as páginas antes que a API oficial esteja disponível.

**Proposta:** Criar telas mockadas de Login, Dashboard, Mapa Criminal, Ocorrências, Importação e Usuários com suporte a prototipação rápida.

**Critérios de Aceite:**

* Navegação fluida entre todas as telas principais sem erros de console.  
* Estrutura visual de cada página estruturada com containers para dados futuros.  
* Arquivos de Mocks estruturados em JSON legíveis.

**ISSUE-03: Padronização Visual, Responsividade e Feedbacks**

**Stack/Tecnologias:** Tailwind CSS, shadcn/ui (Toast/Skeleton).

**Requisitos Associados:** RNF-14, RNF-15 | **Prioridade:** MVP

**Visão Geral:** Adequar a interface para visualização em desktops/notebooks e criar padronização de feedbacks visuais ao usuário.

**Contexto:** A aplicação precisa responder adequadamente a diferentes resoluções de tela e fornecer respostas claras durante o carregamento de dados ou ocorrência de erros.

**Proposta:** Ajustar responsividade para Desktop, Notebook e Tablet, e adicionar toasts e skeletons visuais.

**Critérios de Aceite:**

* Interface funcional e adaptada em resoluções de 1366x768 até 1920x1080.  
* Componentes de loading (skeletons, spinners) exibidos em operações simuladas assíncronas.  
* Notificações do tipo Toast implementadas para eventos de sucesso e erro.

#### **Épico 05: Governança, Contratos e Qualidade (EP05)**

**ISSUE-11: Formalização de Catálogos, Regras e Perfis Supabase**

**Stack/Tecnologias:** JSON Schemas, Regras RLS Supabase.

**Requisitos Associados:** RN-07, RN-11, Seção 14 | **Prioridade:** MVP / Alta

**Visão Geral:** Fechar e documentar as listas oficiais de RAs, catálogo de naturezas criminais e regras formais de deduplicação.

**Contexto:** Para evitar ambiguidades no banco de dados e divergências nas análises, os termos textuais devem ser normalizados antes do backend.

**Proposta:** Definir catálogo oficial das RAs do DF, naturezas e matriz de permissões para Administrador, Operador e Analista.

**Critérios de Aceite:**

* Documento/Arquivo JSON contendo a lista padronizada de RAs do DF e Naturezas.  
* Matriz de regras de deduplicação (campos necessários para considerar registro duplicado) definida.  
* Políticas finas de alteração/exclusão por perfil validadas pela equipe.

### **Sprint 2 (Semana 2\) \- Fluxos Operacionais e Geocodificação UI**

#### **Épico 02: Gestão Operacional de Ocorrências e Acessos (EP02)**

**ISSUE-04: Consulta, Pesquisa e Filtros de Ocorrências**

**Stack/Tecnologias:** React, shadcn/ui (Table, Dialog, Input).

**Requisitos Associados:** RF-04, RF-10, RF-11 | **Prioridade:** MVP

**Visão Geral:** Implementar a listagem paginada de ocorrências, busca global por termos e janela modal de detalhes.

**Contexto:** Operadores e Analistas precisam pesquisar e consultar os detalhes operacionais de cada evento criminal cadastrado no sistema.

**Proposta:** Tabela paginada com ordenação, busca global e modal detalhada de ocorrência.

**Critérios de Aceite:**

* Tabela paginada exibindo registros mockados de forma estruturada.  
* Busca por número, RA, natureza e endereço filtrando os dados corretamente.  
* Modal de detalhamento exibe todas as informações da ocorrência ao clicar na linha.

**ISSUE-05: Formulários de Cadastro, Edição e Inativação Manual**

**Stack/Tecnologias:** React Hook Form, Zod.

**Requisitos Associados:** RF-12, RF-15, RF-16, RN-02 | **Prioridade:** MVP / Alta

**Visão Geral:** Construir a interface para cadastro manual, alteração e exclusão/inativação de registros de ocorrências.

**Contexto:** Inserções e ajustes pontuais de eventos criminais ocorrem via cadastro manual e demandam validação rigorosa dos campos obrigatórios.

**Proposta:** Form de cadastro manual com validação de campos obrigatórios (natureza, data, hora, RA, endereço) e diálogo de confirmação.

**Critérios de Aceite:**

* Campos obrigatórios bloqueiam o envio do formulário quando vazios.  
* Datas e horários validados de acordo com o padrão brasileiro (dd/mm/aaaa e HH:mm).  
* Ação de exclusão/inativação solicita confirmação prévia do usuário.

**ISSUE-10: Controle de Permissões e Perfis na Interface**

**Stack/Tecnologias:** Next.js Middleware, React Context.

**Requisitos Associados:** RF-02, RN-13 | **Prioridade:** MVP

**Visão Geral:** Aplicar restrições de exibição na interface do usuário com base nos perfis Administrador, Operador e Analista.

**Contexto:** O Analista não deve ter acesso a botões de criação/edição/exclusão, enquanto o Operador não acessa rotas administrativas de gestão de usuários.

**Proposta:** Bloqueio de rotas e ocultação de botões na UI segundo os perfis Administrador, Operador e Analista.

**Critérios de Aceite:**

* Perfil Analista não visualiza botões de edição, exclusão ou novos cadastros.  
* Perfil Operador tem acesso bloqueado à tela de Gestão de Usuários.  
* Perfil Administrador acessa todas as opções e configurações do sistema.

#### **Épico 03: Geolocalização e Módulo de Importação (EP03)**

**ISSUE-06: Interface de Geocodificação e Ajuste no Mapa**

**Stack/Tecnologias:** Leaflet, OpenStreetMap UI.

**Requisitos Associados:** RF-13, RF-14, RN-03 | **Prioridade:** MVP

**Visão Geral:** Simular a obtenção de coordenadas lat/long pelo endereço e permitir a definição manual do ponto no mapa.

**Contexto:** Nem sempre a planilha de origem possui coordenadas. O usuário precisa geocodificar o endereço ou ajustar o marcador diretamente sobre o mapa.

**Proposta:** Componente de mapa interativo na tela de cadastro para mover e definir o marcador (lat/long) de ocorrência.

**Critérios de Aceite:**

* Digitação do endereço simula o preenchimento automático de lat/long.  
* Possibilidade de clicar no mapa para redefinir as coordenadas geográficas.  
* Alerta visual exibido quando o endereço não gera coordenada válida.

### **Sprint 3 (Semanas 3 e 4\) \- Importação, Analytics e Contratos API**

#### **Épico 03: Geolocalização e Módulo de Importação (EP03)**

**ISSUE-07: Interface de Importação de Arquivos em Lote**

**Stack/Tecnologias:** React Dropzone, SheetJS (XLSX/CSV).

**Requisitos Associados:** RF-17, RF-18, RF-20, RF-21, RF-22 | **Prioridade:** MVP

**Visão Geral:** Construir a interface visual para carga de dados em lote via arquivos CSV/XLSX.

**Contexto:** Grande parte dos dados vem de planilhas. O sistema precisa de uma área de upload interativa com pré-visualização antes da gravação final.

**Proposta:** Interface Drag-and-Drop de planilhas PCDF/SSP-DF com de/para de colunas e tabela de pré-visualização.

**Critérios de Aceite:**

* Área de dropzone aceita apenas arquivos .csv e .xlsx de até 50MB.  
* Tela de de/para para mapear colunas da planilha aos campos do sistema.  
* Resumo prévio exibe a contagem de linhas válidas, erros e duplicidades identificadas.

#### **Épico 04: Visualizações Analíticas e Mapeamento Criminal (EP04)**

**ISSUE-08: Mapa Criminal do DF (Camadas, Pontos e Calor)**

**Stack/Tecnologias:** Leaflet, Leaflet.heat, GeoJSON RAs DF.

**Requisitos Associados:** RF-05, RF-06, RF-07, RF-08, RF-09, P02 | **Prioridade:** MVP

**Visão Geral:** Renderizar o Mapa Criminal interativo do DF com suporte a polígonos das RAs, marcadores e mapa de calor.

**Contexto:** A análise geográfica necessita da demarcação territorial oficial das Regiões Administrativas do Distrito Federal e visualização de manchas criminais.

**Proposta:** Renderizar os limites reais das RAs do DF via GeoJSON, marcadores de ocorrência e camada de Mapa de Calor (heatmap).

**Critérios de Aceite:**

* Polígonos das RAs do DF renderizados e interativos ao passar o cursor (hover exibe nome e contagem).  
* Alternância entre visão por marcadores individuais e Mapa de Calor funcional.  
* Filtros do mapa refletem dinamicamente no quantitativo de pontos exibidos.

**ISSUE-09: Dashboard de Indicadores e Gráficos Analíticos**

**Stack/Tecnologias:** Recharts, Tailwind CSS.

**Requisitos Associados:** RF-03, RN-10 | **Prioridade:** Alta

**Visão Geral:** Construir o painel de métricas com cartões de KPI, gráficos temporais e distribuição territorial.

**Contexto:** Gestores demandam visão consolidada dos índices de criminalidade, tendências históricas e naturezas mais frequentes.

**Proposta:** Gráficos de linha (evolução temporal), barras (por RA/natureza) e cards de KPI integrados aos filtros de consulta.

**Critérios de Aceite:**

* Cards numéricos exibem totalizações coerentes com o contexto selecionado.  
* Gráficos interativos com relatórios de tendência e barras por categoria.  
* Filtro de período global recalcula as métricas do painel simuladamente.

#### **Épico 05: Governança, Contratos e Qualidade (EP05)**

**ISSUE-12: Especificação de Contratos e Swagger de API**

**Stack/Tecnologias:** OpenAPI 3.0 / Swagger.

**Requisitos Associados:** Especificação Técnica (Etapa 3\) | **Prioridade:** Alta

**Visão Geral:** Especificar formalmente a arquitetura RESTful das APIs e os contratos de dados em OpenAPI (Swagger).

**Contexto:** A integração entre front-end e backend exige a definição prévia e sem ambiguidades de todos os endpoints, headers e payloads.

**Proposta:** Especificação formal dos payloads JSON, erros e endpoints RESTful para integração com o Supabase.

**Critérios de Aceite:**

* Documentação OpenAPI/Swagger estruturada e publicada para o time.  
* Payloads de requisição e resposta detalhados com tipos de dados e códigos HTTP.  
* Definição das estruturas de erros e validações da API.

### **Sprint 4 (Semanas 5 e 6\) \- QA Front-end, Persistência e Serviços Core Backend**

#### **Épico 05: Governança, Contratos e Qualidade (EP05)**

**ISSUE-13: Validação Mocks vs Protótipo e QA de Interface**

**Stack/Tecnologias:** Jest, React Testing Library.

**Requisitos Associados:** Garantia de Qualidade Front-end | **Prioridade:** Alta

**Visão Geral:** Testar a usabilidade do front-end, validar aderência ao protótipo e garantir que os mocks das telas forneçam dados coerentes.

**Contexto:** Antes do backend ser implementado, o front-end precisa estar congelado e consistente para evitar retrabalhos nas telas durante a integração.

**Proposta:** Testes de integração front-end garantindo paridade numérica entre Dashboard, Mapa e Tabelas.

**Critérios de Aceite:**

* Zero divergências numéricas entre o Dashboard mockado e os dados do Mapa.  
* Layout e usabilidade validados em comparação com os protótipos aprovados.  
* Lista de ajustes visuais e bugs de front-end corrigidos.

#### **Épico 06: Infraestrutura, Segurança e Banco de Dados (EP06)**

**ISSUE-14: Modelagem Física e Scripts DDL do Banco de Dados**

**Stack/Tecnologias:** PostgreSQL, PostGIS, Supabase Database.

**Requisitos Associados:** Seção 9 | **Prioridade:** MVP

**Visão Geral:** Desenvolver e aplicar os scripts DDL de criação do banco de dados relacional e relacional geospacial.

**Contexto:** O sistema precisa de uma estrutura de persistência confiável, indexada e com suporte a consultas espaciais (latitude/longitude e limites de RA).

**Proposta:** Scripts DDL criando as 8 tabelas base (usuarios, ocorrencias, regioes\_administrativas, etc.) e suporte PostGIS.

**Critérios de Aceite:**

* Banco de dados estruturado via scripts de Migration/DDL.  
* Chaves estrangeiras, índices e restrições de integridade aplicados.  
* Suporte a tipos e índices geospaciais configurados.

#### **Épico 07: Serviços e Motores Backend (EP07)**

**ISSUE-15: API Backend \- Autenticação, Usuários e RBAC (Supabase Auth)**

**Stack/Tecnologias:** Supabase Auth, Row Level Security (RLS).

**Requisitos Associados:** RF-01, RF-02, RF-28, RNF-01, RNF-02 | **Prioridade:** MVP

**Visão Geral:** Desenvolver a camada de segurança no servidor para controle de login, gerenciamento de contas e validação de permissões.

**Contexto:** A segurança deve ser forçada obrigatoriamente no backend, impedindo que chamadas não autorizadas acessem ou modifiquem registros.

**Proposta:** Login com e-mail/senha, gestão de tokens JWT, controle de sessão e políticas de RLS no PostgreSQL.

**Critérios de Aceite:**

* Autenticação por token emitida e validada corretamente nas requisições.  
* Middleware e RLS bloqueiam endpoints e dados restritos no servidor de acordo com o perfil (Admin/Operador/Analista).  
* CRUD de Usuários restrito estritamente ao perfil Administrador.

**ISSUE-16: API Backend \- CRUD Transacional de Ocorrências**

**Stack/Tecnologias:** PostgreSQL REST API, Supabase Client.

**Requisitos Associados:** RF-10, RF-12, RF-15, RF-16, RNF-06 | **Prioridade:** MVP / Alta

**Visão Geral:** Implementar a API RESTful para criação, listagem, atualização e exclusão/inativação de ocorrências no banco de dados.

**Contexto:** Manipulações individuais em ocorrências demandam controle transacional para garantir a consistência do banco de dados e alimentar os rastros de auditoria.

**Proposta:** API REST transacional para persistência de ocorrências com registro na tabela auditoria.

**Critérios de Aceite:**

* Endpoints de listagem respondem com estrutura paginada e filtros aplicados.  
* Validações do servidor rejeitam inserções sem os campos obrigatórios.  
* Toda criação, alteração ou exclusão gera automaticamente um registro na tabela de auditoria.

### **Sprint 5 (Semana 7\) \- Processamento em Lote, Geocodificação Real e Analytics**

#### **Épico 07: Serviços e Motores Backend (EP07)**

**ISSUE-17: API Backend \- Motor Transacional de Importação e Deduplicação**

**Stack/Tecnologias:** PostgreSQL Triggers/Functions, Supabase Storage.

**Requisitos Associados:** RF-19, RF-23, RF-25, RN-05, RN-07, RNF-08 | **Prioridade:** MVP

**Visão Geral:** Desenvolver o processador de arquivos CSV/XLSX no backend para validação, deduplicação e carga em lote.

**Contexto:** O processamento em lote deve aceitar arquivos de até 50MB, identificar incoerências por linha e rejeitar registros sem duplicar a base.

**Proposta:** Processamento atômico de arquivos Excel com gravação de pendências na tabela erros\_importacao e regra de deduplicação.

**Critérios de Aceite:**

* Upload de arquivo processa dados de forma atômica (rollback em falhas críticas de infraestrutura).  
* Algoritmo detecta registros duplicados e impede inserção redundante.  
* Relatório final retornado informando exatamente as linhas com erro e os motivos.

**ISSUE-18: Serviço Real de Geocodificação Integrado**

**Stack/Tecnologias:** OpenStreetMap Nominatim API.

**Requisitos Associados:** RF-14, RN-03, Seção 14 | **Prioridade:** MVP

**Visão Geral:** Integrar serviço externo de geocodificação para transformar descrições de locais e endereços em coordenadas geográficas válidas.

**Contexto:** Registros que não possuam coordenadas de origem devem ser geocodificados. Caso a localização falhe, a ocorrência não pode ser consolidada.

**Proposta:** Integração backend para obtenção de coordenadas lat/long via endereço, aplicando flag de pendência em ambiguidades.

**Critérios de Aceite:**

* Ocorrência sem coordenadas é enviada para geocodificação automática.  
* Registros geocodificados com sucesso atualizam latitude e longitude no banco.  
* Endereços ambíguos ou não localizados marcam o registro como "Pendente de Localização".

**ISSUE-19: API Backend \- Serviços de Analytics e Dados Espaciais**

**Stack/Tecnologias:** PostgreSQL Views & Spatial Indexes.

**Requisitos Associados:** RF-03, RF-05, RF-06, RNF-09 | **Prioridade:** Alta / MVP

**Visão Geral:** Criar endpoints otimizados para cálculo de indicadores agregados e extração das coordenadas para o Mapa Criminal.

**Contexto:** Consultas do Dashboard e renderização de pontos/calor no mapa precisam responder em até 3 segundos mesmo com alto volume de dados.

**Proposta:** Views e consultas geospaciais otimizadas para alimentar o Dashboard Recharts e o Mapa Leaflet com tempo \< 3s.

**Critérios de Aceite:**

* Endpoints analíticos fornecem contagens por RA, evolução temporal e naturezas.  
* Tempo de resposta inferior a 3 segundos no percentil 95 sob dados indexados.  
* Filtros de data e categoria retornam os mesmos quantitativos tanto na API do Dashboard quanto do Mapa.

### **Sprint 6 (Semana 8\) \- Auditoria, Carga Histórica ETL e Deploy Produtivo**

#### **Épico 07: Serviços e Motores Backend (EP07)**

**ISSUE-20: Módulo de Auditoria, Logs e Exportação de Dados**

**Stack/Tecnologias:** PostgreSQL Table auditoria, CSV Export.

**Requisitos Associados:** RF-27, RF-33, RNF-05 | **Prioridade:** Alta / Média

**Visão Geral:** Desenvolver serviço de registro de ações administrativas e funcionalidade de download de dados em formatos estruturados.

**Contexto:** Ações críticas (login, alterações, cargas) exigem rastro de auditoria. Usuários autorizados devem conseguir exportar o resultado das buscas.

**Proposta:** Módulo de logs de ações do sistema e exportação de relatórios em CSV/Excel respeitando perfil de acesso.

**Critérios de Aceite:**

* Tabela de auditoria registra eventos sem guardar informações sensíveis/senhas.  
* Botão de exportação gera arquivo CSV/XLSX respeitando os filtros ativos da consulta.  
* Acesso ao log de auditoria restrito às credenciais permitidas.

#### **Épico 08: ETL, Integração e Homologação Final (EP08)**

**ISSUE-21: Módulo ETL \- Tratamento e Carga da Base Real PCDF/SSP-DF (5 anos)**

**Stack/Tecnologias:** Python/Node.js ETL Scripts, PostgreSQL.

**Requisitos Associados:** P03, RNF-20 | **Prioridade:** MVP

**Visão Geral:** Desenvolver e executar pipeline ETL para tratamento e carga dos dados históricos de aproximadamente 5 anos.

**Contexto:** O SENTINELA deve entrar em operação alimentado com os dados reais e históricos das fontes oficiais do Distrito Federal.

**Proposta:** Pipeline de sanitização e carga massiva dos dados históricos de \~5 anos da PCDF/SSP-DF na base oficial do SENTINELA.

**Critérios de Aceite:**

* Script de carga executado com sucesso e sem perda de dados válidos.  
* Base populada com a série histórica de aproximadamente 5 anos de ocorrências do DF.  
* Dashboard e Mapa exibem os indicadores oficiais integrados após a carga.

#### **Épico 06: Infraestrutura, Segurança e Banco de Dados (EP06)**

**ISSUE-22: Configuração de Hospedagem Vercel, HTTPS e Deploy Produtivo**

**Stack/Tecnologias:** Vercel, GitHub Actions CI/CD, HTTPS/TLS.

**Requisitos Associados:** RNF-01, RNF-12, RNF-13, RNF-19 | **Prioridade:** MVP

**Visão Geral:** Configurar os ambientes de publicação web, HTTPS, diretrizes de backup e infraestrutura de produção.

**Contexto:** A solução precisa ser publicada em ambiente seguro com HTTPS habilitado e rotinas automatizadas para prevenção de perda de dados.

**Proposta:** Build e deploy produtivo na Vercel com integração contínua via GitHub, HTTPS habilitado e rotina de backup no Supabase.

**Critérios de Aceite:**

* Aplicação acessível de forma segura via HTTPS em ambiente produtivo.  
* Rotina automatizada de backup diário configurada e testada via restore (RPO \<= 24h / RTO \<= 4h).  
* Logs do servidor centralizados para diagnóstico de indisponibilidades.