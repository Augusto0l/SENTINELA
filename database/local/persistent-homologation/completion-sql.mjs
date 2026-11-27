import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { persistentDestination, persistentReaders, persistentWriters } from "../../../src/lib/db/config.ts"
import { pcdfLedger, pcdfSchema, pcdfSql } from "./pcdf-sql.mjs"

export const completionRevision = "homolog-persist-0006"
export const completionLedger = [...pcdfLedger, completionRevision]
const owner = "s4_hom_pcdf"
const writers = Object.values(persistentWriters).map(writer => writer.login).join(",")
const reviewerRoles = writers + "," + persistentReaders.Analista
const reviewArguments = "text,text,text,text,text,integer,integer"
const uploadArguments = "uuid,jsonb,bytea,text,bigint,bytea"

export async function completionSql() {
  const source = await pcdfSql()
  assert.equal(createHash("sha256").update(source).digest("hex"),
    "affd01fafbbc839360258ea1eac9ad0eca36b0db16596f9faeb0b196990c707f")
  const name = `CREATE FUNCTION ${pcdfSchema}.workspace_review(p_type text,p_priority text,p_status text,p_id uuid)`
  const start = source.indexOf(name)
  const end = source.indexOf("\n$$;", start)
  assert(start >= 0 && end > start)
  const review = source.slice(start, end + 4)
    .replace(name, `CREATE FUNCTION ${pcdfSchema}.review_page(
      p_type text,p_priority text,p_status text,p_query text,p_order text,p_page integer,p_size integer)`)
    .replace("'occurrenceId',link.ocorrencia_id,", "'occurrenceId',link.ocorrencia_id,'lotId',s.lote_id,")
    .replace("AND (p_id IS NULL OR p.id=p_id)", `AND p_order IN ('prioridade','recentes','antigas')
      AND p_page BETWEEN 1 AND 10000 AND p_size BETWEEN 1 AND 50
      AND (p_query IS NULL OR (length(p_query) BETWEEN 1 AND 120 AND strpos(lower(concat_ws(' ',
        p.id::text,s.lote_id::text,p.campo,p.motivo,p.valor_original #>> '{}',
        coalesce(d.normalized_value,s.derivados_efetivos->>p.campo))),lower(p_query))>0))`)
    .replace("ORDER BY CASE p.prioridade WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,p.detectada_em,p.id\n  LIMIT 100;",
      `ORDER BY CASE WHEN p_order='prioridade' THEN CASE p.prioridade WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END END,
        CASE WHEN p_order='recentes' THEN p.detectada_em END DESC,p.detectada_em,p.id
      LIMIT (least(greatest(p_size,1),50)+1) OFFSET ((least(greatest(p_page,1),10000)-1)*least(greatest(p_size,1),50));`)
  assert(review.includes("LIMIT (least") && review.includes("strpos(") && !review.includes("p_id"))

  return `DO $guard$ BEGIN
  IF current_database()<>'${persistentDestination.database}' OR session_user<>'sprint4_migration'
    OR current_user<>session_user OR inet_server_port() IS DISTINCT FROM ${persistentDestination.port}
    OR host(inet_server_addr()) IS DISTINCT FROM '${persistentDestination.host}'
    OR current_setting('listen_addresses')<>'${persistentDestination.host}'
    OR current_setting('cluster_name')<>'${persistentDestination.cluster}'
    OR current_setting('server_version_num')<>'${persistentDestination.version}'
    OR sentinela_homologacao.system_identifier()<>'${persistentDestination.system}'
    OR (SELECT array_agg(versao ORDER BY versao) FROM sentinela.schema_migrations) IS DISTINCT FROM
      ARRAY[${pcdfLedger.map(version => `'${version}'`).join(",")}]
  THEN RAISE EXCEPTION 'Destino XLSX e Central recusado'; END IF;
END $guard$;

CREATE TABLE ${pcdfSchema}.xlsx_originals(
  lot_id uuid NOT NULL REFERENCES sentinela.lotes_importacao(id),
  sha256 text GENERATED ALWAYS AS (encode(sha256(content),'hex')) STORED,
  subject uuid NOT NULL REFERENCES sentinela_homolog_crud.individuals(subject),
  content bytea NOT NULL CHECK(octet_length(content) BETWEEN 4 AND 16777216),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(lot_id,sha256));
ALTER TABLE ${pcdfSchema}.xlsx_originals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${pcdfSchema}.xlsx_originals FORCE ROW LEVEL SECURITY;
GRANT SELECT(lot_id,sha256),INSERT(lot_id,subject,content) ON ${pcdfSchema}.xlsx_originals TO ${owner};
CREATE POLICY xlsx_receipt_read ON ${pcdfSchema}.xlsx_originals FOR SELECT TO ${owner}
  USING(EXISTS(SELECT FROM sentinela.lotes_importacao l WHERE l.id=lot_id));
CREATE POLICY xlsx_receipt_insert ON ${pcdfSchema}.xlsx_originals FOR INSERT TO ${owner}
  WITH CHECK(EXISTS(SELECT FROM sentinela.lotes_importacao l WHERE l.id=lot_id)
    AND EXISTS(SELECT FROM sentinela_homolog_crud.individuals i WHERE i.login=session_user AND i.subject=xlsx_originals.subject));

CREATE FUNCTION ${pcdfSchema}.upload_xlsx(p_subject uuid,batch jsonb,canonical bytea,xml_sha text,xml_size bigint,original bytea)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $upload$
 DECLARE receipt jsonb;
 BEGIN
   IF original IS NULL OR octet_length(original) NOT BETWEEN 4 AND 16777216
      OR substring(original FOR 4)<>decode('504b0304','hex') THEN
     RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Arquivo XLSX recusado';
   END IF;
   receipt:=${pcdfSchema}.upload(p_subject,batch,canonical,xml_sha,xml_size);
   INSERT INTO ${pcdfSchema}.xlsx_originals(lot_id,subject,content)
   VALUES((receipt->>'lot')::uuid,p_subject,original) ON CONFLICT(lot_id,sha256) DO NOTHING;
   RETURN receipt;
 END $upload$;
ALTER FUNCTION ${pcdfSchema}.upload_xlsx(${uploadArguments}) OWNER TO ${owner};
REVOKE ALL ON FUNCTION ${pcdfSchema}.upload_xlsx(${uploadArguments}) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ${pcdfSchema}.upload_xlsx(${uploadArguments}) TO ${writers};

${review}
ALTER FUNCTION ${pcdfSchema}.review_page(${reviewArguments}) OWNER TO ${owner};
REVOKE ALL ON FUNCTION ${pcdfSchema}.review_page(${reviewArguments}) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ${pcdfSchema}.review_page(${reviewArguments}) TO ${reviewerRoles};
INSERT INTO sentinela.schema_migrations(versao,descricao)
VALUES('${completionRevision}','XLSX sintetico com original imutavel e paginacao da Central');
`
}
