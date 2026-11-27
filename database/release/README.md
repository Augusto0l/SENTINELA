# Homologação privada e implantação controlada

## Inventário e repetição local

O roteiro usa Node 22, pnpm 10.34.3, Python no PATH, Edge, PostgreSQL
17.11 e PostGIS 3.6.2. Os executores atestam a porta 55432, o loopback
e a identidade do cluster. O Next.js de ensaio usa a porta 3317. Cada
executor cria um cluster novo e encerra o processo ao concluir.

```powershell
& ./database/release/qualify-private.ps1 -BackupDirectory 'CAMINHO_DO_BACKUP_HISTORICO'
```

O roteiro interrompe a sequência se uma etapa falhar. Roda restore e
preflight, PostGIS, SQL PCDF e Next.js, nessa ordem, em clusters distintos.
O restore confere os hashes do arquivo histórico antes de restaurar.
Reserve espaço para os quatro diretórios descartáveis e recibos preservados.
[Guia do backup e recuperação](../../docs/backup-recuperacao-postgresql-local.md)

## Revisão do delta SQL

Revise `install.sql`, `consolidate.sql` e `workspace.sql` em
`database/local/pcdf-sandbox` nessa ordem. A instalação reaproveita
staging, auditoria e catálogos. A promoção verifica candidatos de
outros lotes, exige mapeamento e preserva uma associação por linha.
A Central acrescenta decisões administrativas por versão, preserva
a origem e expõe o identificador do caso após a promoção.
Os scripts SQL estão prontos para revisão e ensaio no laboratório.
Qualquer delta operacional deve receber versão de ledger própria depois
do aceite de identidade humana, política PCDF, roles e funções.
`local-ra-0002` já está registrada no destino operacional.

| Ordem local do ambiente integrado | Arquivos |
| --- | --- |
| Baseline e reader | `local/sandbox/sql/postgis.sql`, `baseline.sql`, `role.sql`, `read_only.sql` |
| Escrita de ocorrências e autoria | `local/write-sandbox/setup.sql`, `mutations.sql`, `mutation-fixtures.sql`, `003_individual_address.sql`, `004_workspace_read.sql` |
| PCDF e analytics | `local/pcdf-sandbox/install.sql`, `consolidate.sql`, `workspace.sql`, `catalog-fixtures.sql`, `analytics.sql` |

## Sequência para a futura janela autorizada

1. Inventariar projeto privado, rede, versões e responsável pelo banco.
   Separar executor da migration, login do serviço e reader. Emitir
   credenciais específicas e armazená-las no gerenciador aprovado.
2. Obter a identidade do destino por canal confiável antes de conectar.
   Executar `preflight.psql` em sessão de manutenção autorizada com
   `psql -X -qAt -v ON_ERROR_STOP=1 -f database/release/preflight.psql`.
   Fornecer, com opções `-v`, os parâmetros `destino`, `host`,
   `porta`, `system_id`, `postgres_num` e `postgis`, todos registrados
   no plano. Selecionar a conexão explicitamente com os parâmetros do
   destino. A primeira linha confirma a identidade. A segunda contém
   somente o inventário JSON. Guardar a saída em área privada.
3. Comparar ledger, RLS, grants efetivos e snapshot estrutural com o
   esperado. A reader precisa aparecer com `readerPodeGravar=false`.
   No banco operacional já qualificado, a referência é de 37 RAs.
4. Obter aprovação de janela e backup. Conferir hashes do archive e
   restaurar em destino separado. Registrar RPO e RTO acordados.
   Resolver divergências antes de liberar o executor da migration.
5. Aplicar somente os artefatos revisados, na ordem aprovada, dentro da
   transação prevista. Fazer testes negativos com os três perfis e
   verificar autoria, versão, concorrência, rollback e ausência de
   credenciais administrativas no aplicativo.
6. Rodar o preflight novamente e comparar o JSON com o inventário esperado
   da mudança. O ledger só deve ganhar a versão autorizada. A carga de RAs
   deve continuar conciliada. Para qualquer diferença, manter o acesso
   fechado e apurar antes de repetir um comando. Usar também a comparação
   de fingerprints do roteiro de restore para conferir conteúdo.
7. Em falha antes do commit, executar rollback e repetir o inventário em
   sessão nova. Após commit, manter tráfego fechado e avaliar correção
   incremental ou restore separado. Troca de destino exige aprovação e
   reconciliação das escritas posteriores.

Critérios de liberação incluem identidade humana auditável, política
PCDF aprovada, testes positivos e negativos no destino privado, backup
restaurável e aprovação explícita da operação. A primeira homologação
privada persistente precisa de autorização e recursos próprios.

## Preview hospedado

1. Após autorização, usar projeto separado e acesso restrito a revisores
   nominados. Em Vercel Authentication, selecionar **All Deployments** e
   verificar os URLs gerados e os domínios associados em sessão anônima.
   Desabilitar exceções públicas e links de bypass durante o aceite.
2. Restringir o primeiro aceite hospedado ao build e ao acesso da equipe.
   A proteção do Vercel controla o acesso à implantação. Identidade de
   aplicação, papéis de banco e autoria continuam critérios independentes
   antes de habilitar um fluxo persistente hospedado.
3. Inventariar apenas nomes de configurações. Atribuir os segredos futuros
   ao ambiente Preview dedicado no gerenciador aprovado. Bloquear as
   flags de loopback, credenciais locais, `PGPASSFILE` e chaves elevadas no
   projeto hospedado. O primeiro aceite usa somente fixtures sintéticas.
4. Depois da aprovação de identidade hospedada, verificar cookies HTTPS,
   logout e expiração, vínculo individual, CSRF, papéis e RLS com as três
   contas de teste. Conferir que credenciais administrativas pertencem
   apenas ao executor da migration e aos operadores responsáveis.
5. Registrar proteção de acesso, aprovação de dados, inventário do banco,
   backup restaurável e procedimento de rollback antes de propor uma
   janela de operação. O teste permanece protegido durante a reconciliação.

[Proteção de todos os deployments](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan) ·
[Variáveis por ambiente](https://vercel.com/docs/environment-variables/manage-across-environments)
