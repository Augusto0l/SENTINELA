-- Included ONLY by run_auth_local.py inside one rollback transaction with a synthetic Auth fixture.
CREATE FUNCTION pg_temp.esperar_erro_auth(comando text, esperado text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE codigo text;
BEGIN
  BEGIN
    EXECUTE comando;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS codigo=RETURNED_SQLSTATE;
    IF codigo<>esperado THEN RAISE EXCEPTION 'SQLSTATE esperado %, recebido %: %',esperado,codigo,SQLERRM; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Operacao indevida aceita: %',comando;
END $$;

INSERT INTO auth.users(id) SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,5) i;
SELECT sentinela_private.provisionar_vinculo('00000000-0000-4000-8000-000000000001','ADMIN SINTETICO','Administrador',true,'TESTE aprovacao explicita');
SELECT sentinela_private.provisionar_vinculo('00000000-0000-4000-8000-000000000002','OPERADOR SINTETICO','Operador',true,'TESTE aprovacao explicita');
SELECT sentinela_private.provisionar_vinculo('00000000-0000-4000-8000-000000000003','ANALISTA SINTETICO','Analista',true,'TESTE aprovacao explicita');
SELECT sentinela_private.provisionar_vinculo('00000000-0000-4000-8000-000000000004','INATIVO SINTETICO','Analista',false,'TESTE aprovacao explicita');

DO $$
DECLARE id_anterior uuid; id_depois uuid;
BEGIN
  IF (SELECT count(*) FROM sentinela.eventos_auditoria)<>4 THEN RAISE EXCEPTION 'Provisionamento sem auditoria'; END IF;
  PERFORM pg_temp.esperar_erro_auth($q$SELECT sentinela_private.provisionar_vinculo('00000000-0000-4000-8000-000000000003','X','Administrador',true,'')$q$,'23514');
  PERFORM pg_temp.esperar_erro_auth($q$SELECT sentinela_private.provisionar_vinculo('00000000-0000-4000-8000-000000000099','X','Administrador',true,'TESTE aprovacao')$q$,'23514');
  PERFORM pg_temp.esperar_erro_auth($q$SELECT sentinela_private.provisionar_vinculo('00000000-0000-4000-8000-000000000001','X','Analista',true,'TESTE aprovacao')$q$,'23514');
  PERFORM pg_temp.esperar_erro_auth($q$SELECT sentinela_private.provisionar_vinculo('00000000-0000-4000-8000-000000000001','X','Administrador',false,'TESTE aprovacao')$q$,'23514');
  PERFORM pg_temp.esperar_erro_auth($q$DELETE FROM auth.users WHERE id='00000000-0000-4000-8000-000000000001'$q$,'23503');
  SELECT id INTO id_anterior FROM sentinela.usuarios WHERE auth_user_id='00000000-0000-4000-8000-000000000002';
  id_depois:=sentinela_private.provisionar_vinculo('00000000-0000-4000-8000-000000000002','OPERADOR ATUALIZADO','Operador',true,'TESTE mesma identidade interna');
  IF id_anterior<>id_depois THEN RAISE EXCEPTION 'Identificador interno alterado'; END IF;
  IF (SELECT count(*) FROM sentinela.eventos_auditoria)<>5 THEN RAISE EXCEPTION 'Atualizacao sem auditoria'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r' AND NOT (relrowsecurity AND relforcerowsecurity)) THEN
    RAISE EXCEPTION 'RLS original removido';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='sentinela')<>1 THEN RAISE EXCEPTION 'Policies excessivas'; END IF;
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE i integer; esperado text; bloqueado boolean;
BEGIN
  FOR i IN 1..5 LOOP
    PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-'||lpad(i::text,12,'0'),true);
    IF i<=3 THEN
      esperado:=CASE i WHEN 1 THEN 'Administrador' WHEN 2 THEN 'Operador' ELSE 'Analista' END;
      IF (SELECT count(*) FROM sentinela_api.meu_acesso())<>1 OR
        (SELECT perfil FROM sentinela_api.meu_acesso())<>esperado THEN RAISE EXCEPTION 'Perfil/vinculo incorreto'; END IF;
      IF (SELECT count(id) FROM sentinela.usuarios)<>1 THEN RAISE EXCEPTION 'Leitura de outros usuarios'; END IF;
    ELSE
      IF EXISTS(SELECT 1 FROM sentinela_api.meu_acesso()) THEN RAISE EXCEPTION 'Sem vinculo/inativo recebeu acesso'; END IF;
    END IF;
    bloqueado:=false;
    BEGIN UPDATE sentinela.usuarios SET perfil='Administrador'; EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'Autopromocao permitida'; END IF;
    bloqueado:=false;
    BEGIN INSERT INTO sentinela.usuarios(nome_exibicao,perfil,ativo) VALUES('FORJADO','Administrador',true);
      EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'Auto provisionamento permitido'; END IF;
    bloqueado:=false;
    BEGIN PERFORM sentinela_private.provisionar_vinculo('00000000-0000-4000-8000-000000000003','FORJADO','Administrador',true,'FORJADO');
      EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'Provisionamento administrativo exposto'; END IF;
    bloqueado:=false;
    BEGIN PERFORM 1 FROM sentinela.ocorrencias; EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'Consulta de dados sem escopo'; END IF;
    bloqueado:=false;
    BEGIN UPDATE sentinela.ocorrencias SET local='FORJADO'; EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'Correcao liberada prematuramente'; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub','',true);
  IF EXISTS(SELECT 1 FROM sentinela_api.meu_acesso()) THEN RAISE EXCEPTION 'Sem identidade recebeu vinculo'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
DECLARE bloqueado boolean:=false;
BEGIN
  BEGIN PERFORM 1 FROM sentinela_api.meu_acesso(); EXCEPTION WHEN insufficient_privilege THEN bloqueado:=true; END;
  IF NOT bloqueado THEN RAISE EXCEPTION 'Anon acessou API'; END IF;
END $$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN RAISE NOTICE 'Auth SQL fixture: FK historica, vinculo proprio, 3 perfis, inativos/sem vinculo, autopromocao, acesso fechado e auditoria verificados.'; END $$;
