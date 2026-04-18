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
      select table_schema, table_name
      from information_schema.tables
      where table_schema not in ('pg_catalog', 'information_schema')
      order by table_schema, table_name
    `);
  }

  return query(profile, `
    select table_schema, table_name
    from information_schema.tables
    where table_schema = database()
    order by table_name
  `);
}

async function getTableRows(profile, tableName, limit = 200) {
  const sql = profile.client === 'postgres'
    ? `select * from ${tableName} limit ${Number(limit)}`
    : `select * from \`${tableName.replaceAll('`', '')}\` limit ${Number(limit)}`;
  return query(profile, sql);
}

async function upsertRows(profile, tableName, rows) {
  if (!rows.length) {
    return { affectedRows: 0 };
  }

  if (profile.client === 'postgres') {
    throw new Error('PostgreSQL auto-sync is not implemented yet. Use SQL inside Adminer.');
  }

  const columns = Object.keys(rows[0]);
  const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
  const values = rows.flatMap((row) => columns.map((column) => row[column] ?? null));
  const updates = columns.map((column) => `\`${column}\` = values(\`${column}\`)`).join(', ');
  const sql = `insert into \`${tableName.replaceAll('`', '')}\` (${columns.map((column) => `\`${column}\``).join(', ')}) values ${placeholders} on duplicate key update ${updates}`;

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
  upsertRows,
};
