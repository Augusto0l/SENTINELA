# Ativação final da gestão de arquivos

**Estado da porta 3000.** A instalação continua em consulta e a gravação administrativa permanece bloqueada. O PostgreSQL da porta 55484 ainda não recebeu o delta. O lote PCDF de janeiro/2021 foi reconferido com 6.393 associações.

| Pergunta | Resultado |
| --- | --- |
| A migration está pronta? | O delta `local-import-management-0001` foi revisado e gerado. O preflight em `READ ONLY` passou no banco principal, confrontando identidade, versões, reader, gatilhos, RLS e as 13 FKs. O SQL verifica por padrão, exige `check_only=off` para aplicar e serializa a instalação. A reaplicação do mesmo artefato confere o estado sem alterar a abertura ou as aprovações. |
| Foi qualificada em clone autorizado? | A qualificação no clone que represente os dados operacionais está pendente. Existe evidência de restauração anterior, porém nenhum clone atualizado com autorização de uso foi identificado. A fixture direcionada verificou o delta e a reaplicação, com dados fabricados e sem uso como substituto do clone. |
| As funções estão corretas? | O handler e o PostgreSQL descartável confirmaram edição auditada, revalidação do plano, exclusão física, consumo da aprovação e rollback por falha tardia. As 13 FKs foram confrontadas no catálogo operacional. Origem, extração e pendências compartilhadas permaneceram no outro lote durante o teste. |
| A autoria institucional está validada? | A validação técnica liga sessão, conta e usuário institucional ativo. A conta de Administrador configurada na instalação principal ainda não possui `subject`. Falta aprovar a pessoa responsável e vincular seus identificadores reais, com prazo, pelo procedimento de manutenção. |
| Edição e exclusão estão prontas para uso? | O código usa o mesmo endpoint e os mesmos diálogos da porta 3000. A escrita depende da qualificação do clone, da aplicação do delta, da abertura no PostgreSQL e do Administrador vinculado. A exclusão também depende de aprovação da pessoa para o UUID e a revisão exata do plano, com prova de recuperação. Janeiro/2021 segue protegido. |

**Verificações finais.** O Edge confirmou a consulta dos arquivos, os detalhes, a associação, o formulário e a prévia bloqueada em 1440 e 390 px na porta 3000. O POST com JSON vazio retornou 403. O recorte Node teve 41 aprovações e dois testes condicionados a fixture pulados. A qualificação SQL direcionada teve oito aprovações, além do preflight, da instalação concorrente e da recusa de argumento inválido. ESLint, contratos, build, TypeScript e `git diff --check` passaram.

## Comandos

O renderizador oficial gerou `tmp/operational-import-management.sql`. SHA-256 final do arquivo em UTF-8: `CB1E21385B9FF84CD8057A6A280665DDE2C7BE7A9879BE03D0EB4D07EF2E8F14`. Para gerar em outro ambiente, use um caminho novo:

```powershell
python -B database/release/render-operational-import-management.py --output tmp/operational-import-management.sql
```

Depois de qualificar o backup e o delta no clone autorizado, o mantenedor executa o preflight no destino aprovado, aplica o mesmo artefato incluindo `-v check_only=off`, confirma a instalação fechada, cadastra o vínculo e abre a janela. Encerre normalmente o lançador anterior e inicie a mesma aplicação:

```powershell
npm.cmd run dev:local -- --management
```

O parâmetro solicita a gestão. A autorização continua no servidor e no PostgreSQL. Para fechar a janela, ponha `aberta=false` no controle de release atestado. O procedimento inclui criação do clone, backup, restauração, aplicação, vinculação, aprovação por lote e rollback. [Roteiro de manutenção](backend-operacional-gestao-arquivos-2026-11-24.md)

## Autorizações pendentes

1. Autorizar a cópia do backup atualizado para um clone identificado de forma independente, com host isolado, mantenedor, finalidade e janela definidos.
2. Após a qualificação, aprovar a aplicação do SQL identificado pelo hash e o Administrador institucional responsável no cluster principal.
3. Para cada eventual exclusão elegível, aprovar separadamente o UUID, a revisão, a pessoa, a validade e a evidência de recuperação.
