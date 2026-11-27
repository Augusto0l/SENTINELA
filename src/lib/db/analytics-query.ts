import { ANALYTICS_HEAT_CELL_LIMIT, ANALYTICS_POINT_LIMIT, persistentAnalyticsQuery, type PersistentAnalyticsQuery } from "@/contracts/persistent-analytics"
import { pointViewport, VIEWPORT_POINT_LIMIT, type PointViewport } from "@/contracts/point-viewport"
import { visibleOccurrence } from "@/lib/db/occurrence-visibility"

export function analyticsSql(input: PersistentAnalyticsQuery, source: "legacy" | "integrated" = "legacy", confirmedMap = false) {
  return buildAnalyticsSql(input, source, confirmedMap)
}

/** Requires the clone-only indexed reader. The HTTP runtime continues to use analyticsSql. */
export function pointViewportSql(input: PersistentAnalyticsQuery, bbox: PointViewport) {
  return buildAnalyticsSql(input, "integrated", true, pointViewport.parse(bbox))
}

function buildAnalyticsSql(input: PersistentAnalyticsQuery, source: "legacy" | "integrated", confirmedMap: boolean, viewport?: PointViewport) {
  const query = persistentAnalyticsQuery.parse(input)
  const pcdf = source === "integrated" && query.scope === "pcdf"
  const schema = source === "integrated" ? "sentinela_ocorrencias_analytics" : "sentinela"
  const pcdfOnly = "o.fonte='PCDF' AND o.origem='importacao'"
  const visibility = pcdf && !confirmedMap ? pcdfOnly : source === "integrated" ? "true" : visibleOccurrence
  // The attested analytics view can still be on the previous schema during rollout.
  const sourceCategory = source === "integrated" ? "to_jsonb(a)->>'categoria_pcdf_original'" : "original.categoria_pcdf_original"
  const categoryJoin = source === "legacy" ? ` JOIN ${schema}.naturezas_criminais original ON original.id=a.natureza_id` : ""
  const canonical = source === "integrated" ? "coalesce((to_jsonb(n)->>'catalogo_pcdf')::boolean,false)" : "false"
  // Integrated sources group by the homologated SENTINELA category when the association is classified and fall back
  // to the PCDF source label otherwise, so nothing disappears before homologation.
  const homologated = source === "integrated"
  const mappedCategory = confirmedMap || homologated ? `LEFT JOIN ${schema}.mapeamentos_natureza m ON m.id=a.mapeamento_id
    LEFT JOIN ${schema}.categorias_criminais c ON c.id=m.categoria_id${homologated ? " AND c.status='homologada'" : ""}` : ""
  const categoryExpression = homologated ? `coalesce(c.nome,nullif(${sourceCategory},''))`
    : confirmedMap ? `coalesce(nullif(${sourceCategory},''),c.nome)` : sourceCategory
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
  const bounds = viewport ? [viewport.west, viewport.south, viewport.east, viewport.north]
    .map(value => `(${bind(value)}::double precision)`) : []
  const [west, south, east, north] = bounds
  const coords = bounds.join(",")
  const zoom = viewport ? bind(viewport.zoom) : ""
  const spatialPoints = viewport ? "spatial_candidates" : `${schema}.pontos_confirmados`
  const cells = ANALYTICS_HEAT_CELL_LIMIT
  const cell = (column: string) => `(round(${column}::numeric*500)/500)::float8`
  const heatOverflow = `((SELECT count(*) FROM reference)>${cells} OR (SELECT count(*) FROM heat)>${cells})`
  const common = `WITH regions AS MATERIALIZED (
    SELECT id,codigo_interno::text AS code,nome::text AS name FROM ${schema}.regioes_administrativas
  ), ${viewport ? `spatial_candidates AS MATERIALIZED (
    SELECT * FROM ${schema}.pontos_no_enquadramento(${coords})
  ), ` : ""}visible AS MATERIALIZED (
    SELECT o.id,r.code,o.data_fato,o.horario_fato,o.latitude,o.longitude,o.localizacao_status${confirmedMap ? ",o.fonte,o.origem" : ""}
    FROM ${schema}.ocorrencias o LEFT JOIN regions r ON r.id=o.ra_id
    WHERE o.ativo AND ${visibility}${viewport ? " AND o.id IN (SELECT id FROM spatial_candidates)" : ""}
  ), nature_labels AS MATERIALIZED (
    SELECT n.id,n.descricao_original COLLATE "C" AS name,${canonical} AS canonical
    FROM ${schema}.naturezas_criminais n
  ), links AS MATERIALIZED (
    SELECT a.ocorrencia_id,a.natureza_id,(${categoryExpression}) COLLATE "C" AS categoria
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
    FROM matched m JOIN ${spatialPoints} p USING(id)${raParam ? `
    WHERE ${pointRa}=${raParam}::text` : ""}
  ),
  points AS (SELECT * FROM mapped ORDER BY id LIMIT ${limit + 1}),
  -- Heat uses weighted 0.002° cells: every published occurrence counts once, however many months are loaded.
  heat AS (SELECT ${cell("latitude")} AS latitude,${cell("longitude")} AS longitude,"raCode",count(*)::int AS weight
    FROM mapped GROUP BY 1,2,3 ORDER BY 1,2,3 LIMIT ${cells + 1}),
  reference AS (SELECT ${cell("latitude")} AS latitude,${cell("longitude")} AS longitude,NULL::text AS "raCode",count(*)::int AS weight
    FROM ${schema}.pontos_confirmados GROUP BY 1,2 ORDER BY 1,2 LIMIT ${cells + 1})` : `mapped AS (
    SELECT id,code AS "raCode",latitude,longitude FROM selected
    WHERE ${eligiblePoint}
  ), points AS (SELECT * FROM mapped ORDER BY id LIMIT ${limit + 1}), reference AS (
    SELECT id,code AS "raCode",latitude,longitude FROM visible
    WHERE ${eligiblePoint}
    ORDER BY id LIMIT ${limit + 1}
  )`}`
  // Web Mercator bins use scalar math. PostGIS stays in the protected reader that searches the GiST index.
  if (viewport) return { values, text: `${common},
    tally AS (SELECT count(*) AS count FROM mapped),
    spacing AS (
      SELECT greatest(40075016.68557849*24/(256*power(2,${zoom}::int)),
        6378137*radians(${east}-${west})/63,
        6378137*ln(tan(radians(45+${north}/2))/tan(radians(45+${south}/2)))/63) AS cell
    ), projected AS (
      SELECT latitude,longitude,cell,6378137*radians(longitude) AS x,
        6378137*ln(tan(radians(45+latitude/2))) AS y
      FROM mapped CROSS JOIN spacing WHERE (SELECT count FROM tally)>${VIEWPORT_POINT_LIMIT}
    ), groups AS (
      SELECT count(*) AS count,(min(latitude)+max(latitude))/2 AS latitude,(min(longitude)+max(longitude))/2 AS longitude,
        jsonb_build_object('west',min(longitude),'south',min(latitude),'east',max(longitude),'north',max(latitude)) AS bounds
      FROM projected GROUP BY floor(x/cell),floor(y/cell)
    )
    SELECT CASE WHEN tally.count>${VIEWPORT_POINT_LIMIT} THEN
      jsonb_build_object('kind','groups','representedOccurrences',tally.count,'groups',
        (SELECT coalesce(jsonb_agg(g ORDER BY latitude,longitude),'[]') FROM groups g))
      ELSE jsonb_build_object('kind','points','representedOccurrences',tally.count,'points',
        (SELECT coalesce(jsonb_agg(m ORDER BY id),'[]') FROM mapped m)) END AS data
    FROM tally` }
  const text = `${common}
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
    ${confirmedMap ? `'heatReference',CASE WHEN ${heatOverflow} THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY latitude,longitude),'[]') FROM reference r) END,
    'heat',CASE WHEN ${heatOverflow} THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY latitude,longitude,"raCode"),'[]') FROM heat h) END,
    'heatUnavailable',${heatOverflow},`
    : `'heatReference',CASE WHEN (SELECT count(*) FROM reference)>${limit} THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(to_jsonb(reference)-'id' ORDER BY id),'[]') FROM reference) END,
    'heatUnavailable',(SELECT count(*) FROM reference)>${limit},`}
    'pointsTruncated',(SELECT count(*) FROM points)>${limit}
  ) AS data`
  return { text, values }
}
