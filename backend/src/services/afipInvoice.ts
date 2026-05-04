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
      readFileSync(cp, 'utf8');
      readFileSync(kp, 'utf8');
      return 'ok';
    } catch {
      return 'bad';
    }
  }
  if (!ic || !ik) return 'bad';
  return 'ok';
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
  if (ic && ik) return { cert: ic, key: ik };
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
 * Emite Factura B (CbteTipo 6) consumidor final por el monto del servicio + productos opcionales (IVA 21 % discriminado).
 * Requiere token de Afip SDK (`https://afipsdk.com`) y CUIT del emisor en variables de entorno.
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

  const total = amount;
  const neto = Math.round((total / 1.21) * 100) / 100;
  const iva = Math.round((total - neto) * 100) / 100;

  const fechaCbte = todayYyyymmddArgentina();
  const fechaServ = yyyymmddFromDateStr(app.date);

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
    ImpNeto: neto,
    ImpOpEx: 0,
    ImpTrib: 0,
    ImpIVA: iva,
    MonId: 'PES',
    MonCotiz: 1,
    Iva: [{ Id: 5, BaseImp: neto, Importe: iva }],
    FchServDesde: fechaServ,
    FchServHasta: fechaServ,
    FchVtoPago: fechaServ,
  };

  let res: { CAE: string; CAEFchVto: string; voucherNumber: number };
  try {
    res = await afip.ElectronicBilling.createNextVoucher(voucherData);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`AFIP: ${msg}`);
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
