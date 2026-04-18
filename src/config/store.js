import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

const files = {
  connections: path.join(env.storageRoot, 'connections.json'),
  scripts: path.join(env.storageRoot, 'scripts.json'),
  settings: path.join(env.storageRoot, 'settings.json'),
};

const defaults = {
  connections: [],
  scripts: [],
  settings: {
    backgroundUrls: [],
    rotateSeconds: 30,
    overviewConnectionId: '',
    overviewTableName: '',
  },
};

function ensureFile(name) {
  const file = files[name];
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaults[name], null, 2));
  }
}

function readJson(name) {
  ensureFile(name);
  return JSON.parse(fs.readFileSync(files[name], 'utf8'));
}

function writeJson(name, data) {
  fs.writeFileSync(files[name], JSON.stringify(data, null, 2));
  return data;
}

export const store = {
  readConnections() {
    return readJson('connections');
  },
  writeConnections(data) {
    return writeJson('connections', data);
  },
  readScripts() {
    return readJson('scripts');
  },
  writeScripts(data) {
    return writeJson('scripts', data);
  },
  readSettings() {
    return { ...defaults.settings, ...readJson('settings') };
  },
  writeSettings(data) {
    return writeJson('settings', { ...defaults.settings, ...data });
  },
};
