# ADR — Período civil compartilhado nas análises demonstrativas

Data: 28/10/2026. Status: implementado localmente, aguardando revisão da Etapa 2.

## Contexto

Dashboard e Mapa Criminal utilizam a mesma base fictícia, mas tinham controles e agregações diferentes. Um intervalo personalizado exige limites inclusivos, regras independentes do fuso e coerência entre indicadores e camadas. As variações fixas do Dashboard não representavam um recorte aplicado.

## Decisão

Centralizar filtro e agregações em `src/data/demoAnalytics.ts`, com comparação de datas civis validadas por componentes UTC. Compartilhar o formulário de filtros; aplicar datas personalizadas somente após validação, preservando o último estado válido. Transportar o recorte aplicado na navegação Dashboard → Mapa por parâmetros de consulta, sem persistência.

Manter a referência fixa dos atalhos já existentes e permitir intervalos personalizados independentes dela. Contar ocorrências separadamente dos vínculos de natureza. Substituir tendências fixas por séries e indicadores calculados sobre o recorte. Manter a base integral como referência da intensidade cartográfica.

## Consequências

As duas telas reutilizam regras puras testáveis, sem importar Canvas no servidor nem integrar a importação demonstrativa. A seleção de RA não refaz o filtro de período. Datas não representam timestamps operacionais; contratos futuros do backend precisarão definir fuso e semântica de timestamp antes de uma integração real. Estado de filtros não é salvo entre sessões. Nenhuma decisão sobre provedor, geometria ou estilo cartográfico foi alterada.

Detalhes e critérios de validação: [filtros e analytics](../filtros-analytics.md).
