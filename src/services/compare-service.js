function normalizeRecord(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value == null ? null : String(value)])
  );
}

function hashRecord(record, keyField) {
  if (keyField && record[keyField] !== undefined) {
    return `${keyField}:${record[keyField]}`;
  }
  return JSON.stringify(record);
}

function diffRecords(fileRows, dbRows, keyField) {
  const normalizedFileRows = fileRows.map(normalizeRecord);
  const normalizedDbRows = dbRows.map(normalizeRecord);

  const fileMap = new Map(normalizedFileRows.map((row) => [hashRecord(row, keyField), row]));
  const dbMap = new Map(normalizedDbRows.map((row) => [hashRecord(row, keyField), row]));

  const onlyInFile = [];
  const onlyInDatabase = [];
  const changed = [];

  for (const [key, fileRow] of fileMap) {
    const dbRow = dbMap.get(key);
    if (!dbRow) {
      onlyInFile.push(fileRow);
      continue;
    }
    if (JSON.stringify(fileRow) !== JSON.stringify(dbRow)) {
      changed.push({ key, file: fileRow, database: dbRow });
    }
  }

  for (const [key, dbRow] of dbMap) {
    if (!fileMap.has(key)) {
      onlyInDatabase.push(dbRow);
    }
  }

  return {
    summary: {
      fileRows: normalizedFileRows.length,
      databaseRows: normalizedDbRows.length,
      onlyInFile: onlyInFile.length,
      onlyInDatabase: onlyInDatabase.length,
      changed: changed.length,
    },
    onlyInFile,
    onlyInDatabase,
    changed,
  };
}

export const compareService = {
  diffRecords,
};
