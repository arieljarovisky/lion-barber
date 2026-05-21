import { effectiveBarberCommissionPercent } from '../barberCommission.js';
import {
  barberHasAfipCredentials,
  enrichBarberAfipPublic,
  normalizeCuitDigits,
  normalizePemFromEnv,
  resolveBarberAfipCredentials,
  type BarberAfipCredentials,
} from '../barberAfip.js';
import pool, { query } from '../db.js';
import type { Barber } from '../types.js';

interface DbBarber {
  id: string;
  name: string;
  role: string;
  photo: string | null;
  desc: string | null;
  whatsapp_phone?: string | null;
  commission_percent?: string | number | null;
  monotributo_category?: string | null;
  monotributo_monthly_limit?: string | number | null;
  monotributo_annual_limit?: string | number | null;
  afip_cuit?: string | null;
  afip_pto_vta?: number | string | null;
  afip_cbte_tipo?: number | string | null;
  afip_cert?: string | null;
  afip_key?: string | null;
  afip_access_token?: string | null;
}

function parseMonthlyLimit(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function rowToBarber(r: DbBarber): Barber {
  const raw = r.commission_percent != null ? Number(r.commission_percent) : 0;
  const pct = effectiveBarberCommissionPercent(Number.isFinite(raw) ? raw : 0);
  const base: Barber = {
    id: r.id,
    name: r.name,
    role: r.role,
    photo: r.photo ?? '',
    desc: r.desc ?? '',
    whatsappPhone: r.whatsapp_phone ?? null,
    commissionPercent: pct,
    monotributoCategory: r.monotributo_category?.trim() || null,
    monotributoMonthlyLimit: parseMonthlyLimit(
      r.monotributo_monthly_limit ?? r.monotributo_annual_limit
    ),
  };
  return enrichBarberAfipPublic(base, r);
}

export async function getAllBarbers(): Promise<Barber[]> {
  const rows = await query<DbBarber[]>('SELECT * FROM barbers');
  return rows.map(rowToBarber);
}

export async function getBarberById(id: string): Promise<Barber | null> {
  const rows = await query<DbBarber[]>('SELECT * FROM barbers WHERE id = ? LIMIT 1', [id]);
  const r = rows[0];
  return r ? rowToBarber(r) : null;
}

export async function getBarberAfipCredentials(barberId: string): Promise<BarberAfipCredentials | null> {
  const rows = await query<DbBarber[]>(
    'SELECT afip_cuit, afip_pto_vta, afip_cbte_tipo, afip_cert, afip_key, afip_access_token FROM barbers WHERE id = ? LIMIT 1',
    [barberId]
  );
  const r = rows[0];
  return r ? resolveBarberAfipCredentials(r) : null;
}

export async function updateBarberCommission(id: string, commissionPercent: number): Promise<Barber | null> {
  const p = Math.min(100, Math.max(0, commissionPercent));
  await pool.execute('UPDATE barbers SET commission_percent = ? WHERE id = ?', [p, id]);
  return getBarberById(id);
}

export async function updateBarber(
  id: string,
  data: {
    name?: string;
    commissionPercent?: number;
    whatsappPhone?: string | null;
    monotributoCategory?: string | null;
    monotributoMonthlyLimit?: number | null;
    afipCuit?: string | null;
    afipPtoVta?: number | null;
    afipCbteTipo?: number | null;
    afipCert?: string | null;
    afipKey?: string | null;
    afipAccessToken?: string | null;
  }
): Promise<Barber | null> {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (data.name != null) {
    const n = data.name.trim();
    if (!n) throw new Error('El nombre no puede quedar vacío.');
    fields.push('name = ?');
    values.push(n);
  }

  if (data.commissionPercent != null) {
    const p = Math.min(100, Math.max(0, Number(data.commissionPercent)));
    if (!Number.isFinite(p)) throw new Error('Comisión inválida.');
    fields.push('commission_percent = ?');
    values.push(p);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'whatsappPhone')) {
    const w = data.whatsappPhone == null ? '' : String(data.whatsappPhone).trim();
    if (w && !/^\+[1-9]\d{7,14}$/.test(w)) {
      throw new Error('WhatsApp inválido. Usá formato internacional, por ejemplo +54911...');
    }
    fields.push('whatsapp_phone = ?');
    values.push(w || null);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'monotributoCategory')) {
    const c =
      data.monotributoCategory == null ? null : String(data.monotributoCategory).trim().slice(0, 64) || null;
    fields.push('monotributo_category = ?');
    values.push(c);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'monotributoMonthlyLimit')) {
    const lim = data.monotributoMonthlyLimit;
    if (lim == null) {
      fields.push('monotributo_monthly_limit = ?');
      values.push(null);
    } else {
      const n = Number(lim);
      if (!Number.isFinite(n) || n < 0) throw new Error('Límite mensual de monotributo inválido.');
      fields.push('monotributo_monthly_limit = ?');
      values.push(n > 0 ? Math.round(n * 100) / 100 : null);
    }
  }

  if (Object.prototype.hasOwnProperty.call(data, 'afipCuit')) {
    const cuit = data.afipCuit == null ? null : normalizeCuitDigits(String(data.afipCuit));
    if (data.afipCuit != null && String(data.afipCuit).trim() && !cuit) {
      throw new Error('CUIT inválido: deben ser 11 dígitos.');
    }
    fields.push('afip_cuit = ?');
    values.push(cuit);
  }

  if (data.afipPtoVta != null) {
    const p = Math.floor(Number(data.afipPtoVta));
    if (!Number.isFinite(p) || p < 1 || p > 9999) throw new Error('Punto de venta AFIP inválido (1–9999).');
    fields.push('afip_pto_vta = ?');
    values.push(p);
  }

  if (data.afipCbteTipo != null) {
    const t = Math.floor(Number(data.afipCbteTipo));
    if (!Number.isFinite(t) || t < 1) throw new Error('Tipo de comprobante AFIP inválido.');
    fields.push('afip_cbte_tipo = ?');
    values.push(t);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'afipCert')) {
    const cert = data.afipCert == null ? null : normalizePemFromEnv(String(data.afipCert));
    fields.push('afip_cert = ?');
    values.push(cert || null);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'afipKey')) {
    const key = data.afipKey == null ? null : normalizePemFromEnv(String(data.afipKey));
    fields.push('afip_key = ?');
    values.push(key || null);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'afipAccessToken')) {
    const token = data.afipAccessToken == null ? null : String(data.afipAccessToken).trim() || null;
    fields.push('afip_access_token = ?');
    values.push(token);
  }

  if (!fields.length) return getBarberById(id);

  const existing = await query<DbBarber[]>('SELECT * FROM barbers WHERE id = ? LIMIT 1', [id]);
  const prev = existing[0];
  if (!prev) return null;

  await pool.execute(`UPDATE barbers SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);

  const after = await query<DbBarber[]>('SELECT * FROM barbers WHERE id = ? LIMIT 1', [id]);
  const next = after[0];
  if (next) {
    const draft = {
      afip_cuit: next.afip_cuit,
      afip_cert: next.afip_cert,
      afip_key: next.afip_key,
      afip_access_token: next.afip_access_token,
    };
    if (
      draft.afip_cert?.trim() &&
      draft.afip_key?.trim() &&
      draft.afip_access_token?.trim() &&
      normalizeCuitDigits(draft.afip_cuit) &&
      !barberHasAfipCredentials(draft)
    ) {
      throw new Error(
        'Certificado o clave AFIP inválidos. Pegá el .crt y .key completos en formato PEM (con -----BEGIN...).'
      );
    }
  }

  return getBarberById(id);
}
