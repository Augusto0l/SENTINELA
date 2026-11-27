import { ANALYTICS_POINT_LIMIT, persistentAnalyticsQuery, type PersistentAnalyticsQuery } from "@/contracts/persistent-analytics"
import { visibleOccurrence } from "@/lib/db/occurrence-visibility"

export function analyticsSql(input: PersistentAnalyticsQuery, source: "legacy" | "integrated" = "legacy", confirmedMap = false) {
  const query = persistentAnalyticsQuery.parse(input)
  const pcdf = source === "integrated" && query.scope === "pcdf"
  const schema = source === "integrated" ? "sentinela_ocorrencias_analytics" : "sentinela"
  const pcdfOnly = "o.fonte='PCDF' AND o.origem='importacao'"
  const visibility = pcdf && !confirmedMap ? pcdfOnly : source === "integrated" ? "true" : visibleOccurrence
  // The attested analytics view can still be on the previous schema during rollout.
  const sourceCategory = source === "integrated" ? "to_jsonb(a)->>'categoria_pcdf_original'" : "original.categoria_pcdf_original"
  const categoryJoin = source === "legacy" ? ` JOIN ${schema}.naturezas_criminais original ON original.id=a.natureza_id` : ""
  const canonical = source === "integrated" ? "coalesce((to_jsonb(n)->>'catalogo_pcdf')::boolean,false)" : "false"
  const mappedCategory = confirmedMap ? `LEFT JOIN ${schema}.mapeamentos_natureza m ON m.id=a.mapeamento_id
    LEFT JOIN ${schema}.categorias_criminais c ON c.id=m.categoria_id` : ""
  const values: unknown[] = []
  const bind = (value: unknown) => { values.push(value); return `$${values.length}` }
  const filters = ["true"]
  const linkFilters: string[] = []
  if (query.startDate) filters.push(`o.data_fato >= ${bind(query.startDate)}::date`)
  if (query.endDate) filters.push(`o.data_fato <= ${bind(query.endDate)}::date`)
  if (query.hour) {
    const [start, end] = query.hour.split("-").map(Number)
    filters.push(`o.horario_fato >= make_time(${bind(start)}::int,0,0) AND o.horario_fato < ${bind(end === 24 ? "24:00" : `${end}:00`)}::time`)
  }
  if (query.nature || query.category) {
    if (query.nature) linkFilters.push(`a.natureza_id IN (SELECT id FROM nature_labels WHERE
        name=(SELECT name FROM nature_labels WHERE id=${bind(query.nature)}::uuid))`)
    if (query.category) linkFilters.push(`a.categoria=${bind(query.category)}::text`)
    filters.push(`o.id IN (SELECT a.ocorrencia_id FROM links a
      WHERE ${linkFilters.join(" AND ")})`)
  }
  const raParam = query.ra ? bind(query.ra) : null
  const selected = raParam ? ` WHERE code=${raParam}::text` : ""
  // The published spatial RA governs the map. Older manual-only views expose the validated RA on the occurrence.
  const pointRa = `coalesce(to_jsonb(p)->>'ra_codigo',m.code)`
  const limit = source === "integrated" ? ANALYTICS_POINT_LIMIT : 5000
  const eligiblePoint = `${source === "legacy" ? "code IS NOT NULL AND " : ""}localizacao_status='validada' AND latitude IS NOT NULL AND longitude IS NOT NULL`
  const population = pcdf && confirmedMap ? "statistical" : "matched"
  const text = `WITH regions AS MATERIALIZED (
    SELECT id,codigo_interno::text AS code,nome::text AS name FROM ${schema}.regioes_administrativas
  ), visible AS MATERIALIZED (
    SELECT o.id,r.code,o.data_fato,o.horario_fato,o.latitude,o.longitude,o.localizacao_status${confirmedMap ? ",o.fonte,o.origem" : ""}
    FROM ${schema}.ocorrencias o LEFT JOIN regions r ON r.id=o.ra_id
    WHERE o.ativo AND ${visibility}
  ), nature_labels AS MATERIALIZED (
    SELECT n.id,n.descricao_original COLLATE "C" AS name,${canonical} AS canonical
    FROM ${schema}.naturezas_criminais n
  ), links AS MATERIALIZED (
    SELECT a.ocorrencia_id,a.natureza_id,(${confirmedMap ? `coalesce(nullif(${sourceCategory},''),c.nome)` : sourceCategory}) COLLATE "C" AS categoria
    FROM ${schema}.ocorrencia_naturezas a${categoryJoin}
    JOIN visible o ON o.id=a.ocorrencia_id
    ${mappedCategory}
  ), source_categories AS MATERIALIZED (
    SELECT DISTINCT categoria AS name FROM links WHERE length(btrim(categoria)) > 0
  ), matched AS MATERIALIZED (SELECT * FROM visible o WHERE ${filters.join(" AND ")}),
  ${population === "statistical" ? `statistical AS (SELECT * FROM matched o WHERE ${pcdfOnly}),` : ""}
  selected AS MATERIALIZED (SELECT * FROM ${population}${selected}),
  selected_links AS MATERIALIZED (
    SELECT a.ocorrencia_id,a.natureza_id,a.categoria FROM links a JOIN selected s ON s.id=a.ocorrencia_id
    ${pcdf && linkFilters.length ? "WHERE " + linkFilters.join(" AND ") : ""}
  ),
  ${confirmedMap ? `mapped AS MATERIALIZED (
    SELECT id,${pointRa} AS "raCode",p.latitude,p.longitude,m.code AS "territorialRaCode",
      CASE WHEN m.fonte='PCDF' AND m.origem='importacao' AND m.localizacao_status IS DISTINCT FROM 'validada'
        THEN 'pcdf_crs_unverified' ELSE 'validated' END AS "publicationStatus"
    FROM matched m JOIN ${schema}.pontos_confirmados p USING(id)${raParam ? `
    WHERE ${pointRa}=${raParam}::text` : ""}
  ),
  points AS (SELECT * FROM mapped ORDER BY id LIMIT ${limit + 1}),
  reference AS (SELECT id,NULL::text AS "raCode",latitude,longitude FROM ${schema}.pontos_confirmados ORDER BY id LIMIT ${limit + 1})` : `mapped AS (
    SELECT id,code AS "raCode",latitude,longitude FROM selected
    WHERE ${eligiblePoint}
  ), points AS (SELECT * FROM mapped ORDER BY id LIMIT ${limit + 1}), reference AS (
    SELECT id,code AS "raCode",latitude,longitude FROM visible
    WHERE ${eligiblePoint}
    ORDER BY id LIMIT ${limit + 1}
  )`}
  SELECT jsonb_build_object(
    'total',(SELECT count(*) FROM selected),'mapTotal',(SELECT count(*) FROM ${population}),
    'mappedByRa',(SELECT coalesce(jsonb_agg(b ORDER BY key),'[]') FROM
      (SELECT "raCode" AS key,count(*) AS count FROM mapped WHERE "raCode" IS NOT NULL GROUP BY 1) b),
    'byRa',(SELECT coalesce(jsonb_agg(b ORDER BY key),'[]') FROM
      (SELECT code AS key,count(*) AS count FROM ${pcdf ? "selected" : "matched"} WHERE code IS NOT NULL GROUP BY code) b),
    'byNature',(SELECT coalesce(jsonb_agg(b ORDER BY count DESC,key COLLATE "C"),'[]') FROM
      (SELECT n.name AS key,count(DISTINCT a.ocorrencia_id) AS count FROM selected_links a
        JOIN nature_labels n ON n.id=a.natureza_id
        GROUP BY n.name) b),
    ${pcdf ? `'natureLinks',(SELECT coalesce(jsonb_agg(b ORDER BY count DESC,key COLLATE "C"),'[]') FROM
      (SELECT n.name AS key,count(*) AS count FROM selected_links a JOIN nature_labels n ON n.id=a.natureza_id GROUP BY n.name) b),` : ""}
    'byCategory',(SELECT coalesce(jsonb_agg(b ORDER BY count DESC,key COLLATE "C"),'[]') FROM
      (SELECT a.categoria AS key,count(DISTINCT a.ocorrencia_id) AS count FROM selected_links a
        WHERE length(btrim(a.categoria)) > 0 GROUP BY 1) b),
    'timeline',(SELECT coalesce(jsonb_agg(b ORDER BY key),'[]') FROM
      (SELECT to_char(data_fato,'YYYY-MM') AS key,count(*) AS count FROM selected WHERE data_fato IS NOT NULL GROUP BY 1) b),
    'weekday',(SELECT extract(dow FROM data_fato)::int AS bucket FROM selected WHERE data_fato IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC,bucket LIMIT 1),
    'hour',(SELECT extract(hour FROM horario_fato)::int AS bucket FROM selected WHERE horario_fato IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC,bucket LIMIT 1),
    'regions',(SELECT coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name) ORDER BY name COLLATE "C", code),'[]') FROM regions),
    'natures',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]')
      FROM (SELECT DISTINCT ON (name) id,name FROM nature_labels
        WHERE canonical OR NOT EXISTS (SELECT FROM nature_labels WHERE canonical)
          ${confirmedMap ? `OR EXISTS (SELECT FROM links l
            JOIN ${schema}.pontos_confirmados p ON p.id=l.ocorrencia_id WHERE l.natureza_id=nature_labels.id)` : ""}
        ORDER BY name,canonical DESC,id) labels),
    'categories',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',name,'name',name) ORDER BY name),'[]') FROM source_categories),
    'points',(SELECT coalesce(jsonb_agg(${confirmedMap ? "to_jsonb(p)" : "to_jsonb(p)-'id'"} ORDER BY id),'[]') FROM (SELECT * FROM points ORDER BY id LIMIT ${limit}) p),
    'eligiblePoints',(SELECT count(*) FROM mapped),
    ${confirmedMap ? `'unverifiedPcdfPoints',(SELECT count(*) FROM mapped WHERE "publicationStatus"='pcdf_crs_unverified'),` : ""}
    'heatReference',CASE WHEN (SELECT count(*) FROM reference)>${limit} THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(to_jsonb(reference)-'id' ORDER BY id),'[]') FROM reference) END,
    'pointsTruncated',(SELECT count(*) FROM points)>${limit},
    'heatUnavailable',(SELECT count(*) FROM reference)>${limit}
  ) AS data`
  return { text, values }
}
