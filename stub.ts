// A stand-in for @supabase/supabase-js, just wide enough to run the three
// Keystamp Edge Functions for real.
//
// The point is not to simulate Postgres. It is to be able to (a) drive the
// genuine handler code with hostile input and (b) force a query to FAIL, so
// the "a database outage must not render as an empty club" claim can be
// tested rather than asserted.

export type Row = Record<string, any>;

export const db: Record<string, Row[]> = {
  profiles: [], meetings: [], attendance_sessions: [], attendance: [], reward_claims: [],
};
export const users: Record<string, { id: string }> = {};   // jwt -> user

/** tables whose next query returns an error instead of data */
export const FAIL = new Set<string>();
export const reset = () => {
  for (const k of Object.keys(db)) db[k] = [];
  for (const k of Object.keys(users)) delete users[k];
  FAIL.clear();
};

const dbError = { message: 'simulated backend failure', code: 'XX000', details: '', hint: '' };

class Query implements PromiseLike<any> {
  private filters: Array<(r: Row) => boolean> = [];
  private wantCount = false;
  private head = false;
  private one: false | 'one' | 'maybe' = false;
  private orderBy: { col: string; asc: boolean } | null = null;
  private lo = 0; private hi = Infinity;
  private mode: 'select' | 'insert' | 'update' = 'select';
  private payload: Row = {};

  constructor(private table: string) {}

  select(_c?: string, o?: { count?: string; head?: boolean }) {
    if (o?.count) this.wantCount = true;
    if (o?.head) this.head = true;
    if (this.mode !== 'select') this.one = false;
    return this;
  }
  insert(p: Row) { this.mode = 'insert'; this.payload = p; return this; }
  update(p: Row) { this.mode = 'update'; this.payload = p; return this; }

  eq(c: string, v: any)  { this.filters.push(r => r[c] === v); return this; }
  neq(c: string, v: any) { this.filters.push(r => r[c] !== v); return this; }
  is(c: string, v: any)  { this.filters.push(r => (r[c] ?? null) === v); return this; }
  in(c: string, vs: any[]) { this.filters.push(r => vs.includes(r[c])); return this; }
  lte(c: string, v: any) { this.filters.push(r => String(r[c]) <= String(v)); return this; }
  gte(c: string, v: any) { this.filters.push(r => String(r[c]) >= String(v)); return this; }
  lt(c: string, v: any)  { this.filters.push(r => String(r[c]) <  String(v)); return this; }
  gt(c: string, v: any)  { this.filters.push(r => String(r[c]) >  String(v)); return this; }
  ilike(c: string, pat: string) {
    const needle = pat.replace(/%/g, '').toLowerCase();
    this.filters.push(r => String(r[c] ?? '').toLowerCase().includes(needle));
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) {
    this.orderBy = { col, asc: o?.ascending !== false }; return this;
  }
  limit(n: number) { this.hi = this.lo + n - 1; return this; }
  range(a: number, b: number) { this.lo = a; this.hi = b; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  single() { this.one = 'one'; return this; }

  private rows() {
    let rs = (db[this.table] ?? []).filter(r => this.filters.every(f => f(r)));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      rs = [...rs].sort((x, y) =>
        (String(x[col]) < String(y[col]) ? -1 : String(x[col]) > String(y[col]) ? 1 : 0) * (asc ? 1 : -1));
    }
    return rs;
  }

  private run() {
    if (FAIL.has(this.table)) return { data: null, count: null, error: dbError };

    if (this.mode === 'insert') {
      const row = { id: crypto.randomUUID(), ...this.payload };
      // the constraints that actually matter, enforced like the database does
      if (this.table === 'attendance' &&
          db.attendance.some(a => a.user_id === row.user_id && a.meeting_id === row.meeting_id))
        return { data: null, count: null, error: { code: '23505', message: 'duplicate key' } };
      if (this.table === 'attendance' && !db.profiles.some(p => p.id === row.user_id))
        return { data: null, count: null, error: { code: '23503', message: 'fk violation' } };
      if (this.table === 'reward_claims' &&
          db.reward_claims.some(c => c.user_id === row.user_id && c.reward_id === row.reward_id))
        return { data: null, count: null, error: { code: '23505', message: 'duplicate key' } };
      if (!row.checked_in_at) row.checked_in_at = new Date().toISOString();
      db[this.table].push(row);
      return { data: this.one ? row : [row], count: null, error: null };
    }

    if (this.mode === 'update') {
      const hit = this.rows();
      for (const r of hit) Object.assign(r, this.payload);
      return { data: hit, count: hit.length, error: null };
    }

    const all = this.rows();
    const page = all.slice(this.lo, this.hi === Infinity ? undefined : this.hi + 1);
    if (this.head) return { data: null, count: all.length, error: null };
    if (this.one === 'maybe')
      return { data: page[0] ?? null, count: all.length, error: null };
    if (this.one === 'one')
      return page.length === 1
        ? { data: page[0], count: 1, error: null }
        : { data: null, count: all.length, error: { code: 'PGRST116', message: 'not one row' } };
    return { data: page, count: this.wantCount ? all.length : null, error: null };
  }

  then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, no?: ((e: any) => B) | null) {
    return Promise.resolve(this.run()).then(ok, no);
  }
}

export function createClient(_url: string, _key: string, opts?: any) {
  const hdr = String(opts?.global?.headers?.Authorization ?? '');
  const fromHeader = hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : undefined;
  return {
    from: (t: string) => new Query(t),
    auth: {
      getUser: async (jwt?: string) => {
        const tok = jwt ?? fromHeader;
        const u = tok ? users[tok] : undefined;
        return u ? { data: { user: u }, error: null }
                 : { data: { user: null }, error: { message: 'bad jwt' } };
      },
    },
  };
}
