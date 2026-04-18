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

app.get('/api/overview', asyncHandler(async (req, res) => {
  const connections = store.readConnections();
  const scripts = scriptService.getScripts().map((item) => ({ ...item, execution: scriptService.getExecution(item.id) }));
  const settings = store.readSettings();
  let subTypeSummary = [];
  if (settings.overviewConnectionId && settings.overviewTableName) {
    try {
      const connection = getConnection(settings.overviewConnectionId);
      subTypeSummary = await dbService.getSubTypeSummary(connection, settings.overviewTableName);
    } catch {
      subTypeSummary = [];
    }
  }
  res.json({
    appName: 'Data Manager',
    adminerUrl: env.adminerUrl,
    mappedRoots: { data: env.dataRoot, scripts: env.scriptsRoot, logs: env.logsRoot },
    stats: {
      connections: connections.length,
      enabledConnections: connections.filter((item) => item.enabled).length,
      scripts: scripts.length,
      runningScripts: scripts.filter((item) => item.execution?.status === 'running').length,
    },
    connections,
    scripts,
    settings,
    subTypeSummary,
  });
}));

app.get('/api/settings', (req, res) => {
  res.json(store.readSettings());
});

app.post('/api/settings', (req, res) => {
  const next = store.writeSettings(req.body || {});
  res.json(next);
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
  if (index >= 0) connections[index] = next; else connections.push(next);
  store.writeConnections(connections);
  res.json(next);
});

app.delete('/api/connections/:id', (req, res) => {
  const connections = store.readConnections();
  const next = connections.filter((item) => item.id !== req.params.id);
  if (next.length === connections.length) return res.status(404).json({ message: 'Connection not found.' });
  store.writeConnections(next);
  res.json({ ok: true });
});

app.post('/api/connections/:id/test', asyncHandler(async (req, res) => {
  res.json(await dbService.testConnection(getConnection(req.params.id)));
}));

app.get('/api/connections/:id/tables', asyncHandler(async (req, res) => {
  res.json(await dbService.listTables(getConnection(req.params.id)));
}));

app.get('/api/connections/:id/tables/:tableName/columns', asyncHandler(async (req, res) => {
  res.json(await dbService.listColumns(getConnection(req.params.id), decodeURIComponent(req.params.tableName)));
}));

app.get('/api/connections/:id/tables/:tableName/rows', asyncHandler(async (req, res) => {
  const connection = getConnection(req.params.id);
  const result = await dbService.getTableRows(
    connection,
    decodeURIComponent(req.params.tableName),
    req.query.limit || 200,
    req.query.offset || 0,
    req.query.filterColumn || '',
    req.query.filterValue || '',
    req.query.sortDirection || 'asc',
  );
  res.json(result);
}));

app.get('/api/connections/:id/tables/:tableName/sub-type-summary', asyncHandler(async (req, res) => {
  const rows = await dbService.getSubTypeSummary(getConnection(req.params.id), decodeURIComponent(req.params.tableName));
  res.json(rows);
}));

app.post('/api/connections/:id/query', asyncHandler(async (req, res) => {
  res.json(await dbService.executeSql(getConnection(req.params.id), req.body.sql));
}));

app.post('/api/files/browse', (req, res) => {
  const rootType = req.body.rootType || 'data';
  const relativePath = req.body.relativePath || '.';
  const root = rootType === 'scripts' ? env.scriptsRoot : rootType === 'logs' ? env.logsRoot : env.dataRoot;
  res.json(fileService.listDirectory(root, relativePath));
});

app.post('/api/compare', asyncHandler(async (req, res) => {
  const { connectionId, tableName, filePath, keyField, limit = 500 } = req.body;
  const fileRows = fileService.readStructuredFile(env.dataRoot, filePath);
  const dbResult = await dbService.getTableRows(getConnection(connectionId), tableName, limit);
  res.json(compareService.diffRecords(fileRows, dbResult.rows || [], keyField));
}));

app.post('/api/compare/sync', asyncHandler(async (req, res) => {
  const { connectionId, tableName, rows } = req.body;
  res.json(await dbService.upsertRows(getConnection(connectionId), tableName, (rows || []).map((item) => item.row || item)));
}));

app.get('/api/scripts', (req, res) => {
  res.json(scriptService.getScripts().map((item) => ({ ...item, execution: scriptService.getExecution(item.id) })));
});

app.post('/api/scripts', (req, res) => {
  res.json(scriptService.upsertScript(req.body));
});

app.delete('/api/scripts/:id', (req, res) => {
  res.json(scriptService.deleteScript(req.params.id));
});

app.post('/api/scripts/:id/run', asyncHandler(async (req, res) => {
  res.json(await scriptService.runScript(req.params.id));
}));

app.get('/api/scripts/:id/logs', (req, res) => {
  res.type('text/plain').send(scriptService.getLogs(req.params.id));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((error, req, res, next) => {
  res.status(error.status || 500).json({ message: error.message || 'Unexpected error' });
});

app.listen(env.port, () => {
  console.log(`Data Manager listening on port ${env.port}`);
});
