# Homologação da gestão de arquivos em clone operacional

**Qualificação concluída sobre uma cópia restaurada do PostgreSQL principal.** Ao fim do ensaio, a verificação encontrou o delta ausente na origem e **6.393 associações de janeiro/2021**. A aplicação autorizada posterior está registrada abaixo. A porta 3000 continua em consulta.

## Origem, backup e recuperação

| Item | Resultado |
| --- | --- |
| Origem | `127.0.0.1:55484`, banco `sentinela_pcdf_local`, identidade atestada pelo manifesto de operação. |
| Clone de homologação | `127.0.0.1:55487`, banco `sentinela_pcdf_local`, UUID, system identifier e diretório próprios. O Next.js temporário escutou exclusivamente em `127.0.0.1:3318`. |
| Clone de recuperação | `127.0.0.1:55489`, banco `sentinela_pcdf_local`, identidade própria. Ambos os PostgreSQL de ensaio e o Next.js temporário foram encerrados ao final. |
| Versões | PostgreSQL 17.11 e PostGIS 3.6.2 nos três destinos. |
| Arquivo usado | `origem.dump`, criado com `pg_dump` 17.11 em conexão somente leitura e snapshot exportado. 3.079.949 bytes, 382 entradas no archive, 24/11/2026 às 16:42:31 UTC. |
| SHA-256 do backup | `8554e0bf015c9ab6871153f388e2c04b5dc01c7167bc5935c0ca8cb86b6f6755` |
| Guarda | `%USERPROFILE%\.sentinela-local\homologacao-clone\clone-0f92e44e1d5546a7bad2eee4306ce2a3`, com DACL protegida para o usuário, SYSTEM e Administradores do Windows. As credenciais de bootstrap ficam protegidas por DPAPI. |

O archive foi listado e lido integralmente pelo `pg_restore`. A restauração transacional reproduziu a definição do schema e os fingerprints das **23 tabelas** da visão consistente da origem. A comparação verificou tabelas, índices, funções, constraints, gatilhos e políticas. No clone, os três perfis passaram pela leitura atestada. O procedimento reaplicou os privilégios de banco e de catálogo que ficam fora do archive. A recuperação independente na porta 55489 repetiu a comparação, confirmou a ausência da migration, a RLS forçada nas 19 tabelas principais e as 6.393 associações. O inicializador do Windows foi ajustado para evitar que os pipes do `pg_ctl` ficassem presos depois da subida do servidor. A restauração foi retomada no clone ainda sem o banco de destino e concluída com as mesmas verificações.

## Delta e testes com o clone

O preflight aprovou o destino atestado e as **13 chaves estrangeiras**. O delta `local-import-management-0001` foi aplicado com `check_only=off` exclusivamente na porta 55487. A instalação iniciou com a escrita fechada. A segunda execução conferiu o mesmo artefato sem reaplicar o DDL. O SQL do clone tem SHA-256 `d3b69918e6d79f8a35da35c4cd6a64737517b1565292498341f65540f073bcd8`. O artefato para a porta 55484, gerado pelo mesmo renderizador com a guarda do destino principal, tem SHA-256 `cb1e21385b9ff84cd8057a6a280665dde2c7be7a9879be03d0eb4d07ef2e8f14`.

- **Edição, Edge a 1440 px.** A aplicação consultou uma associação PCDF restaurada e salvou o campo de revisão após exigir justificativa. A correção persistiu após recarregar. SQL confirmou o evento humano, a identidade exclusiva de homologação e o hash inalterado do CSV em staging.
- **Prévia dos dados restaurados.** A cópia continha um único lote importado, janeiro/2021. A prévia gerou o bloqueio `lote_protegido`. Como não havia outro lote restaurado elegível, o ensaio de exclusão usou um lote descartável criado nesse clone com staging próprio e uma origem compartilhada com o lote restaurado. Janeiro permaneceu no clone e na origem.
- **Exclusão física, Edge a 390 px.** A aprovação do clone vinculou pessoa, UUID e revisão. A confirmação recusou UUID diferente. Após a confirmação correta, uma conexão SQL nova encontrou zero lotes, execuções e linhas de staging exclusivas do lote de ensaio, uma origem compartilhada preservada, zero aprovações pendentes e um comprovante. O indicador de associações passou de 6.394 para 6.393. Os fingerprints de ocorrências e naturezas vinculadas independentes ficaram iguais aos do backup.
- **Segurança.** Operador e Analista receberam 403 nas duas mutações. O Administrador recebeu 403 sem aprovação, 422 com UUID diferente e 409 para revisão divergente. Uma falha simulada na inserção do comprovante reverteu a remoção e preservou a aprovação. Sem a falha, o commit consumiu a aprovação e gravou o comprovante.
- **Concorrência e reimportação.** Um arquivo fabricado para o ensaio, processado pelo receptor existente nesse clone, confirmou reenvio idempotente, uma única exclusão em duas tentativas concorrentes e reimportação com novo UUID após a remoção. O ensaio não usou os CSVs ou XMLs originais no disco.

Os relatórios privados da execução guardam contagens, hashes e a evidência da restauração. Este relatório omite identificadores de registros, campos policiais e credenciais. A autorização de escrita no clone foi fechada antes do encerramento.

Passaram TypeScript, ESLint, contratos, build e `git diff --check`. O recorte Node teve 42 testes aprovados e dois condicionados a fixtures que ficaram fora do recorte. A porta 3000 voltou a responder HTTP 403 ao POST com JSON vazio. Na conferência de listeners ao final, permaneciam apenas a aplicação principal (3000) e o PostgreSQL principal (55484).

## Aplicação autorizada na porta 55484

Após a autorização do responsável, o backup imediatamente anterior à aplicação foi gerado em leitura e restaurado em outro cluster na porta 55489. A comparação validou o schema e os fingerprints de 23 tabelas. O SHA-256 do backup é `1f49b4da9307f7a62a411145a227de06f00a4c6bc6b3121916900df8bea0ca03`. A execução privada está em `%USERPROFILE%\.sentinela-local\homologacao-clone\clone-8812d8d3773a4c529fd4eba4275cd340`.

O preflight confirmou o destino e o SHA-256 homologado `cb1e21385b9ff84cd8057a6a280665dde2c7be7a9879be03d0eb4d07ef2e8f14`. O comando com `check_only=off` instalou `local-import-management-0001` com `aberta=false`. A conferência posterior confirmou os mesmos dados nas 23 tabelas preexistentes, a leitura pelos três perfis, as 19 tabelas principais com RLS forçada e zero FKs divergentes. Janeiro/2021 manteve 6.393 associações. O login na porta 3000 respondeu 200 e o POST administrativo com corpo vazio respondeu 403.

O inventário de identidade encontrou zero Administradores ativos com identidade institucional cadastrada. A aplicação permanece em consulta e o banco mantém zero atores de gestão e zero aprovações. Nenhum vínculo foi criado com a identidade do clone.

## Etapas restantes para ativação na porta 3000

1. Identificar e verificar o cadastro do Administrador institucional real. Vincular a identidade ao cadastro e à sessão, com prazo. Depois, abrir a autorização no PostgreSQL e reiniciar a aplicação da porta 3000 com `npm.cmd run dev:local -- --management`. Confirmar leitura e disponibilidade.
2. Cada exclusão real elegível exige autorização própria para pessoa, UUID e revisão exata, com recuperação comprovada.
3. Para reverter a liberação, fechar `aberta` no controle atestado. Depois de uma exclusão concluída, recuperar dados requer backup/PITR e uma janela aprovada. A recuperação ensaiada foi feita em outro cluster, sem sobrepor a origem. [Comandos e ordem de implantação](backend-operacional-gestao-arquivos-2026-11-24.md)
