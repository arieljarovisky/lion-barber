import { readFileSync } from 'node:fs';
import {
  DEFAULT_BARBER_AFIP_CBTE_TIPO,
  DEFAULT_BARBER_AFIP_PTO_VTA,
  normalizeCuitDigits,
  normalizePemFromEnv,
} from './barberAfip.js';
import pool, { query } from './db.js';

type BarberAfipRow = {
  id: string;
  name: string;
  afip_cuit: string | null;
  afip_access_token: string | null;
  afip_pto_vta: number | null;
  afip_cbte_tipo: number | null;
  afip_cert: string | null;
  afip_key: string | null;
};

function loadEnvCertKey(): { cert: string; key: string } | null {
  const cp = process.env.AFIP_CERT_PATH?.trim();
  const kp = process.env.AFIP_KEY_PATH?.trim();
  const ic = process.env.AFIP_CERT?.trim();
  const ik = process.env.AFIP_KEY?.trim();
  if (cp && kp) {
    try {
      return { cert: readFileSync(cp, 'utf8'), key: readFileSync(kp, 'utf8') };
    } catch {
      return null;
    }
  }
  if (ic && ik) {
    return { cert: normalizePemFromEnv(ic), key: normalizePemFromEnv(ik) };
  }
  return null;
}

function pickLegacyBarber(rows: BarberAfipRow[], envCuit: string | null): BarberAfipRow | null {
  const pending = rows.filter((b) => !b.afip_access_token?.trim());
  if (!pending.length) return null;

  const legacyId = process.env.AFIP_LEGACY_BARBER_ID?.trim();
  if (legacyId) {
    return pending.find((b) => b.id === legacyId) ?? null;
  }

  if (envCuit) {
    const byCuit = pending.filter((b) => normalizeCuitDigits(b.afip_cuit) === envCuit);
    if (byCuit.length === 1) return byCuit[0];
    const byName = pending.filter((b) => /agus|agustin/i.test(b.name));
    if (byName.length === 1) return byName[0];
  }

  return null;
}

/**
 * Copia variables AFIP_* del servidor al barbero indicado (ej. Agustín) si aún no tiene token en DB.
 * Sirve para migrar la config vieja de Railway sin reingresar todo en el panel.
 */
export async function importLegacyAfipEnvToBarbers(): Promise<void> {
  const token = process.env.AFIP_ACCESS_TOKEN?.trim();
  const envCuit = normalizeCuitDigits(process.env.AFIP_CUIT);
  const tls = loadEnvCertKey();
  if (!token && !envCuit) return;

  const rows = await query<BarberAfipRow[]>(
    'SELECT id, name, afip_cuit, afip_access_token, afip_pto_vta, afip_cbte_tipo, afip_cert, afip_key FROM barbers'
  );
  const barber = pickLegacyBarber(rows, envCuit);
  if (!barber) return;

  const ptoVta = Math.min(
    9999,
    Math.max(1, parseInt(process.env.AFIP_PTO_VTA ?? String(DEFAULT_BARBER_AFIP_PTO_VTA), 10) || DEFAULT_BARBER_AFIP_PTO_VTA)
  );
  const cbteTipo = Math.min(
    32767,
    Math.max(1, parseInt(process.env.AFIP_CBTE_TIPO ?? String(DEFAULT_BARBER_AFIP_CBTE_TIPO), 10) || DEFAULT_BARBER_AFIP_CBTE_TIPO)
  );

  await pool.execute(
    `UPDATE barbers SET
      afip_access_token = COALESCE(afip_access_token, ?),
      afip_cuit = COALESCE(afip_cuit, ?),
      afip_pto_vta = COALESCE(afip_pto_vta, ?),
      afip_cbte_tipo = COALESCE(afip_cbte_tipo, ?),
      afip_cert = COALESCE(afip_cert, ?),
      afip_key = COALESCE(afip_key, ?)
    WHERE id = ?`,
    [
      token || null,
      envCuit,
      ptoVta,
      cbteTipo,
      tls?.cert ?? null,
      tls?.key ?? null,
      barber.id,
    ]
  );

  console.log(
    `[AFIP] Variables de entorno importadas al barbero «${barber.name}» (${barber.id}). ` +
      'Valentin y Jaime: cargar su token y CUIT en Configuración del panel.'
  );
}
