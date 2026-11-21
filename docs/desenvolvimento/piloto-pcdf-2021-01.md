# Importação direta PCDF no SENTINELA

A importação PCDF dispensa aprovação institucional assinada no software, identidade especial de executor e autorização assinada por lote. Administrador e Operador usam as contas locais normais do SENTINELA. O Analista tem acesso negado à tela e à API de importação.

## Iniciar e importar janeiro de 2021

No Windows, a partir do checkout da integração `D:\Projetos\SENTINELA\.cache\sentinela-local-3000`, use as versões de Node e pnpm do projeto, Python 3.12 e a instalação local do PostgreSQL 17.11 com PostGIS 3.6.2. Garanta que as portas locais 3000 e 55484 estejam livres. Se ainda não houver contas locais, execute `scripts/configure-local-auth.ps1` para configurá-las. O script solicita as três senhas de modo interativo.

Uma vez por banco, provisione o destino e copie o caminho `manifesto` informado. Esse arquivo identifica a instalação local e fica no diretório privado `%USERPROFILE%\.sentinela-local\pcdf-local`.

```powershell
pnpm install --frozen-lockfile
python -B database/local/pcdf-sandbox/direct_runtime.py --provision
```

Para cada sessão, inicie o PostgreSQL e o Next.js pelo comando abaixo. Substitua o exemplo pelo caminho retornado no provisionamento. O comando usa DPAPI para abrir as credenciais técnicas na conta Windows que criou o banco, aplica a migração local de histórico e importação geral e executa o Next.js em loopback. A porta 3000 deve estar livre.

```powershell
python -B database/local/pcdf-sandbox/serve-import-3000.py --cluster '<caminho do manifest.json local>'
```

1. Abra [http://localhost:3000/importar](http://localhost:3000/importar) e entre como Administrador ou Operador.
2. Clique em **Selecionar arquivo** ou arraste o CSV original `pcdf_naturezas_2021-01.csv` do SENTINELA-DADOS. Se disponível, selecione também o manifesto técnico JSON correspondente.
3. Na prévia, confira **2021-01**, **6.393 associações**, **2.948.416 bytes** e **34 campos**. O SHA-256 esperado para a entrega de janeiro já catalogada é `e202df3622fbd5f0b4ae53e7a8f435bce9ad58ff30a43a3c248ce2d369fd3770`. Confira as páginas e os avisos de campos vazios ou inválidos.
4. Use **Revisar confirmação** e **Confirmar importação**. Confira **Gravação confirmada**, o UUID do lote e a entrada no histórico. Recarregue a página para consultar o histórico persistido.
5. Use Ctrl+C no terminal ao terminar a sessão. O controlador encerra o PostgreSQL que iniciou e conserva os dados para a próxima execução.

O destino é `sentinela_pcdf_local` em `127.0.0.1:55484`, com diretório próprio e credenciais restritas. A administração do cluster usa a credencial de manutenção no provisionamento e no controle de ciclo de vida. A aplicação usa dois logins PostgreSQL restritos, um por perfil de escrita. A configuração e as credenciais ficam fora do Git.

## API e armazenamento

| Requisição | Resultado |
| --- | --- |
| `POST /api/v1/importacoes/pcdf/direta?etapa=validar` | Validação e prévia com SHA-256, 34 cabeçalhos, quantidade de associações, células e avisos. |
| `POST /api/v1/importacoes/pcdf/direta?etapa=confirmar` | Transação de staging. Retorna 201 no primeiro commit e 200 no reenvio idempotente com os mesmos IDs. |
| `GET /api/v1/importacoes/pcdf/direta` | Até 100 tentativas recentes com situação, competência, arquivo, perfil e lote quando gravado. |
| `GET /api/v1/importacoes/pcdf/direta?execucao=<uuid>&pagina=1` | Até 25 associações com os 34 campos gravados e seus diagnósticos. |

O POST usa `multipart/form-data` com `csv` e `manifesto` opcional. A confirmação repete os arquivos e inclui `sha256` da prévia, além de `manifestSha` quando houver manifesto. A API exige sessão e Origin esperado. O receptor aceita um CSV mensal de até 16 MiB e 10.000 associações e um manifesto de até 1 MiB. A prévia pagina em blocos de 25 no navegador.

O manifesto é um recurso técnico para conferir tamanho, contagem, hash do CSV e IDs de linha com o hash XML declarado. Com apenas o CSV, o sistema confere identidade técnica e registra a proveniência declarada. O upload conserva os 18 originais em origem e todos os 34 valores em staging, inclusive campos vazios, espaços, quebras de linha e zeros à esquerda. O histórico conserva hashes e metadados. Guarde os arquivos originais em sua área de trabalho privada.

Para verificar um arquivo localmente antes de iniciar o sistema, execute `python -B database/local/pcdf-sandbox/pilot_preflight.py --csv '<arquivo mensal>'`. Use `--manifesto '<manifesto técnico>'` se disponível. A prévia da API acrescenta a verificação do destino, da sessão, do papel PostgreSQL e das permissões reais das funções.

Uma falha após a tentativa reverte lote, execução, origens, staging, pendências e o evento de sucesso. Se a conexão permitir, o receptor registra a falha separadamente. Em caso de interrupção, consulte o histórico e reenvie os mesmos bytes se a tentativa continuar sem conclusão. Ocorrências, indicadores e mapas ficam fora da recepção.

## Repetir a homologação sintética

```powershell
python -B database/local/pcdf-sandbox/direct_runtime.py --qualify-main
```

O comando cria um banco de teste separado, usa o Edge em modo headless e o Next.js em `localhost:3000`, com três contas efêmeras. Os CSVs e a planilha XLSX são gerados nos testes. O resultado está em `evidence/pcdf-direct-qualification.json` na pasta privada do cluster de teste. O banco de teste fica encerrado ao final.

A homologação de `localhost:3000` no cluster sintético `9c28c873-9145-4a0e-8d02-14f809efb000` confirmou a prévia e a recepção de 6.393 associações em um único CSV de 2.948.416 bytes. O PostgreSQL reconciliou 217.566 valores de staging e 115.182 valores originais em 6.399 associações PCDF de três lotes. A planilha XLSX geral também persistiu e reconciliou duas linhas. O ensaio confirmou reenvio concorrente, rollback, auditoria, permissões dos três perfis, RLS forçada, mensagem de indisponibilidade e os históricos após reiniciar o Next.js. A contagem de ocorrências e associações consolidadas foi zero.
