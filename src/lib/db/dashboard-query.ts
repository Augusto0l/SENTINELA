import type { DashboardFilters, DateRange } from "@/contracts/dashboard"

const schema = "sentinela_ocorrencias_analytics"
export const dashboardPopulation = "o.ativo AND o.fonte='PCDF' AND o.origem='importacao'"

export function dashboardSql(filters: DashboardFilters, previous: DateRange | null, spatialAvailable: boolean) {
  const hours = filters.hour ? filters.hour.split("-").map(Number) : null
  return {
    values: [
      filters.startDate || null, filters.endDate || null, previous?.start ?? null, previous?.end ?? null,
      [...new Set(filters.ra)], filters.nature || null, filters.category || null, hours?.[0] ?? null, hours?.[1] ?? null,
    ],
    text: `WITH regions AS MATERIALIZED (
      SELECT codigo_interno::text AS id,nome AS name FROM ${schema}.regioes_administrativas
    ), eligible AS MATERIALIZED (
      SELECT o.id,o.data_fato AS day,o.horario_fato AS time
      FROM ${schema}.ocorrencias o WHERE ${dashboardPopulation}
    ), names AS MATERIALIZED (
      SELECT n.id,n.descricao_original COLLATE "C" AS name,
        coalesce((to_jsonb(n)->>'catalogo_pcdf')::boolean,false) AS canonical
      FROM ${schema}.naturezas_criminais n
    ), links AS MATERIALIZED (
      SELECT a.ocorrencia_id AS id,a.natureza_id,n.name,
        nullif(btrim(to_jsonb(a)->>'categoria_pcdf_original'),'') COLLATE "C" AS category,
        to_jsonb(a)->'crime_tentado' AS attempted
      FROM ${schema}.ocorrencia_naturezas a JOIN eligible o ON o.id=a.ocorrencia_id
      JOIN names n ON n.id=a.natureza_id
    ), matching_links AS MATERIALIZED (
      SELECT id,name,attempted FROM links
      WHERE ($6::uuid IS NULL OR name=(SELECT name FROM names WHERE id=$6))
        AND ($7::text IS NULL OR category=$7)
    ), spatial AS (
      ${spatialAvailable ? `SELECT p.id,min(r.id) AS ra
      FROM ${schema}.pontos_confirmados p JOIN regions r ON r.id=to_jsonb(p)->>'ra_codigo'
      JOIN eligible o ON o.id=p.id GROUP BY p.id HAVING count(DISTINCT r.id)=1`
      : "SELECT NULL::uuid AS id,NULL::text AS ra WHERE false"}
    ), filtered AS MATERIALIZED (
      SELECT o.id,o.day,extract(hour FROM o.time)::int AS hour,s.ra,
        ($1::date IS NULL OR o.day BETWEEN $1 AND $2::date) IS TRUE AS current
      FROM eligible o LEFT JOIN spatial s ON s.id=o.id
      WHERE ($1::date IS NULL OR o.day BETWEEN $1 AND $2::date OR o.day BETWEEN $3::date AND $4::date)
        AND (cardinality($5::text[])=0 OR s.ra=ANY($5))
        AND ($8::int IS NULL OR (extract(hour FROM o.time)>=$8 AND extract(hour FROM o.time)<$9::int))
        AND (($6::uuid IS NULL AND $7::text IS NULL) OR EXISTS (SELECT FROM matching_links l WHERE l.id=o.id))
    ), nature_counts AS (
      SELECT l.name AS key,count(DISTINCT f.id) FILTER (WHERE f.current) AS count,
        count(DISTINCT f.id) FILTER (WHERE NOT f.current) AS previous,
        count(*) FILTER (WHERE f.current) AS links
      FROM filtered f JOIN matching_links l ON l.id=f.id GROUP BY l.name
    ), region_counts AS (
      SELECT ra AS key,count(*) FILTER (WHERE current) AS count,count(*) FILTER (WHERE NOT current) AS previous
      FROM filtered WHERE ra IS NOT NULL GROUP BY ra
    ), current_links AS MATERIALIZED (
      SELECT f.id,f.ra,f.day,f.hour,l.name AS nature,l.attempted
      FROM filtered f JOIN matching_links l ON l.id=f.id WHERE f.current
    ), daily_regions AS (
      SELECT r.id,coalesce(c.count,0) AS count
      FROM regions r LEFT JOIN region_counts c ON c.key=r.id
      WHERE (cardinality($5::text[])=0 AND c.count>0) OR r.id=ANY($5)
      ORDER BY count DESC,r.id COLLATE "C" LIMIT 5
    ), region_days AS (
      SELECT f.day,f.ra,count(*) AS count
      FROM filtered f JOIN daily_regions r ON r.id=f.ra
      WHERE f.current AND f.day IS NOT NULL GROUP BY f.day,f.ra
    ), catalog AS (
      SELECT DISTINCT ON (name) id,name FROM names n
      WHERE canonical OR EXISTS (SELECT FROM links l WHERE l.natureza_id=n.id)
      ORDER BY name,canonical DESC,id
    )
    SELECT jsonb_build_object(
      'total',(SELECT count(*) FROM filtered WHERE current),
      'regions',(SELECT coalesce(jsonb_agg(r ORDER BY name,id),'[]') FROM regions r),
      'natures',(SELECT coalesce(jsonb_agg(n ORDER BY name),'[]') FROM catalog n),
      'categories',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',category,'name',category) ORDER BY category),'[]')
        FROM (SELECT DISTINCT category FROM links WHERE category IS NOT NULL) c),
      'days',(SELECT coalesce(jsonb_agg(d ORDER BY key),'[]') FROM
        (SELECT to_char(day,'YYYY-MM-DD') AS key,count(*) AS count FROM filtered WHERE current AND day IS NOT NULL GROUP BY 1) d),
      'cells',(SELECT coalesce(jsonb_agg(h),'[]') FROM
        (SELECT extract(isodow FROM day)::int-1 AS day,hour,count(*) AS count
          FROM filtered WHERE current AND day IS NOT NULL AND hour BETWEEN 0 AND 23 GROUP BY 1,2) h),
      'byRa',(SELECT coalesce(jsonb_agg(r ORDER BY count DESC,key),'[]') FROM region_counts r),
      'byNature',(SELECT coalesce(jsonb_agg(n ORDER BY count DESC,key),'[]') FROM nature_counts n),
      'byNatureShift',(SELECT coalesce(jsonb_agg(s),'[]') FROM (
        SELECT nature,hour/6 AS shift,count(DISTINCT id) AS count FROM current_links
        WHERE day IS NOT NULL AND hour BETWEEN 0 AND 23 GROUP BY 1,2
      ) s),
      'attemptStatus',CASE WHEN EXISTS (
        SELECT FROM pg_attribute WHERE attrelid='${schema}.ocorrencia_naturezas'::regclass
          AND attname='crime_tentado' AND atttypid='boolean'::regtype AND NOT attisdropped
      ) THEN (SELECT jsonb_build_object(
        'completed',count(*) FILTER (WHERE attempted='false'::jsonb),
        'attempted',count(*) FILTER (WHERE attempted='true'::jsonb),
        'unreported',count(*) FILTER (WHERE attempted IS NULL OR attempted='null'::jsonb)
      ) FROM current_links) END,
      'byRaNature',(SELECT coalesce(jsonb_agg(r),'[]') FROM (
        SELECT ra,nature,count(DISTINCT id) AS count FROM current_links
        WHERE ra IS NOT NULL GROUP BY ra,nature
      ) r),
      'dailyRegions',(SELECT coalesce(jsonb_agg(id ORDER BY count DESC,id COLLATE "C"),'[]') FROM daily_regions),
      'byRaDay',(SELECT coalesce(jsonb_agg(d ORDER BY day),'[]') FROM (
        SELECT to_char(day,'YYYY-MM-DD') AS day,jsonb_object_agg(ra,count) AS counts FROM region_days GROUP BY region_days.day
      ) d)
    ) AS data`,
  }
}
