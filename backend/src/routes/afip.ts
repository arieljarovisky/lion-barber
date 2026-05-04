import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  getAfipCertKeyStatus,
  isAfipConfigured,
  invoiceAppointmentAfip,
} from '../services/afipInvoice.js';

const router = Router();

router.get('/status', requireAuth, requireAdmin, (_req, res) => {
  res.json({
    configured: isAfipConfigured(),
    production: process.env.AFIP_PRODUCTION === 'true',
    certKey: getAfipCertKeyStatus(),
  });
});

router.post('/invoice/:appointmentId', requireAuth, requireAdmin, async (req, res) => {
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
