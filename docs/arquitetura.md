# Arquitetura

## Contexto técnico

O Projeto SENTINELA é desenvolvido no âmbito acadêmico como um Projeto Integrador. Trata-se de uma plataforma web unificada para centralizar, monitorar e analisar dados de ocorrências criminais, orientada inicialmente ao Distrito Federal (DF). O sistema tem como canais de uso navegadores web (desktops e notebooks) e visa atender três perfis estritos de usuários: Administrador (acesso total), Operador (alimentação e análise) e Analista (somente leitura/consulta). A operação exige fluxos contínuos de processamento de arquivos em lote (planilhas CSV/XLSX de até 50MB) e interfaces interativas de geolocalização focadas nas Regiões Administrativas (RAs) do DF. Como restrição, a arquitetura provisória será validada primeiro no front-end com dados simulados, aguardando a carga histórica real de cinco anos para a consolidação definitiva do banco.

## Componentes

*   **Front-end Web (Interface de Usuário):** Bloco responsável pela interação direta, provendo login, dashboard analítico, mapa criminal interativo (com limites reais das RAs), formulários de cadastro manual e módulo de importação. A interface oculta controles não autorizados dependendo do perfil do usuário.
*   **Hospedagem e Entrega (Infraestrutura Web):** Plataforma responsável pelo deploy do front-end, garantindo alta disponibilidade (meta de 99,5%), comunicação obrigatória via HTTPS/TLS e distribuição de conteúdo.
*   **Backend as a Service (Serviços Core):** Camada que gerencia a autenticação, controle de sessões e autorização. É responsabilidade mandatória deste bloco validar as regras de acesso (RBAC) em nível de servidor, bloqueando chamadas não autorizadas independentemente da interface.
*   **Banco de Dados e Motor Transacional:** Módulo de persistência que armazena os dados, impõe regras de integridade (RLS) e processa lógicas internas de deduplicação.
*   **Motor de Geocodificação Interno:** Componente lógico que processa arquivos importados sem coordenadas, tentando inferir latitude e longitude a partir do endereço e da RA informados antes da consolidação do dado.
## Integrações

*   **Fontes de Dados Institucionais:** Integração com bases da PCDF e SSP-DF por meio do processamento e upload de arquivos estruturados (CSV/XLSX).
*   **Serviços de Mapas e Cartografia:** Integração de front-end com plataformas externas (ex.: OpenStreetMap via Leaflet) para a renderização das camadas territoriais do Distrito Federal, pontos de ocorrência e mapas de calor.
*   **APIs de Geocodificação de Endereços:** Integração com serviços de terceiros (ex.: Nominatim) para a conversão de endereços em latitude e longitude. O principal risco desta dependência é o retorno de coordenadas imprecisas devido a endereços ambíguos preenchidos na fonte original.

## Dados

*   **Fluxo e Validação:** Os dados entram via importação transacional ou cadastro manual. A presença de natureza, data, horário, RA e endereço/local é obrigatória. Registros com falha na estrutura ou sem coordenadas válidas não são consolidados, ficando retidos com status de pendência para correção pelo usuário.
*   **Armazenamento e Estrutura:** Os dados são persistidos de forma relacional. O detalhamento de bairro/setor não é tratado funcionalmente de forma isolada, integrando o campo texto de endereço/local.
*   **Privacidade e Segurança:** O isolamento e a exibição de dados sensíveis são controlados pelas políticas de privilégio mínimo e pelo mapeamento entre os perfis autorizados (Administrador, Operador, Analista).
*   **Consistência e Rastreabilidade:** A origem de cada dado é preservada (manual ou lote). O sistema mantém prevenção de duplicidades e registra trilhas de auditoria contendo data, hora, usuário, ação e resultado para operações críticas (criação, edição, exclusão, mudanças de permissão).

## Decisões técnicas

*   **Arquitetura Orientada a Perfis (Backend-first):** Decidiu-se que a camada de dados e o backend devem ser a fonte da verdade para as permissões, impedindo falhas de segurança caso a interface seja contornada.
*   **Granularidade Geográfica:** Decisão de focar a análise territorial em Regiões Administrativas (RAs) em detrimento de bairros, garantindo alinhamento com a divisão oficial do DF.
*   **Separação de Etapas:** Adoção de uma estratégia de front-end com mocks (dados fictícios) na fase inicial para destravar o desenvolvimento visual enquanto o modelo físico real de banco de dados aguarda definições dos dados da PM.

## Riscos

*   **Risco de Dados (Duplicidade):** A coexistência de dados agregados (totais mensais) com registros individualizados de fontes variadas pode inflar indevidamente os indicadores do Dashboard. *Mitigação:* Desenvolver regras estritas de deduplicação lógica no motor de importação avaliando data, local, natureza e confiabilidade da fonte.
*   **Risco de Integração (Falha de Geocodificação):** Se o motor de geocodificação não deduzir as coordenadas de um endereço importado, a regra de negócio impede a consolidação da ocorrência. *Mitigação:* Os dados inconsistentes não corrompem o lote inteiro, mas ficam retidos em fila de pendência aguardando que o perfil Operador faça o ajuste manual da localização diretamente no mapa.
*   **Risco Técnico (Performance Web):** A exibição interativa do Mapa Criminal (calor e pontos) carregando 5 anos de histórico pode violar o requisito não-funcional de tempo de resposta de 3 segundos. *Mitigação:* Adoção mandatória de paginação na listagem, índices adequados no banco relacional e técnicas de *clustering* (agrupamento) na renderização do mapa de pontos.

## Diagramas e relação com ADRs

*   **Arquitetura do Sistema (v0.1):** Diagrama de contexto evidenciando os blocos da hospedagem, serviços de BaaS, front-end e comunicação via requisições HTTPS.
*   **Estrutura Inicial do Banco de Dados (v0.3):** Diagrama Entidade-Relacionamento ilustrando a chave estrangeira 1:N entre as `ocorrencias` e as instâncias de `importacoes`, `naturezas_crime` e `regioes_administrativas`.

![Arquitetura do Sistema]([Sentinela/docs/Arquitetura_do_Sistema_(v0.1).jpeg](https://github.com/CAMPUSCEUB/Sentinela/blob/main/docs/Arquitetura_do_Sistema_(v0.1).jpeg))

![Estrutura Inicial Banco de Dados](docs/Estrutura_Inicial_Banco_Dados_SENTINELA_v0.3.pdf)
