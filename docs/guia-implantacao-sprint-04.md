# SENTINELA · Guia de implantação e homologação da Sprint 4

**Parecer: candidato local em homologação. Publicação com dados reais bloqueada.**
O build de produção verifica o empacotamento Next.js. As rotas PostgreSQL
atuais exigem desenvolvimento, sessão local e reader em loopback. O login
local usa um arquivo privado e sessões no disco, incompatíveis com um runtime
hospedado distribuído. O código existente de Supabase Auth não qualifica
identidade individual ou acesso persistente para publicação.

## Instalação e validação local

Na raiz do repositório, use Node 22 e pnpm 10.34.3, conforme `.mise.toml`.
O arquivo `.env.local` e a configuração privada de contas ficam fora do Git.
Para rodar o protótipo local, configure o provedor conforme o
[guia de autenticação](autenticacao-local.md) e use `pnpm dev:next`.
O launcher limita a autenticação local e a prévia opt-in ao IPv4 loopback.

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:contracts
pnpm check:routes
node scripts/build-validation.mjs
git diff --check
```

O servidor usa o App Router, com proxy e handlers validando a sessão.
A camada de leitura usa o pool com role restrita, parâmetros validados,
transações somente leitura e RLS. As escritas de ocorrências e o staging
PCDF têm ensaios isolados. O frontend preserva a indicação de demonstração
nas funções sem persistência.

## Segurança e ambiente hospedado

| Configuração | Desenvolvimento | Preview ou produção |
| --- | --- | --- |
| `SENTINELA_AUTH_PROVIDER=local`, `SENTINELA_LOCAL_ACCOUNTS_FILE`, `SENTINELA_LOCAL_DEMO=1` | Somente loopback e arquivo privado | Ausentes |
| `SENTINELA_LOCAL_BIND` | Definida pelo launcher | Ausente |
| `SENTINELA_LOCAL_READER_URL` | Reader local autorizada, fornecida em privado | Ausente |
| `SENTINELA_SANDBOX_PCDF` | Somente no launcher de homologação descartável com o manifesto PCDF | Ausente |
| `SENTINELA_DATABASE_URL` e `SENTINELA_DATABASE_SSLROOTCERT` | Ferramentas privadas de manutenção conforme roteiro autorizado | Ausentes do Vercel |
| `SENTINELA_APP_ORIGIN` | Origem local exata | Origem HTTPS canônica aprovada quando o caminho hospedado for qualificado |
| `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Desnecessárias para o login local | Só após homologar Auth e RLS. São valores públicos, sem service key |

O build hospedado pelo launcher rejeita configurações de contas locais,
reader, backup, escrita experimental e service role quando detecta o
ambiente Vercel. O diagnóstico lista nomes de variáveis. A verificação
de ambiente complementa os bloqueios de sessão e conexão em runtime.

A prévia sem autenticação antes dependia de opt-in, modo de desenvolvimento
e Host de loopback. O launcher podia continuar ouvindo em todas as
interfaces. Agora ela exige a marca de bind local estabelecida pelo comando
oficial, que força `127.0.0.1`. A checagem de Host/Origin do login
permanece exata, e seus cookies locais usam HttpOnly e SameSite Strict.

As APIs de ocorrências, catálogos e analytics validam sessão e permissões
independentemente do proxy. O PostgreSQL reforça visibilidade e privilégios.
As operações de escrita ficam abertas somente no laboratório atestado.
O fluxo de PCDF e Central usa Python local para o parser e não integra o
runtime de publicação. Geocodificação
operacional está bloqueada até aprovação do tratamento de endereços.
Os logs de ensaio evitam valores de credenciais e mensagens SQL nativas.
Estas verificações cobrem o código e fluxos testados. Scanner de
dependências com inteligência atual e revisão do projeto hospedado ainda
integram a liberação.

## Configuração proposta do Vercel

- Projeto privado, framework preset **Next.js**, raiz do repositório,
  Node.js 22.x na configuração do projeto, saída padrão do framework e
  pnpm 10.34.3 fixado em [vercel.json](../vercel.json) para instalação e build.
  O build roda a guarda de
  ambiente do projeto. Nenhuma migration faz parte do build.
- Separar Development, Preview e Production. Manter projetos de banco
  distintos para staging e produção, sem réplica de dados sensíveis
  em Preview. Usar proteção de acesso e fixtures sintéticas.
- Antes de conectar o repositório, revisar automação de builds e deploys
  para preservar a aprovação explícita da primeira publicação. Aplicar as
  variáveis apenas no ambiente devido e validar a origem HTTPS.
- Verificar que a árvore a enviar contém somente artefatos aprovados.
  Excluir `.env*`, logs privados, dumps, relatórios de SQL e os diretórios
  de evidências descartáveis. Validar os assets públicos e o bundle.

[Ambientes do Vercel](https://vercel.com/docs/deployments/environments) ·
[Variáveis no Vercel](https://vercel.com/docs/environment-variables)

## PostgreSQL, migrations e consistência

1. Atuar primeiro num projeto de staging novo, autorizado e sem dados reais.
   Registrar identidade, versões PostgreSQL/PostGIS, esquema da extensão,
   versão do artefato, checksum, executor e janela. Exigir conexão TLS com
   verificação de certificado e privilégios mínimos.
2. Para banco novo com PostGIS em `extensions`, revisar e usar apenas
   `database/supabase/baseline/0001_modelo_inicial.sql` pelo processo
   aprovado. Ela representa o ledger lógico `0001` a `0005`. Para o
   caminho PostgreSQL com PostGIS em `public`, a sequência alternativa é
   `database/migrations/0001` a `0005`. Não combinar as duas trilhas.
3. `0006_auth_vinculo_acesso.sql` é uma etapa separada que depende do
   projeto de Auth definitivo. `local-read-0001` e
   `0002_ra_official_catalog.sql` pertencem ao caminho local atestado.
   A versão `local-ra-0002` já está registrada no operacional local segundo
   a auditoria anterior. Os executores locais e de sandbox ficam fora da
   trilha hospedada. O catálogo real necessita pacote e autorização próprios.
4. Verificar hashes, ledger, extensões, integridade referencial, índices,
   RLS ENABLE/FORCE, grants efetivos e os dois CHECKs `NOT VALID` esperados.
   Rodar casos negativos com papéis reais de staging. Confirmar o
   isolamento entre tenants/escopos do futuro desenho e ausência de acesso
   por anon, identificadores forjados ou conta técnica inadequada.
5. Separar o executor de migrations da role da aplicação. Revisar Data API,
   esquemas expostos, Realtime e regras de rede antes de abrir tráfego.
   A configuração de pool/credenciais hospedada ainda depende do desenho
   de identidade e leitura persistente.

[Baseline Supabase](../database/supabase/README.md) ·
[Checklist de segurança Supabase](https://supabase.com/docs/guides/security/production-checklist)

## Backup, recuperação e rollback

- Antes da janela, aferir RPO/RTO e retenção com o responsável, confirmar
  backup do destino real e validar manifesto, ledger e fingerprints.
  Ensaiar restore em destino separado com versões compatíveis e acesso
  limitado. Incluir Auth e Storage no plano hospedado conforme o escopo
  aprovado. O dump pré-RA local é evidência histórica.
- Falha transacional antes do COMMIT exige rollback e conferência em
  sessão nova. Se a confirmação se perder, reconciliar estado persistido
  antes de qualquer repetição. Uma divergência exige interrupção.
- Para falha de aplicação, restaurar a versão anterior somente se o
  contrato com o banco continuar compatível. Se o schema já mudou, decidir
  entre correção incremental e restauração em destino separado, com
  comparação e aprovação de eventual perda de dados antes do corte.
  Registre o desfecho sem eliminar evidências.

[Recuperação local](backup-recuperacao-postgresql-local.md) ·
[Backups Supabase](https://supabase.com/docs/guides/platform/backups)

### Requalificação local do backup histórico

O comando abaixo lê exclusivamente os quatro artefatos com hash fixado e
restaura o dump pré-RA em um cluster novo na porta 55432. Ele compara
estrutura e fingerprints e testa o rollback de um restore rejeitado.
Não é um comando de backup ou recuperação do ambiente atual.

```powershell
python -B database/local/backup/qualify_restore.py <diretorio-privado-do-backup-pre-ra> --isolated-only
```

O restore levou 2,210 s na execução local, com 19 tabelas equivalentes e
rollback confirmado após tentativa sobre o destino já restaurado. O tempo
mede a chamada ao `pg_restore`, sem bootstrap ou comparação.
[Recibo](../tmp/release-recovery/rls-sandbox-4c5f5a72-92f1-4fa1-90f9-fa5f01c2ef2c/evidence/restore-requalification.json)

## Evidências do Desenvolvimento Autônomo 05

- A suíte Node passou em 241 testes. TypeScript, ESLint, validação de
  contratos (36 esquemas, 14 caminhos, 16 operações e 32 exemplos),
  verificação estática de rotas e build de produção passaram.
- O PostgreSQL 17.11 com PostGIS 3.6.2 foi exercitado em clusters
  descartáveis, com zero conexões operacionais. O catálogo retornou
  37 RAs. Foram conferidas 19 tabelas com RLS forçada, 8 policies e 48
  grants. O CRUD experimental passou nos ensaios de integridade,
  concorrência, permissões, auditoria e rollback.
- A consulta analítica isolada retornou 10.002 ocorrências sintéticas,
  com 5.000 pontos no limite da resposta. O GET medido levou 341 ms e
  retornou 417.037 bytes. É uma observação local de um ensaio.
- O pipeline PCDF isolado processou 10.000 linhas sintéticas (3.130.551
  bytes). A leitura levou 1,222 s e a transação levou 10,632 s. Os
  testes incluíram reimportação, conflito entre lotes, rollback após
  staging e filtragem de pendências por perfil. O ensaio terminou com
  zero ocorrências ou associações publicadas.
- A auditoria de dependências de produção foi inconclusiva
  (`ERR_PNPM_AUDIT_BAD_RESPONSE`). Repetir em ambiente com acesso ao
  registro de dependências antes de liberar a publicação.
- A verificação HTTP local registrou 225 aprovações. O Next.js recebeu
  login, expiração e logout com sessões descartáveis dos três perfis.
  As APIs rejeitaram sessões inválidas, parâmetros inválidos e métodos
  de escrita. Sem a reader configurada, as leituras válidas retornaram
  503. Em navegador, ocorrências, gráficos e mapa foram verificados
  com respostas interceptadas. A verificação analítica cobriu 1440 px
  e 390 px. As contas e sessões do ensaio foram removidas. O relatório
  local está em `http-qualification/bc87a097-b1fc-4af0-a2fd-234033aca092/report.json`
  na pasta privada `.sentinela-local` do perfil Windows.

## Checklist de liberação e pós-deploy

- [ ] Homologar identidade individual, revogação, sessão HTTPS, escopos
  e papéis SQL. Manter as contas demonstrativas fora do ambiente público.
- [ ] Confirmar GETs locais autenticados com a reader existente e separar
  as evidências locais das evidências de staging hospedado.
- [ ] Homologar catálogos oficiais, identidade PCDF e autoria de escrita
  antes de habilitar importação, CRUD ou Central de Revisão com dados reais.
- [ ] Aplicar em staging a sequência aprovada, testar backup, recuperação,
  migração e compatibilidade de rollback. Medir percentis, concorrência,
  carga representativa e planos antes de decidir novos índices.
- [ ] Autorizar a publicação. Validar em staging login/logout, expiração,
  redirecionamentos, negação anônima, três perfis, filtros, contagens,
  RLS, mapas, erros sanitizados e resposta a falhas.
- [ ] Após um deploy autorizado, verificar a origem canônica, versão,
  ledger, dashboards de erros, latência, conexões e integridade da
  aplicação. Em falha crítica, manter tráfego bloqueado e usar o plano
  de rollback aprovado.

[Checklist de produção Supabase](https://supabase.com/docs/guides/deployment/going-into-prod)

## Divisão sugerida para revisão

1. Auth local, login, política de perfis e proteções de hospedagem.
2. RAs oficiais, reconciliação, recuperação e vínculos, com arquivos SQL
   congelados, manifesto e seus testes.
3. Contratos e APIs de leitura, catálogos e interface de ocorrências.
4. Analytics, filtros, cartografia e ensaios de navegador.
5. CRUD experimental em `database/local/write-sandbox`.
6. Pipeline e Central de leitura experimental em `database/local/pcdf-sandbox`.
7. Relatório de homologação, arquitetura e roteiro de publicação.

Revisar primeiro as dependências compartilhadas em contratos, autorização
e proxy. Preservar os artefatos preexistentes na árvore. Nenhum PR foi criado.
