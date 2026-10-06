Crie a tela “Usuários” do sistema SENTINELA, mantendo exatamente o mesmo padrão visual, identidade, espaçamento, tipografia, cores, sidebar, cabeçalho, dark mode, componentes e estilo das demais telas já existentes no projeto.

IMPORTANTE:
- Não redesenhe o sistema inteiro.
- Não altere a sidebar.
- Não altere o cabeçalho superior.
- Não altere a identidade visual do SENTINELA.
- Apenas desenvolva o conteúdo da tela “Usuários” na área central.
- A tela deve parecer parte nativa das telas já criadas no projeto.

OBJETIVO DA TELA

A tela “Usuários” será uma área administrativa para gerenciamento dos usuários que possuem acesso ao sistema SENTINELA.

Ela deverá ser acessível somente para usuários com perfil de Administrador.

Usuários comuns não devem visualizar essa opção no menu lateral e não devem possuir acesso a essa tela.

ESTRUTURA DA TELA

No topo da área de conteúdo, adicionar:

Título:
“Usuários”

Descrição:
“Gerencie usuários, perfis de acesso e permissões do sistema.”

No lado direito do cabeçalho da página, adicionar um botão principal:

“+ Novo usuário”

Esse botão deve seguir o mesmo padrão visual dos botões primários utilizados no restante do SENTINELA.

Esse botão somente deve existir para Administradores.

---

INDICADORES RESUMIDOS

Logo abaixo do cabeçalho, adicionar pequenos cards de resumo, mantendo o padrão visual já utilizado no dashboard.

Criar 4 cards:

1. Total de usuários
Exemplo:
24

2. Usuários ativos
Exemplo:
21

3. Administradores
Exemplo:
3

4. Usuários inativos
Exemplo:
3

Os cards devem ser discretos, compactos e coerentes com o restante do sistema.

---

FILTROS

Abaixo dos indicadores, criar uma área de filtros horizontal.

Adicionar:

Campo de busca:
“Buscar por nome ou e-mail”

Filtro:
“Perfil”
Opções:
- Todos
- Administrador
- Analista
- Operador

Filtro:
“Status”
Opções:
- Todos
- Ativo
- Inativo

Caso o sistema já possua um padrão visual para filtros em outras telas, reutilizar exatamente esse padrão.

---

TABELA DE USUÁRIOS

Criar uma tabela principal com aparência profissional e limpa.

Colunas:

Usuário
Órgão / Unidade
Perfil
Status
Último acesso
Ações

Exemplo de dados fictícios:

Pedro Augusto
pedro.augusto@email.com
Administração
Administrador
Ativo
Hoje, 10:32

João Silva
joao.silva@email.com
Unidade Operacional
Analista
Ativo
Hoje, 09:15

Maria Souza
maria.souza@email.com
Unidade Operacional
Operador
Ativo
27/08/2026

Carlos Lima
carlos.lima@email.com
Administração
Operador
Inativo
15/08/2026

Na coluna “Usuário”, exibir:

- Avatar circular com iniciais
- Nome completo
- E-mail abaixo do nome em tamanho menor

---

PERFIL

Utilizar badges para identificar o perfil:

Administrador
Analista
Operador

Os badges devem seguir o padrão visual do sistema, sem utilizar cores excessivamente fortes.

---

STATUS

Exibir status utilizando badge:

Ativo
Inativo

“Ativo” deve ter identificação visual positiva e discreta.

“Inativo” deve ter aparência neutra ou reduzida.

---

AÇÕES

Na última coluna, adicionar botão de três pontos “...”.

Ao clicar, abrir menu contextual com:

Visualizar usuário
Editar usuário
Alterar perfil e permissões
Visualizar atividades
Desativar usuário

Para usuário inativo:
Ativar usuário

Utilizar ícones discretos e consistentes com os existentes no sistema.

---

DETALHES DO USUÁRIO

Ao clicar em “Visualizar usuário”, abrir um painel lateral ou modal seguindo o padrão já utilizado pelo SENTINELA.

Exibir:

Nome completo
E-mail
Órgão / Unidade
Perfil
Status
Data de cadastro
Último acesso

Adicionar também duas seções:

“Permissões”

e

“Atividade recente”

---

PERMISSÕES

Na seção “Permissões”, mostrar as permissões do usuário de maneira organizada.

Exemplo:

Visualizar Dashboard
Visualizar Mapa Criminal
Consultar ocorrências
Cadastrar ocorrência
Editar ocorrência
Importar dados
Exportar dados
Gerenciar usuários
Alterar permissões
Configurações administrativas

Mostrar visualmente quais permissões estão habilitadas ou não.

IMPORTANTE:

As permissões devem ser baseadas principalmente no perfil do usuário.

Perfis iniciais:

Administrador
Analista
Operador

Administrador possui acesso completo.

Analista possui acesso a:
- Dashboard
- Mapa Criminal
- Consulta de ocorrências
- Cadastro e edição de ocorrências
- Importação
- Exportação

Analista não pode:
- Gerenciar usuários
- Alterar permissões
- Alterar configurações administrativas

Operador possui acesso mais restrito, principalmente:
- Dashboard
- Mapa Criminal
- Consulta de ocorrências
- Cadastro de ocorrências

---

ATIVIDADE RECENTE

Criar uma pequena timeline de atividades.

Exemplos:

Hoje, 11:34
Cadastrou a ocorrência #001924

Hoje, 10:17
Editou a ocorrência #001873

27/08/2026, 16:43
Exportou relatório de ocorrências

26/08/2026, 14:31
Realizou a importação #IMP-0018

Essa área representa a rastreabilidade das ações realizadas pelo usuário.

---

NOVO USUÁRIO

Ao clicar em “+ Novo usuário”, abrir modal ou tela seguindo o padrão visual existente.

Campos:

Nome completo
E-mail
Órgão / Unidade
Perfil

Perfil deve possuir opções:

Administrador
Analista
Operador

Status inicial:
Ativo

Botões:

Cancelar
Criar usuário

Adicionar uma pequena descrição:

“O usuário receberá acesso ao SENTINELA de acordo com o perfil selecionado.”

---

ALTERAR PERFIL E PERMISSÕES

Criar também o fluxo visual de alteração de perfil.

Mostrar:

Perfil atual
Novo perfil

Administrador
Analista
Operador

Ao alterar o perfil, exibir as permissões correspondentes.

Adicionar aviso:

“As alterações de perfil afetam imediatamente as permissões de acesso do usuário.”

Botões:

Cancelar
Salvar alterações

---

REGRAS IMPORTANTES DO SISTEMA

1. Apenas Administradores podem acessar essa tela.

2. Apenas Administradores podem:
- Criar usuários
- Editar usuários
- Alterar perfil
- Alterar permissões
- Ativar usuários
- Desativar usuários

3. Usuários comuns não devem visualizar a opção “Usuários” na sidebar.

4. A seção “Gestão” da sidebar pode ser exibida somente para Administradores.

5. Usuários nunca devem ser excluídos definitivamente.

Utilizar apenas os status:

Ativo
Inativo

Isso é necessário porque as ações realizadas por eles permanecem vinculadas às ocorrências, importações e registros de auditoria.

6. As ocorrências cadastradas manualmente devem ficar relacionadas ao usuário responsável.

7. Importações de dados devem ficar relacionadas ao usuário que realizou a importação.

8. Alterações importantes devem possuir rastreabilidade do usuário responsável.

---

DESIGN

Manter:

- Dark mode atual.
- Fundo escuro utilizado nas outras telas.
- Sidebar exatamente como está.
- Cabeçalho exatamente como está.
- Azul da identidade visual do SENTINELA.
- Cards discretos.
- Bordas sutis.
- Ícones lineares.
- Tipografia atual.
- Espaçamentos atuais.
- Bordas arredondadas compatíveis com os componentes existentes.
- Aparência profissional voltada para sistema institucional de análise e monitoramento.

Evitar:

- Gradientes exagerados.
- Cards excessivamente grandes.
- Muitas cores.
- Elementos com aparência de aplicativo genérico.
- Redesenhar a sidebar.
- Alterar o logotipo.
- Alterar o nome SENTINELA.

A tela deve parecer uma continuação natural das telas Dashboard, Mapa Criminal, Ocorrências, Nova Ocorrência e Importar Dados já existentes.