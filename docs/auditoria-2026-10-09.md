# Auditoria técnica do SENTINELA

Data: 09/10/2026. Escopo: código versionado, rotas, configurações, dependências declaradas, documentação, segurança implementada, fluxos de dados, mapas, acessibilidade e preparação para entrega.

## Parecer

O projeto é um protótipo de interface em Next.js com dados simulados. A documentação de arquitetura reconhece essa fase. Ainda não atende aos critérios de aceitação do MVP operacional: não há autenticação, autorização no servidor, persistência, pipeline de importação ou trilha real de auditoria implementados neste repositório. Essas ausências são lacunas planejadas, mas impedem uso institucional com dados reais. Há também defeitos concretos no protótipo, descritos abaixo.

Não foram alterados código, dependências ou configurações para corrigir os achados. Este relatório é o único artefato intencionalmente adicionado.

## Verificações e limites

- `npm run typecheck`: passou, sem erros.
- `npm run build`: falhou ao carregar o compilador SWC. A política de Controle de Aplicativo do Windows bloqueou `next-swc.win32-x64-msvc.node`. A primeira tentativa também não conseguiu criar o cache fora do workspace; a repetição com execução escalada continuou bloqueada pela política do Windows. Isso é um impedimento do ambiente, não evidência de erro de compilação do código.
- `npm audit --json`: não executou a auditoria porque o projeto usa `pnpm-lock.yaml`, sem lockfile do npm. `pnpm audit --json` não retornou resultado durante a execução e foi interrompido. Não há conclusão sobre vulnerabilidades de dependências.
- Conferência dos agregados em `mockData.ts`: 37 RAs, total de 22.005 ocorrências; a soma das naturezas corresponde ao total declarado em cada RA.
- Inspeção estática de todas as telas principais, entradas das rotas, componentes de mapas, estilos e documentação de requisitos/arquitetura. As rotas principais usam wrappers de cliente; dashboard, mapa e listagem desabilitam SSR para os mocks que dependem de Canvas/Path2D.
- Não houve teste visual em navegador, medição de desempenho, teste de carga, pentest de serviço publicado, auditoria do histórico completo do Git, validação externa da cartografia, inspeção de infraestrutura ou banco remoto. Os documentos PDF/imagens não foram validados em detalhe. Não se presume que serviços externos inexistam; eles não estão integrados no código examinado.

## Achados por prioridade

### A01 — Alta: cadastro confirma gravação inexistente

Evidência: `src/features/NovaOcorrencia.tsx:161–184`.

`handleSave` valida alguns campos, aguarda 1,4 segundo e ativa a tela de sucesso. Não grava em API, banco ou armazenamento local. A interface afirma que a ocorrência foi salva e está disponível. Retornar à listagem não inclui o registro.

Correção: implementar persistência e confirmar sucesso apenas após resposta válida; enquanto for protótipo, informar explicitamente que a operação é uma simulação. Requisito afetado: RF-12.

### A02 — Alta: importação não lê nem valida arquivos

Evidência: `src/features/ImportarDados.tsx:186–203`, `:251–252`, `:329`, `:375–397`, `:471–476`.

A seleção e o drop alteram somente o nome do arquivo. Prévia, quantidade de registros, pendências e histórico são constantes. Paginar não muda as linhas. O botão de importar não tem ação; baixar modelo apenas impede a propagação do clique. O limite anunciado de 50 MB e os formatos não são validados no drop.

Correção: implementar leitura CSV/XLSX, limite de tamanho, validação estrutural, aplicação do mapeamento, prévia paginada, deduplicação e persistência transacional. Requisitos afetados: RF-16 a RF-24.

### A03 — Alta: filtros analíticos sem efeito

Evidência: `src/features/CrimeMap.tsx:34–46`, `:82–110`, `:225–235`.

Período, natureza e horário são mantidos em estado, mas não participam da seleção de ocorrências nem do cálculo dos indicadores. Apenas a RA altera o contexto. Escolher um crime ou outro período mantém o mesmo resultado analítico.

Correção: criar uma seleção única de ocorrências filtradas e derivar dela mapa, contagens, gráficos e indicadores. Requisito afetado: RF-09 e critério de aceitação 4.

### A04 — Alta: posição do clique calculada incorretamente no SVG

Evidência: `src/components/map/MapaDF.tsx:194–201`, `:215`.

O SVG usa `preserveAspectRatio="xMidYMid meet"`, mas o clique é convertido dividindo pela largura/altura inteira do elemento. Quando a proporção do contêiner difere do viewBox, existem margens de centralização que essa conta ignora; o ponto salvo pode divergir do local clicado.

Correção: converter o ponto da tela pela inversa de `getScreenCTM()`, tratando matriz ausente e cliques fora da área válida. Requisito afetado: RF-13.

### A05 — Alta: mapa de calor pode se desalinha dos polígonos

Evidência: `src/components/map/MapaDF.tsx:83–90`, `:178–180`, `:215`, `:381–393`.

O canvas calcula escalas independentes em X/Y e ocupa 100% do contêiner. O SVG preserva a proporção e centraliza o desenho. Em contêineres de proporção diferente — especialmente ao aproximar uma RA — os dois sistemas deixam de coincidir.

Correção: compartilhar a transformação efetiva e as margens do SVG com o canvas, atualizando-as em mudanças de tamanho e viewBox. Verificar sobreposição em diferentes proporções e seleção de RAs.

### A06 — Alta: indicadores e pontos representam bases diferentes

Evidência: `src/features/Dashboard.tsx:14–25`, `src/features/CrimeMap.tsx:15–17`, `src/data/mockOccurrences.ts:95–113`, `src/features/Occurrences.tsx:38–51`.

Contagens e KPIs usam os agregados de `RA_LIST` (22.005). Pontos, clusters, calor e listagem usam uma amostra aleatória com alvo de 800 registros. Embora a listagem sinalize demonstração, o dashboard não explica essa diferença. A variação geral de +8,4% e as séries temporais são valores fixos; o horário de atualização deriva da renderização, não da atualização da fonte.

Correção: derivar todas as visualizações da mesma base ou identificar claramente amostras e agregados como conjuntos distintos. Calcular variação com períodos definidos e exibir timestamp da fonte. Requisitos afetados: RF-02, RF-03 e critério de aceitação 4.

### A07 — Alta para entrega: scripts de publicação incompatíveis com Next.js

Evidência: `.figma/make/deploy:3–4`, `.figma/make/deploy-preview:4–5`, `package.json:8–10`, `next.config.ts:2`.

O deploy procura `dist`, mas `next build` usa `.next` na configuração atual. O preview ainda passa `--mode development`, uma opção herdada do Vite. Assim, a cadeia de publicação existente não está alinhada ao framework atual.

Correção: definir hospedagem compatível com execução Next.js e atualizar os scripts. Exportação estática exige adaptação prévia das rotas e confirmação de compatibilidade; apenas trocar o diretório não resolve a arquitetura de entrega.

### A08 — Bloqueador operacional: autenticação, autorização e auditoria ausentes

Evidência: `src/app/page.tsx:2`, `src/app/(sistema)/layout.tsx:4–15`, `src/components/SystemSidebar.tsx:7–33`, `src/features/Usuarios.tsx:594–641`.

A página inicial redireciona diretamente ao dashboard. O layout não verifica sessão ou perfil. Gestão de usuários e mudança de permissões são acessíveis pelas rotas sem controle de acesso implementado. Não foram encontradas APIs, políticas de dados ou eventos de auditoria persistidos.

Não há demonstração de vazamento de base real: os dados atuais são simulados. Antes de operação real, implementar autenticação, autorização no servidor por recurso/ação, isolamento de dados e logs auditáveis. Requisitos afetados: RF-01, RF-27, RF-32, RNF-02 e RNF-05.

### A09 — Média: configurações e segurança simuladas passam aparência de efetividade

Evidência: `src/features/Configuracoes.tsx:283–286`, `:307–312`, `:410–439`; `src/features/Usuarios.tsx:595`, `:619–641`.

Senha atual, nova e confirmação começam com uma string literal. Não há evidência de que seja credencial real, mas ela é distribuída no código cliente. MFA começa ativado sem integração com autenticador. Alterar senha não tem handler; salvar configurações só aguarda e apresenta sucesso. Usuários e perfis existem apenas no estado React e se perdem ao remontar a tela. Preferências não são aplicadas globalmente.

Correção: remover senhas pré-preenchidas, conectar fluxos aos serviços correspondentes, validar confirmação, carregar o estado real da conta e persistir preferências. Identificar simulações enquanto essas integrações não existirem.

### A10 — Média: validação e sincronização do cadastro insuficientes

Evidência: `src/features/NovaOcorrencia.tsx:116–158`, `:275–282`.

Latitude e longitude aceitam texto arbitrário, sem validação de número, faixa ou pertencimento territorial. Editar coordenadas não reposiciona o pin. Selecionar uma RA preenche o ponto de rótulo como localização, sem representar um endereço informado. Anexos são acumulados sem limites de tamanho, quantidade ou verificação de tipo. O detector de alterações não inclui todos os campos.

Correção: validar coordenadas e consistência com a RA; distinguir localização aproximada de confirmada; sincronizar pin e campos; validar anexos; validar novamente no servidor ao implementar persistência.

### A11 — Média: responsividade limitada por dimensões fixas

Evidência: `src/components/Sidebar.tsx:40–41`, `src/features/Dashboard.tsx:77`, `:277`, `src/features/ImportarDados.tsx:223`, `src/features/Configuracoes.tsx:359`, `src/features/NovaOcorrencia.tsx:209`, `src/features/CrimeMap.tsx:240`.

Sidebar inicial de 240 px, painéis laterais fixos e grades de duas a cinco colunas não têm adaptação por breakpoint. O layout principal restringe overflow. Em telas estreitas, há risco de conteúdo comprimido ou cortado. Não foi feita homologação visual; o achado decorre das restrições presentes no código.

Correção: adicionar breakpoints, empilhar painéis e permitir acesso à navegação em dispositivos menores. Requisito afetado: RNF-15.

### A12 — Média: barreiras de acessibilidade

Evidência: `src/components/map/MapaDF.tsx:225–239`, `src/features/Configuracoes.tsx:165–190`, `src/features/Usuarios.tsx:423–434`, `src/features/NovaOcorrencia.tsx:466–475`.

Polígonos clicáveis não oferecem foco nem ação por teclado. Campos usam textos visuais sem associação de label. Modais não implementam semântica de diálogo, foco preso, retorno de foco e encerramento por Escape. Vários campos removem outline; estilos de baixo contraste exigem medição e ajuste. Os switches têm `role` e `aria-checked`, mas precisam de nome acessível.

Correção: usar labels associados, nomes acessíveis, foco visível e diálogos com gerenciamento de foco; oferecer seleção territorial por teclado. Contraste e navegação devem ser homologados em navegador. Requisito afetado: RNF-16.

### A13 — Média: controles aparentam ações que não existem

Evidência: `src/components/Header.tsx`, `src/features/Dashboard.tsx:225–248`, `src/features/CrimeMap.tsx:131–145`, `src/components/map/MapaDF.tsx:328–352`.

Busca global, notificações, alternância de tema, controles de zoom/localização do dashboard e exportação do mapa não implementam os fluxos anunciados. Clusters são desenhados com `pointerEvents="none"`, sem exploração do grupo. Isso dificulta distinguir funções disponíveis de elementos ilustrativos.

Correção: implementar as ações ou apresentar os controles como indisponíveis, explicando que pertencem ao protótipo. Manter a comunicação consistente entre telas.

### A14 — Média: qualidade automatizada e documentação técnica insuficientes

Evidência: `package.json:6–12`, `AGENTS.md`, `README.md`, `docs/arquitetura.md`, `src/features/Usuarios.tsx:7`.

Há typecheck e build, mas não foram encontrados testes automatizados, lint de código ou workflows de CI. O AGENTS descreve arquivos Vite que não existem. O README não fornece instruções atuais de instalação/execução. Os perfis do README diferem dos três perfis definidos na arquitetura e no código. A arquitetura exige endereço/local, mas o formulário não o valida como obrigatório. Persistem referências de issues incompletas na especificação.

Correção: atualizar os documentos para o estado atual, estabelecer matriz única de perfis e regras obrigatórias, completar rastreabilidade e adicionar CI com instalação pelo lockfile, typecheck e build. Priorizar testes significativos de filtros, agregação, transformação geográfica e persistência, em vez de apenas snapshots.

### A15 — Baixa hoje; potencial alta com dados externos: HTML interpolado em mapas legados

Evidência: `src/components/map/ClusterLayer.tsx:45–54`, `src/components/map/RALayer.tsx:97–105`.

Valores são interpolados em strings HTML de popup/tooltip sem escape. Esses componentes não estão ligados às telas principais atuais e usam dados controlados; portanto, não foi comprovado XSS explorável no fluxo ativo. A reativação com conteúdo de arquivos/usuários introduziria risco de injeção.

Correção: construir elementos com `textContent` ou usar renderização que escape texto. Revisar também o uso de estatísticas globais em RALayer: `raStats` controla a escala, enquanto valores e tooltips vêm de `getRAByGeoNome`, podendo ignorar estatísticas recebidas.

## Manutenibilidade e desempenho

Há três abordagens de mapa coexistindo: MapaDF ativo, DFMap e componentes Leaflet sem conexão com as rotas atuais. Os modelos `Occurrence` e `MockOccurrence` usam campos distintos. Isso amplia custo de manutenção e facilita divergências. Consolidar modelo e renderizador após definir o destino das implementações antigas.

O CSS global importa estilos Leaflet mesmo quando o mapa ativo é SVG/canvas, além de uma fonte remota. Avaliar remoção de CSS sem uso e hospedagem local da fonte conforme as necessidades de entrega.

Mocks e geometria são processados no cliente; o calor executa duas passagens por ponto e o hover atualiza estado a cada movimento do mouse. Não há evidência de problema medido com o volume atual. Antes de carregar cinco anos reais, medir volume, memória e renderização, adotar agregação no servidor e evitar regenerar grandes conjuntos no carregamento inicial.

## Cobertura do produto

| Área | Estado observado |
| --- | --- |
| Dashboard | Interface e agregados fictícios; sem período efetivo ou métricas derivadas de registros |
| Mapa | Seleção de RA e troca de representação; demais filtros sem efeito; defeitos de alinhamento |
| Ocorrências | Listagem demonstrativa, filtros locais e paginação; sem detalhe, ordenação ou edição operacional |
| Cadastro | Formulário e validação parcial; sucesso simulado sem persistência |
| Importação | Interface ilustrativa; sem leitura, validação, deduplicação ou gravação |
| Usuários | Manipulação em memória; sem gestão de identidade real ou autorização |
| Configurações | Estados locais e sucesso simulado; sem integração de senha/MFA |
| Auditoria, relatórios e alertas | Sem implementação operacional encontrada |
| Mobile separado | Não encontrado; adaptação web também precisa de trabalho |
| Banco, backups e observabilidade | Planejados na documentação; não verificáveis pelo código atual |

## Ordem recomendada de resolução

1. Corrigir scripts de entrega e validar build em ambiente que permita carregar SWC; alinhar AGENTS e instruções de execução.
2. Tornar explícita a natureza demonstrativa, eliminando confirmações falsas de gravação e segurança.
3. Corrigir transformação dos cliques e alinhamento canvas/SVG; aplicar filtros e unificar a origem dos indicadores.
4. Implementar backend, autenticação/autorização e modelo persistente; incorporar validação, rastreabilidade e deduplicação.
5. Conectar cadastro, usuários, configurações e pipeline de importação; confirmar sucesso somente após persistência.
6. Homologar responsividade e acessibilidade; adicionar CI e testes dos fluxos críticos; concluir auditoria de dependências com pnpm.

O protótipo tem uma base visual e territorial aproveitável e TypeScript estrito sem erros na verificação executada. A próxima entrega deve explicitar se o objetivo é demonstração visual ou MVP operacional, porque os critérios de conclusão são diferentes.
