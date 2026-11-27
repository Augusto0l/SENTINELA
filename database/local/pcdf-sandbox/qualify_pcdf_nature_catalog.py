"""Validate the catalog delta after the integrated disposable baseline tests."""
import json
import subprocess


def qualify_catalog(psql, database, repo, identity, system, seed_workspace):
    def read(sql):
        return json.loads(psql(database, "-f", "-", input=sql.encode("utf-8"), stdout=subprocess.PIPE).stdout)

    migration = repo / "database/release/pcdf-original-natures-clone.psql"
    catalog = json.loads((repo / "docs/catalogos/pcdf-naturezas-xml-v1.json").read_text(encoding="utf-8"))
    expected = catalog["naturezas"]
    args = ["-v", "expected_uuid=" + identity, "-v", "expected_system=" + system]
    try:
        psql(database, *args, "-v", "naturezas=[]", "-f", migration, capture_output=True)
    except subprocess.CalledProcessError:
        assert read("SELECT to_jsonb(to_regprocedure('sentinela.descricao_pcdf(text)') IS NULL)")
    else:
        raise AssertionError("O clone aceitou um catálogo divergente.")

    snapshot = """
      SELECT jsonb_build_array(
        (SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM sentinela.ocorrencia_naturezas t),
        (SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM sentinela.linhas_origem t),
        (SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM sentinela.linhas_staging t),
        (SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM sentinela.pendencias_revisao t),
        (SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM sentinela.eventos_auditoria t))
    """
    previous = read(snapshot)
    psql(database, *args, "-v", "naturezas=" + json.dumps(expected), "-f", migration)
    assert read(snapshot) == previous
    assert read("""
        SET SESSION AUTHORIZATION sentinela_local_operator;
        SELECT jsonb_agg(n->>'descricao' ORDER BY (n->>'descricao') COLLATE "C")
        FROM jsonb_array_elements(sentinela_ocorrencias_manual.catalogo(NULL)->'naturezas') n
        WHERE NOT n?'codigo'
    """) == sorted(expected)
    assert read("""
        SELECT to_jsonb(NOT has_function_privilege('sentinela_local_analyst',
          'sentinela_ocorrencias_manual.catalogo(text)','EXECUTE'))
    """)

    created = read("""
        SET SESSION AUTHORIZATION sentinela_local_operator;
        SELECT sentinela_ocorrencias_manual.cadastrar_completo(jsonb_build_object(
          'data','2025-01-01','horario','12:30:00','cep','70000000','endereco','Logradouro de teste',
          'bairroOuSetor','Setor de teste','raId',(SELECT r->'id' FROM
            jsonb_array_elements(sentinela_ocorrencias_manual.catalogo(NULL)->'regioes') r WHERE r->>'codigo'='RA-I'),
          'coordenadas',jsonb_build_object('latitude',-15.7942,'longitude',-47.8825),'localizacaoConfirmada',true,
          'dadosCrime',jsonb_build_object('descricao','Teste','meio','outro','vitimas',1,'autores',1),
          'naturezas',(SELECT jsonb_agg(jsonb_build_object('naturezaId',n->'id','crimeTentado',n->>'descricao'='ESTUPRO'))
            FROM jsonb_array_elements(sentinela_ocorrencias_manual.catalogo(NULL)->'naturezas') n
            WHERE n->>'descricao' IN ('ESTUPRO','ESTUPRO DE VULNERÁVEL'))),gen_random_uuid(),repeat('a',64))
    """)
    assert created["situacao"] == "em_revisao"
    assert read(f"""
        SELECT jsonb_build_array(count(*),count(DISTINCT natureza_id),count(mapeamento_id),
          count(*) FILTER (WHERE crime_tentado)) FROM sentinela.ocorrencia_naturezas
        WHERE ocorrencia_id='{created["id"]}'
    """) == [2, 2, 0, 1]

    # The import service still stages the source fields. The following consolidation is a synthetic reader fixture.
    seed_workspace(psql, (("2020-02", "66701"),), "ESTUPRO", "ESTUPRO")
    seed_workspace(psql, (("2020-03", "66702"),), "ESTUPRO DE VULNERÁVEL", "ESTUPRO")
    psql(database, "-c", """
        INSERT INTO sentinela.naturezas_criminais(fonte,descricao_original,categoria_pcdf_original)
        VALUES ('PCDF','ESTUPRO','ESTUPRO');
        WITH occurrence AS (
          INSERT INTO sentinela.ocorrencias(origem,fonte,versao_identidade,consolidacao_status,data_fato,horario_fato)
          VALUES('importacao','PCDF','fixture-catalogo','consolidada','2020-02-10','09:00:00') RETURNING id
        )
        INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,linha_origem_id,crime_tentado)
        SELECT o.id,n.id,'importacao',l.id,l.numero_registro='66701'
        FROM occurrence o CROSS JOIN sentinela.linhas_origem l
        JOIN sentinela.naturezas_criminais n ON n.fonte='PCDF' AND n.descricao_original=l.natureza_original
          AND n.categoria_pcdf_original IS NOT DISTINCT FROM CASE WHEN l.numero_registro='66701' THEN 'ESTUPRO' END
        WHERE l.numero_registro IN ('66701','66702')
    """)
    print("Migração atestada no clone, originais/IDs/auditoria preservados e cadastro múltiplo validado.", flush=True)
