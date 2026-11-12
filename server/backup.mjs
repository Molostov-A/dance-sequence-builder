import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { readConfig } from './config.mjs';

const config = readConfig();
const destination = path.resolve(process.argv[2] || './backups/dance-' + new Date().toISOString().replace(/[:.]/g, '-') + '.sqlite');
if (destination === config.database) throw new Error('Резервная копия должна иметь другое имя.');
await mkdir(path.dirname(destination), { recursive: true });
const db = new DatabaseSync(config.database, { readOnly: true });
try { await backup(db, destination); console.log('SQLite backup created: ' + destination); }
finally { db.close(); }
