import { Router } from 'express';
import * as repo from '../repositories/barbers.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const barbers = await repo.getAllBarbers();
    res.json(barbers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener barberos' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { commissionPercent, name, whatsappPhone } = req.body as {
    commissionPercent?: number;
    name?: string;
    whatsappPhone?: string | null;
  };
  const hasName = name != null && String(name).trim().length > 0;
  const hasCommission = commissionPercent != null;
  const hasWhatsapp = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'whatsappPhone');
  if (!hasName && !hasCommission && !hasWhatsapp) {
    return res.status(400).json({ error: 'Se requiere name, commissionPercent o whatsappPhone' });
  }
  try {
    const updated = await repo.updateBarber(req.params.id, {
      ...(hasName ? { name: String(name) } : {}),
      ...(commissionPercent != null ? { commissionPercent: Number(commissionPercent) } : {}),
      ...(hasWhatsapp
        ? {
            whatsappPhone:
              whatsappPhone == null ? null : String(whatsappPhone).trim() || null,
          }
        : {}),
    });
    if (!updated) return res.status(404).json({ error: 'Barbero no encontrado' });
    res.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al actualizar';
    const code = /vac[ií]o|inv[aá]lida/i.test(msg) ? 400 : 500;
    if (code === 500) console.error(err);
    res.status(code).json({ error: msg });
  }
});

export default router;
