# Filtros de período e analytics demonstrativos

Etapa 2 da Sprint 3, iniciada sobre `7451b44`, branch `integracao-pedro`. Escopo relacionado aos PBIs #82/#85/#88/#91 e tasks #83/#84/#87/#89/#90/#92/#93, conforme o planejamento local. Este registro não declara fechamento remoto de issues ou homologação institucional.

## Interação

Dashboard e Mapa Criminal compartilham `AnalyticFilters`. Os atalhos de período continuam relativos a **25/08/2026**, referência fixa da demonstração, explicitada na tela. RA, natureza, horário e atalhos são aplicados imediatamente.

Em **Personalizado**, preencha Data inicial e Data final e use **Aplicar período** (ou Enter). Editar datas não altera o último recorte aplicado. Datas incompletas, inexistentes ou invertidas apresentam mensagem acessível e mantêm esse recorte. O status informa o período efetivamente aplicado. **Limpar filtros** restaura toda a base, todas as RAs/naturezas/horários e limpa os campos de data. Selecionar um atalho restaura o período rápido sem apagar os outros filtros.

O mapa aberto a partir de uma RA no Dashboard recebe os critérios aplicados na URL, incluindo as datas. “Ver todas” mantém período/natureza/horário e remove a restrição de RA. No Mapa Criminal, voltar à visão do DF remove somente a RA. A URL inicial é interpretada no servidor sem importar Canvas; o estado posterior permanece local à tela, sem persistência. Recarregar o Dashboard restaura o estado padrão.

## Regras de datas e agregação

- `demoCivilDate` valida datas civis ISO (anos 1900–9999) por componentes UTC e conferência de retorno. Datas de ocorrências `DD/MM/YYYY` são convertidas explicitamente; não se usa `Date.parse` de texto localizado nem comparação em horário local.
- O intervalo é fechado nos dois extremos: uma ocorrência às 00:00 da data inicial ou às 23:59 da data final participa. O horário só restringe resultados quando o respectivo filtro está selecionado. Não há conversão de uma data civil para um instante operacional.
- Intervalos personalizados não são limitados à referência dos atalhos. Um período sem dados retorna zero, sem gerar ocorrências substitutas. Datas inválidas na consulta não ampliam silenciosamente o recorte.
- `queryDemoAnalytics` aplica período/natureza/horário uma vez; calcula as contagens territoriais e depois restringe a RA selecionada. O resumo regional não reaplica o período padrão. Sem RA, o resumo é reutilizado pelo mapa e pelos indicadores.
- `summary.total` e a série mensal contam linhas de ocorrências da base canônica (IDs únicos na base fictícia atual). `byNature` conta vínculos distintos entre ocorrência e natureza: uma ocorrência com duas naturezas continua uma ocorrência, com dois vínculos. Nenhuma deduplicação por semelhança é aplicada. Isso não conecta os dados importados da Etapa 1 ao mapa.
- Os rótulos territoriais mostram as contagens por RA após os filtros globais; pontos/calor/clusters e indicadores respeitam a RA selecionada. As contagens das outras RAs continuam disponíveis para exploração geográfica.
- Série mensal, ranking, distribuição, total, dia e hora de pico derivam do mesmo resumo. A série só lista meses com registros; meses ausentes não são interpolados. Empates de pico mantêm a ordem de encontro da base, sem inferência estatística.

## Correções de consistência

O Dashboard não tinha filtros e apresentava variações e séries fixas que não respondiam aos dados. Esses trechos foram substituídos por quantidade de RAs com registros, dia/hora de pico e evolução mensal real da base fictícia, com tabela acessível. O Mapa Criminal também deixou de exibir variações percentuais fixas: o resumo regional mostra a participação da RA no recorte do DF. Distribuições por natureza agora incluem todas as categorias do recorte.

O mapa recebe sempre a base integral como referência de intensidade de calor, enquanto os pontos exibidos são filtrados. Assim, um recorte menor não aumenta artificialmente a intensidade por renormalização. Não houve mudança em `src/components/map`, GeoJSON, cores, posições, clusters, modo Satélite ou nos dados fictícios.

## Validação e limites

Os testes de `tests/demo-analytics.test.mjs` cobrem limites inclusivos, intervalo invertido/incompleto, data impossível/bissexta, recorte vazio, limpeza, atalhos, combinação de filtros, contagens, múltiplas naturezas e transporte de filtros na URL. A comparação de resultados roda em processos com TZ UTC, America/Sao_Paulo, America/New_York e Pacific/Kiritimati; isso verifica as regras analíticas, não a geração de dados de outras telas.

Roteiro de navegador reproduzível: iniciar o build de produção local e executar `node scripts/check-analytics.mjs`. O endereço pode ser substituído por `SENTINELA_TEST_URL`. Resultados e capturas temporárias vão para `tmp/analytics-evidence`. O roteiro valida as duas rotas, estados vazios/inválidos, navegação entre telas, contagens (incluindo a camada Satélite com intervalo personalizado), referência de calor, geometria, temas, quatro larguras e teclado. As fontes Google são bloqueadas nesse roteiro; tiles de Satélite têm roteiro separado (`scripts/check-satellite.mjs`).

Resultados efetivamente registrados: [evidências desta etapa](evidencias/analytics/README.md). Limitações: demonstração exclusivamente em memória, sem backend, banco, autenticação ou importação persistida; validação local em Chrome não substitui aceite do professor ou cobertura de todos os navegadores/dispositivos.
