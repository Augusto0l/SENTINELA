-- Reversão de estrutura antes da primeira escrita institucional.
-- O ledger é imutável. Registrar a reversão compensatória após a 0014.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(743204,22);

DO $guard$
DECLARE aplicada_em timestamptz;
BEGIN
  SELECT m.aplicado_em INTO aplicada_em FROM sentinela.schema_migrations m WHERE m.versao='0014';
  IF NOT sentinela_ambiente.vinculado() OR aplicada_em IS NULL
     OR EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0014-reversao')
     OR EXISTS (SELECT FROM sentinela_pessoas.solicitacoes)
     OR EXISTS (SELECT FROM sentinela.usuarios WHERE arquivado_em IS NOT NULL OR revisao_gestao<>0)
     OR EXISTS (SELECT FROM auth.users WHERE raw_app_meta_data ? 'sentinela_cadastro_solicitacao')
     OR EXISTS (SELECT FROM sentinela.eventos_auditoria
                WHERE servico='sentinela-usuarios' AND registrado_em>=aplicada_em) THEN
    RAISE EXCEPTION 'Reversão estrutural indisponível. Feche a escrita e preserve os registros.';
  END IF;
END
$guard$;

DROP TRIGGER sentinela_concluir_cadastro ON auth.users;
DROP TRIGGER usuarios_proteger_administrador ON sentinela.usuarios;
DROP FUNCTION sentinela_private.concluir_cadastro_gestao();
DROP FUNCTION sentinela_private.proteger_ultimo_administrador();
DROP FUNCTION sentinela_pessoas.preparar_cadastro(uuid,uuid,uuid,jsonb);

SET LOCAL ROLE sentinela_pessoas_owner;
DROP FUNCTION sentinela_pessoas.alterar_gestao(uuid,uuid,uuid,text,jsonb);
GRANT EXECUTE ON FUNCTION sentinela_pessoas.criar(uuid,uuid,uuid,text,text,text,text),
  sentinela_pessoas.editar(uuid,uuid,uuid,text,text,text,text),
  sentinela_pessoas.excluir(uuid,uuid,uuid,text,text) TO sentinela_local_admin;
RESET ROLE;
GRANT EXECUTE ON FUNCTION sentinela_api.consultar_cadastro(text,jsonb),
  sentinela_api.bloquear_exclusao_usuario(uuid,uuid,uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION sentinela_pessoas.registros(alvo uuid) RETURNS SETOF jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',u.id,'name',u.nome_exibicao,'email',c.email,'orgao',c.orgao,
   'perfil',u.perfil,'ativo',u.ativo,'cadastro',u.criado_em,
   'version',encode(sha256(convert_to(jsonb_build_array(u.nome_exibicao,c.email,c.orgao)::text,'UTF8')),'hex'),
   'activity',coalesce((SELECT jsonb_agg(a.registrado_em ORDER BY a.registrado_em DESC) FROM (
     SELECT registrado_em FROM sentinela.eventos_auditoria
     WHERE acao='usuarios.editar_institucional' AND depois->>'alvo'=u.id::text ORDER BY registrado_em DESC LIMIT 5
   ) a),'[]'::jsonb))
 FROM sentinela.usuarios u LEFT JOIN sentinela_pessoas.contatos c ON c.usuario=u.id
 WHERE alvo IS NULL OR u.id=alvo ORDER BY u.nome_exibicao,u.id
$$;

ALTER POLICY pessoas_auditoria_escrita ON sentinela.eventos_auditoria WITH CHECK (
  session_user='sentinela_local_admin' AND acao='usuarios.editar_institucional'
  AND ator_tipo='servico' AND servico='sentinela-usuarios');
ALTER POLICY pessoas_auditoria_leitura ON sentinela.eventos_auditoria USING (
  session_user='sentinela_local_admin' AND acao='usuarios.editar_institucional');

DROP FUNCTION sentinela_private.dados_auth_gestao(uuid);
REVOKE USAGE ON SCHEMA sentinela_private FROM sentinela_pessoas_owner;
DROP TABLE sentinela_pessoas.solicitacoes;
REVOKE UPDATE (perfil) ON sentinela.usuarios FROM sentinela_pessoas_owner;
ALTER TABLE sentinela.usuarios DROP COLUMN revisao_gestao, DROP COLUMN arquivado_em;

INSERT INTO sentinela.schema_migrations VALUES ('0014-reversao','Reverte estrutura da gestão de usuários sem escritas',DEFAULT);
COMMIT;
