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
});

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T> {
  const [rows] = await pool.execute(sql, params as (string | number | null | boolean)[]);
  return rows as T;
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
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS services (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      price VARCHAR(50) NOT NULL,
      duration INT NOT NULL,
      \`desc\` TEXT,
      emoji TEXT
    )
  `);
  try {
    await pool.execute('ALTER TABLE services ADD COLUMN emoji TEXT');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.execute('ALTER TABLE services MODIFY COLUMN emoji TEXT');
  } catch {
    /* migración no crítica */
  }
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
      'ALTER TABLE barbers ADD COLUMN commission_percent DECIMAL(6,2) NOT NULL DEFAULT 0'
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS shop_settings (
      id INT PRIMARY KEY DEFAULT 1,
      cutoff_hours INT NOT NULL DEFAULT 12,
      open_weekdays VARCHAR(64) NOT NULL DEFAULT '1,2,3,4,5,6,7',
      deposit_percent DECIMAL(5,2) NOT NULL DEFAULT 30
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
      "INSERT IGNORE INTO shop_settings (id, cutoff_hours, open_weekdays, deposit_percent) VALUES (1, 12, '1,2,3,4,5,6,7', 30)"
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
    for (const [id, name, price, duration, desc] of services) {
      await pool.execute(
        'INSERT INTO services (id, name, price, duration, `desc`, emoji) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name, price, duration, desc, '✂️']
      );
    }
  }

  const [barberRows] = await pool.execute('SELECT COUNT(*) as count FROM barbers');
  const barberCount = (barberRows as { count: number }[])[0].count;
  if (barberCount === 0) {
    const barbers = [
      ['barber_1', 'Agus', 'Master Barber', 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?q=80&w=500&auto=format&fit=crop', 'Especialista en cortes clásicos y perfilado de barba.'],
      ['barber_2', 'Valen', 'Senior Barber', 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=500&auto=format&fit=crop', 'Experto en degradados y estilos urbanos modernos.'],
      ['barber_3', 'Toni', 'Barber', 'https://images.unsplash.com/photo-1605406575497-015ab0d21b9b?q=80&w=500&auto=format&fit=crop', 'Detallista y perfeccionista. Especialista en tijera.'],
    ];
    for (const [id, name, role, photo, desc] of barbers) {
      await pool.execute(
        'INSERT INTO barbers (id, name, role, photo, `desc`) VALUES (?, ?, ?, ?, ?)',
        [id, name, role, photo, desc]
      );
    }
  }
}

export default pool;
