import pool, { query } from '../db.js';

function formatBackupTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function escapeSqlString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z')
    .replace(/'/g, "\\'");
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) {
    return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
  }
  if (Buffer.isBuffer(value)) {
    return `X'${value.toString('hex')}'`;
  }
  if (typeof value === 'object') {
    return `'${escapeSqlString(JSON.stringify(value))}'`;
  }
  return `'${escapeSqlString(String(value))}'`;
}

export type DatabaseBackupResult = {
  sql: string;
  filename: string;
  tableCount: number;
  rowCount: number;
};

/** Genera un volcado SQL (estructura + datos) de todas las tablas del esquema actual. */
export async function createDatabaseBackupSql(): Promise<DatabaseBackupResult> {
  const dbName = process.env.MYSQL_DATABASE ?? 'lion_barber';
  const generatedAt = new Date();

  const tables = await query<{ TABLE_NAME: string }[]>(
    `SELECT TABLE_NAME AS TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [dbName]
  );

  const lines: string[] = [
    '-- Lion Barber — copia de seguridad MySQL',
    `-- Generado: ${generatedAt.toISOString()}`,
    `-- Base de datos: ${dbName}`,
    '',
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
  ];

  let rowCount = 0;

  for (const { TABLE_NAME: table } of tables) {
    const createRows = await query<Record<string, string>[]>(`SHOW CREATE TABLE \`${table}\``);
    const createSql = createRows[0]?.['Create Table'] ?? createRows[0]?.['Create View'];
    if (!createSql) continue;

    lines.push(`-- Tabla: ${table}`);
    lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
    lines.push(`${createSql};`);
    lines.push('');

    const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
    const data = rows as Record<string, unknown>[];
    if (data.length === 0) continue;

    const columns = Object.keys(data[0]);
    const colList = columns.map((c) => `\`${c}\``).join(', ');

    for (const row of data) {
      const values = columns.map((c) => sqlLiteral(row[c])).join(', ');
      lines.push(`INSERT INTO \`${table}\` (${colList}) VALUES (${values});`);
      rowCount += 1;
    }
    lines.push('');
  }

  lines.push('SET FOREIGN_KEY_CHECKS = 1;', '');

  return {
    sql: lines.join('\n'),
    filename: `lion-barber-backup-${formatBackupTimestamp(generatedAt)}.sql`,
    tableCount: tables.length,
    rowCount,
  };
}
