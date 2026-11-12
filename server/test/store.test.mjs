import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backup } from 'node:sqlite';
import { openStore, saveDocument } from '../store.mjs';

test('SQLite persists data, revisions and sessions across restart; online backup includes recent writes', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'dance-db-test-'));
  const file = path.join(directory, 'data.sqlite'), copy = path.join(directory, 'backup.sqlite');
  let db = openStore(file);
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('user', 'user@example.com', 'User', null, Date.now());
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('token-hash', 'user', 'csrf', Date.now() + 60000);
  for (let revision = 0; revision < 15; revision++) {
    assert.equal(saveDocument(db, 'user', revision, JSON.stringify({ name: 'v' + (revision + 1) }), Date.now()).revision, revision + 1);
  }
  assert.equal(saveDocument(db, 'user', 1, '{"name":"stale"}', Date.now()), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM document_history').get().count, 10);
  await backup(db, copy); db.close(); db = openStore(file);
  assert.equal(db.prepare('SELECT revision FROM documents').get().revision, 15);
  assert.equal(db.prepare('SELECT user_id FROM sessions').get().user_id, 'user'); db.close();
  const restored = openStore(copy);
  assert.equal(JSON.parse(restored.prepare('SELECT body FROM documents').get().body).name, 'v15'); restored.close();
});
