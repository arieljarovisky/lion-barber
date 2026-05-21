import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER ?? 'root',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE ?? 'lion_barber',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  /** Evita que DATE se convierta en Date de JS (medianoche UTC) y al serializar JSON se corra un día. */
  dateStrings: true,
});

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T> {
  const [rows] = await pool.execute(sql, params as (string | number | null | boolean)[]);
  return rows as T;
}

async function tableHasColumn(table: string, column: string): Promise<boolean> {
  const rows = await query<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0]?.n) > 0;
}

/** monotributo_annual_limit → monotributo_monthly_limit (idempotente). */
async function migrateMonotributoLimitColumns(): Promise<void> {
  const hasAnnual = await tableHasColumn('barbers', 'monotributo_annual_limit');
  const hasMonthly = await tableHasColumn('barbers', 'monotributo_monthly_limit');

  if (hasAnnual && !hasMonthly) {
    await pool.execute(
      'ALTER TABLE barbers CHANGE COLUMN monotributo_annual_limit monotributo_monthly_limit DECIMAL(14,2) NULL'
    );
    return;
  }

  if (!hasMonthly) {
    try {
      await pool.execute('ALTER TABLE barbers ADD COLUMN monotributo_monthly_limit DECIMAL(14,2) NULL');
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
    }
    return;
  }

  if (hasAnnual && hasMonthly) {
    await pool.execute(
      `UPDATE barbers
       SET monotributo_monthly_limit = COALESCE(monotributo_monthly_limit, monotributo_annual_limit)
       WHERE monotributo_annual_limit IS NOT NULL`
    );
    try {
      await pool.execute('ALTER TABLE barbers DROP COLUMN monotributo_annual_limit');
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code !== 'ER_BAD_FIELD_ERROR' && code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw e;
    }
  }
}

export async function initDb(): Promise<void> {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      google_uid VARCHAR(128) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role ENUM('client', 'admin', 'staff') NOT NULL DEFAULT 'client',
      points INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    await pool.execute(
      "ALTER TABLE users MODIFY COLUMN role ENUM('client', 'admin', 'staff') NOT NULL DEFAULT 'client'"
    );
  } catch {
    /* Base ya migrada o motor distinto */
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS staff_invites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    await pool.execute('ALTER TABLE users ADD COLUMN points INT NOT NULL DEFAULT 0');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE users ADD COLUMN barber_id VARCHAR(50) NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE staff_invites ADD COLUMN barber_id VARCHAR(50) NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE users MODIFY google_uid VARCHAR(128) NULL');
  } catch {
    /* ya aplicado o motor distinto */
  }
  try {
    await pool.execute('ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE users ADD COLUMN phone VARCHAR(50) NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute("ALTER TABLE users ADD COLUMN deposit_exempt TINYINT(1) NOT NULL DEFAULT 0");
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE users ADD COLUMN admin_notes TEXT NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS client_phones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      phone VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_client_phone (user_id, phone),
      KEY idx_client_phone_user (user_id),
      KEY idx_client_phone_phone (phone)
    )
  `);
  /**
   * Migración legacy: copia el teléfono principal viejo a la tabla de teléfonos.
   * Se permite el mismo número entre distintos clientes (solo se evita duplicado exacto por cliente).
   */
  await pool.execute(`
    INSERT IGNORE INTO client_phones (user_id, phone)
    SELECT id, TRIM(phone)
    FROM users
    WHERE role = 'client' AND phone IS NOT NULL AND TRIM(phone) <> ''
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS services (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      price VARCHAR(50) NOT NULL,
      duration INT NOT NULL,
      \`desc\` TEXT,
      emoji MEDIUMTEXT,
      sort_order INT NOT NULL DEFAULT 0
    )
  `);
  try {
    await pool.execute('ALTER TABLE services ADD COLUMN emoji MEDIUMTEXT NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE services ADD COLUMN sort_order INT NOT NULL DEFAULT 0');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  /** Tablas antiguas: emoji a veces quedó VARCHAR corto y falla al guardar SVG/URL largos. */
  await pool.execute('ALTER TABLE services MODIFY COLUMN emoji MEDIUMTEXT NULL');
  await pool.execute('ALTER TABLE services MODIFY COLUMN sort_order INT NOT NULL DEFAULT 0');
  try {
    await pool.execute('ALTER TABLE services ADD COLUMN points_reward INT NOT NULL DEFAULT 0');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS shop_products (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      points_reward INT NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    await pool.execute('ALTER TABLE shop_products ADD COLUMN unit_price VARCHAR(50) NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS points_redemption_options (
      id VARCHAR(50) PRIMARY KEY,
      label VARCHAR(255) NOT NULL,
      points_cost INT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    )
  `);
  /**
   * Si sort_order quedó en 0 para todos (migración vieja), se asigna un orden estable por nombre.
   * Se usa tabla temporal con ROW_NUMBER para MySQL 8+.
   */
  await pool.execute(`
    UPDATE services s
    JOIN (
      SELECT id, ROW_NUMBER() OVER (ORDER BY name, id) AS rn
      FROM services
    ) ord ON ord.id = s.id
    SET s.sort_order = ord.rn
    WHERE s.sort_order = 0
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS barbers (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(100) NOT NULL,
      photo VARCHAR(500),
      \`desc\` TEXT
    )
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      service VARCHAR(255) NOT NULL,
      barber VARCHAR(255),
      barber_id VARCHAR(50),
      date DATE NOT NULL,
      time VARCHAR(10) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    await pool.execute('ALTER TABLE appointments ADD COLUMN user_id INT NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE appointments ADD COLUMN duration_minutes INT NOT NULL DEFAULT 30');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE appointments ADD COLUMN service_id VARCHAR(50) NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE appointments ADD COLUMN deposit_paid TINYINT(1) NOT NULL DEFAULT 0');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute(
      'ALTER TABLE appointments ADD COLUMN mercadopago_payment_id VARCHAR(64) NULL UNIQUE'
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute(
      "ALTER TABLE appointments ADD COLUMN status ENUM('scheduled','pending_payment','cancelled') NOT NULL DEFAULT 'scheduled'"
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute(
      "ALTER TABLE appointments MODIFY COLUMN status ENUM('scheduled','pending_payment','cancelled') NOT NULL DEFAULT 'scheduled'"
    );
  } catch {
    /* motor sin cambios o enum ya actualizado */
  }
  try {
    await pool.execute('ALTER TABLE appointments ADD COLUMN payment_due_at DATETIME NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute(
      'ALTER TABLE barbers ADD COLUMN commission_percent DECIMAL(6,2) NOT NULL DEFAULT 50'
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute(
      'UPDATE barbers SET commission_percent = 50 WHERE commission_percent IS NULL OR commission_percent = 0'
    );
  } catch {
    /* columna puede no existir aún en el primer arranque */
  }
  try {
    await pool.execute('ALTER TABLE barbers ADD COLUMN monotributo_category VARCHAR(64) NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  await migrateMonotributoLimitColumns();
  try {
    await pool.execute('ALTER TABLE barbers ADD COLUMN whatsapp_phone VARCHAR(32) NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE barbers ADD COLUMN afip_cuit VARCHAR(11) NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE barbers ADD COLUMN afip_pto_vta SMALLINT NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE barbers ADD COLUMN afip_cbte_tipo SMALLINT NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE barbers ADD COLUMN afip_cert MEDIUMTEXT NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE barbers ADD COLUMN afip_key MEDIUMTEXT NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE barbers ADD COLUMN afip_access_token VARCHAR(512) NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE appointments ADD COLUMN afip_cae VARCHAR(20) NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE appointments ADD COLUMN afip_cae_vto DATE NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE appointments ADD COLUMN afip_cbte_nro INT NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE appointments ADD COLUMN afip_pto_vta SMALLINT NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE appointments ADD COLUMN afip_facturado_at DATETIME NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE appointments ADD COLUMN afip_invoice_detail MEDIUMTEXT NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute(
      'ALTER TABLE appointments ADD COLUMN reminder_1h_sent TINYINT(1) NOT NULL DEFAULT 0'
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute(
      "ALTER TABLE appointments ADD COLUMN service_payment_method VARCHAR(32) NULL"
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute(
      'ALTER TABLE appointments ADD COLUMN service_payment_splits JSON NULL'
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute(
      'ALTER TABLE appointments ADD COLUMN client_chose_any_barber TINYINT(1) NOT NULL DEFAULT 0'
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute(
      'ALTER TABLE appointments ADD COLUMN tip_amount DECIMAL(12,2) NOT NULL DEFAULT 0'
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS shop_settings (
      id INT PRIMARY KEY DEFAULT 1,
      cutoff_hours INT NOT NULL DEFAULT 12,
      open_weekdays VARCHAR(64) NOT NULL DEFAULT '1,2,3,4,5,6,7',
      deposit_percent DECIMAL(5,2) NOT NULL DEFAULT 30,
      close_time VARCHAR(5) NOT NULL DEFAULT '20:00',
      weekday_hours TEXT NULL
    )
  `);
  try {
    await pool.execute(
      'ALTER TABLE shop_settings ADD COLUMN deposit_percent DECIMAL(5,2) NOT NULL DEFAULT 30'
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute(
      "ALTER TABLE shop_settings ADD COLUMN close_time VARCHAR(5) NOT NULL DEFAULT '20:00'"
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE shop_settings ADD COLUMN weekday_hours TEXT NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE shop_settings ADD COLUMN closed_dates TEXT NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE shop_settings ADD COLUMN whatsapp_message_template MEDIUMTEXT NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute(
      "INSERT IGNORE INTO shop_settings (id, cutoff_hours, open_weekdays, deposit_percent, close_time) VALUES (1, 12, '1,2,3,4,5,6,7', 30, '20:00')"
    );
  } catch {
    /* ya existe */
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS barber_francos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      barber_id VARCHAR(50) NOT NULL,
      weekday TINYINT NOT NULL COMMENT '1=Lun ... 7=Dom',
      UNIQUE KEY uq_barber_franco (barber_id, weekday)
    )
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS barber_time_blocks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      barber_id VARCHAR(50) NOT NULL,
      block_date DATE NULL,
      weekday TINYINT NULL COMMENT '1=Lun ... 7=Dom, repetición semanal si block_date NULL',
      time_start VARCHAR(5) NOT NULL,
      time_end VARCHAR(5) NOT NULL
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS fixed_monthly_expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(14,2) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cash_expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      expense_date DATE NOT NULL,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(14,2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_cash_expense_date (expense_date)
    )
  `);

  const serviceCountRows = await query<{ count: number }[]>('SELECT COUNT(*) as count FROM services');
  if (serviceCountRows[0].count === 0) {
    const services = [
      ['corte', 'Corte de cabello', '$20.000', 30, 'Corte clásico o degradado con terminaciones a navaja.'],
      ['corte_ninos', 'Corte de niños 0 a 6', '$22.000', 30, 'Corte especial para los más pequeños.'],
      ['cabellos_largos', 'Cabellos largos 10cm', '$22.000', 45, 'Corte y estilizado para cabellos largos.'],
      ['arreglo_barba', 'Arreglo de barba', '$10.000', 30, 'Perfilado, rebaje y toallas calientes.'],
      ['perfilado_cejas', 'Perfilado de cejas', '$1.000', 15, 'Diseño y perfilado de cejas.'],
      ['rapado', 'Rapado', '$10.000', 20, 'Rapado completo a máquina.'],
      ['afeitado_tradicional', 'Afeitado tradicional', '$8.000', 30, 'Afeitado clásico con navaja y toallas calientes.'],
    ];
    let sortOrder = 1;
    for (const [id, name, price, duration, desc] of services) {
      await pool.execute(
        'INSERT INTO services (id, name, price, duration, `desc`, emoji, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, name, price, duration, desc, '✂️', sortOrder]
      );
      sortOrder += 1;
    }
  }

  const [barberRows] = await pool.execute('SELECT COUNT(*) as count FROM barbers');
  const barberCount = (barberRows as { count: number }[])[0].count;
  if (barberCount === 0) {
    const barbers = [
      ['barber_1', 'Agus', 'Master Barber', '/barbers/agus.png', 'Especialista en cortes clásicos y perfilado de barba.'],
      ['barber_2', 'Valen', 'Senior Barber', '/barbers/valen.png', 'Experto en degradados y estilos urbanos modernos.'],
      ['barber_3', 'Toni', 'Barber', '/barbers/toni.png', 'Detallista y perfeccionista. Especialista en tijera.'],
    ];
    for (const [id, name, role, photo, desc] of barbers) {
      await pool.execute(
        'INSERT INTO barbers (id, name, role, photo, `desc`) VALUES (?, ?, ?, ?, ?)',
        [id, name, role, photo, desc]
      );
    }
  }
  await pool.execute('UPDATE barbers SET photo = ? WHERE id = ?', ['/barbers/agus.png', 'barber_1']);
  await pool.execute('UPDATE barbers SET photo = ? WHERE id = ?', ['/barbers/valen.png', 'barber_2']);
  await pool.execute('UPDATE barbers SET photo = ? WHERE id = ?', ['/barbers/toni.png', 'barber_3']);

  const { importLegacyAfipEnvToBarbers } = await import('./importLegacyAfipEnv.js');
  await importLegacyAfipEnvToBarbers();
  const { syncSuperAdminBarberLinks } = await import('./invoiceBarberScope.js');
  await syncSuperAdminBarberLinks();
}

export default pool;
