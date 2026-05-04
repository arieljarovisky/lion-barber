import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as repo from '../repositories/appointments.js';
import { getShopProductById } from '../repositories/shopProducts.js';
import { getServiceById } from '../repositories/services.js';
import type { AfipInvoiceDetail, Appointment } from '../types.js';

const require = createRequire(import.meta.url);
// Paquete CommonJS (@afipsdk/afip.js)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Afip = require('@afipsdk/afip.js') as new (opts: {
  access_token: string;
  CUIT: number | string;
  production?: boolean;
  cert?: string;
  key?: string;
}) => {
  ElectronicBilling: {
    createNextVoucher: (data: Record<string, unknown>) => Promise<{
      CAE: string;
      CAEFchVto: string;
      voucherNumber: number;
    }>;
  };
};

function parseArsAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  let normalized = cleaned;
  if (hasDot && hasComma) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    const parts = cleaned.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      normalized = cleaned.replace(/\./g, '');
    }
  } else if (hasComma) {
    const parts = cleaned.split(',');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      normalized = cleaned.replace(/,/g, '');
    } else {
      normalized = cleaned.replace(',', '.');
    }
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Fecha del turno yyyy-mm-dd → entero yyyymmdd (AFIP). */
function yyyymmddFromDateStr(yyyyMmDd: string): number {
  const clean = yyyyMmDd.trim().slice(0, 10).replace(/-/g, '');
  const n = parseInt(clean, 10);
  if (!Number.isFinite(n) || clean.length !== 8) {
    throw new Error('Fecha del turno inválida.');
  }
  return n;
}

function todayYyyymmddArgentina(): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !d) {
    const t = new Date();
    return t.getFullYear() * 10000 + (t.getMonth() + 1) * 100 + t.getDate();
  }
  return parseInt(`${y}${m}${d}`, 10);
}

/** Railway / paneles suelen guardar el PEM en una línea con `\n` literales; OpenSSL y el SDK necesitan saltos reales. */
function normalizePemFromEnv(raw: string): string {
  const t = raw.trim();
  if (!t.includes('-----BEGIN')) return t;
  return t.replace(/\\n/g, '\n');
}

/** El SDK rechaza rutas o texto corto: exige bloques PEM completos. */
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

function formatAfipSdkError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const ex = e as Error & { status?: number; data?: unknown };
  let out = ex.message;
  const d = ex.data;
  if (d === undefined || d === null) return out;
  if (typeof d === 'string') {
    if (d.length) out += `: ${d}`;
    return out;
  }
  if (typeof d === 'object') {
    const o = d as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message) out += `: ${o.message}`;
    else if (typeof o.error === 'string' && o.error) out += `: ${o.error}`;
    else {
      try {
        const j = JSON.stringify(d);
        if (j && j !== '{}') out += `: ${j}`;
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

/**
 * Estado del par cert/clave (opcional con Afip SDK: obligatorio para tu CUIT en producción).
 * - absent: no definiste rutas ni PEM en env
 * - ok: par completo y archivos legibles (si usás rutas)
 * - bad: definición incompleta, mezcla rutas+PEM, o archivos ilegibles
 */
export function getAfipCertKeyStatus(): 'absent' | 'ok' | 'bad' {
  const cp = process.env.AFIP_CERT_PATH?.trim();
  const kp = process.env.AFIP_KEY_PATH?.trim();
  const ic = process.env.AFIP_CERT?.trim();
  const ik = process.env.AFIP_KEY?.trim();
  const hasPath = !!(cp || kp);
  const hasInline = !!(ic || ik);
  if (!hasPath && !hasInline) return 'absent';
  if (hasPath && hasInline) return 'bad';
  if (hasPath) {
    if (!cp || !kp) return 'bad';
    try {
      const cert = readFileSync(cp, 'utf8');
      const key = readFileSync(kp, 'utf8');
      return pemPairShapeOk(cert, key) ? 'ok' : 'bad';
    } catch {
      return 'bad';
    }
  }
  if (!ic || !ik) return 'bad';
  return pemPairShapeOk(ic, ik) ? 'ok' : 'bad';
}

function loadAfipCertKey(): { cert: string; key: string } | undefined {
  if (getAfipCertKeyStatus() !== 'ok') return undefined;
  const cp = process.env.AFIP_CERT_PATH?.trim();
  const kp = process.env.AFIP_KEY_PATH?.trim();
  const ic = process.env.AFIP_CERT?.trim();
  const ik = process.env.AFIP_KEY?.trim();
  if (cp && kp) {
    return {
      cert: readFileSync(cp, 'utf8'),
      key: readFileSync(kp, 'utf8'),
    };
  }
  if (ic && ik) return { cert: normalizePemFromEnv(ic), key: normalizePemFromEnv(ik) };
  return undefined;
}

export function isAfipConfigured(): boolean {
  if (!process.env.AFIP_ACCESS_TOKEN?.trim() || !process.env.AFIP_CUIT?.trim()) return false;
  return getAfipCertKeyStatus() !== 'bad';
}

export type InvoiceProductLineInput = { productId: string; quantity: number };

async function resolveAmountArs(app: Appointment): Promise<number> {
  if (app.serviceId) {
    const s = await getServiceById(app.serviceId);
    if (s?.price) {
      const n = parseArsAmount(s.price);
      if (n != null && n > 0) return Math.round(n * 100) / 100;
    }
  }
  const n = parseArsAmount(app.service);
  if (n != null && n > 0) return Math.round(n * 100) / 100;
  throw new Error('No se pudo determinar el importe del servicio para facturar.');
}

/**
 * Emite comprobante AFIP según `AFIP_CBTE_TIPO`: por defecto Factura B (6), consumidor final, IVA 21 % discriminado.
 * Monotributo / no RI en IVA: usar `AFIP_CBTE_TIPO=11` (Factura C: total = neto, sin alícuotas IVA en el request).
 * Requiere token de Afip SDK y CUIT del emisor.
 */
export async function invoiceAppointmentAfip(
  appointmentId: string,
  opts?: { productLines?: InvoiceProductLineInput[] }
): Promise<{
  cae: string;
  caeVto: string;
  cbteNro: number;
  ptoVta: number;
}> {
  if (!isAfipConfigured()) {
    throw new Error('AFIP no configurado: definí AFIP_ACCESS_TOKEN y AFIP_CUIT en el servidor.');
  }
  await repo.expireStalePendingAppointments();
  const app = await repo.getAppointmentById(appointmentId);
  if (!app) throw new Error('Turno no encontrado');
  if (app.status === 'cancelled') throw new Error('No se puede facturar un turno cancelado.');
  if (app.afipCae) throw new Error('Este turno ya tiene factura registrada.');

  const serviceAmount = await resolveAmountArs(app);
  const merged = new Map<string, number>();
  for (const line of opts?.productLines ?? []) {
    const pid = String(line.productId ?? '').trim();
    const q = Math.floor(Number(line.quantity));
    if (!pid || !Number.isFinite(q) || q < 1) {
      throw new Error('Cada línea de producto debe tener productId válido y cantidad ≥ 1.');
    }
    merged.set(pid, (merged.get(pid) ?? 0) + q);
  }

  const productLines: AfipInvoiceDetail['productLines'] = [];
  let productsTotal = 0;
  for (const [productId, quantity] of merged) {
    const product = await getShopProductById(productId);
    if (!product) throw new Error(`Producto no encontrado: ${productId}`);
    const rawPrice = product.unitPrice;
    if (!rawPrice || !String(rawPrice).trim()) {
      throw new Error(
        `El producto «${product.name}» no tiene precio de venta cargado. Cargalo en Productos o quitá la línea.`
      );
    }
    const unit = parseArsAmount(String(rawPrice));
    if (unit == null || unit <= 0) {
      throw new Error(`Precio inválido para el producto «${product.name}».`);
    }
    const subtotal = Math.round(unit * quantity * 100) / 100;
    productsTotal += subtotal;
    productLines.push({
      productId,
      name: product.name,
      quantity,
      unitPrice: unit,
      subtotal,
    });
  }

  const amount = Math.round((serviceAmount + productsTotal) * 100) / 100;
  const invoiceDetail: AfipInvoiceDetail = {
    serviceAmount: Math.round(serviceAmount * 100) / 100,
    serviceLabel: app.service,
    productLines,
    total: amount,
  };

  const ptoVta = Math.min(9999, Math.max(1, parseInt(process.env.AFIP_PTO_VTA ?? '1', 10) || 1));
  const cbteTipo = Math.min(32767, Math.max(1, parseInt(process.env.AFIP_CBTE_TIPO ?? '6', 10) || 6));
  /** Factura C (monotributo): WSFE no debe recibir alícuotas IVA en el detalle. */
  const isFacturaC = cbteTipo === 11;
  const condIvaReceptor = Math.min(
    32767,
    Math.max(1, parseInt(process.env.AFIP_CONDICION_IVA_RECEPTOR_ID ?? '5', 10) || 5)
  );

  const total = amount;
  const neto = Math.round((total / 1.21) * 100) / 100;
  const iva = Math.round((total - neto) * 100) / 100;

  const fechaCbte = todayYyyymmddArgentina();
  const fechaServ = yyyymmddFromDateStr(app.date);
  /** AFIP (10036): FchVtoPago no puede ser anterior a CbteFch; si el turno fue días atrás, el vencimiento de pago alinea al día del comprobante. */
  const fchVtoPago = Math.max(fechaCbte, fechaServ);

  const tls = loadAfipCertKey();
  const afip = new Afip({
    access_token: process.env.AFIP_ACCESS_TOKEN!.trim(),
    CUIT: Number(String(process.env.AFIP_CUIT).replace(/\D/g, '')),
    production: process.env.AFIP_PRODUCTION === 'true',
    ...(tls ? { cert: tls.cert, key: tls.key } : {}),
  });

  const voucherData: Record<string, unknown> = {
    PtoVta: ptoVta,
    CbteTipo: cbteTipo,
    Concepto: 2,
    DocTipo: 99,
    DocNro: 0,
    CbteFch: fechaCbte,
    ImpTotal: total,
    ImpTotConc: 0,
    ImpNeto: isFacturaC ? total : neto,
    ImpOpEx: 0,
    ImpTrib: 0,
    ImpIVA: isFacturaC ? 0 : iva,
    MonId: 'PES',
    MonCotiz: 1,
    CondicionIVAReceptorId: condIvaReceptor,
    FchServDesde: fechaServ,
    FchServHasta: fechaServ,
    FchVtoPago: fchVtoPago,
  };

  if (!isFacturaC) {
    voucherData.Iva = [{ Id: 5, BaseImp: neto, Importe: iva }];
  }

  let res: { CAE: string; CAEFchVto: string; voucherNumber: number };
  try {
    res = await afip.ElectronicBilling.createNextVoucher(voucherData);
  } catch (e: unknown) {
    throw new Error(`AFIP: ${formatAfipSdkError(e)}`);
  }

  const cae = String(res.CAE ?? '');
  const caeVto = String(res.CAEFchVto ?? '').slice(0, 10);
  const cbteNro = Number(res.voucherNumber);

  await repo.setAppointmentAfipInvoice(appointmentId, {
    cae,
    caeVto,
    cbteNro,
    ptoVta,
    invoiceDetail,
  });

  return { cae, caeVto, cbteNro, ptoVta };
}
