import mysql from 'mysql2/promise';
import pg from 'pg';

const { Pool } = pg;

function toConnection(profile) {
  return {
    host: profile.host,
    port: Number(profile.port),
    user: profile.user,
    password: profile.password,
    database: profile.database,
  };
}

async function withMysql(profile, callback) {
  const connection = await mysql.createConnection(toConnection(profile));
  try {
    return await callback(connection);
  } finally {
    await connection.end();
  }
}

async function withPostgres(profile, callback) {
  const pool = new Pool(toConnection(profile));
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

function resolveRunner(profile) {
  return profile.client === 'postgres' ? withPostgres : withMysql;
}

function escapeMysqlIdentifier(value) {
  return `\`${String(value).replaceAll('`', '``')}\``;
}

function escapePostgresIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function quoteTableName(profile, tableName) {
  const normalized = String(tableName || '').trim();
  if (!normalized) {
    throw new Error('Table name is required.');
  }

  const segments = normalized.split('.').map((item) => item.trim()).filter(Boolean);
  if (!segments.length || segments.length > 2) {
    throw new Error('Invalid table name.');
  }

  if (profile.client === 'postgres') {
    return segments.map(escapePostgresIdentifier).join('.');
  }

  return escapeMysqlIdentifier(segments[segments.length - 1]);
}

async function query(profile, sql) {
  const run = resolveRunner(profile);
  if (profile.client === 'postgres') {
    return run(profile, async (pool) => {
      const result = await pool.query(sql);
      return result.rows;
    });
  }

  return run(profile, async (connection) => {
    const [rows] = await connection.query(sql);
    return rows;
  });
}

async function testConnection(profile) {
  await query(profile, profile.client === 'postgres' ? 'select current_database() as database_name' : 'select database() as database_name');
  return { ok: true };
}

async function listTables(profile) {
  if (profile.client === 'postgres') {
    return query(profile, `
      select table_schema, table_name, concat(table_schema, '.', table_name) as full_name
      from information_schema.tables
      where table_schema not in ('pg_catalog', 'information_schema')
      order by table_schema, table_name
    `);
  }

  return query(profile, `
    select table_schema, table_name, table_name as full_name
    from information_schema.tables
    where table_schema = database()
    order by table_name
  `);
}

async function getTableRows(profile, tableName, limit = 200, offset = 0) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(2000, Number(limit))) : 200;
  const safeOffset = Number.isFinite(Number(offset)) ? Math.max(0, Number(offset)) : 0;
  const quotedTable = quoteTableName(profile, tableName);
  const rows = await query(profile, `select * from ${quotedTable} limit ${safeLimit} offset ${safeOffset}`);
  const countSql = profile.client === 'postgres'
    ? `select count(*)::int as total from ${quotedTable}`
    : `select count(*) as total from ${quotedTable}`;
  const countRows = await query(profile, countSql);
  return {
    rows,
    pagination: {
      limit: safeLimit,
      offset: safeOffset,
      total: Number(countRows[0]?.total || 0),
    },
  };
}

async function executeSql(profile, sql) {
  const trimmed = String(sql || '').trim();
  if (!trimmed) {
    throw new Error('SQL is required.');
  }

  if (profile.client === 'postgres') {
    return withPostgres(profile, async (pool) => {
      const result = await pool.query(trimmed);
      return {
        command: result.command,
        rowCount: result.rowCount ?? 0,
        fields: result.fields?.map((field) => field.name) || [],
        rows: result.rows || [],
      };
    });
  }

  return withMysql(profile, async (connection) => {
    const [rows, fields] = await connection.query(trimmed);
    if (Array.isArray(rows)) {
      return {
        command: 'SELECT',
        rowCount: rows.length,
        fields: (fields || []).map((field) => field.name),
        rows,
      };
    }

    return {
      command: trimmed.split(/\s+/)[0]?.toUpperCase() || 'QUERY',
      rowCount: rows.affectedRows ?? 0,
      affectedRows: rows.affectedRows ?? 0,
      insertId: rows.insertId ?? null,
      fields: [],
      rows: [],
    };
  });
}

async function upsertRows(profile, tableName, rows) {
  if (!rows.length) {
    return { affectedRows: 0 };
  }

  if (profile.client === 'postgres') {
    throw new Error('PostgreSQL auto-sync is not implemented yet. Use SQL inside Adminer or SQL console.');
  }

  const columns = Object.keys(rows[0]);
  const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
  const values = rows.flatMap((row) => columns.map((column) => row[column] ?? null));
  const updates = columns.map((column) => `${escapeMysqlIdentifier(column)} = values(${escapeMysqlIdentifier(column)})`).join(', ');
  const sql = `insert into ${quoteTableName(profile, tableName)} (${columns.map((column) => escapeMysqlIdentifier(column)).join(', ')}) values ${placeholders} on duplicate key update ${updates}`;

  return withMysql(profile, async (connection) => {
    const [result] = await connection.query(sql, values);
    return { affectedRows: result.affectedRows };
  });
}

export const dbService = {
  query,
  testConnection,
  listTables,
  getTableRows,
  executeSql,
  upsertRows,
};
