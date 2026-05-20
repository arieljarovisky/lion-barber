import type { Barber } from './types.js';

/** Factura C (monotributo) a consumidor final. */
export const DEFAULT_BARBER_AFIP_CBTE_TIPO = 11;
export const DEFAULT_BARBER_AFIP_PTO_VTA = 1;
/** Consumidor final (DocTipo 99 + condición IVA receptor 5). */
export const AFIP_CONSUMIDOR_FINAL_CONDICION_IVA = 5;

export type BarberAfipCredentials = {
  accessToken: string;
  cuit: string;
  ptoVta: number;
  cbteTipo: number;
  cert: string;
  key: string;
};

export function normalizeCuitDigits(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length !== 11) return null;
  return d;
}

export function normalizePemFromEnv(raw: string): string {
  const t = raw.trim();
  if (!t.includes('-----BEGIN')) return t;
  return t.replace(/\\n/g, '\n');
}

function pemPairShapeOk(cert: string, key: string): boolean {
  const c = normalizePemFromEnv(cert);
  const k = normalizePemFromEnv(key);
  if (!c.includes('-----BEGIN CERTIFICATE-----') || !c.includes('-----END CERTIFICATE-----')) return false;
  const keyBegin =
    k.includes('-----BEGIN PRIVATE KEY-----') ||
    k.includes('-----BEGIN RSA PRIVATE KEY-----') ||
    k.includes('-----BEGIN EC PRIVATE KEY-----');
  const keyEnd =
    k.includes('-----END PRIVATE KEY-----') ||
    k.includes('-----END RSA PRIVATE KEY-----') ||
    k.includes('-----END EC PRIVATE KEY-----');
  return keyBegin && keyEnd;
}

type BarberAfipRow = {
  afip_cuit?: string | null;
  afip_pto_vta?: number | string | null;
  afip_cbte_tipo?: number | string | null;
  afip_cert?: string | null;
  afip_key?: string | null;
  afip_access_token?: string | null;
};

export function barberHasAfipAccessToken(row: BarberAfipRow): boolean {
  return Boolean(row.afip_access_token?.trim());
}

export function barberHasAfipCredentials(row: BarberAfipRow): boolean {
  const cuit = normalizeCuitDigits(row.afip_cuit);
  const cert = row.afip_cert?.trim();
  const key = row.afip_key?.trim();
  if (!barberHasAfipAccessToken(row) || !cuit || !cert || !key) return false;
  return pemPairShapeOk(cert, key);
}

export function enrichBarberAfipPublic(barber: Barber, row: BarberAfipRow): Barber {
  const cuit = normalizeCuitDigits(row.afip_cuit);
  const ptoRaw = row.afip_pto_vta != null ? Number(row.afip_pto_vta) : DEFAULT_BARBER_AFIP_PTO_VTA;
  const cbteRaw = row.afip_cbte_tipo != null ? Number(row.afip_cbte_tipo) : DEFAULT_BARBER_AFIP_CBTE_TIPO;
  return {
    ...barber,
    afipCuit: cuit,
    afipPtoVta: Number.isFinite(ptoRaw) && ptoRaw > 0 ? Math.min(9999, ptoRaw) : DEFAULT_BARBER_AFIP_PTO_VTA,
    afipCbteTipo:
      Number.isFinite(cbteRaw) && cbteRaw > 0 ? Math.min(32767, cbteRaw) : DEFAULT_BARBER_AFIP_CBTE_TIPO,
    afipAccessTokenConfigured: barberHasAfipAccessToken(row),
    afipCredentialsConfigured: barberHasAfipCredentials(row),
  };
}

export function resolveBarberAfipCredentials(row: BarberAfipRow): BarberAfipCredentials | null {
  if (!barberHasAfipCredentials(row)) return null;
  const cuit = normalizeCuitDigits(row.afip_cuit)!;
  const ptoRaw = row.afip_pto_vta != null ? Number(row.afip_pto_vta) : DEFAULT_BARBER_AFIP_PTO_VTA;
  const cbteRaw = row.afip_cbte_tipo != null ? Number(row.afip_cbte_tipo) : DEFAULT_BARBER_AFIP_CBTE_TIPO;
  return {
    accessToken: row.afip_access_token!.trim(),
    cuit,
    ptoVta: Number.isFinite(ptoRaw) && ptoRaw > 0 ? Math.min(9999, ptoRaw) : DEFAULT_BARBER_AFIP_PTO_VTA,
    cbteTipo:
      Number.isFinite(cbteRaw) && cbteRaw > 0 ? Math.min(32767, cbteRaw) : DEFAULT_BARBER_AFIP_CBTE_TIPO,
    cert: normalizePemFromEnv(row.afip_cert!.trim()),
    key: normalizePemFromEnv(row.afip_key!.trim()),
  };
}
