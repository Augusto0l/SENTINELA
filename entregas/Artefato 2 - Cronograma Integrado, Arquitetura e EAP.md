# **Cronograma Integrado, Arquitetura e EAP \- SENTINELA (v0.1 Arquitetura / v3.6 Consolidado)**

---

**Projeto:** SENTINELA — Sistema de Análise e Monitoramento de Ocorrências Criminais do Distrito Federal (CAMPUSCEUB)  
**Duração Total Prevista:** 8 Semanas  |  **Total de Sprints:** 6 Sprints  |  **Total de Issues:** 22 Issues  
**Stack Tecnológica Integrada:** Next.js 14+ (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Leaflet, Supabase (Auth/PostgreSQL/RLS), Vercel, OpenStreetMap/Nominatim.

## **1\. Estrutura Analítica do Projeto (EAP / WBS)**

---

A Estrutura Analítica do Projeto (EAP) reflete a decomposição do projeto integrando a arquitetura oficial do sistema e a stack tecnológica selecionada (Next.js 14, Tailwind, Supabase, PostgreSQL/PostGIS e Vercel):

**Diagrama Oficial da Estrutura Analítica do Projeto (EAP \- SENTINELA)**

**Estrutura dos 5 Eixos da EAP:**

* **1.1 Gestão e Governança do Projeto:** Requisitos v0.4, Matriz RBAC Supabase Auth (RLS), Tabela de Perfis e Regras de Deduplicação.  
* **1.2 Front-end Web (UI/UX \- Next.js 14 / Tailwind / shadcn):** Design System, Autenticação, Tabela de Ocorrências, Formulário/Mapa Leaflet, Drag-and-Drop Excel/CSV, Recharts Dashboard e Mapa Criminal (GeoJSON RAs).  
* **1.3 Backend e Serviços BaaS (Supabase / Vercel):** Schemas OpenAPI, Supabase Auth/JWT, RLS Policies, Engine de Importação/Erros, Geocodificação Nominatim/Leaflet e APIs de Analytics.  
* **1.4 Banco de Dados Relacional/Geospacial (PostgreSQL / PostGIS):** Modelagem DDL (8 tabelas base), Functions/Triggers/Views, RLS e Pipeline ETL de Carga Histórica (5 anos PCDF/SSP-DF).  
* **1.5 Infraestrutura, DevOps e Segurança:** Hospedagem Vercel (Build Automático GitHub), HTTPS/TLS, Supabase Storage e Políticas de Backup.

## **2\. Arquitetura do Sistema e Especificação Tecnológica**

---

Com base no diagrama oficial de Arquitetura do Sistema (v0.1), o SENTINELA organiza suas camadas e tecnologias da seguinte forma:

> * **Usuários & Perfis:** Administrador (Acesso total), Operador (Cadastra/Analisa) e Analista (Apenas consultas). Dispositivos: Desktop, Notebook e Tablet via navegador Web.  
> * **Front-End Web (Vercel):** **Next.js 14+** **React** **TypeScript** **Tailwind CSS** **shadcn/ui** **Recharts** **Leaflet**. Hospedado na Vercel com CI/CD via GitHub.  
> * **Backend & BaaS (Supabase):** **Supabase Auth** para gerenciamento de sessão/login e controle de perfis via **Row Level Security (RLS)**. API REST/PostgreSQL nativa com Triggers, Functions e Views.  
> * **Banco de Dados (PostgreSQL / Supabase):** Tabelas principais: usuarios, perfis\_usuario, naturezas\_crime, regioes\_administrativas, ocorrencias, importacoes, erros\_importacao e auditoria. Uso de PostGIS para georreferenciamento.  
> * **Serviços Externos & Mapas:** OpenStreetMap via Leaflet, GeoJSON oficial das RAs do DF e Geocodificação de endereços via Nominatim.

## **3\. Quadro Geral e Matriz do Cronograma de Sprints**

---

| Sprint | Período | Duração | Foco / Objetivo Principal (Tecnológico e Funcional) | Épicos Alocados | Qtd. Issues   |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Sprint 1** | Semana 1 | 1 Semana | Setup Next.js 14, Tailwind, shadcn/ui, Design System e Mapeamento de Regras | EP01, EP05 | 4 |
| **Sprint 2** | Semana 2 | 1 Semana | Interface Operacional de Ocorrências, Leaflet UI (Pino/Mapa) e Guards de Perfil | EP02, EP03 | 4 |
| **Sprint 3** | Semanas 3 e 4 | 2 Semanas | Módulo Upload (Excel/CSV), Mapa de Calor/GeoJSON RAs, Recharts e Swagger | EP03, EP04, EP05 | 4 |
| **Sprint 4** | Semanas 5 e 6 | 2 Semanas | QA Front-end, Schema PostgreSQL (8 Tabelas), PostGIS, Supabase Auth e CRUD REST | EP05, EP06, EP07 | 4 |
| **Sprint 5** | Semana 7 | 1 Semana | Engine Importação Supabase (erros\_importacao), Geocodificador Nominatim e Views SQL | EP07 | 3 |
| **Sprint 6** | Semana 8 | 1 Semana | Módulo de Auditoria (RLS), Pipeline ETL PCDF/SSP-DF (5 anos) e Deploy Vercel Produtivo | EP06, EP07, EP08 | 3 |

## **4\. Detalhamento Mapeado das Issues com Stack Tecnológica**

### ---

**Sprint 1 (Semana 1\) — Fundação Web e Regras de Negócio**

#### **Épico 01: Fundação Front-end e Identidade Visual (EP01)**

##### **ISSUE-01: Setup inicial do projeto Web, Next.js 14+ e Design System**

**Stack/Tecnologias:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui.  
**Proposta:** Inicializar repositório no GitHub, configurar Next.js 14+ com App Router, Tailwind CSS e componentes shadcn/ui para o layout base (Sidebar \+ Topbar).

##### **ISSUE-02: Páginas e Mocks do Layout Base**

**Stack/Tecnologias:** Next.js 14, JSON Mocks.  
**Proposta:** Criar telas mockadas de Login, Dashboard, Mapa Criminal, Ocorrências, Importação e Usuários com suporte a prototipação rápida.

##### **ISSUE-03: Padronização Visual, Responsividade e Feedbacks**

**Stack/Tecnologias:** Tailwind CSS, shadcn/ui (Toast/Skeleton).  
**Proposta:** Ajustar responsividade para Desktop, Notebook e Tablet, e adicionar toasts e skeletons visuais.

#### **Épico 05: Governança, Contratos e Qualidade (EP05)**

##### **ISSUE-11: Formalização de Catálogos, Regras e Perfis Supabase**

**Stack/Tecnologias:** JSON Schemas, Regras RLS Supabase.  
**Proposta:** Definir catálogo oficial das RAs do DF, naturezas e matriz de permissões para Administrador, Operador e Analista.

### **Sprint 2 (Semana 2\) — Fluxos Operacionais e Geocodificação UI**

#### **Épico 02: Gestão Operacional de Ocorrências e Acessos (EP02)**

##### **ISSUE-04: Consulta, Pesquisa e Filtros de Ocorrências**

**Stack/Tecnologias:** React, shadcn/ui (Table, Dialog, Input).  
**Proposta:** Tabela paginada com ordenação, busca global e modal detalhada de ocorrência.

##### **ISSUE-05: Formulários de Cadastro, Edição e Inativação Manual**

**Stack/Tecnologias:** React Hook Form, Zod.  
**Proposta:** Form de cadastro manual com validação de campos obrigatórios (natureza, data, hora, RA, endereço) e diálogo de confirmação.

##### **ISSUE-10: Controle de Permissões e Perfis na Interface**

**Stack/Tecnologias:** Next.js Middleware, React Context.  
**Proposta:** Bloqueio de rotas e ocultação de botões na UI segundo os perfis Administrador, Operador e Analista.

#### **Épico 03: Geolocalização e Módulo de Importação (EP03)**

##### **ISSUE-06: Interface de Geocodificação e Ajuste no Mapa**

**Stack/Tecnologias:** Leaflet, OpenStreetMap UI.  
**Proposta:** Componente de mapa interativo na tela de cadastro para mover e definir o marcador (lat/long) de ocorrência.

### **Sprint 3 (Semanas 3 e 4\) — Importação, Analytics e Contratos API**

#### **Épico 03: Geolocalização e Módulo de Importação (EP03)**

##### **ISSUE-07: Interface de Importação de Arquivos em Lote**

**Stack/Tecnologias:** React Dropzone, SheetJS (XLSX/CSV).  
**Proposta:** Interface Drag-and-Drop de planilhas PCDF/SSP-DF com de/para de colunas e tabela de pré-visualização.

#### **Épico 04: Visualizações Analíticas e Mapeamento Criminal (EP04)**

##### **ISSUE-08: Mapa Criminal do DF (Camadas, Pontos e Calor)**

**Stack/Tecnologias:** Leaflet, Leaflet.heat, GeoJSON RAs DF.  
**Proposta:** Renderizar os limites reais das RAs do DF via GeoJSON, marcadores de ocorrência e camada de Mapa de Calor (heatmap).

##### **ISSUE-09: Dashboard de Indicadores e Gráficos Analíticos**

**Stack/Tecnologias:** Recharts, Tailwind CSS.  
**Proposta:** Gráficos de linha (evolução temporal), barras (por RA/natureza) e cards de KPI integrados aos filtros de consulta.

#### **Épico 05: Governança, Contratos e Qualidade (EP05)**

##### **ISSUE-12: Especificação de Contratos e Swagger de API**

**Stack/Tecnologias:** OpenAPI 3.0 / Swagger.  
**Proposta:** Especificação formal dos payloads JSON, erros e endpoints RESTful para integração com o Supabase.

### **Sprint 4 (Semanas 5 e 6\) — QA Front-end, Persistência e Serviços Core Backend**

#### **Épico 05: Governança, Contratos e Qualidade (EP05)**

##### **ISSUE-13: Validação Mocks vs Protótipo e QA de Interface**

**Stack/Tecnologias:** Jest, React Testing Library.  
**Proposta:** Testes de integração front-end garantindo paridade numérica entre Dashboard, Mapa e Tabelas.

#### **Épico 06: Infraestrutura, Segurança e Banco de Dados (EP06)**

##### **ISSUE-14: Modelagem Física e Scripts DDL do Banco de Dados**

**Stack/Tecnologias:** PostgreSQL, PostGIS, Supabase Database.  
**Proposta:** Scripts DDL criando as 8 tabelas base (usuarios, ocorrencias, regioes\_administrativas, etc.) e suporte PostGIS.

#### **Épico 07: Serviços e Motores Backend (EP07)**

##### **ISSUE-15: API Backend \- Autenticação, Usuários e RBAC (Supabase Auth)**

**Stack/Tecnologias:** Supabase Auth, Row Level Security (RLS).  
**Proposta:** Login com e-mail/senha, gestão de tokens JWT, controle de sessão e políticas de RLS no PostgreSQL.

##### **ISSUE-16: API Backend \- CRUD Transacional de Ocorrências**

**Stack/Tecnologias:** PostgreSQL REST API, Supabase Client.  
**Proposta:** API REST transacional para persistência de ocorrências com registro na tabela auditoria.

### **Sprint 5 (Semana 7\) — Processamento em Lote, Geocodificação Real e Analytics**

#### **Épico 07: Serviços e Motores Backend (EP07)**

##### **ISSUE-17: API Backend \- Motor Transacional de Importação e Deduplicação**

**Stack/Tecnologias:** PostgreSQL Triggers/Functions, Supabase Storage.  
**Proposta:** Processamento atômico de arquivos Excel com gravação de pendências na tabela erros\_importacao e regra de deduplicação.

##### **ISSUE-18: Serviço Real de Geocodificação Integrado**

**Stack/Tecnologias:** OpenStreetMap Nominatim API.  
**Proposta:** Integração backend para obtenção de coordenadas lat/long via endereço, aplicando flag de pendência em ambiguidades.

##### **ISSUE-19: API Backend \- Serviços de Analytics e Dados Espaciais**

**Stack/Tecnologias:** PostgreSQL Views & Spatial Indexes.  
**Proposta:** Views e consultas geospaciais otimizadas para alimentar o Dashboard Recharts e o Mapa Leaflet com tempo \< 3s.

### **Sprint 6 (Semana 8\) — Auditoria, Carga Histórica ETL e Deploy Produtivo**

#### **Épico 07: Serviços e Motores Backend (EP07)**

##### **ISSUE-20: Módulo de Auditoria, Logs e Exportação de Dados**

**Stack/Tecnologias:** PostgreSQL Table auditoria, CSV Export.  
**Proposta:** Módulo de logs de ações do sistema e exportação de relatórios em CSV/Excel respeitando perfil de acesso.

#### **Épico 08: ETL, Integração e Homologação Final (EP08)**

##### **ISSUE-21: Módulo ETL \- Tratamento e Carga da Base Real PCDF/SSP-DF (5 anos)**

**Stack/Tecnologias:** Python/Node.js ETL Scripts, PostgreSQL.  
**Proposta:** Pipeline de sanitização e carga massiva dos dados históricos de \~5 anos da PCDF/SSP-DF na base oficial do SENTINELA.

#### **Épico 06: Infraestrutura, Segurança e Banco de Dados (EP06)**

##### **ISSUE-22: Configuração de Hospedagem Vercel, HTTPS e Deploy Produtivo**

**Stack/Tecnologias:** Vercel, GitHub Actions CI/CD, HTTPS/TLS.  
**Proposta:** Build e deploy produtivo na Vercel com integração contínua via GitHub, HTTPS habilitado e rotina de backup no Supabase.

*Para o quesito de organização deste documento, foi feito o uso de inteligência artificial. (Google Gemini)*