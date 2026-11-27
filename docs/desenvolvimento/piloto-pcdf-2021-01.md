# Importação direta PCDF no SENTINELA

A recepção da importação PCDF está disponível a Administradores e Operadores autenticados no Supabase Auth. O Analista tem acesso negado à tela e à API de importação.

## Iniciar e consultar janeiro de 2021

No Windows, abra `D:\Projetos\SENTINELA` no VS Code e use o terminal da raiz. Use as versões de Node e pnpm do projeto, Python 3.12 e a instalação local do PostgreSQL 17.11 com PostGIS 3.6.2. A execução operacional usa a conta institucional existente e as variáveis públicas do Supabase em `.env.local`.

Para o piloto já instalado, inicie pelo terminal do VS Code na raiz do projeto.

```powershell
npm run dev:local
```

O lançador localiza o único manifesto operacional em `%USERPROFILE%\.sentinela-local\pcdf-local`. Ele reutiliza o PostgreSQL atestado na porta 55484 ou inicia o cluster existente. Após um desligamento inesperado, verifica o PID, a porta e a identidade do cluster. O próprio PostgreSQL trata o `postmaster.pid` residual e faz a recuperação normal na inicialização. O lançador carrega as credenciais dos perfis do PostgreSQL com DPAPI e serve o Next.js na porta 3000. Essa inicialização não aplica migrations. No Windows, `pnpm dev` aciona o mesmo lançador.

Uma segunda execução informa quando o SENTINELA integrado já está respondendo. Se outro aplicativo estiver usando a porta 3000, o lançador informa o PID e o executável quando o Windows permite consultá-lo. Feche esse aplicativo pelo controle que o iniciou antes de tentar novamente.

Use sempre `http://localhost:3000` no navegador. A sessão Supabase usa cookies do host e as rotas de envio exigem o Origin correspondente. Para reiniciar apenas o Next.js com o PostgreSQL já em execução, use o modo explícito abaixo.

```powershell
npm run dev:local -- --next-only
```

O argumento `--cluster '<caminho do manifest.json local>'` seleciona um manifesto específico. O provisionamento inicial (`direct_runtime.py --provision`) e as migrations são operações explícitas para ambientes novos ou ajustados, com o [procedimento de leitura separado](../contratos/consulta-ocorrencias-local.md#instalação-local).

1. Abra [http://localhost:3000/importar](http://localhost:3000/importar) e entre como Administrador ou Operador.
2. Abra **Histórico** e filtre por `pcdf_naturezas_2021-01.csv`. O lote já está gravado, com **6.393 associações** e **20.020 pendências**.
3. Use **Ver detalhes** para consultar o lote, a execução e o SHA-256 `e202df3622fbd5f0b4ae53e7a8f435bce9ad58ff30a43a3c248ce2d369fd3770`.
4. Em **Abrir registros importados**, confira a paginação de 25 registros e a opção **Ver todos os campos**. O lote também está disponível em [Registros importados](http://localhost:3000/ocorrencias).
5. Use Ctrl+C no terminal ao terminar a sessão. O lançador encerra o PostgreSQL se tiver iniciado o cluster nessa sessão.

O destino é `sentinela_pcdf_local` em `127.0.0.1:55484`, com diretório próprio e credenciais restritas. A administração do cluster usa a credencial de manutenção no provisionamento e no controle de ciclo de vida. A aplicação usa os logins PostgreSQL dos perfis Administrador, Operador e Analista. A configuração e as credenciais ficam fora do Git.

## API e armazenamento

| Requisição | Resultado |
| --- | --- |
| `POST /api/v1/importacoes/pcdf/direta?etapa=validar` | Validação e prévia com SHA-256, 34 cabeçalhos, quantidade de associações, células e avisos. |
| `POST /api/v1/importacoes/pcdf/direta?etapa=confirmar` | Transação de staging. Retorna 201 no primeiro commit e 200 no reenvio idempotente com os mesmos IDs. |
| `GET /api/v1/importacoes/pcdf/direta` | Até 100 tentativas recentes com situação, competência, arquivo, perfil e lote quando gravado. |
| `GET /api/v1/importacoes/pcdf/direta?execucao=<uuid>&pagina=1` | Até 25 associações com os 34 campos gravados e seus diagnósticos. |

O POST usa `multipart/form-data` com `csv` e `manifesto` opcional. A confirmação repete os arquivos e inclui `sha256` da prévia, além de `manifestSha` quando houver manifesto. A API exige sessão e Origin esperado. O receptor aceita um CSV mensal de até 16 MiB e 10.000 associações e um manifesto de até 1 MiB. A prévia pagina em blocos de 25 no navegador.

Uma sessão ausente recebe HTTP 401. Um perfil ou Origin recusado recebe 403. A API usa 503 quando o serviço local está indisponível ou o PostgreSQL não passa na atestação. Se apenas uma fonte do histórico falhar, a tela mantém os dados da fonte disponível e indica histórico parcial.

O manifesto é um recurso técnico para conferir tamanho, contagem, hash do CSV e IDs de linha com o hash XML declarado. Com apenas o CSV, o sistema confere identidade técnica e registra a proveniência declarada. O upload conserva os 18 originais em origem e todos os 34 valores em staging, inclusive campos vazios, espaços, quebras de linha e zeros à esquerda. O histórico conserva hashes e metadados. Guarde os arquivos originais em sua área de trabalho privada.

Para verificar um arquivo localmente antes de iniciar o sistema, execute `python -B database/local/pcdf-sandbox/pilot_preflight.py --csv '<arquivo mensal>'`. Use `--manifesto '<manifesto técnico>'` se disponível. A prévia da API acrescenta a verificação do destino, da sessão, do papel PostgreSQL e das permissões reais das funções.

Uma falha após a tentativa reverte lote, execução, origens, staging, pendências e o evento de sucesso. Se a conexão permitir, o receptor registra a falha separadamente. Em caso de interrupção, consulte o histórico e reenvie os mesmos bytes se a tentativa continuar sem conclusão. Ocorrências, indicadores e mapas ficam fora da recepção.

## Repetir a homologação sintética

```powershell
python -B database/local/pcdf-sandbox/direct_runtime.py --qualify-main
```

O comando usa um banco de teste separado na porta 55488, o Edge em modo headless e o Next.js em `localhost:3000`, com três contas efêmeras. Libere a porta 3000 antes do ensaio. Os CSVs e a planilha XLSX são gerados nos testes. O resultado está em `evidence/pcdf-direct-qualification.json` na pasta privada do cluster de teste. O banco de teste fica encerrado ao final.

A homologação do redesign em `localhost:3000` usou o cluster sintético `89583bf6-38f1-4dc5-bf1a-43ec57bf292c`. O navegador conferiu as quatro etapas, as duas abas, os filtros, a consulta individual e as larguras de 1440, 1366, 1024, 768 e 390 px. O PostgreSQL reconciliou 6.399 associações PCDF em três lotes, incluindo um CSV de 6.393 associações e 2.948.416 bytes. A planilha XLSX gravou duas linhas e o CSV geral gravou uma. O ensaio confirmou reenvio concorrente, rollback, auditoria, permissões dos três perfis e histórico após reiniciar o Next.js. A contagem de ocorrências e associações consolidadas foi zero. As seis capturas do navegador estão no diretório de evidências da execução.
