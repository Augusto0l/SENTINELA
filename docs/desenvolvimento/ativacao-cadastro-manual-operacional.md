# Ativação operacional do cadastro manual (local-manual-0004)

Pacote: [modelo](../../database/release/manual-occurrences-operational.psql.in) · [renderizador](../../database/release/render-manual-operational.py) · [reversão](../../database/release/manual-occurrences-operational-rollback.psql).

## Instalação em 25/11/2026

O responsável autorizou expressamente a instalação no PostgreSQL `127.0.0.1:55484/sentinela_pcdf_local`. Autorizou também a habilitação provisória das 41 descrições originais PCDF, com os identificadores internos `PCDF-N-01…41`. Esses identificadores não são códigos oficiais, e a homologação institucional permanece ausente.

- **Guardas.** As guardas conferiram antes da gravação: porta 55484, `cluster_uuid` `c04244a6-…-9af8a268d30c`, `system_id` `7710764288366362848`, PostgreSQL 17.11, PostGIS 3.6.2, migrations `0001`–`0005` e `local-manual-0001…0003`. `local-manual-0004` estava ausente. Os três hashes de guarda coincidiam com os revisados, e não havia ocorrências manuais.
- **Ensaio a seco.** O pacote renderizado (SHA-256 `be96d2889f1242a6eacc084747dd96fcc2c1f52adbf6cf3573120b4f68e45175`) passou pelas guardas e pela verificação final no próprio 55484. A transação terminou em `ROLLBACK`.
- **Backup.** O backup lógico fica no diretório privado `clone-5b2d17cfe04249bdbb399b926b6a36e0`: dump SHA-256 `c00c9aa6…f34b866`, 709 entradas e 30 tabelas. A restauração na 55487 reproduziu os hashes das 30 tabelas. Instalação, recusa de reinstalação e reversão foram ensaiadas nessa cópia com o mesmo arquivo. A cópia foi parada ao fim.
- **Instalação.** `local-manual-0004` foi registrada às 17:22:38 (DF). Depois dela, as 29 tabelas preexistentes, exceto o ledger, mantêm os hashes do backup. Entre elas estão as 41 naturezas PCDF, as 6.090 ocorrências, staging, lotes e a fila histórica. O catálogo de uso manual tem 41 linhas, com `codigoOficial` nulo e homologação `ausente`.
- **Validação no banco real.** O fluxo completo rodou numa única transação, encerrada com `ROLLBACK`:
  - cadastro e edição por Operador e Administrador;
  - recusas para Analista, conta, natureza, RA, ponto e confirmação;
  - publicação negada ao Operador, aceita pelo Administrador e bloqueada por pendência aberta;
  - ponto único em `pontos_confirmados` e na SQL do Mapa Criminal;
  - inativação conforme o perfil e escrita direta recusada.

  O Operador desse ensaio existia só dentro da transação, porque o 55484 não tem Operador ativo com identidade vinculada. Após o `ROLLBACK`, o banco tinha 6.090 ocorrências, 0 manuais e 0 eventos manuais.

## Diferença entre Mapa Criminal e Dashboard

Os totais medem populações diferentes; nenhum número foi ajustado. Em [analytics-query.ts](../../src/lib/db/analytics-query.ts), o Dashboard pede `scope=pcdf`. Com o mapa confirmado instalado, ele usa a população `statistical`: ocorrências consolidadas com `fonte='PCDF' AND origem='importacao'`. O Mapa Criminal usa a população `matched`, com todas as ocorrências consolidadas ativas, inclusive as manuais publicadas.

Assim, a diferença entre os dois totais é o número de ocorrências manuais publicadas e ativas. No ensaio havia uma: 6.091 contra 6.090. Hoje não há nenhuma, e ambos mostram 6.090. Os pontos dos dois mapas vêm da mesma view `pontos_confirmados`, então o ponto manual aparece nos dois. Os indicadores estatísticos do Dashboard continuam restritos à série PCDF.

## O que o pacote faz

- **Catálogo de uso manual local e provisório.** Reutiliza as 41 naturezas PCDF já gravadas, com os mesmos UUIDs, descrição literal e procedência dos SHA-256 do inventário e do XML. `PCDF-N-01…41` são identificadores internos de revisão. `codigoOficial` é nulo e `homologacaoInstitucional` é `ausente`. Nenhuma linha de `naturezas_criminais` é criada ou alterada.
- **Autoria institucional.** Grava somente Administrador ou Operador ativo com identidade vinculada. O PostgreSQL recalcula a impressão digital da conta a partir do `auth_user_id` e do projeto Supabase liberado. Ele também confere se o login corresponde ao perfil. Analista é recusado. A auditoria fica em `eventos_auditoria`, com `ator_tipo='usuario'`, `usuario_id` e `operacao='cadastro-manual'`.
- **Cadastro, edição e inativação.** O cadastro entra em `em_revisao`. A edição é permitida só em revisão. Ela tem controle de versão, troca naturezas por retirada auditada e não exclui vínculos. A inativação preserva o registro. Depois da publicação, apenas o Administrador pode inativar.
- **Publicação auditada.** A transição para `consolidada` é exclusiva do Administrador. Ela é recusada enquanto houver qualquer bloqueio nos critérios abaixo:
  - identidade manual e evento de criação;
  - naturezas ativas no catálogo local;
  - geometria WGS84 igual a latitude/longitude e contida na RA vigente;
  - dados obrigatórios completos;
  - nenhuma pendência de revisão aberta.

  Após publicar, a ocorrência entra em `pontos_confirmados`, usado nos mapas do Dashboard e no Mapa Criminal (Pontos, Clusters e Calor). Os KPIs do Dashboard continuam com a população estatística PCDF. As contagens são por ocorrência distinta, então múltiplas naturezas não duplicam o registro.
- **Proteções preservadas.** As três guardas da base são estendidas só para o papel técnico `sentinela_manual_writer`, e a instalação recusa corpos diferentes dos revisados. Escrita direta continua bloqueada (`42501`) para os três logins. Coordenadas PCDF importadas permanecem fora dos mapas.

## Qualificação realizada (clones privados 55487)

Instalação e fluxo completo em SQL: cadastro por Operador com duas naturezas, reenvio idempotente, edição, publicação, leitura pelo Analista e inativação. Também foram exercitadas as recusas: Analista, conta adulterada, login trocado, natureza fora do catálogo, ponto fora do DF, ponto não confirmado, versão antiga e Operador publicando. Por último, reinstalação recusada e reversão com schema igual ao 55484 e dados iguais exceto o ledger. Os clones foram descartados ao fim.

## Procedimento (executado em 25/11/2026; mantido para reversão e repetição)

1. Backup lógico verificado do 55484 por `python -B database/local/pcdf-sandbox/operational_clone.py`. O comando gera dump, roles e ACLs em diretório privado e restaura na 55487 para conferência.
2. Renderização: `python database/release/render-manual-operational.py --saida <arquivo-novo.psql>`. Anote o SHA-256 impresso.
3. Instalação como `postgres` em `127.0.0.1:55484/sentinela_pcdf_local`, com as variáveis `cluster_uuid` (`sentinela.sandbox_uuid`), `system_id` (`pg_control_system()`) e `supabase_url` (`NEXT_PUBLIC_SUPABASE_URL`):

   ```powershell
   psql -X -w -h 127.0.0.1 -p 55484 -U postgres -d sentinela_pcdf_local -v ON_ERROR_STOP=1 `
     -v cluster_uuid=<uuid> -v system_id=<id> -v supabase_url=<url> -f <arquivo-novo.psql>
   ```

4. Reversão, enquanto não houver dado manual gravado: o mesmo comando com `manual-occurrences-operational-rollback.psql`, sem `supabase_url`. O ledger é imutável e recebe `local-manual-0004-revertida`. Com dados gravados, restaure o backup do passo 1.

Depois da instalação, o pacote de importação (`render-operational-import-management.py`) deixa de reconhecer as três guardas revisadas. Uma nova execução desse pacote exige atualizar os hashes esperados nele.

## Encerramento técnico em 25/11/2026

- **`local-manual-0005`** · [script](../../database/release/manual-occurrences-operational-0005.psql). A FK `naturezas_retiradas.auditoria_id → eventos_auditoria`, criada pela 0004, ficava fora do contrato `sentinela_exclusao.vinculos_inesperados()`. Com isso bloqueava a prévia e a exclusão física de lotes, além da reverificação da gestão de importação. A 0005 troca essa FK por um gatilho de restrição adiado, que exige o evento `ocorrencia.manual.editada` da mesma transação. Sequência executada:
  1. backup verificado (dump `69f879d3…`, 34 tabelas restauradas com hashes iguais);
  2. qualificação na cópia 55487: aplicação, recusa de reaplicação, reversão combinada 0004+0005 em ensaio, fluxo completo e retirada sem auditoria recusada;
  3. ensaio a seco com `ROLLBACK` no 55484 e aplicação.

  Depois da aplicação, as 34 tabelas mantêm os hashes do backup, exceto o ledger.
- **Gestão de importação.** [render-operational-import-management.py](../../database/release/render-operational-import-management.py) preserva o artefato instalado, ainda `ca7bb36f…`, e o fingerprint. A reverificação de uma instalação existente passou a aceitar:
  - o schema manual, só com o ledger `local-manual-0001…0003` e a liberação instalada;
  - os corpos de `bloquear_correcao_sem_backend` e `bloquear_autoria_manual_sem_auth` instalados pela 0004, lidos do próprio template revisado, só enquanto `local-manual-0004` estiver ativa e não revertida.

  `impedir_mutacao` mantém o hash original. O preflight `check_only`, rodado em sessão somente leitura, retorna "já instalado e conferido", e um UUID de cluster divergente continua recusado.
- **Revalidação no banco real.** O fluxo completo rodou numa transação no 55484, com `ROLLBACK`, depois da 0005, com o mesmo resultado da instalação. A liberação confere porta, UUID do cluster e URL do Supabase.

## Dependências externas

- **Operador institucional.** O 55484 tem dois registros Operador, nenhum com identidade Supabase: "Operador local", técnico das contas locais, e o serviço de importação geral, inativo. O cadastro manual hoje funciona apenas para o Administrador vinculado. Para habilitar um Operador:
  - uma pessoa real precisa ter conta no Supabase Auth institucional e perfil `Operador` em `usuarios` do Supabase hospedado;
  - essa pessoa entra no SENTINELA, e a partir dessa sessão anotam-se `meu_acesso().usuario_id` e `auth.getUser().id`;
  - executa-se [register-supabase-operator.psql](../../database/release/register-supabase-operator.psql) com esses IDs, o nome e a referência da aprovação formal. O script roda primeiro em ensaio e grava somente com `-v confirmar=on`.

  Nenhum vínculo foi criado.
- **Homologação institucional das naturezas.** O catálogo de uso manual continua provisório: `PCDF-N-01…41` com `codigoOficial` nulo e homologação `ausente`. A substituição por códigos oficiais depende do emissor.
- **CRS das coordenadas PCDF.** As coordenadas importadas continuam fora dos mapas até a comprovação do sistema de referência. Isso não afeta os pontos manuais, que entram em WGS84 confirmado.
