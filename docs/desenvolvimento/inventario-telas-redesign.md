# Inventário funcional para a futura repaginação

Este inventário registra as rotas existentes e a superfície a preservar.
As evidências de execução e o escopo homologado ficam no guia do ambiente
persistente. [Guia de homologação](../../database/local/persistent-homologation/README.md)

| Rota | Componentes e dados | Ações, estados e dependências |
| --- | --- | --- |
| `/login` | Página de login e provedor local. `POST /auth/login` em loopback. | Formulário, feedback de credenciais ou configuração e redirecionamento conforme sessão. Acesso inicial dos três perfis. Preservar inputs com labels, foco e leitura em tela estreita. |
| `/dashboard` | `Dashboard`, cards, gráficos, filtros analíticos e endpoint `GET /api/v1/analytics/persistente`. | Os três perfis consultam período, região, natureza e categoria. Carregamento, vazio, erro e retentativa. Compartilha filtros e recorte com o mapa. Preservar reorganização de cards por breakpoint. |
| `/mapa-criminal` | `CrimeMapEntry`, mapas, cartografia oficial e o endpoint analítico. | Camadas de calor, pontos, clusters e satélite, tooltip, filtros e navegação para Dashboard. Estados de carregamento, falta de geometria, vazio e falha. Conferir controles e área útil em viewport menor. |
| `/ocorrencias` | `Occurrences` e, na homologação de escrita, `IsolatedList`. Catálogos, listagem e detalhe em `/api/v1`. | Consulta dos três perfis, controles de filtro/paginação na listagem padrão, detalhe em diálogo e ações de edição/inativação para registros elegíveis. Estados vazio e de falha com retentativa. Preservar rolagem horizontal de tabela. |
| `/ocorrencias/nova` | `NovaOcorrenciaEntry`, `IsolatedCreate`, catálogo de RA e naturezas e API de ocorrências. | Administrador e Operador, campos de tempo, endereço, coordenadas e natureza, validação de entrada e confirmação por UUID/versão. Campos em grade responsiva, incluindo feedback de catálogo indisponível. |
| `/importar` | `PersistentPcdf`, upload e histórico em `/api/v1/importacoes/pcdf`. CSV e XLSX no modo persistente qualificado. | Administrador e Operador selecionam arquivo e competência, veem pendências, replay e erros e podem solicitar consolidação de grupos aprovados. Preservar o feedback de linha/coluna e o estado de processamento. |
| `/central-revisao` | `PcdfReview` e `/api/v1/central-revisao`. Busca textual, tipo, prioridade e situação combinados, ordenação e páginas no modo persistente qualificado. | Os três perfis consultam. O Administrador decide dentro das regras aprovadas. Preservar diálogo com lote, versão, original e histórico, além de vazio, carregamento, erro e bloqueio explícito de correção. |
| `/usuarios` | Tela administrativa existente. | Administrador. Manter estado demonstrativo e feedback de ações indisponíveis. O gerenciamento real está em fase própria. |
| `/configuracoes` | Tela administrativa existente. | Administrador. Preservar as decisões atuais sobre ações simuladas e estados bloqueados. |

## Pontos compartilhados para o design

- `Header`, `Sidebar` e `SystemSidebar` organizam título, sessão e
  navegação. Preservar a indicação do ambiente local e a matriz de acesso.
- `Button`, inputs, selects e diálogos padronizam controles. Preservar
  associação de labels, teclado, foco, feedback e confirmações.
- Tabelas, filtros, paginação e mensagens de vazio, carregamento e falha
  aparecem em ocorrências, importação e Central. Manter a semântica e
  os critérios de filtro ao unificar suas apresentações.
- Cards, gráficos e mapas compartilham a fonte analítica. Preservar
  parâmetros cartográficos, origem oficial e estados sem localização.

## Aceite de navegador da versão atual

O Edge confirmou a área principal das oito rotas autenticadas e o
formulário de login em 1280 e 390 px. Nas telas persistentes, o roteiro
exercitou cadastro e detalhe de ocorrência, upload XLSX inválido e válido,
histórico de lotes, busca com resultado vazio, retentativa, detalhe e
consulta analítica compartilhada por Dashboard e Mapa. O aceite de teclado
cobriu o atalho para o conteúdo, os controles do menu e a restauração de
foco ao fechar o detalhe da Central com `Escape`. O menu compacto
conservou os nomes acessíveis. A avaliação do redesign deverá comparar a
apresentação das telas, camadas do mapa e estados em outros tamanhos.
[Relatório de aceite](relatorio-homologacao-funcional.md#resultado-da-rodada-final)
