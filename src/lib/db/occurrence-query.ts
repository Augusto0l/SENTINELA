import type { PersistentQuery } from "@/contracts/persistent-occurrences"
import { visibleOccurrence } from "@/lib/db/occurrence-visibility"

const columns = ["id", "origem", "fonte", "ano_registro", "unidade_registro", "numero_registro", "identidade_status", "data_fato", "horario_fato", "local", "latitude", "longitude", "localizacao_status", "consolidacao_status", "ativo", "versao", "criado_em", "atualizado_em"]
const sort = { data: "data_fato", horario: "horario_fato", identificacao: "numero_registro", local: "local", ra: "ra_nome" } as const
export function occurrenceSql(query: PersistentQuery, id?: string) {
  const values: unknown[] = []
  const bind = (v: unknown) => { values.push(v); return `$${values.length}` }
  const filters = [visibleOccurrence]
  if (id) filters.push(`o.id=${bind(id)}::uuid`)
  if (query.raId) filters.push(`o.ra_id=${bind(query.raId)}::uuid`)
  if (query.naturezaId) filters.push(`EXISTS (SELECT 1 FROM sentinela.ocorrencia_naturezas a
    JOIN sentinela.naturezas_criminais n ON n.id=a.natureza_id WHERE a.ocorrencia_id=o.id
    AND n.descricao_original COLLATE "C"=(SELECT descricao_original FROM sentinela.naturezas_criminais
      WHERE id=${bind(query.naturezaId)}::uuid))`)
  if (query.startDate) filters.push(`o.data_fato>=${bind(query.startDate)}::date`)
  if (query.endDate) filters.push(`o.data_fato<=${bind(query.endDate)}::date`)
  if (query.identificacao) filters.push(`strpos(lower(concat_ws(' / ',o.id::text,o.ano_registro,o.unidade_registro,o.numero_registro)),lower(${bind(query.identificacao)}::text))>0`)
  if (query.local) filters.push(`strpos(lower(coalesce(o.local,'')),lower(${bind(query.local)}::text))>0`)
  // Both tokens come exclusively from allowlists, never interpolation of raw input.
  const field = sort[query.sortBy]
  if (!field || !["asc", "desc"].includes(query.direction)) throw Error("Invalid ordering")
  const order = `${field} ${query.direction === "asc" ? "ASC" : "DESC"} NULLS LAST, id ASC`
  const limit = bind(id ? 1 : query.pageSize), offset = bind(id ? 0 : (query.page - 1) * query.pageSize)
  const text = `WITH filtered AS (
    SELECT ${columns.map(c => `o.${c}`).join(",")}, r.nome AS ra_nome,
      CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'codigo',r.codigo_interno,'nome',r.nome) END AS ra_info
    FROM sentinela.ocorrencias o LEFT JOIN sentinela.regioes_administrativas r ON r.id=o.ra_id
    WHERE ${filters.join(" AND ")}
  ), page AS (SELECT * FROM filtered ORDER BY ${order} LIMIT ${limit} OFFSET ${offset})
  SELECT (SELECT count(*)::text FROM filtered) AS total,
    coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'origem',p.origem,'fonte',p.fonte,'anoRegistro',p.ano_registro,'unidadeRegistro',p.unidade_registro,'numeroRegistro',p.numero_registro,
      'identidadeStatus',p.identidade_status,'data',p.data_fato::text,'horario',p.horario_fato::text,'local',p.local,
      'latitude',p.latitude,'longitude',p.longitude,'localizacaoStatus',p.localizacao_status,'consolidacaoStatus',p.consolidacao_status,
      'ativo',p.ativo,'versao',p.versao::text,'criadoEm',p.criado_em,'atualizadoEm',p.atualizado_em,'ra',p.ra_info,
      'naturezas',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'crimeTentado',a.crime_tentado,'classificacaoStatus',a.classificacao_status,
        'natureza',CASE WHEN n.id IS NULL THEN NULL ELSE jsonb_build_object('id',n.id,'descricao',n.descricao_original,'categoriaOriginal',n.categoria_pcdf_original) END,
        'categoria',null) ORDER BY a.id),'[]'::jsonb)
        FROM sentinela.ocorrencia_naturezas a
        LEFT JOIN sentinela.naturezas_criminais n ON n.id=a.natureza_id WHERE a.ocorrencia_id=p.id)
    ) ORDER BY ${order.split(", ").map(part => `p.${part}`).join(", ")}), '[]'::jsonb) AS items FROM page p`
  return { text, values }
}
