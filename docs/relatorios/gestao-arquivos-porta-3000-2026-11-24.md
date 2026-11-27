# Gestão de arquivos na porta 3000

## Situação verificada

O lançador oficial `npm run dev:local` iniciou o Next.js em `http://localhost:3000` com o manifesto operacional existente. O PostgreSQL 17.11 com PostGIS 3.6.2 respondeu em `127.0.0.1:55484`, no banco `sentinela_pcdf_local`. Os três perfis passaram pela atestação de leitura. O inventário confirmou RLS forçada em 19 tabelas do schema principal e ausência de privilégio de leitura direta sobre staging e pendências nos logins da aplicação.

O histórico PCDF e a consulta de associações já estavam instalados. A função de lista da instalação filtrava por competência e identificação, mas ignorava o parâmetro de lote. Os schemas `sentinela_gestao` e `sentinela_exclusao`, a custódia PCDF v2 e o schema de cadastro manual estavam ausentes. As contas locais configuradas não tinham vínculo individual. O proxy e a rota de gestão admitiam as mutações somente no cluster sintético atestado da porta 55488, e a aba usava a mesma trava para impedir a abertura dos diálogos.

## Entrega na instalação principal

- **Editar registros** abre as associações PCDF do lote, pagina os resultados e abre o formulário com os valores consultados. As páginas da versão legada são aceitas somente após conferir o total gravado e o UUID de todos os registros retornados. A busca aceita número ou UUID. **Salvar alterações** permanece desabilitado.
- **Excluir arquivo** abre a prévia de consulta pelo UUID. Para janeiro de 2021, o PostgreSQL confirmou 6.393 associações na consulta, 20.020 pendências no histórico do envio e seis tabelas referenciadoras no catálogo. A prévia contém a justificativa e a confirmação por UUID, com o envio desabilitado. O plano transacional ainda precisa verificar quais dependências se aplicam ao lote, quais registros são exclusivos e quais devem ser preservados.
- O endpoint de disponibilidade atesta a conexão e verifica a sessão, o perfil e os privilégios de leitura. O Administrador tem acesso às consultas administrativas. Os serviços usam transações `READ ONLY` e os logins existentes. O POST administrativo na porta 3000 retornou 403 com um corpo vazio. Os fluxos de escrita já homologados continuam usando os mesmos serviços no destino sintético.

O Edge verificou na própria porta 3000, com a conta de Administrador, a listagem, os detalhes, a associação, o formulário de correção, a prévia e a confirmação bloqueada em 1440 e 390 px. O Playwright bloqueou o envio de mutações da interface durante a verificação. O diagnóstico SQL independente confirmou duas páginas de 25 associações, busca por UUID, rascunho e a ausência de uma revisão executável na prévia. A escrita sintética e a preservação dos originais já constam no [relatório de homologação](correcao-botoes-editar-excluir-2026-11-24.md).

Para conferir as consultas na instalação em execução, abra `http://localhost:3000/ocorrencias`, entre como Administrador e selecione **Arquivos importados**. A verificação Playwright pode ser repetida com `node scripts/check-operational-import-review.mjs`, que aguarda a autenticação no Edge.

O build Next.js, TypeScript, ESLint, contratos OpenAPI e `git diff --check` passaram. O recorte Node teve 41 testes aprovados e um teste de escrita condicionado ao cluster sintético foi pulado.

## Migrações e liberação

O delta de leitura está preparado. Ele reaproveita a função de lista versionada e permite filtrar pelo UUID diretamente no PostgreSQL. A implantação preserva o proprietário e os privilégios da função e exige conferir a identidade do destino, a definição instalada e a RLS. A leitura do lote atual já funciona sem esse delta.

1. Em manutenção autorizada, inventariar o destino com `database/release/preflight.psql` e arquivar a definição anterior de `sentinela_ocorrencias_local.lista(text,jsonb,integer,text,text)` com `pg_get_functiondef` e seu `md5`. Guardar os valores de UUID do cluster e system identifier no registro privado da manutenção. Gerar o delta sem conectar ao banco.

   ```powershell
   python -B database/release/render-occurrence-reader-upgrade.py --output tmp/occurrence-reader-upgrade.sql
   ```

2. Ensaiar o delta de leitura e a reinstalação da definição anterior em clone autorizado, usando um host isolado em que o clone possa escutar na porta 55484. Na janela aprovada, usar a sessão de manutenção do cluster existente com `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55484 -d sentinela_pcdf_local -U <conta-de-manutencao> -v cluster_uuid=<uuid> -v system_id=<identidade> -v reader_md5=<md5-inventariado> -f tmp/occurrence-reader-upgrade.sql`. Usar a credencial pelo mecanismo privado vigente. Em falha antes do commit, o PostgreSQL reverte o delta. Para reverter após o commit, reinstalar a definição capturada em transação, no mesmo destino atestado, e conferir novamente o proprietário, o acesso por perfil e a consulta.
3. Para a escrita, preparar e aprovar o delta operacional dos serviços existentes. As definições sintéticas `0001` a `0005` têm guardas de ambiente, permissões e dependências próprias. O delta precisa resolver as referências à custódia PCDF v2, ao cadastro manual e às tabelas auxiliares, preservar o contrato v1 e a importação geral e manter os logins da aplicação sem DML direto. O planejamento e a remoção transacional devem reutilizar a mesma revisão dos vínculos e o mesmo comprovante. O aceite exige um vínculo institucional válido com a identidade humana da sessão, conferido pelo servidor e persistido na autoria.
4. Em clone autorizado do destino, ensaiar backup e restauração com as ferramentas já usadas pelo projeto. Verificar contagens e hashes dos originais, FKs, RLS, reenvio, concorrência, rollback, auditoria por pessoa, preservação de dados compartilhados e restauração do estado pré-operação. Qualificar o plano para PCDF v1 e para lotes CSV/XLSX elegíveis. [Procedimento e prova anterior de recuperação](../backup-recuperacao-postgresql-local.md).
5. Autorizar separadamente o delta, o destino e a janela operacional. A liberação de exclusão também exige aprovação para o UUID e para a revisão do plano do lote, com evidência de recuperação. O backend deverá atestar destino, identidade e aprovação antes de aceitar o POST existente. Fechar o acesso de escrita deve ser possível independentemente da leitura. A recuperação de uma exclusão após commit depende de restauração ou recuperação ensaiada, pois reverter a migration não recompõe registros apagados.

O delta de escrita e a autorização operacional ainda são pendências. Uma alteração de configuração isolada não libera a escrita na porta 3000. A execução atual não aplicou migrations, não realizou importações e não modificou registros operacionais. O lote de janeiro permanece disponível na consulta.
