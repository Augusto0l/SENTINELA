import { natureCatalogQuerySchema, type CatalogKind, type NatureCatalogQuery } from "@/contracts/persistent-catalogs"

// Fixed server-owned SQL. RLS supplies row visibility; no administrator or marker bypass.
export function catalogSql(kind: CatalogKind, query: NatureCatalogQuery = {}) {
  if (kind === "regioes") {
    if (Object.keys(query).length) throw new Error("Catálogo de regiões sem parâmetros.")
    return { text: 'SELECT id, nome FROM sentinela.regioes_administrativas ORDER BY lower(nome) COLLATE "C", nome COLLATE "C", id ASC', values: [] }
  }
  if (kind !== "naturezas") throw new Error("Catálogo inválido.")
  const { q, direction } = natureCatalogQuerySchema.parse(query)
  const filter = q === undefined ? "" : " WHERE strpos(lower(descricao_original), lower($1::text)) > 0"
  const order = direction === "desc" ? ' DESC, descricao_original COLLATE "C" DESC' : ', descricao_original COLLATE "C"'
  return {
    text: `SELECT id, descricao_original AS descricao FROM sentinela.naturezas_criminais${filter} ORDER BY lower(descricao_original) COLLATE "C"${order}, id ASC`,
    values: q === undefined ? [] : [q],
  }
}
