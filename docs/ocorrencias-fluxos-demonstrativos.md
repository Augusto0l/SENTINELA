# Etapa 2.16 — fluxos demonstrativos de ocorrências

Revisão de 12/11/2026. Cadastro, edição e inativação integrados à interface,
**sem persistência e sem endpoints novos de escrita**. A homologação PostgreSQL
das Etapas 2.14/2.15 continua separada e não é executada pela aplicação.

## Implementação e separação de responsabilidades

- `src/features/occurrences/simulation.ts`: serviço puro de aplicação demonstrativa,
  adaptação tipada de GET, autorização, contratos Zod e prévias independentes.
  Não importa SQL, pg, segredos, sandbox, fetch ou armazenamento do navegador.
- `SimulationWorkspace.tsx` e seu CSS: formulários, múltiplas naturezas,
  coordenadas/mapa opcional, versão, justificativa, cancelamento, confirmação de
  inativação, processamento, trava síncrona de duplo envio e estados de erro.
- `NovaOcorrenciaEntry.tsx`: cadastro em `/ocorrencias/nova`, protegido pela
  autorização de página existente. Mantém retorno à consulta.
- `Occurrences.tsx`: navegação para cadastro e área demonstrativa recolhível,
  separada dos resultados persistentes e sem alterar filtros/paginação.
- `PersistentDetails.tsx`: carrega GET existente e permite simular em uma cópia.
  Fechar/reabrir descarta a prévia e consulta novamente o original.

Os componentes legados de formulário/geolocalização foram preservados, sem
remoção de código ou alteração da autenticação. A nova entrada utiliza UUIDs de
catálogo, em vez dos códigos internos do formulário legado. A busca postal e a
geocodificação legadas não foram adaptadas a essa nova entrada: não se inventa
correspondência entre UUID persistente e código demonstrativo de RA. É possível
informar endereço e coordenadas ou ajustar o mapa opcional.

## Contratos e regras

Reutiliza `plannedOccurrenceCreateSchema`, `plannedOccurrenceUpdateSchema` e
`plannedOccurrenceInactivationSchema`, sem publicar suas operações como endpoints.
Datas ISO, horários normalizados para HH:mm:ss, RA/naturezas UUID, local e tentativa
por associação são convertidos tipadamente. Bairro/setor integra `local`; não se
criam campos policiais, atores, responsáveis ou anexos sem suporte no contrato.

Coordenadas são opcionais conforme o contrato planejado da interface; se informadas,
o par precisa ser numérico e válido. Isso não relaxa as regras do cadastro SQL
experimental da 2.14, que exige coordenadas. A prévia não verifica cartografia
oficial, vigência SQL ou classificação criminal e não homologa esses aspectos.

Edição/inativação requerem versão esperada e motivo. Registro regular demonstrativo
precisa ser manual, ativo e consolidado; importação, revisão, bloqueio e inatividade
impedem essas ações. A simulação não é a Central de Revisão. Cadastro gera prévia
em revisão, sem promovê-la automaticamente para permitir edição. Uma fixture
regular precisa ser escolhida explicitamente para ensaiar os demais fluxos.

O resultado sempre tem `persisted:false` e mensagem de ausência de gravação.
Editar/inativar produz outro objeto, sem alterar o resultado GET original.
O incremento de versão existe apenas na prévia. Cancelar não chama o serviço;
formulário alterado permite confirmar descarte ou continuar preenchendo.

## Catálogos e origem dos dados

Usa os GETs existentes de regiões administrativas e naturezas originais. Opções
exibem descrições e preservam UUIDs. Catálogo vazio/indisponível bloqueia envio,
exibe estado apropriado e permite nova tentativa; não há fallback silencioso.

O botão **Usar cenário sintético explícito** escolhe catálogos/fixtures identificados
como SINTÉTICOS. Não injeta linhas na lista persistente. A cópia de um GET não
oferece essa troca, evitando misturar seus UUIDs com catálogo sintético diferente.
Fixtures regulares, em revisão e inativas têm seleção explícita, sem mudar perfil.

## Matriz de autorização

| Perfil | Consulta | Cadastro demonstrativo | Edição demonstrativa | Inativação demonstrativa |
| --- | --- | --- | --- | --- |
| Administrador | Sim | Sim | Somente elegível | Somente elegível |
| Operador | Sim | Sim | Somente elegível | Somente elegível |
| Analista | Sim | Negado | Negada | Negada |

A simulação aplica a matriz funcional central e as regras de elegibilidade.
Correções da Central permanecem exclusivas do Administrador. O perfil vem do OperationalProvider com principal do
servidor; não há seletor de perfil ou autoridade baseada em nome exibido.
O serviço puro repete a checagem, além dos estados visuais dos controles.

Páginas continuam protegidas no proxy e servidor; os GETs repetem sua autorização
existente. Não há Server Action, RPC ou novo handler de aplicação invocável para
as simulações. Logo, não se transfere ao cliente nenhuma autoridade de banco.
Chamadas diretas POST/PATCH/DELETE continuam recusadas pelas proteções existentes.
Manipular a prévia no navegador não cria caminho de escrita.

## Homologação automatizada e visual

Os testes novos cobrem contrato, perfis, estados, erros, versões, prévias imutáveis,
catálogo vazio, referências, duplicação de naturezas, ausência de transporte SQL e
renderização dos controles. Os 174 testes anteriores permanecem na suíte.

| Validação final | Resultado |
| --- | --- |
| Suíte automatizada completa | 186 aprovados: 174 anteriores e 12 novos |
| TypeScript | Aprovado |
| ESLint | Aprovado, zero warnings |
| Zod/OpenAPI | 35 schemas, 13 paths, 15 operações, 31 payloads válidos |
| Rotas | Oito páginas planejadas, 341 imports resolvidos; análise estática |
| Build Next.js isolado | Aprovado, código de saída zero |
| Navegador | Oito grupos aprovados; quatro larguras e dois temas |
| git diff --check | Aprovado; avisos LF/CRLF preexistentes |

Arquivos de teste: `tests/occurrence-simulation.test.mjs` (nove grupos) e
`tests/occurrence-simulation-ui.test.mjs` (três grupos). O inventário de rotas e os
testes de autorização anteriores continuam comprovando ausência de handlers novos
de escrita e rejeição de chamadas diretas não autorizadas.

O script `scripts/check-occurrence-workflows-browser.mjs` inicia apenas um servidor
Next próprio em 127.0.0.1:3316, com saída separada, e o encerra ao final. Recusa porta
ocupada. Usa o preview opt-in já existente, sem criar usuários, receber senhas ou
alterar a autenticação. Supabase e URLs PostgreSQL ficam vazios somente no ambiente
desse processo. GETs são interceptados por respostas de teste; não se consulta banco.

**O ensaio visual não equivale a login autenticado dos três usuários privados nem
a integração com PostgreSQL ao vivo.** Administrador foi exercitado no preview;
Operador/Analista foram verificados por serviço, componentes renderizados e testes
de autorização existentes. Navegação autenticada com essas contas permanece uma
verificação manual, sem necessidade de compartilhar senha.

Oito grupos visuais aprovados:

1. Catálogo GET vazio sem fallback e envio bloqueado.
2. Cadastro com duas naturezas, duplicação rejeitada e sucesso demonstrativo.
3. Edição com justificativa, conflito e incremento da versão da prévia.
4. Inativação com motivo/checkbox, cancelamento e prevenção de duplo envio.
5. Larguras 1366, 768, 390 e 320 px, claro/escuro, sem overflow horizontal.
6. Foco por teclado e cancelamento.
7. Catálogos preenchidos via GET de teste, detalhe, cópia e original preservado.
8. Todas as requisições de API observadas foram GET, sem erros JavaScript.

Evidências finais em
`tmp/occurrence-workflows-3e4d876d-aa3f-4383-9ebe-dff717a1a065/`:
`result.json`, `server.log`, `form-<largura>-<tema>.png` e
`form-bottom-<largura>-<tema>.png`. São artefatos locais ignorados pelo Git.
Capturas anteriores foram preservadas; a tentativa com seletor acessível incorreto
foi corrigida sem alterar autenticação ou credenciais. IDs por instância usam useId
para evitar colisões entre a área da lista e a cópia em detalhes.

Reprodução, sem banco ou credenciais:

```powershell
node --experimental-strip-types scripts/check-occurrence-workflows-browser.mjs
```

Para conferir as contas reais localmente: entrar pelo login existente como cada
perfil; conferir cadastro e acesso direto a `/ocorrencias/nova`; abrir detalhes e
área de simulação; confirmar bloqueios de escrita para Analista, edição/inativação
elegíveis para Administrador e Operador, logout e ausência de chamadas de escrita no
painel de rede. Não enviar senhas pelo chat. Catálogos vazios devem permanecer vazios
até escolha explícita do cenário sintético.

## Estado e dependências

| Camada | Estado |
| --- | --- |
| Interface de cadastro/edição/inativação | Implementada, somente demonstrativa |
| Serviço de aplicação desta etapa | Puro, sem persistência |
| PostgreSQL sandbox | Homologação anterior preservada, não utilizado nesta etapa |
| PostgreSQL operacional | Leitura existente; escrita não habilitada |
| Identidade humana/auditoria de produção | Pendente, sem substituição pela identidade técnica |
| Supabase Auth definitivo | Adiado, não alterado |

Próximo passo: revisar elegibilidade, cartografia, identidade/auditoria e os
contratos da futura aplicação persistente antes de habilitar qualquer endpoint
de escrita. Não conectar a interface às credenciais técnicas do sandbox nem à
conexão administrativa. Não se executou migration, SQL, commit, push ou PR.
