import fs from 'node:fs';
import path from 'node:path';

function normalizeDir(value, fallback) {
  return path.resolve(value || fallback);
}

export const env = {
  port: Number(process.env.PORT || 3000),
  adminerUrl: process.env.ADMINER_URL || 'http://localhost:8080',
  dataRoot: normalizeDir(process.env.DATA_ROOT, path.resolve(process.cwd(), 'data')),
  scriptsRoot: normalizeDir(process.env.SCRIPTS_ROOT, path.resolve(process.cwd(), 'scripts')),
  logsRoot: normalizeDir(process.env.LOGS_ROOT, path.resolve(process.cwd(), 'logs')),
  storageRoot: normalizeDir(process.env.STORAGE_ROOT, path.resolve(process.cwd(), 'storage')),
  defaultDbClient: process.env.DEFAULT_DB_CLIENT || 'mysql',
};

for (const dir of [env.dataRoot, env.scriptsRoot, env.logsRoot, env.storageRoot]) {
  fs.mkdirSync(dir, { recursive: true });
}
