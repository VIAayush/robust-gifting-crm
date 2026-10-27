// A small in-memory stand-in for the Supabase client, used ONLY by isolated tests. It is deliberately simple:
// it implements the query-builder calls the application's actions use (select/insert/update/delete/upsert, eq, neq,
// in, is, not, gt/gte/lt/lte, ilike, order, limit, range, single, maybeSingle, count) over plain arrays, plus rpc()
// handlers and auth.getUser(). It does NOT implement row-level security, column privileges, triggers, constraints or
// embedded-relation joins: anything that depends on the real database is out of scope for these tests and must be
// verified against Supabase (see docs/SELF_AUDIT_TEST_REPORT.md).
export type Row = Record<string, unknown>
type RpcResult = { data?: unknown; error?: { code?: string; message: string } | null }
type RpcHandler = (args: Record<string, unknown>, db: FakeDb) => RpcResult | Promise<RpcResult>

let counter = 0
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`

export class FakeDb {
  tables: Record<string, Row[]> = {}
  rpcHandlers: Record<string, RpcHandler> = {}
  user: { id: string; email?: string } | null = null
  /** Every write: `${table}:insert|update|delete`, in order. */
  writes: string[] = []
  rpcCalls: { name: string; args: Record<string, unknown> }[] = []
  /** Tables whose reads should fail, to simulate outages or privilege errors: table -> error message. */
  readErrors: Record<string, string> = {}
  writeErrors: Record<string, { code?: string; message: string }> = {}
  /** table -> column that must be unique (a duplicate insert fails with Postgres code 23505, like a unique index). */
  unique: Record<string, string> = {}

  seed(table: string, rows: Row[]) {
    this.tables[table] = [...(this.tables[table] || []), ...rows.map((r) => ({ id: r.id ?? newId(), ...r }))]
    return this
  }
  rows(table: string) {
    return this.tables[table] || []
  }
  signedInAs(id: string | null) {
    this.user = id ? { id, email: `${id}@example.test` } : null
    return this
  }
  client() {
    return makeClient(this)
  }
}

type Filter = (row: Row) => boolean

class Query implements PromiseLike<{ data: unknown; error: { code?: string; message: string } | null; count?: number | null }> {
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private filters: Filter[] = []
  private payload: Row | Row[] | null = null
  private wantsReturn = false
  private limitN: number | null = null
  private mode: 'many' | 'single' | 'maybe' = 'many'
  private head = false
  private countMode = false
  private upsertKey: string[] | null = null
  private ignoreDuplicates = false

  private db: FakeDb
  private table: string
  constructor(db: FakeDb, table: string) {
    this.db = db
    this.table = table
  }

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.action === 'select') this.action = 'select'
    else this.wantsReturn = true
    if (opts?.count) this.countMode = true
    if (opts?.head) this.head = true
    return this
  }
  insert(rows: Row | Row[]) {
    this.action = 'insert'
    this.payload = rows
    return this
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.action = 'upsert'
    this.payload = rows
    this.upsertKey = opts?.onConflict ? opts.onConflict.split(',').map((s) => s.trim()) : ['id']
    this.ignoreDuplicates = Boolean(opts?.ignoreDuplicates)
    return this
  }
  update(values: Row) {
    this.action = 'update'
    this.payload = values
    return this
  }
  delete() {
    this.action = 'delete'
    return this
  }
  eq(col: string, value: unknown) { this.filters.push((r) => r[col] === value); return this }
  neq(col: string, value: unknown) { this.filters.push((r) => r[col] !== value); return this }
  gt(col: string, value: number | string) { this.filters.push((r) => (r[col] as number) > (value as number)); return this }
  gte(col: string, value: number | string) { this.filters.push((r) => (r[col] as number) >= (value as number)); return this }
  lt(col: string, value: number | string) { this.filters.push((r) => (r[col] as number) < (value as number)); return this }
  lte(col: string, value: number | string) { this.filters.push((r) => (r[col] as number) <= (value as number)); return this }
  in(col: string, values: unknown[]) { this.filters.push((r) => values.includes(r[col])); return this }
  is(col: string, value: unknown) { this.filters.push((r) => (value === null ? r[col] === null || r[col] === undefined : r[col] === value)); return this }
  not(col: string, op: string, value: unknown) {
    if (op === 'is' && value === null) this.filters.push((r) => r[col] !== null && r[col] !== undefined)
    else if (op === 'in') this.filters.push((r) => !String(value).replace(/[()]/g, '').split(',').includes(String(r[col])))
    else throw new Error(`fake supabase: not(${col}, ${op}) is not implemented`)
    return this
  }
  ilike(col: string, pattern: string) {
    const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i')
    this.filters.push((r) => re.test(String(r[col] ?? '')))
    return this
  }
  like(col: string, pattern: string) { return this.ilike(col, pattern) }
  or() { throw new Error('fake supabase: or() is not implemented; write the test around it') }
  order() { return this }
  range(from: number, to: number) { this.limitN = to - from + 1; return this }
  limit(n: number) { this.limitN = n; return this }
  single() { this.mode = 'single'; return this }
  maybeSingle() { this.mode = 'maybe'; return this }

  private matches() {
    return this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)))
  }

  private run(): { data: unknown; error: { code?: string; message: string } | null; count?: number | null } {
    const t = this.table
    const db = this.db
    if (this.action === 'select') {
      if (db.readErrors[t]) return { data: null, error: { message: db.readErrors[t] } }
      let rows = this.matches()
      const count = rows.length
      if (this.limitN !== null) rows = rows.slice(0, this.limitN)
      if (this.head) return { data: null, error: null, count }
      return this.shape(rows, this.countMode ? count : undefined)
    }
    const writeError = db.writeErrors[t]
    if (this.action === 'insert') {
      if (writeError) return { data: null, error: writeError }
      const incoming: Row[] = (Array.isArray(this.payload) ? this.payload : [this.payload as Row]).map((r) => ({ id: newId(), ...r }))
      const uniqueCol = db.unique[t]
      if (uniqueCol) {
        for (const r of incoming) {
          if (r[uniqueCol] != null && db.rows(t).some((e) => e[uniqueCol] === r[uniqueCol])) {
            return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint on ${uniqueCol}` } }
          }
        }
      }
      db.tables[t] = [...db.rows(t), ...incoming]
      db.writes.push(`${t}:insert`)
      return this.wantsReturn ? this.shape(incoming) : { data: null, error: null }
    }
    if (this.action === 'upsert') {
      if (writeError) return { data: null, error: writeError }
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
      const out: Row[] = []
      for (const row of incoming) {
        const key = this.upsertKey || ['id']
        const existing = db.rows(t).find((r) => key.every((k) => r[k] === row[k]))
        if (existing) {
          if (!this.ignoreDuplicates) Object.assign(existing, row)
          out.push(existing)
        } else {
          const created = { id: newId(), ...row }
          db.tables[t] = [...db.rows(t), created]
          out.push(created)
        }
      }
      db.writes.push(`${t}:upsert`)
      return this.wantsReturn ? this.shape(out) : { data: null, error: null }
    }
    if (this.action === 'update') {
      if (writeError) return { data: null, error: writeError }
      const rows = this.matches()
      for (const r of rows) Object.assign(r, this.payload as Row)
      db.writes.push(`${t}:update`)
      return this.wantsReturn ? this.shape(rows) : { data: null, error: null }
    }
    // delete
    if (writeError) return { data: null, error: writeError }
    const doomed = new Set(this.matches())
    db.tables[t] = db.rows(t).filter((r) => !doomed.has(r))
    db.writes.push(`${t}:delete`)
    return this.wantsReturn ? this.shape([...doomed]) : { data: null, error: null }
  }

  private shape(sourceRows: Row[], count?: number) {
    // A real database returns copies; sharing live row objects would let a later update change what a test already read.
    const rows = sourceRows.map((r) => ({ ...r }))
    if (this.mode === 'single') {
      if (rows.length === 1) return { data: rows[0], error: null }
      return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
    }
    if (this.mode === 'maybe') {
      if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows returned' } }
      return { data: rows[0] ?? null, error: null }
    }
    return { data: rows, error: null, count: count ?? null }
  }

  then<R1 = unknown, R2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { code?: string; message: string } | null; count?: number | null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected)
  }
}

function makeClient(db: FakeDb) {
  return {
    auth: {
      getUser: async () => ({ data: { user: db.user }, error: null }),
      signOut: async () => ({ error: null }),
      admin: {
        createUser: async (attrs: { email: string; user_metadata?: Record<string, unknown> }) => {
          const id = newId()
          db.seed('auth_users', [{ id, email: attrs.email, metadata: attrs.user_metadata }])
          db.writes.push('auth:createUser')
          return { data: { user: { id, email: attrs.email } }, error: null }
        },
        deleteUser: async (id: string) => {
          db.tables['auth_users'] = db.rows('auth_users').filter((u) => u.id !== id)
          db.writes.push('auth:deleteUser')
          return { error: null }
        },
        generateLink: async () => ({ data: { properties: { action_link: 'https://example.test/set-password' } }, error: null }),
      },
    },
    from: (table: string) => new Query(db, table),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      db.rpcCalls.push({ name, args })
      const handler = db.rpcHandlers[name]
      if (!handler) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.' + name } }
      const result = await handler(args, db)
      return { data: result.data ?? null, error: result.error ?? null }
    },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  }
}
