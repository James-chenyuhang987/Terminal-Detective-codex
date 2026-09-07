import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export const USER_ID = 'firebase-user-123';
export const SESSION_ID = 'web-1234567890123456';
export const session = { user_id: USER_ID, user: { id: USER_ID, email: 'detective@example.com' } };

export function authorityDB(profile = {}, options = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_initial.sql', '0002_reset_for_firebase.sql', '0003_profile_operations.sql', '0004_authoritative_state.sql']) {
    sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${file}`, import.meta.url), 'utf8'));
  }
  sqlite.exec('CREATE TABLE d1_migrations (name TEXT PRIMARY KEY)');
  sqlite.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run('0004_authoritative_state.sql');
  sqlite.prepare('INSERT INTO users(id,email) VALUES (?,?)').run(USER_ID, session.user.email);
  sqlite.prepare('INSERT INTO users(id,email) VALUES (?,?)').run('another-user-123', 'another@example.com');
  sqlite.prepare('INSERT INTO profiles(user_id,profile_json,active_session_id) VALUES (?,?,?)')
    .run(USER_ID, typeof profile === 'string' ? profile : JSON.stringify(profile), SESSION_ID);
  const prepare = sql => {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { return this.execute(); },
      execute() { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; },
    };
  };
  return {
    sqlite, prepare,
    async batch(statements) {
      options.beforeBatch?.(sqlite);
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.execute());
        if (options.failBatch?.()) throw new Error('Simulated storage failure');
        sqlite.exec('COMMIT');
        return results;
      } catch (cause) {
        sqlite.exec('ROLLBACK');
        throw cause;
      }
    },
    profile(userId = USER_ID) { return sqlite.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId); },
    count(table) { return sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n; },
  };
}

export function request(body) {
  return new Request('https://game.example/api/profile', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-profile-owner': 'another-user-123' },
    body: JSON.stringify({ session_id: SESSION_ID, ...body }),
  });
}
