# Geocodificação local da Nova Ocorrência

## Provedor e escopo

| Alternativa | Cobertura, custo e política | Decisão |
| --- | --- | --- |
| Geocode IPEDF | Fonte institucional orientada ao DF. REST público, sem chave na documentação ou no ensaio. O manual prevê integração recorrente e documenta `localidade`, `limite` e GeoJSON. O serviço não publica tarifa, limite de chamadas, SLA, licença de cache ou suporte a autocomplete na documentação consultada. | Provedor do fluxo local para CEP e endereço geográfico público. As respostas não são armazenadas pelo SENTINELA. [Manual da API](https://geocode.ipe.df.gov.br/tutorial/geocode-api.pdf) |
| GeoPortal e IDE/DF | O GeoPortal pesquisa por endereço cartorial, usual e CEP. O catálogo REST consultado disponibiliza camadas territoriais da SEDUH e a cartografia de RAs usada na verificação. | Fonte de limites. A busca usa a interface REST documentada do IPEDF. [Manual GeoPortal](https://www.geoportal.seduh.df.gov.br/geoportal/widgets/HomeMenu/pdf/manual.pdf) · [Catálogo REST](https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico) |
| Nominatim público | Sem chave. Cobertura e precisão variam com o OSM. A OSMF limita a operação a 1 requisição por segundo por aplicação, exige identificação e atribuição, orienta cache e veda autocomplete e envio de material pessoal ou confidencial. | O fluxo local não utiliza esse endpoint. [Política vigente da OSMF](https://operations.osmfoundation.org/policies/nominatim/) |
| Photon público e autogerenciado | A instância pública é um serviço de demonstração que pode restringir uso intenso, sem garantia de disponibilidade. Photon autogerenciado oferece autocomplete e filtros sobre dados OSM. Nominatim autogerenciado oferece uma API compatível, com custos de infraestrutura, atualização de dados e operação. | Uma instância própria do Nominatim pode ser configurada para consultas dentro do perímetro institucional. Photon requer um adaptador próprio. [Photon](https://github.com/komoot/photon) · [Nominatim](https://nominatim.org/release-docs/latest/admin/Installation/) |
| ViaCEP | Gratuito e sem chave para consultas postais, com restrição a uso massivo. Devolve logradouro e bairro quando disponíveis. | Mantido para consulta unitária de oito dígitos e preenchimento de campos postais. [ViaCEP](https://viacep.com.br/) |

O escopo ativado utiliza a API pública do IPEDF para consultas geográficas comuns previstas na documentação, em volume de operação local. O texto de busca deve conter somente localização pública. Endereços ligados a pessoas identificáveis e informações sigilosas exigem tratamento dentro do perímetro autorizado. Para esses casos o formulário permite usar o mapa ou digitar as coordenadas. A validação de formato bloqueia identificadores e complementos privados comuns. A natureza pública de texto livre depende do seu conteúdo.

## Configuração e contrato

```dotenv
SENTINELA_MANUAL_GEOCODER_URL=https://geocode.ipe.df.gov.br/api/
```

Essa é a URL completa da API. `npm run dev:local` carrega o `.env.local`, ignorado no Git. A rota conserva o `POST /api/ocorrencias/geocode` com `q` e os campos postais opcionais. O cliente IPEDF envia somente `localidade` e `limite=5`, identifica a aplicação e bloqueia redirecionamentos. Na consulta postal, `localidade` recebe os oito dígitos, mesmo quando o formulário tem outras informações. Na busca explícita, recebe o termo geográfico validado. Naturezas, identificação policial, complementos e outros campos do formulário não compõem a requisição. A busca recebe `Cache-Control: private, no-store`. O processo permite uma consulta externa por vez, com intervalo mínimo de 1,1 segundo, propaga a pausa indicada pelo provedor e usa timeout de oito segundos. A rota devolve `429` para limitação, `503` para indisponibilidade e `504` para timeout.

O navegador consulta ViaCEP ao completar o CEP, preserva campos digitados e usa os dados postais encontrados para o rótulo. Uma coordenada só é aceita para o CEP se o IPEDF devolver o mesmo código. A interface exige seleção quando há mais de um ponto distinto. CEP genérico sem logradouro nem bairro ou CEP sem coordenadas permanece disponível como informação postal. O operador pode pesquisar o logradouro explicitamente ou indicar o ponto.

No formulário e na barra do mapa, Enter ou o botão de busca consulta o endereço. Uma resposta única aproxima o mapa e posiciona o marcador. Em múltiplos resultados, a lista permite seleção por teclado ou mouse. As coordenadas são filtradas no servidor pelos polígonos do GeoJSON IDE/DF. O mapa usa a mesma referência para destacar a RA que contém o ponto. A identificação é geométrica e a vigência jurídica dos polígonos continua pendente. O IPEDF entrega o nome e o ponto geográfico sem declarar precisão de imóvel, por isso os resultados são apresentados como referências aproximadas. Clicar, arrastar ou digitar coordenadas substitui o ponto e exige confirmação. Editar endereço ou CEP invalida a confirmação anterior e cancela a resposta pendente. A confirmação espacial funciona enquanto os catálogos persistentes estiverem indisponíveis.

## Verificações e arquivos

O ensaio determinístico em Edge cobriu CEP válido, inexistente e incompleto, endereço pelo formulário e pela barra do mapa, seleção de resultados ambíguos por teclado, busca sem resultado, marcador centralizado, zoom, clique, arraste e coordenadas manuais. Também verificou ponto fora do DF, divergência de RA, invalidação da confirmação após editar o endereço e preservação do ponto manual após uma resposta atrasada. O navegador foi validado em 1920, 1440, 1366, 1024, 768 e 390 px, com tema claro, escuro e entrada por toque. As capturas bloqueiam tiles externos e exibem a cartografia local.

O teste da rota verificou o payload enviado ao IPEDF, recusa de complementos e identificadores pessoais comuns, filtro poligonal, ausência de credenciais na resposta, `429` com `Retry-After`, `503` e `504`. As consultas reais pontuais na API IPEDF e no ViaCEP utilizaram o CEP público `70070-010`, a Esplanada dos Ministérios, o estádio Mané Garrincha e o logradouro SAUS Quadra 1.

No Edge com os serviços reais, após reiniciar o Next.js, o CEP `70070-010` preencheu SAUS Quadra 1 e Asa Sul, centralizou o marcador e identificou o Plano Piloto. O ponto retornado pelo IPEDF foi marcado como aproximado e exigiu confirmação. A Esplanada dos Ministérios apresentou mais de uma opção para seleção por teclado. `/ocorrencias` exibiu as 6.393 associações e `/importar` exibiu o histórico de janeiro. As evidências estão em `tmp/manual-geocode-stage2-evidence/`.

Passaram 264 testes Node, 11 testes estáticos SQL/Python, TypeScript, ESLint, contratos/OpenAPI, verificação estática de rotas, build Next.js e `git diff --check`. O ensaio isolado confirmou a regressão de cadastro em banco sintético, com duas ocorrências em revisão e dados persistentes após reinício. Os 20 cenários funcionais especificados passaram na combinação dos ensaios controlados e reais.

O histórico operacional foi comparado em leitura antes e depois. Os fingerprints permaneceram idênticos, com 6.393 associações de 34 campos, 20.020 pendências, zero ocorrências consolidadas e 19 tabelas com RLS forçada. A ativação alterou a configuração do geocodificador local. As migrations e os catálogos da Etapa 1 continuam pendentes no banco operacional.

- Backend em `src/app/api/ocorrencias/geocode/route.ts`, `src/lib/geocoding/handler.ts`, `src/lib/geocoding/ipedf.ts` e `src/data/addressLocation.ts`.
- Formulário e mapa em `src/features/occurrences/ManualCreate.tsx`, `ManualCreate.module.css`, `ManualLocation.tsx` e `use-manual-location-search.ts`.
- Testes em `tests/auth-geocode.test.mjs` e `scripts/check-manual-occurrence-browser.mjs`. Configuração local no `.env.local` e documentação em `docs/desenvolvimento/cadastro-manual-local.md` e neste relatório.
- Checkout `feat/redesign-interface`, HEAD `3e1b3adb8b597c393a3bb3fe0d18c38f1166c9f0`, com as modificações preexistentes preservadas. Esta etapa foi mantida em alterações locais.
