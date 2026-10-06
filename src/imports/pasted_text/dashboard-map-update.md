Atualize o componente de mapa da tela Dashboard do sistema SENTINELA, deixando-o com aparência visual semelhante ao exemplo de referência enviado, porém com uma regra obrigatória:

REGRA PRINCIPAL E OBRIGATÓRIA
- O mapa deve ser REAL.
- Use o mapa vetorial real das Regiões Administrativas (RAs) do Distrito Federal que já está importado no projeto.
- Não recrie o mapa do zero.
- Não redesenhe o DF.
- Não altere a geometria do mapa.
- Não altere os limites reais das RAs.
- Não use um mapa ilustrativo ou aproximado.
- Os nomes das RAs devem estar posicionados no local geográfico correto.
- Cada label deve corresponder exatamente à sua respectiva Região Administrativa.

OBJETIVO
Transformar o mapa atual em um mapa analítico moderno, elegante e profissional, com visual institucional de análise criminal, mantendo total fidelidade geográfica ao mapa real do DF já existente no arquivo.

IMPORTANTE
- Preserve o restante da interface do SENTINELA.
- Não alterar a sidebar.
- Não alterar o cabeçalho superior.
- Não alterar o layout geral da dashboard.
- A mudança deve se concentrar no componente do mapa e harmonizar com o restante da tela.
- O mapa deve parecer parte nativa do sistema já criado.

ESTILO VISUAL
- Manter dark mode.
- Manter a identidade visual atual do SENTINELA.
- Fundo do card do mapa em azul-marinho bem escuro.
- Bordas sutis.
- Cantos arredondados.
- Sombra discreta.
- Aparência sofisticada, limpa, técnica e institucional.
- Visual compatível com sistema profissional de monitoramento criminal.

ESTRUTURA DO COMPONENTE DO MAPA

1. MAPA BASE
- Utilizar como base o mapa real já importado das RAs do DF.
- Cada RA deve permanecer com seu formato real.
- Aplicar preenchimento em tons de azul escuro e azul médio.
- As divisões entre RAs devem continuar visíveis, porém discretas.
- O mapa deve ter aparência moderna e bem acabada.

2. NOMES DAS RAs E CONTAGENS
- Exibir os nomes das Regiões Administrativas no mapa.
- Cada nome deve estar no local correto da respectiva RA.
- Não posicionar nomes em regiões erradas.
- Não inverter localizações.
- Exibir também um badge pequeno, escuro e arredondado com a quantidade de ocorrências de cada RA.
- O badge deve ficar próximo ao nome da região e manter boa legibilidade.
- Se necessário, posicionar o texto de forma levemente ajustada para melhorar leitura, mas sempre mantendo associação correta com a RA real.

Exemplos de regiões a manter corretamente posicionadas:
- Ceilândia
- Taguatinga
- Samambaia
- Plano Piloto
- Lago Sul
- Lago Norte
- Sobradinho
- Sobradinho II
- Planaltina
- Paranoá
- Gama
- Santa Maria
- Recanto das Emas
- Riacho Fundo
- Núcleo Bandeirante
- Jardim Botânico
- Brazlândia
- Fercal
- São Sebastião

3. MAPA DE CALOR
- Adicionar uma camada visual de heatmap sobre o mapa base.
- O heatmap deve respeitar a distribuição geográfica das ocorrências.
- Utilizar gradiente de intensidade:
  azul = menor incidência
  amarelo = incidência intermediária
  laranja = incidência alta
  vermelho = maior incidência
- O heatmap deve ter aparência suave e difusa, com blur elegante.
- As manchas de calor não devem esconder totalmente o contorno das RAs.
- O mapa deve continuar legível.
- O efeito deve ser semelhante ao da imagem de referência.
- Áreas mais densas devem apresentar calor mais intenso.

4. PONTOS DE OCORRÊNCIA
- Adicionar pequenos pontos representando ocorrências.
- Os pontos devem ter brilho discreto e aparência luminosa.
- Utilizar tons quentes, como amarelo, laranja e vermelho.
- Variar levemente o tamanho e a intensidade dos pontos.
- Concentrar mais pontos nas áreas de maior incidência e menos nas áreas frias.
- Os pontos devem complementar o mapa de calor sem poluir visualmente.

5. LEGENDA
- Inserir no canto inferior esquerdo uma legenda de intensidade.
- Adicionar uma barra horizontal com gradiente:
  azul → amarelo → laranja → vermelho
- Texto da legenda:
  “Menor incidência” no lado esquerdo
  “Maior incidência” no lado direito
- A legenda deve ser discreta, moderna e fácil de entender.

6. CONTROLES DO MAPA
- No lado direito do mapa, adicionar botões visuais verticais:
  home/reset
  zoom in
  zoom out
  configuração/localização
- Os botões devem seguir o estilo dark do sistema, com ícones discretos e elegantes.
- No topo direito do card do mapa, adicionar um seletor com 3 opções:
  “Mapa de calor”
  “Pontos”
  “Clusters”
- Deixar “Mapa de calor” como aba ativa.
- O seletor deve combinar com o restante do sistema.

7. ESCALA
- Inserir no canto inferior direito uma escala visual do mapa, por exemplo:
  “20 km”
- A escala deve ser discreta e compatível com o estilo profissional da tela.

8. TÍTULO DO CARD
- Manter título do card do mapa como:
  “Ocorrências por Região Administrativa”
- Adicionar subtítulo:
  “Distribuição espacial das ocorrências no período selecionado”

REGRAS DE FIDELIDADE
- A fidelidade geográfica é obrigatória.
- Não modificar o desenho real do DF.
- Não simplificar exageradamente o mapa.
- Não criar regiões fictícias.
- Não mover nomes para posições incorretas.
- Não associar contagens à RA errada.
- Não substituir o mapa real por uma ilustração.

RESULTADO ESPERADO
Quero um componente de mapa com:
- mapa real das RAs do DF já importado no projeto,
- nomes das RAs no local correto,
- badges com contagem por região,
- heatmap profissional,
- pontos de ocorrência brilhantes,
- legenda de intensidade,
- controles modernos de mapa,
- escala visual,
- estilo sofisticado e institucional,
- visual muito próximo ao exemplo de referência,
- sem alterar a geometria real do mapa do DF.

PRIORIDADE MÁXIMA
A principal prioridade é:
1. manter o mapa real das RAs do DF;
2. manter os nomes das RAs no local correto;
3. apenas melhorar o visual e a apresentação do componente.