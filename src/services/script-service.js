import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import cron from 'node-cron';
import { env } from '../config/env.js';
import { store } from '../config/store.js';
import { fileService } from './file-service.js';

const jobs = new Map();
const executions = new Map();

function logPathFor(scriptId) {
  return path.join(env.logsRoot, `${scriptId}.log`);
}

function appendLog(scriptId, line) {
  fs.appendFileSync(logPathFor(scriptId), `[${new Date().toISOString()}] ${line}\n`);
}

function getScripts() {
  return store.readScripts();
}

function saveScripts(scripts) {
  store.writeScripts(scripts);
  return scripts;
}

function resolveRuntime(script, absoluteFile) {
  const runtime = (script.runtime || '').trim().toLowerCase();
  const ext = path.extname(absoluteFile).toLowerCase();

  if (runtime === 'python' || ext === '.py') {
    return process.platform === 'win32'
      ? { command: 'python', args: [absoluteFile] }
      : { command: 'python3', args: [absoluteFile] };
  }

  if (runtime === 'node' || ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    return { command: 'node', args: [absoluteFile] };
  }

  if (runtime === 'powershell' || ext === '.ps1') {
    return process.platform === 'win32'
      ? { command: 'powershell.exe', args: ['-ExecutionPolicy', 'Bypass', '-File', absoluteFile] }
      : { command: 'pwsh', args: ['-File', absoluteFile] };
  }

  if (runtime === 'shell' || ext === '.sh') {
    return { command: '/bin/sh', args: [absoluteFile] };
  }

  return process.platform === 'win32'
    ? { command: 'powershell.exe', args: ['-ExecutionPolicy', 'Bypass', '-File', absoluteFile] }
    : { command: absoluteFile, args: [] };
}

function scheduleScript(script) {
  if (!script.enabled || !script.schedule) {
    return;
  }
  if (!cron.validate(script.schedule)) {
    appendLog(script.id, `Invalid cron expression skipped: ${script.schedule}`);
    return;
  }
  const task = cron.schedule(script.schedule, () => {
    runScript(script.id).catch((error) => appendLog(script.id, `Scheduled run failed: ${error.message}`));
  });
  jobs.set(script.id, task);
}

function refreshSchedules() {
  for (const task of jobs.values()) {
    task.stop();
  }
  jobs.clear();
  for (const script of getScripts()) {
    scheduleScript(script);
  }
}

async function runScript(scriptId) {
  const script = getScripts().find((item) => item.id === scriptId);
  if (!script) {
    throw new Error('Script not found.');
  }
  const absoluteFile = fileService.safeResolve(env.scriptsRoot, script.relativePath);
  const cwd = script.workingDirectory
    ? fileService.safeResolve(env.scriptsRoot, script.workingDirectory)
    : path.dirname(absoluteFile);
  const runtime = resolveRuntime(script, absoluteFile);

  appendLog(script.id, `Starting script: ${script.name}`);
  appendLog(script.id, `Runtime: ${runtime.command} ${runtime.args.join(' ')}`);

  const execution = { status: 'running', startedAt: new Date().toISOString(), pid: null };
  executions.set(script.id, execution);

  await new Promise((resolve, reject) => {
    const child = spawn(runtime.command, runtime.args, { cwd, env: process.env });
    execution.pid = child.pid;

    child.stdout.on('data', (data) => appendLog(script.id, data.toString().trimEnd()));
    child.stderr.on('data', (data) => appendLog(script.id, `[stderr] ${data.toString().trimEnd()}`));
    child.on('error', reject);
    child.on('close', (code) => {
      execution.status = code === 0 ? 'success' : 'failed';
      execution.finishedAt = new Date().toISOString();
      execution.exitCode = code;
      appendLog(script.id, `Finished with exit code ${code}`);
      resolve();
    });
  });

  return execution;
}

function upsertScript(payload) {
  const scripts = getScripts();
  const next = {
    id: payload.id || `script-${Date.now()}`,
    name: payload.name,
    relativePath: payload.relativePath,
    workingDirectory: payload.workingDirectory || '.',
    schedule: payload.schedule || '',
    enabled: Boolean(payload.enabled),
    description: payload.description || '',
    runtime: payload.runtime || '',
  };
  const index = scripts.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    scripts[index] = next;
  } else {
    scripts.push(next);
  }
  saveScripts(scripts);
  refreshSchedules();
  return next;
}

function deleteScript(scriptId) {
  const scripts = getScripts();
  const next = scripts.filter((item) => item.id !== scriptId);
  if (next.length === scripts.length) {
    throw new Error('Script not found.');
  }
  const task = jobs.get(scriptId);
  if (task) {
    task.stop();
    jobs.delete(scriptId);
  }
  saveScripts(next);
  executions.delete(scriptId);
  return { ok: true };
}

function getLogs(scriptId) {
  const file = logPathFor(scriptId);
  if (!fs.existsSync(file)) {
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

refreshSchedules();

export const scriptService = {
  getScripts,
  upsertScript,
  deleteScript,
  runScript,
  getLogs,
  refreshSchedules,
  getExecution(scriptId) {
    return executions.get(scriptId) || null;
  },
};
