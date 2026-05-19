import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import {
  getAfipCertKeyStatus,
  isAfipConfigured,
  invoiceAppointmentAfip,
} from '../services/afipInvoice.js';
import {
  buildBarberInvoicingUsage,
  currentCalendarYearArgentina,
} from '../services/barberInvoicingLimits.js';

const router = Router();

router.get('/status', requireAuth, requireSuperAdmin, (_req, res) => {
  const configured = isAfipConfigured();
  const rawCuit = process.env.AFIP_CUIT?.trim();
  const digits = rawCuit ? String(rawCuit).replace(/\D/g, '') : '';
  const cbteTipo = Math.min(32767, Math.max(1, parseInt(process.env.AFIP_CBTE_TIPO ?? '6', 10) || 6));
  res.json({
    configured,
    production: process.env.AFIP_PRODUCTION === 'true',
    certKey: getAfipCertKeyStatus(),
    emitterCuit: configured && digits.length === 11 ? digits : null,
    cbteTipo,
  });
});

router.get('/barber-invoicing', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const rawYear = req.query.year;
    const year =
      typeof rawYear === 'string' && /^\d{4}$/.test(rawYear)
        ? parseInt(rawYear, 10)
        : currentCalendarYearArgentina();
    const usage = await buildBarberInvoicingUsage(year);
    res.json({ year, barbers: usage });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al calcular facturación por barbero' });
  }
});

router.post('/invoice/:appointmentId', requireAuth, requireSuperAdmin, async (req, res) => {
  const id = req.params.appointmentId;
  const body = req.body as { productLines?: { productId: string; quantity: number }[] };
  try {
    const productLines = Array.isArray(body?.productLines) ? body.productLines : undefined;
    const result = await invoiceAppointmentAfip(id, { productLines });
    res.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al facturar';
    let status = 400;
    if (msg.includes('no encontrado')) status = 404;
    else if (
      /ECONNABORTED|ECONNRESET|ETIMEDOUT|socket hang up|status code 502|status code 503|status code 504/i.test(
        msg
      )
    ) {
      status = 502;
    }
    res.status(status).json({ error: msg });
  }
});

export default router;
