import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { store } from './config/store.js';
import { dbService } from './services/db-service.js';
import { fileService } from './services/file-service.js';
import { compareService } from './services/compare-service.js';
import { scriptService } from './services/script-service.js';
import { asyncHandler } from './routes/helpers.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(publicDir));

function getConnection(id) {
  const connection = store.readConnections().find((item) => item.id === id);
  if (!connection) {
    const error = new Error('Connection not found.');
    error.status = 404;
    throw error;
  }
  return connection;
}

app.get('/api/overview', (req, res) => {
  const connections = store.readConnections();
  const scripts = store.readScripts();
  res.json({
    appName: 'Data Manager',
    adminerUrl: env.adminerUrl,
    mappedRoots: {
      data: env.dataRoot,
      scripts: env.scriptsRoot,
      logs: env.logsRoot,
    },
    stats: {
      connections: connections.length,
      enabledConnections: connections.filter((item) => item.enabled).length,
      scripts: scripts.length,
      scheduledScripts: scripts.filter((item) => item.enabled && item.schedule).length,
    },
  });
});

app.get('/api/connections', (req, res) => {
  res.json(store.readConnections());
});

app.post('/api/connections', (req, res) => {
  const payload = req.body;
  const connections = store.readConnections();
  const next = {
    id: payload.id || `conn-${Date.now()}`,
    name: payload.name,
    client: payload.client || 'mysql',
    host: payload.host,
    port: Number(payload.port),
    user: payload.user,
    password: payload.password,
    database: payload.database,
    enabled: Boolean(payload.enabled),
  };
  const index = connections.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    connections[index] = next;
  } else {
    connections.push(next);
  }
  store.writeConnections(connections);
  res.json(next);
});

app.post('/api/connections/:id/test', asyncHandler(async (req, res) => {
  const connection = getConnection(req.params.id);
  const result = await dbService.testConnection(connection);
  res.json(result);
}));

app.get('/api/connections/:id/tables', asyncHandler(async (req, res) => {
  const connection = getConnection(req.params.id);
  const rows = await dbService.listTables(connection);
  res.json(rows);
}));

app.post('/api/files/browse', (req, res) => {
  const rootType = req.body.rootType || 'data';
  const relativePath = req.body.relativePath || '.';
  const root = rootType === 'scripts' ? env.scriptsRoot : env.dataRoot;
  res.json(fileService.listDirectory(root, relativePath));
});

app.post('/api/compare', asyncHandler(async (req, res) => {
  const { connectionId, tableName, filePath, keyField, limit = 500 } = req.body;
  const connection = getConnection(connectionId);
  const fileRows = fileService.readStructuredFile(env.dataRoot, filePath);
  const dbRows = await dbService.getTableRows(connection, tableName, limit);
  const diff = compareService.diffRecords(fileRows, dbRows, keyField);
  res.json(diff);
}));

app.post('/api/compare/sync', asyncHandler(async (req, res) => {
  const { connectionId, tableName, rows } = req.body;
  const connection = getConnection(connectionId);
  const result = await dbService.upsertRows(connection, tableName, rows || []);
  res.json(result);
}));

app.get('/api/scripts', (req, res) => {
  const scripts = scriptService.getScripts().map((item) => ({
    ...item,
    execution: scriptService.getExecution(item.id),
  }));
  res.json(scripts);
});

app.post('/api/scripts', (req, res) => {
  const script = scriptService.upsertScript(req.body);
  res.json(script);
});

app.post('/api/scripts/:id/run', asyncHandler(async (req, res) => {
  const execution = await scriptService.runScript(req.params.id);
  res.json(execution);
}));

app.get('/api/scripts/:id/logs', (req, res) => {
  res.type('text/plain').send(scriptService.getLogs(req.params.id));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((error, req, res, next) => {
  res.status(error.status || 500).json({
    message: error.message || 'Unexpected error',
  });
});

app.listen(env.port, () => {
  console.log(`Data Manager listening on port ${env.port}`);
});
