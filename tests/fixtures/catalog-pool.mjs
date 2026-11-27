export const state = { queries: [], rows: [], fail: false, identity: {
  db: "sentinela_dev_operacional", login: "sentinela_local_reader", role: "sentinela_local_reader",
  host: "127.0.0.1", port: 5432, version: "170011", elevated: false, member: false, owner: false, rls: 19,
} }
export class Pool {
  on() {}
  async end() {}
  async connect() {
    if (state.fail) throw Error("private connection detail")
    return {
      query: async input => {
        const text = typeof input === "string" ? input : input.text
        state.queries.push(text)
        return { rows: text.startsWith("SELECT current_database") ? [state.identity] : text.startsWith("SELECT id,") ? state.rows : [] }
      },
      release() {},
    }
  }
}
