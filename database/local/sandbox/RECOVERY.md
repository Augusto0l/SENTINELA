# Recuperacao controlada do sandbox ? revisao implementada

Esta entrega implementa comandos futuros; NAO os executa no sandbox real.
Nenhuma senha e necessaria para aprovar revisao parada, copiar ou reconciliar.
Start/verify mantem entrada oculta em terminal Windows, nunca por chat/argumentos.

## Estado e limites do diagnostico

O manifesto continua RUNNING; PID 15652 inexistente, postmaster.pid residual,
pg_control in production. O codigo 0xC000013A e STATUS_CONTROL_C_EXIT, compativel
com evento de console, sem prova da origem. O manifesto representa ultima atestacao,
nao supervisao continua. Nao ha prova de corrupcao nem de recuperabilidade integral.

## Comandos implementados e gates

- approve-recovery-artifacts: bootstrap separado para este estado paradoxal. Exige
  RUNNING no manifesto, UUID, plano exato com hash do manifesto e hashes antigo/novo,
  allowlist apenas control.py e snapshot_extra.sql, todos os demais artefatos intactos,
  identidade por arquivos/pg_controldata e ausencia comprovada de processo/listener.
  Registra STOPPED_FILES_AND_OS_ONLY e authenticated_server=false, preserva fase/PID
  e identidade. Nao equivale a atestacao autenticada e nao reconcilia nem inicia.
- copy-stopped: exige revisao aprovada, UUID, SHA do manifesto e nova observacao
  completa. Cria recovery-copy-UUID sob a raiz privada de sandboxes, nunca dentro de
  data ou do operacional. Diret?rio novo com DACL usuario/SYSTEM/Administradores.
  robocopy /E /COPY:DATS /DCOPY:DAT /XJ /R:0 /W:0, sem MIR/PURGE/MOVE. Copia toda
  raiz (dados/WAL/configs/manifesto/logs/evidencias), verifica origem antes/depois,
  destino por tamanho/hash/mtime/atributos/DACL/proprietario/grupo e nova observacao.
  N?o le SACL nem exige privilegio de backup. Divergencia de proprietario ou metadata
  bloqueia, sem tomar posse ou ampliar permissoes. Nao e ensaio de restauracao.
  copy.json identifica origem, UUID/system id, inventario, hash do manifesto e UTC.
- reconcile: exige RUNNING obsoleto, UUID, SHA exato do manifesto e copy.json valido.
  Reconfere copia e dados atuais, identidade, WAL e ausencia de processo/listener.
  Preserva PID/inicio antigos como evidencia; nao remove PID file. Grava before.json,
  proposed.json antes da substituicao atomica; after.json so apos releitura confirmada.
  Atualiza somente phase=RECOVERY_REQUIRED, recovery_copy e reconciliations.
  N?o atualiza UUID, system id, artefatos, senha ou configuracao. Falha deixa evidencias;
  nao repete, sobrescreve alteracao concorrente, limpa ou restaura automaticamente.
- start em RECOVERY_REQUIRED: exige revisao, copia intacta e hash do registro fixado
  na reconciliacao; dados ainda identicos ? copia; identidade/WAL e ausencia novamente
  confirmadas. Preserva postmaster.pid. Deixa PostgreSQL decidir sobre lock residual
  e recuperar WAL normalmente. pg_ctl -t 120 com limite externo 135s; demais probes
  limitados. Somente apos atestacao autenticada de PID/inicio/system id/UUID/data/HBA/
  listener registra RUNNING e recovery_start=true. Falha/interrupcao preserva manifesto
  anterior e registra evidencia start-UUID.json; servidor nunca e morto automaticamente.

A observacao nativa exige OpenProcess retornar ausencia (erro 87), corroborada por
inventario WMI completo e porta livre. Acesso negado e UNKNOWN. PID ativo ou reutilizado,
processo orfao sem atribuicao, pg_ctl/initdb concorrente, cmdline inacessivel e porta
ocupada bloqueiam. Isso pode impedir operar com token sem acesso ao inventario: nao
usar elevacao automatica nem substituir por SET ROLE ou checagem de porta apenas.
Links/reparse points, tablespaces externos, destino 5432/remoto/banco operacional,
identidade/configs divergentes e WAL ausente/ilegivel sao recusados.

## Console e interrupcao

pg_ctl usa CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP no Windows, stdin nulo,
close_fds e stdout/stderr em arquivo regular (sem pipes herdados para drenagem).
CREATE_NO_WINDOW separa da console chamadora; grupo sozinho nao era essa garantia.
Nao abre janela visivel, instala servico ou exige Administrador. Nao mata processo
em timeout/KeyboardInterrupt. GetLastError de OpenProcess e preservado no diagnostico.

Simulacoes verificam flags e fluxo, nao provam comportamento real dos descendentes
PostgreSQL/Job Objects/encerramento da sessao Windows. Homologacao nativa de console
com processos descartaveis ainda e necessaria; nao usar o sandbox real para isso.
Nao garante sobreviver a logoff, shutdown ou politica de kill-on-job-close.

## Sequencia futura ? cada fase exige autorizacao especifica

1. Revisar codigo, testes e recovery-revision-checksums.json. recovery-revision-plan.json
   substitui como proposta o plano anterior, preservado. Inclui snapshot v2 pendente e
   NOVO hash do controlador; o hash f572... anterior nao aprova esta implementacao.
2. Em janela exclusiva, confirmar identidade/ausencia e autorizar apenas aprovacao:

```powershell
$manifestoSandbox = 'C:\Users\pedro\.sentinela-local\rls-sandboxes\rls-sandbox-a8aaa34d-98a0-43aa-9a15-ddbdf0dd375a\manifest.json'
python -B database/local/sandbox/control.py approve-recovery-artifacts --execute --manifest $manifestoSandbox --authorize 'a8aaa34d-98a0-43aa-9a15-ddbdf0dd375a' --revision-plan database/local/sandbox/recovery-revision-plan.json --plan-sha256 '<SHA-256-revisado-do-novo-plano>'
```

3. A aprovacao muda o hash do manifesto. Rele-lo, conferir as alteracoes permitidas e
   registrar o SHA novo. Nao reutilizar o SHA antigo nem preencher automaticamente:

```powershell
Get-FileHash -LiteralPath $manifestoSandbox -Algorithm SHA256
# Depois de autorizacao exclusiva da copia:
python -B database/local/sandbox/control.py copy-stopped --execute --manifest $manifestoSandbox --authorize 'a8aaa34d-98a0-43aa-9a15-ddbdf0dd375a' --manifest-sha256 '<SHA-do-manifesto-pos-aprovacao>'
```

4. Conferir copy.json e destino privado retornado; autorizar reconciliacao:

```powershell
python -B database/local/sandbox/control.py reconcile --execute --manifest $manifestoSandbox --authorize 'a8aaa34d-98a0-43aa-9a15-ddbdf0dd375a' --manifest-sha256 '<mesmo-SHA-pos-aprovacao>' --backup-record '<caminho-privado-retornado-copy.json>'
```

5. Conferir before/proposed/after, fase RECOVERY_REQUIRED, identidade/configs/hashes
   preservados e copia intacta. Somente apos autorizacao de inicializacao:

```powershell
python -B database/local/sandbox/control.py start --execute --manifest $manifestoSandbox
# Apenas se start terminar PASS:
python -B database/local/sandbox/control.py verify --execute --manifest $manifestoSandbox
```

6. Examinar logs privados: recuperacao REDO quando necessaria, ready, ausencia de
   PANIC/FATAL/WAL ausente; conferir identidade e pg_control. in production e esperado
   enquanto o servidor roda. Registrar evidencias, nao publicar log bruto.
   Nao instalar SQL ou fixtures automaticamente. Nao usar pg_resetwal nem remover WAL.

## Falhas e evidencias

Escrita atomica nao oferece transacao entre arquivos: se falhar depois de substituir
manifesto ou antes de after.json, resultado pode estar aplicado com evidencia incompleta.
Reler hash/fase e evidencias; nao repetir automaticamente. Ha janela TOCTOU: exige janela
exclusiva e ACL privada; nao protege contra administrador malicioso ou manutencao que
ignore o controlador. Arquivos parciais da copia ficam preservados sem copy.json valido.
Somente depois de observar servidor parado, uma restauracao da copia exigiria plano e
autorizacao separados, destino novo isolado e revisao de caminhos/identidade; nunca
sobrescrever original ou operacional automaticamente.

## Testes

```powershell
python -B database/local/sandbox/test_control.py
python -B database/local/sandbox/test_recovery_plan.py
python -B database/local/sandbox/test_recovery_runtime.py
python -B database/local/tests/test_static.py --parser-path tmp/sql-validation
```

Testes de runtime usam observacoes/subprocessos simulados. Um teste nativo adicional
copia somente arquivos sinteticos descartaveis e verifica metadados/ACLs e corrupcao
da copia; nao executa PostgreSQL. Nenhuma atestacao/recuperacao WAL real e alegada.
