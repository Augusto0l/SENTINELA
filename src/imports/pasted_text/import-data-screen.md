# Prompt para Figma Make — Tela “Importar Dados” do SENTINELA

Crie uma tela web de dashboard chamada **“Importar dados”** para o sistema **SENTINELA**, mantendo o visual **o mais fiel possível** à referência aprovada, com **layout dark mode moderno, profissional, institucional e sofisticado**, usando tons de **azul-marinho, preto azulado e cinza-escuro**, com **detalhes em azul vivo** para ações, estados e destaques.

## Objetivo

Quero uma tela de **Importação de Dados** para **popular o banco de dados do sistema** com arquivos vindos do **Excel ou CSV**, desde que estejam no **padrão definido na documentação de formatação dos dados de ocorrência**.

A tela deve transmitir claramente que:

* o usuário pode **arrastar ou selecionar um arquivo**;
* o sistema faz **validação da estrutura do arquivo**;
* existe **mapeamento de colunas**;
* há **pré-visualização dos dados** antes da importação;
* existe um **resumo da validação/importação**;
* o usuário consegue consultar um **histórico recente de importações**.

## Diretriz principal

Use a **imagem de referência aprovada** como base principal e recrie a interface **praticamente igual**, preservando:

* a identidade visual do **SENTINELA**;
* o **menu lateral escuro**;
* a **barra superior com busca e perfil do usuário**;
* o título **“Importar dados”**;
* a organização em **cards/painéis**;
* o layout em **duas colunas principais**;
* a grande área de upload à esquerda;
* a coluna lateral direita com **regras, mapeamento, resumo e histórico**;
* a tabela de **pré-visualização dos dados**;
* os botões **“Cancelar”** e **“Validar e importar”**.

## Estrutura geral

A tela deve ser em formato **desktop widescreen**, com:

* **sidebar fixa à esquerda**;
* **topbar horizontal**;
* **conteúdo principal com ótimo aproveitamento do espaço**;
* distribuição bem equilibrada entre **área operacional principal** e **painéis de apoio à direita**.

---

## 1. Sidebar esquerda

Criar uma barra lateral escura com:

* logo/nome **SENTINELA**
* subtítulo: **Análise e Monitoramento**

### Itens do menu

#### Visão Geral

* **Dashboard**
* **Mapa Criminal**

#### Ocorrências

* **Ocorrências**
* **Nova Ocorrência**
* **Importar Dados** (item ativo/selecionado)

#### Gestão

* **Usuários**
* **Configurações**

O item **Importar Dados** deve estar destacado com fundo azul.

### Rodapé da sidebar

Inserir:

* avatar circular com iniciais **PA**
* nome **Pedro Augusto**
* função **Administrador**

---

## 2. Topbar superior

Adicionar uma barra horizontal superior com:

* campo de busca com placeholder:
  **“Buscar ocorrência, região, natureza...”**
* ícones discretos à direita (ex.: notificações e tema)
* avatar pequeno do usuário
* nome **Pedro Augusto**
* seta de dropdown

---

## 3. Cabeçalho do conteúdo

No topo do conteúdo principal:

* título grande **“Importar dados”**
* subtítulo:
  **“Adicione novas ocorrências ao sistema por meio de arquivos estruturados.”**

---

## 4. Layout do conteúdo

Organizar o conteúdo em **duas colunas principais**:

* **Coluna esquerda maior**: upload, pré-visualização e ações principais
* **Coluna direita menor**: regras de formatação, mapeamento, resumo e histórico

---

# Coluna esquerda

## Card 1 — Área principal de upload

Criar um card grande e central, com borda sutil/demarcada, estilo **dropzone**, com aparência elegante.

### Conteúdo do card

Inserir no centro:

* ícone grande de upload
* texto principal:
  **“Arraste um arquivo para esta área ou selecione um arquivo”**
* texto de apoio:
  **“Formatos aceitos: CSV, XLSX | Tamanho máximo: 50 MB”**

Abaixo, mostrar dois pequenos chips ou badges:

* **.CSV**
* **.XLSX**

Abaixo, inserir um link/ação visual:

* **Baixar modelo**

Esse link representa o download do arquivo modelo no formato correto exigido pela documentação.

### Função da área

Essa área deve deixar claro que a tela serve para **importar planilhas de ocorrências** que sigam o padrão documental do sistema.

---

## Card 2 — Pré-visualização dos dados

Título:
**Pré-visualização dos dados**

Criar uma tabela moderna e legível, com cabeçalho escuro e linhas bem organizadas.

### Colunas da tabela

* **Data**
* **Horário**
* **Natureza**
* **Região Administrativa**
* **Bairro/Setor**
* **Latitude**
* **Longitude**

### Exemplo de linhas

Usar dados de exemplo coerentes com o contexto do DF:

1. **21/05/2026 | 08:15 | Furto | Plano Piloto | Asa Sul | -15.7901 | -47.8822**
2. **21/05/2026 | 10:42 | Roubo | Ceilândia | QNM 17 | -15.8325 | -48.1153**
3. **20/05/2026 | 22:31 | Lesão Corporal | Taguatinga | C1 | -15.8340 | -48.0601**
4. **20/05/2026 | 14:05 | Tráfico de Drogas | Samambaia | QR 406 | -15.8679 | -48.1036**
5. **19/05/2026 | 18:47 | Ameaça | Gama | Setor Central | -15.9657 | -48.0371**

### Rodapé da tabela

No canto inferior esquerdo, inserir:

* **“Mostrando 5 de 1.248 registros”**

No canto inferior direito, inserir paginação visual, por exemplo:

* anterior
* páginas **1, 2, 3**
* reticências
* última página
* próximo

---

## Rodapé da coluna esquerda — ações principais

Na parte inferior da tela, abaixo da pré-visualização, inserir uma barra ou área com os botões:

* botão secundário:
  **Cancelar**
* botão primário azul:
  **Validar e importar**

O botão **Validar e importar** deve ser o principal destaque de ação.

---

# Coluna direita

## Card 3 — Regras de formatação

Título:
**Regras de formatação**

Exibir uma lista com ícones de status positivos (check verde), contendo:

* **Arquivo no padrão da documentação**
* **Colunas obrigatórias: data, horário, natureza, RA**
* **Latitude e longitude quando disponíveis**
* **Sem linhas em branco entre registros**
* **Datas no formato dd/mm/aaaa**

Esse card deve comunicar claramente que a planilha precisa seguir o **padrão documental do sistema**.

---

## Card 4 — Mapeamento de colunas

Título:
**Mapeamento de colunas**

Criar uma estrutura em duas colunas:

* **Coluna da planilha**
* **Campo no sistema**

### Linhas de mapeamento

Exibir exemplos como:

* **Data da ocorrência** → **data**
* **Hora** → **horário**
* **Tipo do crime** → **natureza**
* **RA** → **região_administrativa**
* **Local** → **endereço/local**

No lado direito, os campos do sistema devem aparecer como **select dropdowns**, para indicar que o usuário pode ajustar o mapeamento antes da importação.

---

## Card 5 — Resumo da importação

Título:
**Resumo da importação**

Mostrar informações resumidas em formato de lista:

* **Arquivo selecionado** → **ocorrencias_df_2026.xlsx**
* **Registros identificados** → **1.248**
* **Campos obrigatórios válidos** → **1.203**
* **Pendências** → **45**
* **Status** → **Aguardando validação**

### Estilo dos status

* **Campos obrigatórios válidos** em tom verde
* **Pendências** em tom amarelo/laranja
* **Status** dentro de um badge discreto azul ou neutro

---

## Card 6 — Histórico recente

Título:
**Histórico recente**

No canto superior direito do card, inserir o link:

* **Ver todos**

Criar uma tabela compacta com as colunas:

* **Arquivo**
* **Data**
* **Registros**
* **Status**

### Exemplo de linhas

1. **ocorrencias_df_2026.xlsx | 20/05/2026 16:42 | 1.248 | Com pendências**
2. **ocorrencias_df_2026_1.xlsx | 19/05/2026 09:18 | 980 | Concluído**
3. **ocorrencias_df_2026_2.xlsx | 18/05/2026 14:05 | 1.075 | Concluído**

### Estilo dos status

* **Com pendências** → badge amarelo/laranja
* **Concluído** → badge verde

---

## 5. Estilo visual

Seguir rigorosamente estas diretrizes:

* tema escuro elegante e premium;
* painéis com fundo azul-escuro/cinza-escuro;
* bordas suaves e discretas;
* cantos arredondados;
* tipografia moderna, limpa e legível;
* excelente espaçamento entre os elementos;
* contraste alto sem exagero;
* ícones discretos e institucionais;
* sombras leves;
* aparência de sistema real, robusto e confiável.

---

## 6. Sensação desejada

A interface deve transmitir:

* segurança;
* confiabilidade;
* organização;
* clareza operacional;
* controle de qualidade dos dados;
* profissionalismo institucional.

---

## 7. Requisito importante

Quero que o resultado fique **muito próximo da referência aprovada**, sem reinventar o layout.

O foco é **replicar essa mesma proposta visual**, apenas garantindo:

* ótimo aproveitamento do espaço;
* visual limpo;
* organização impecável;
* leitura clara;
* acabamento visual de alto nível;
* e a mensagem funcional de que essa tela serve para **importar arquivos Excel/CSV no padrão exigido pela documentação de formatação das ocorrências**, com validação antes de popular o banco de dados.
