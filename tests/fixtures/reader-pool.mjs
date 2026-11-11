export const state = { options: null, queries: [], released: null, fail: false, identity: null }
export class Pool {
  constructor(options) { state.options=options }
  on() {}
  async end() {}
  async connect() {
    if(state.fail) throw Error("synthetic-secret-connect-error")
    return { query:async text=>{state.queries.push(text);return {rows:state.identity?[state.identity]:[]}}, release:discard=>{state.released=discard} }
  }
}
