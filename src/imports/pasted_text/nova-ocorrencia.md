Crie/redesenhe a tela **“Nova Ocorrência”** do sistema web **SENTINELA** seguindo **exatamente o layout e a organização visual da imagem de referência enviada**, mantendo a identidade visual atual do projeto.

## Objetivo

A tela deve aproveitar melhor toda a largura disponível e deixar o cadastro de ocorrência mais profissional, organizado e funcional.

Não altere a identidade visual geral do SENTINELA. Mantenha:

* tema escuro;
* sidebar lateral esquerda;
* barra superior;
* cores azul-marinho, grafite e azul de destaque;
* tipografia, ícones, bordas, espaçamentos e estilo dos cards já utilizados no sistema;
* item **“Nova Ocorrência”** destacado na sidebar;
* responsividade para desktop.

A referência visual deve ser seguida com bastante fidelidade.

---

# Estrutura geral da tela

A área principal deve utilizar praticamente toda a largura disponível após a sidebar.

No topo da página:

**← Voltar**

Título:

**Nova ocorrência**

Subtítulo:

**Registre uma nova ocorrência no sistema.**

Logo abaixo, utilizar um layout principal de **duas colunas**:

* coluna esquerda com aproximadamente **55% da largura**;
* coluna direita com aproximadamente **45% da largura**;
* espaçamento uniforme entre os cards.

---

# COLUNA ESQUERDA

## 1. Card — Informações da ocorrência

Título do card:

**Informações da ocorrência**

Organizar os campos na mesma linha sempre que houver espaço.

### Primeira linha

Campo maior:

**Natureza da ocorrência ***

Tipo: select/dropdown.

Placeholder:

**Selecione a natureza**

Ao abrir, deve apresentar as naturezas de ocorrência cadastradas no sistema.

Na mesma linha, à direita:

**Data ***

Tipo: date picker.

Placeholder:

**dd/mm/aaaa**

Ao lado:

**Horário ***

Tipo: time picker.

Placeholder:

**--:--**

A Natureza deve ocupar aproximadamente metade do card e Data + Horário dividem o restante.

---

# 2. Card — Localização

Título:

**Localização**

### Primeira linha

**Região Administrativa ***

Tipo: select.

Placeholder:

**Selecione a RA**

Utilizar apenas as Regiões Administrativas do Distrito Federal cadastradas no sistema.

Ao lado:

**Bairro ou setor ***

Tipo: select.

Placeholder:

**Selecione o bairro/setor**

O campo deve ser dependente da Região Administrativa selecionada.

Exemplo:

Se a RA selecionada for Ceilândia, apresentar os bairros/setores associados a Ceilândia.

---

### Segunda linha

Campo ocupando toda a largura:

**Endereço ou local**

Placeholder:

**Ex: QNN 25 Conjunto A, próximo ao mercado**

---

### Terceira linha

Dois campos lado a lado:

**Latitude**

Placeholder:

**Ex: -15.800000**

**Longitude**

Placeholder:

**Ex: -47.800000**

As coordenadas podem ser:

* digitadas manualmente;
* preenchidas automaticamente quando o usuário selecionar um ponto no mapa.

---

### Seleção pelo mapa

Logo abaixo das coordenadas, exibir:

ícone de localização + **Selecionar no mapa**

Abaixo, colocar um **mapa interativo em formato horizontal**, ocupando toda a largura do card.

O mapa deve:

* utilizar tema escuro;
* permitir zoom;
* permitir movimentação;
* mostrar ruas e regiões;
* permitir clicar em qualquer ponto;
* adicionar um marcador azul no local selecionado;
* atualizar automaticamente Latitude e Longitude;
* centralizar inicialmente no Distrito Federal.

Adicionar controles discretos de:

**+**

**−**

Pode existir também um botão para centralizar/relocalizar.

---

# 3. Card — Descrição da ocorrência

Título:

**Descrição da ocorrência**

Campo:

**Descrição detalhada ***

Tipo: textarea.

Placeholder:

**Descreva os detalhes da ocorrência...**

Deixar espaço suficiente para aproximadamente 3 a 4 linhas de texto.

---

## Anexos

Abaixo da descrição:

**Anexos**

Criar uma área de upload com borda tracejada.

Texto central:

**Arraste arquivos aqui ou clique para selecionar**

Texto auxiliar:

**Imagens, documentos, áudios ou vídeos (máx. 10MB cada)**

Adicionar ícone de upload/cloud.

O usuário poderá selecionar múltiplos arquivos.

---

# COLUNA DIREITA

## 4. Card — Localização no mapa

Título:

**Localização no mapa**

Criar um mapa maior mostrando o Distrito Federal.

Este mapa funciona sincronizado com o mapa da coluna esquerda.

Características:

* tema escuro;
* foco no Distrito Federal;
* mostrar principais vias e regiões;
* marcador azul indicando a localização selecionada;
* permitir clicar em um ponto para alterar a localização;
* atualizar latitude e longitude automaticamente.

No canto inferior direito do mapa:

**Clique no mapa para definir a localização**

Esse mapa deve ocupar uma área visual importante da página.

---

# 5. Card — Resumo da ocorrência

Título:

**Resumo da ocorrência**

Criar um resumo dinâmico dos dados preenchidos pelo usuário.

Utilizar linhas horizontais discretas separando cada informação.

Exibir:

**Natureza**
valor do campo ou **Não informada**

**Data e horário**
valor ou **Não informados**

**Local**
RA + bairro/setor + endereço ou **Não informado**

**Coordenadas**
Latitude e Longitude ou **Não definidas**

**Descrição**
prévia curta ou **Não informada**

**Anexos**
quantidade de arquivos, por exemplo:

**0 arquivo(s)**

Esse resumo deve atualizar automaticamente enquanto o formulário é preenchido.

Não permitir edição dentro do resumo.

---

# 6. Card — Informações adicionais

Título:

**Informações adicionais**

### Campo

**Responsável pelo registro ***

Tipo: select.

Placeholder:

**Selecione o responsável**

Caso o usuário logado seja o próprio responsável, poderá vir automaticamente preenchido, mas permitir alteração caso o perfil tenha permissão.

---

### Campo

**Unidade/Órgão**

Tipo: select.

Placeholder:

**Selecione a unidade/órgão**

---

### Prioridade

Label:

**Prioridade**

Criar três opções horizontais no formato radio button/card:

**Baixa**
indicador verde

**Média**
indicador amarelo

**Alta**
indicador vermelho

Selecionar apenas uma opção.

Manter aparência discreta e compatível com o tema escuro.

---

# BOTÕES DA PÁGINA

Ao final da tela, alinhados à esquerda da área principal:

Botão secundário:

**Cancelar**

Botão principal azul:

**Salvar ocorrência**

O botão **Salvar ocorrência** deve ser visualmente mais destacado.

Ao salvar:

1. validar campos obrigatórios;
2. registrar a ocorrência;
3. associar o responsável pelo cadastro;
4. armazenar coordenadas;
5. armazenar anexos;
6. atualizar a base de ocorrências;
7. permitir que essa ocorrência posteriormente apareça no **Mapa Criminal**.

---

# CAMPOS OBRIGATÓRIOS

Marcar com asterisco vermelho:

* Natureza da ocorrência;
* Data;
* Horário;
* Região Administrativa;
* Bairro ou setor;
* Descrição detalhada;
* Responsável pelo registro.

Não utilize pop-ups excessivos.

As validações devem preferencialmente aparecer abaixo ou junto ao próprio campo.

---

# COMPORTAMENTO E UX

A tela deve funcionar como um formulário real.

Implementar estados de:

* campo vazio;
* campo preenchido;
* hover;
* focus;
* disabled;
* erro de validação;
* loading;
* salvando;
* sucesso;
* falha ao salvar.

Ao clicar em **Cancelar**, solicitar confirmação somente se existirem dados preenchidos.

Exemplo:

**Descartar alterações?**

**Os dados preenchidos nesta ocorrência serão perdidos.**

---

# IMPORTANTE SOBRE OS DADOS DO SENTINELA

O sistema trabalha geograficamente com as **Regiões Administrativas do Distrito Federal**.

Portanto:

* não criar subdivisões geográficas fora das RAs sem necessidade;
* Bairro/Setor funciona apenas como informação complementar da ocorrência;
* o mapa criminal posteriormente utilizará Latitude/Longitude e Região Administrativa para posicionar e analisar os registros;
* cada ocorrência cadastrada nesta tela deve poder ser correlacionada com os pontos e com o mapa de calor do **Mapa Criminal**.

---

# IMPORTANTE SOBRE O DESIGN

Não redesenhar:

* sidebar;
* logo;
* barra superior;
* menu principal;
* identidade visual do SENTINELA.

Apenas melhorar a tela **Nova Ocorrência**.

Utilize a imagem enviada como principal referência visual.

Quero que a implementação final fique visualmente **o mais próxima possível da referência**, especialmente em:

* proporções dos cards;
* divisão em duas colunas;
* tamanho dos mapas;
* distribuição dos campos;
* resumo lateral;
* espaçamentos;
* alinhamentos;
* hierarquia visual;
* estilo dos botões;
* densidade das informações.

O resultado deve parecer uma tela profissional de um sistema institucional de análise e monitoramento criminal, aproveitando adequadamente a área disponível em telas desktop.
