import { ANALYTICS_POINT_LIMIT, persistentAnalyticsQuery, type PersistentAnalyticsQuery } from "@/contracts/persistent-analytics"
import { visibleOccurrence } from "@/lib/db/occurrence-visibility"

export function analyticsSql(input: PersistentAnalyticsQuery) {
  const query = persistentAnalyticsQuery.parse(input)
  const values: unknown[] = []
  const bind = (value: unknown) => { values.push(value); return `$${values.length}` }
  const filters = ["true"]
  if (query.startDate) filters.push(`o.data_fato >= ${bind(query.startDate)}::date`)
  if (query.endDate) filters.push(`o.data_fato <= ${bind(query.endDate)}::date`)
  if (query.hour) {
    const [start, end] = query.hour.split("-").map(Number)
    filters.push(`o.horario_fato >= make_time(${bind(start)}::int,0,0) AND o.horario_fato < ${bind(end === 24 ? "24:00" : `${end}:00`)}::time`)
  }
  if (query.nature || query.category) {
    const constraints = ["a.ocorrencia_id=o.id"]
    if (query.nature) constraints.push(`n.id=${bind(query.nature)}::uuid`)
    if (query.category) constraints.push(`c.id=${bind(query.category)}::uuid`)
    filters.push(`EXISTS (SELECT 1 FROM sentinela.ocorrencia_naturezas a
      JOIN sentinela.naturezas_criminais n ON n.id=a.natureza_id
      LEFT JOIN sentinela.mapeamentos_natureza m ON m.id=a.mapeamento_id AND m.natureza_id=a.natureza_id
      LEFT JOIN sentinela.categorias_criminais c ON c.id=m.categoria_id WHERE ${constraints.join(" AND ")})`)
  }
  const selected = query.ra ? ` WHERE code=${bind(query.ra)}::text` : ""
  const limit = ANALYTICS_POINT_LIMIT
  const text = `WITH regions AS MATERIALIZED (
    SELECT id,codigo_interno::text AS code,nome::text AS name FROM sentinela.regioes_administrativas
  ), visible AS MATERIALIZED (
    SELECT o.id,r.code,o.data_fato,o.horario_fato,o.latitude,o.longitude,o.localizacao_status
    FROM sentinela.ocorrencias o LEFT JOIN regions r ON r.id=o.ra_id
    WHERE o.ativo AND ${visibleOccurrence}
  ), matched AS MATERIALIZED (SELECT * FROM visible o WHERE ${filters.join(" AND ")}),
  selected AS MATERIALIZED (SELECT * FROM matched${selected}),
  points AS (
    SELECT id,code AS "raCode",latitude,longitude FROM selected
    WHERE code IS NOT NULL AND localizacao_status='validada' AND latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY id LIMIT ${limit + 1}
  ), reference AS (
    SELECT id,code AS "raCode",latitude,longitude FROM visible
    WHERE code IS NOT NULL AND localizacao_status='validada' AND latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY id LIMIT ${limit + 1}
  )
  SELECT jsonb_build_object(
    'total',(SELECT count(*) FROM selected),'mapTotal',(SELECT count(*) FROM matched),
    'byRa',(SELECT coalesce(jsonb_agg(b ORDER BY key),'[]') FROM
      (SELECT code AS key,count(*) AS count FROM matched WHERE code IS NOT NULL GROUP BY code) b),
    'byNature',(SELECT coalesce(jsonb_agg(b ORDER BY count DESC,key COLLATE "C"),'[]') FROM
      (SELECT n.descricao_original AS key,count(DISTINCT s.id) AS count FROM selected s
        JOIN sentinela.ocorrencia_naturezas a ON a.ocorrencia_id=s.id JOIN sentinela.naturezas_criminais n ON n.id=a.natureza_id
        GROUP BY n.descricao_original) b),
    'byCategory',(SELECT coalesce(jsonb_agg(b ORDER BY count DESC,key COLLATE "C"),'[]') FROM
      (SELECT c.nome::text AS key,count(DISTINCT s.id) AS count FROM selected s
        JOIN sentinela.ocorrencia_naturezas a ON a.ocorrencia_id=s.id
        JOIN sentinela.mapeamentos_natureza m ON m.id=a.mapeamento_id AND m.natureza_id=a.natureza_id
        JOIN sentinela.categorias_criminais c ON c.id=m.categoria_id WHERE c.status='homologada'
        GROUP BY c.nome) b),
    'timeline',(SELECT coalesce(jsonb_agg(b ORDER BY key),'[]') FROM
      (SELECT to_char(data_fato,'YYYY-MM') AS key,count(*) AS count FROM selected WHERE data_fato IS NOT NULL GROUP BY 1) b),
    'weekday',(SELECT extract(dow FROM data_fato)::int AS bucket FROM selected WHERE data_fato IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC,bucket LIMIT 1),
    'hour',(SELECT extract(hour FROM horario_fato)::int AS bucket FROM selected WHERE horario_fato IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC,bucket LIMIT 1),
    'regions',(SELECT coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name) ORDER BY name COLLATE "C", code),'[]') FROM regions),
    'natures',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',descricao_original) ORDER BY descricao_original COLLATE "C",id),'[]') FROM sentinela.naturezas_criminais),
    'categories',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',nome) ORDER BY nome COLLATE "C",id),'[]') FROM sentinela.categorias_criminais WHERE status='homologada'),
    'points',(SELECT coalesce(jsonb_agg(to_jsonb(p)-'id' ORDER BY id),'[]') FROM (SELECT * FROM points ORDER BY id LIMIT ${limit}) p),
    'heatReference',CASE WHEN (SELECT count(*) FROM reference)>${limit} THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(to_jsonb(reference)-'id' ORDER BY id),'[]') FROM reference) END,
    'pointsTruncated',(SELECT count(*) FROM points)>${limit},
    'heatUnavailable',(SELECT count(*) FROM reference)>${limit}
  ) AS data`
  return { text, values }
}
