import { Router } from 'express';
import * as repo from '../repositories/barbers.js';
import { isSuperAdminEmail } from '../auth.js';
import { requireAuth, requireAdmin, type AuthRequest } from '../middleware/auth.js';

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
  const authReq = req as AuthRequest;
  const body = req.body as {
    commissionPercent?: number;
    name?: string;
    whatsappPhone?: string | null;
    monotributoCategory?: string | null;
    monotributoMonthlyLimit?: number | null;
    afipCuit?: string | null;
    afipPtoVta?: number | null;
    afipCbteTipo?: number | null;
    afipCert?: string | null;
    afipKey?: string | null;
    afipAccessToken?: string | null;
  };
  const {
    commissionPercent,
    name,
    whatsappPhone,
    monotributoCategory,
    monotributoMonthlyLimit,
    afipCuit,
    afipPtoVta,
    afipCbteTipo,
    afipCert,
    afipKey,
    afipAccessToken,
  } = body;
  const hasName = name != null && String(name).trim().length > 0;
  const hasCommission = commissionPercent != null;
  const hasWhatsapp = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'whatsappPhone');
  const hasMonotributoCategory = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'monotributoCategory');
  const hasMonotributoLimit = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'monotributoMonthlyLimit');
  const hasAfipCuit = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'afipCuit');
  const hasAfipPtoVta = afipPtoVta != null;
  const hasAfipCbteTipo = afipCbteTipo != null;
  const hasAfipCert = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'afipCert');
  const hasAfipKey = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'afipKey');
  const hasAfipAccessToken = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'afipAccessToken');
  if (
    !hasName &&
    !hasCommission &&
    !hasWhatsapp &&
    !hasMonotributoCategory &&
    !hasMonotributoLimit &&
    !hasAfipCuit &&
    !hasAfipPtoVta &&
    !hasAfipCbteTipo &&
    !hasAfipCert &&
    !hasAfipKey &&
    !hasAfipAccessToken
  ) {
    return res.status(400).json({
      error: 'No hay campos para actualizar',
    });
  }
  const needsSuperAdmin =
    hasMonotributoCategory ||
    hasMonotributoLimit ||
    hasAfipCuit ||
    hasAfipPtoVta ||
    hasAfipCbteTipo ||
    hasAfipCert ||
    hasAfipKey ||
    hasAfipAccessToken;
  if (needsSuperAdmin && (!authReq.user?.email || !isSuperAdminEmail(authReq.user.email))) {
    return res.status(403).json({
      error: 'Solo super administradores pueden configurar monotributo y AFIP por barbero',
    });
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
      ...(hasMonotributoCategory
        ? {
            monotributoCategory:
              monotributoCategory == null ? null : String(monotributoCategory).trim() || null,
          }
        : {}),
      ...(hasMonotributoLimit
        ? {
            monotributoMonthlyLimit:
              monotributoMonthlyLimit == null ? null : Number(monotributoMonthlyLimit),
          }
        : {}),
      ...(hasAfipCuit ? { afipCuit: afipCuit == null ? null : String(afipCuit) } : {}),
      ...(hasAfipPtoVta ? { afipPtoVta: Number(afipPtoVta) } : {}),
      ...(hasAfipCbteTipo ? { afipCbteTipo: Number(afipCbteTipo) } : {}),
      ...(hasAfipCert ? { afipCert: afipCert == null ? null : String(afipCert) } : {}),
      ...(hasAfipKey ? { afipKey: afipKey == null ? null : String(afipKey) } : {}),
      ...(hasAfipAccessToken
        ? { afipAccessToken: afipAccessToken == null ? null : String(afipAccessToken) }
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
