import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

function safeResolve(root, target = '.') {
  const resolved = path.resolve(root, target);
  if (!resolved.startsWith(root)) {
    throw new Error('Path is outside mapped root.');
  }
  return resolved;
}

function listDirectory(root, relativePath = '.') {
  const absolutePath = safeResolve(root, relativePath);
  const entries = fs.readdirSync(absolutePath, { withFileTypes: true }).map((entry) => {
    const entryPath = path.join(absolutePath, entry.name);
    const stats = fs.statSync(entryPath);
    return {
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      relativePath: path.relative(root, entryPath) || '.',
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    };
  });

  return {
    root,
    currentPath: path.relative(root, absolutePath) || '.',
    entries: entries.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
  };
}

function readStructuredFile(root, relativePath) {
  const absolutePath = safeResolve(root, relativePath);
  const extension = path.extname(absolutePath).toLowerCase();
  const raw = fs.readFileSync(absolutePath, 'utf8');

  if (extension === '.json') {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  if (extension === '.csv') {
    return parse(raw, { columns: true, skip_empty_lines: true, bom: true });
  }

  throw new Error('Only JSON and CSV are supported for comparison.');
}

export const fileService = {
  listDirectory,
  readStructuredFile,
  safeResolve,
};
