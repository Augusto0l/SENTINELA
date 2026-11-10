# Sprint 4 — interface de login

Validação local em 29/10/2026. Escopo: apresentação de `/login`, preservando o backend de autenticação existente. Sem execução SQL, acesso ao Supabase, importação, commit ou publicação.

## Alterações desta entrega

- `src/components/auth/AuthPanel.tsx`: encaminha somente o modo login à nova apresentação; os modos de recuperação e atualização mantêm sua apresentação anterior.
- `src/components/auth/LoginScreen.tsx`: composição institucional, formulário e rodapé factual.
- `src/components/auth/LoginScreen.module.css`: estilos exclusivos, responsividade e movimento reduzido.
- `src/components/auth/LoginBrand.tsx`: adaptação local da geometria do escudo existente, com o S centralizado e IDs de gradiente distintos.
- `src/components/auth/LoginIcon.tsx`: ícones SVG locais.
- `src/components/auth/LoginForm.tsx`: apresentação dos campos, visibilidade da senha, validação nativa e estados acessíveis, mantendo POST `/auth/login` e os nomes dos campos existentes.
- `public/images/login-df-network.svg`: fundo local de aproximadamente 49 KB, derivado das 37 geometrias de `public/data/ras-df.geojson`, com simplificação visual e projeção uniforme. Grade, conexões e luzes são decorativas; não representam ocorrências.
- `scripts/check-login-ui.mjs`: verificação de navegador reproduzível contra servidor local já iniciado.
- Este diretório: relatório, métricas e cinco capturas.

Outras alterações já presentes no workspace, incluindo Auth e banco, pertencem às etapas anteriores; não fazem parte desta alteração visual.

## Comparação com a referência

As capturas foram abertas e inspecionadas visualmente em comparação com a imagem fornecida. Foram preservados a composição em duas colunas no desktop, as proporções do painel, a hierarquia tipográfica, os três cards, o azul de destaque, os campos escuros e os dois escudos. O segundo card apresenta “Visualização geográfica”. O fundo usa limites reais do DF em lugar da silhueta cartográfica da referência; não há reprodução pixel a pixel do mapa original.

Os ajustes de responsividade corrigiram um recorte lateral do painel, inclusive quando a largura do documento não acusava overflow. O teste final verifica também os limites dos elementos visíveis. No tablet e no celular, a apresentação institucional lateral é ocultada e o formulário permanece prioritário. Em 320×800 há rolagem vertical para preservar o conteúdo; não há recorte ou rolagem horizontal.

Diferenças intencionais: o rodapé declara ambiente demonstrativo, sem afirmar auditoria universal inexistente. “Lembrar-me” fica marcado e desabilitado, com explicação acessível de que a duração da sessão é controlada pelo Supabase; nenhuma preferência ou senha é persistida pelo componente. O formulário fica desabilitado e apresenta o aviso real de indisponibilidade quando falta configuração Auth, como nas capturas.

## Evidências

| Viewport | Captura |
| --- | --- |
| 1920×1080 | [Desktop](login-1920.png) |
| 1440×900 | [Desktop menor](login-1440.png) |
| 768×1024 | [Tablet](login-768.png) |
| 390×844 | [Celular](login-390.png) |
| 320×800 | [Celular estreito](login-320.png) |

[Métricas do navegador](visual-metrics.json) registram limites dos elementos, largura do documento e centro dos caracteres nos escudos visíveis. O centro esperado é (18, 22,5) nas coordenadas SVG; a tolerância de 0,25 considera a medição subpixel da fonte. As capturas omitem somente o indicador de desenvolvimento do Next.js, por estilo aplicado pelo runner à página de teste.

## Resultados

| Verificação | Resultado |
| --- | --- |
| TypeScript (`tsc --noEmit` e checagem do build) | Aprovado |
| ESLint completo e runner novo | Aprovado, sem warnings |
| `pnpm test` | 111 testes aprovados, nenhuma falha |
| `pnpm check:routes` | 8 rotas planejadas e 235 imports locais; verificação estática aprovada |
| `pnpm build` | Aprovado, Next.js 16.3.6 / Turbopack, 16 páginas geradas |
| Navegador Chrome / Playwright | Cinco resoluções aprovadas, sem overflow ou elementos de formulário recortados |
| Interações | Mostrar/ocultar senha; Tab para recuperação; navegação real à recuperação; checkbox fixo e submit desabilitado aprovados |
| Tema e movimento reduzido | Fundo do login preservado ao alternar para tema claro; transições desativadas com preferência de movimento reduzido |

Para repetir as capturas, com o servidor local existente disponível:

```powershell
$env:CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node scripts/check-login-ui.mjs
```

O runner aceita `LOGIN_UI_ORIGIN` somente com hostname localhost ou 127.0.0.1. Não envia formulários ou credenciais. Requer Chrome ou navegador Playwright instalado.

## Limitações

O ambiente desta execução não tem Auth configurado. Não houve login com credenciais reais, recuperação por e-mail nem homologação com Supabase hospedado. Os testes existentes de Auth incluem transporte simulado; isso não substitui integração hospedada. Os estados de submissão em andamento, erro de credenciais retornado pelo provedor e validação de campos habilitados não foram exercitados no navegador nesta execução; o componente os prepara mantendo o fluxo existente. A comparação visual foi humana, sem cálculo de diferença de pixels com a imagem anexada. Contraste e foco receberam inspeção e validação de estrutura pelo lint; não foi realizada auditoria completa com leitor de tela.
