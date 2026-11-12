import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function openStore(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      google_sub TEXT UNIQUE, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_codes (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauth_flows (
      state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, nonce TEXT NOT NULL,
      user_id TEXT, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauth_clients (
      state_hash TEXT PRIMARY KEY REFERENCES oauth_flows(state_hash) ON DELETE CASCADE,
      challenge TEXT NOT NULL, client_state TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS login_tickets (
      code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS document_history (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, revision INTEGER NOT NULL,
      body TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id, revision)
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL
    );`);
  return db;
}

export function consumeRate(db, key, maximum, windowMs, now) {
  const row = db.prepare('SELECT * FROM rate_limits WHERE key=?').get(key);
  if (row && row.resets_at > now && row.count >= maximum) return false;
  db.prepare(`INSERT INTO rate_limits(key,count,resets_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN resets_at<=? THEN 1 ELSE count+1 END,
    resets_at=CASE WHEN resets_at<=? THEN excluded.resets_at ELSE resets_at END`).run(key, now + windowMs, now, now);
  return true;
}

export function saveDocument(db, userId, expectedRevision, body, now) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const previous = db.prepare('SELECT * FROM documents WHERE user_id=?').get(userId);
    if ((previous?.revision || 0) !== expectedRevision) {
      db.exec('ROLLBACK'); return null;
    }
    const revision = expectedRevision + 1, updatedAt = new Date(now).toISOString();
    if (previous) db.prepare('INSERT OR IGNORE INTO document_history VALUES(?,?,?,?)')
      .run(userId, previous.revision, previous.body, previous.updated_at);
    db.prepare(`INSERT INTO documents VALUES(?,?,?,?) ON CONFLICT(user_id)
      DO UPDATE SET body=excluded.body,revision=excluded.revision,updated_at=excluded.updated_at`)
      .run(userId, body, revision, updatedAt);
    db.prepare('DELETE FROM document_history WHERE user_id=? AND revision<?').run(userId, revision - 10);
    db.exec('COMMIT');
    return { revision, updatedAt };
  } catch (err) { db.exec('ROLLBACK'); throw err; }
}
