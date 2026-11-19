/**
 * In-memory stand-in for the subset of the supabase-js query builder the API
 * uses. Implements filters, ordering, ranges, unique constraints and a
 * simplified Row Level Security check (rows are only visible to the user the
 * client was created for), so authorization logic is exercised for real.
 */
import { randomUUID } from 'node:crypto';

const UNIQUE = {
  reminders: [['user_id', 'dedupe_key']],
  google_connections: [['user_id']],
  profiles: [['id']],
  oauth_states: [['nonce']],
};
const OWNER_COLUMN = { notes: 'user_id', reminders: 'user_id', profiles: 'id' };
const ADMIN_ONLY = new Set(['google_connections', 'oauth_states']);

function matchesIlike(value, pattern) {
  const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]]/g, '\\$&').replace(/\\\\([%_])/g, '\u0000$1').replace(/%/g, '.*').replace(/_/g, '.').replace(/\u0000(.)/g, '\\$1')}$`, 'is');
  return regex.test(String(value ?? ''));
}

class Query {
  constructor(store, table, scope) {
    Object.assign(this, { store, table, scope, op: 'select', filters: [], orders: [], wantSingle: null, rangeFrom: 0, rangeTo: Infinity, returning: false, count: null });
  }

  select(_columns, options) { if (this.op === 'select') this.op = 'select'; else this.returning = true; if (options?.count) this.count = options.count; return this; }
  insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(row, options) { this.op = 'upsert'; this.payload = [row]; this.onConflict = options?.onConflict; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
  neq(column, value) { this.filters.push((row) => row[column] !== value); return this; }
  in(column, values) { this.filters.push((row) => values.includes(row[column])); return this; }
  lt(column, value) { this.filters.push((row) => row[column] < value); return this; }
  lte(column, value) { this.filters.push((row) => row[column] <= value); return this; }
  gte(column, value) { this.filters.push((row) => row[column] >= value); return this; }
  ilike(column, pattern) { this.filters.push((row) => matchesIlike(row[column], pattern)); return this; }
  or(expression) {
    const clauses = expression.split(',').map((part) => {
      const [column, operator, ...rest] = part.split('.');
      return { column, operator, value: rest.join('.') };
    });
    this.filters.push((row) => clauses.some(({ column, operator, value }) => operator === 'ilike' && matchesIlike(row[column], value)));
    return this;
  }
  order(column, { ascending = true } = {}) { this.orders.push([column, ascending]); return this; }
  limit(n) { this.rangeTo = this.rangeFrom + n - 1; return this; }
  range(from, to) { this.rangeFrom = from; this.rangeTo = to; return this; }
  single() { this.wantSingle = 'single'; return this; }
  maybeSingle() { this.wantSingle = 'maybe'; return this; }

  rows() {
    if (!this.store.tables[this.table]) this.store.tables[this.table] = [];
    return this.store.tables[this.table];
  }

  visible(row) {
    if (this.scope.admin) return true;
    if (ADMIN_ONLY.has(this.table)) return false;
    const owner = OWNER_COLUMN[this.table];
    return !owner || row[owner] === this.scope.userId;
  }

  checkUnique(candidate, ignore) {
    for (const columns of UNIQUE[this.table] || []) {
      const clash = this.rows().find((row) => row !== ignore && columns.every((c) => row[c] === candidate[c]));
      if (clash) return { code: '23505', message: `duplicate key value violates unique constraint on ${columns.join(',')}` };
    }
    return null;
  }

  rlsWriteCheck(row) {
    if (this.scope.admin) return null;
    if (ADMIN_ONLY.has(this.table)) return { code: '42501', message: 'permission denied' };
    const owner = OWNER_COLUMN[this.table];
    if (owner && row[owner] !== this.scope.userId) return { code: '42501', message: 'new row violates row-level security policy' };
    return null;
  }

  execute() {
    if (this.store.failNext) {
      const error = this.store.failNext;
      this.store.failNext = null;
      return { data: null, error };
    }
    const now = () => new Date(Date.now() + (this.store.tick++)).toISOString();
    let result = [];
    if (this.op === 'insert' || this.op === 'upsert') {
      for (const input of this.payload) {
        const keyColumn = this.onConflict;
        const existing = keyColumn ? this.rows().find((row) => row[keyColumn] === input[keyColumn]) : null;
        if (existing) {
          const denied = this.rlsWriteCheck({ ...existing, ...input });
          if (denied) return { data: null, error: denied };
          Object.assign(existing, input, { updated_at: now() });
          result.push(existing);
          continue;
        }
        const row = { ...(this.table === 'profiles' ? {} : { id: randomUUID() }), created_at: now(), updated_at: now(), ...input };
        if (this.table === 'profiles') Object.assign(row, { timezone: 'UTC', ai_detection_enabled: true, ...input });
        if (this.table === 'reminders') Object.assign(row, { status: 'pending', ...input });
        const denied = this.rlsWriteCheck(row) || this.checkUnique(row);
        if (denied) return { data: null, error: denied };
        this.rows().push(row);
        result.push(row);
      }
    } else {
      let matched = this.rows().filter((row) => this.visible(row) && this.filters.every((f) => f(row)));
      if (this.op === 'update') {
        for (const row of matched) {
          const next = { ...row, ...this.payload, updated_at: now() };
          const denied = this.rlsWriteCheck(next) || this.checkUnique(next, row);
          if (denied) return { data: null, error: denied };
          if (this.table === 'reminders' && next.status === 'synced' && !next.google_event_id) return { data: null, error: { code: '23514', message: 'check constraint' } };
          Object.assign(row, next);
        }
      } else if (this.op === 'delete') {
        this.store.tables[this.table] = this.rows().filter((row) => !matched.includes(row));
      }
      for (const [column, ascending] of [...this.orders].reverse()) {
        matched = [...matched].sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * (ascending ? 1 : -1));
      }
      const total = matched.length;
      result = matched.slice(this.rangeFrom, this.rangeTo + 1);
      if (this.count) this.total = total;
    }
    const data = result.map((row) => ({ ...row }));
    if (this.wantSingle === 'single') {
      return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    }
    if (this.wantSingle === 'maybe') return { data: data[0] ?? null, error: null };
    return { data, error: null, count: this.total ?? null };
  }

  then(resolve, reject) {
    try {
      resolve(this.execute());
    } catch (error) {
      reject(error);
    }
  }
}

export function createFakeSupabase() {
  const store = { tables: {}, tick: 0, failNext: null };
  const client = (scope) => ({ from: (table) => new Query(store, table, scope) });
  return {
    store,
    admin: client({ admin: true }),
    forUserId: (userId) => client({ userId }),
    reset() { store.tables = {}; },
  };
}
