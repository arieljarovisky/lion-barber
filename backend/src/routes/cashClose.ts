import { Router } from 'express';
import { requireAuth, requireStaffOrAdmin, requireSuperAdmin, type AuthRequest } from '../middleware/auth.js';
import * as dailyCashCloseRepo from '../repositories/dailyCashClose.js';

const router = Router();

router.get('/daily', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from.slice(0, 10) : '';
  const to = typeof req.query.to === 'string' ? req.query.to.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: 'Se requieren from y to (yyyy-MM-dd)' });
  }
  try {
    const closes = await dailyCashCloseRepo.listDailyCashClosesInRange(from, to);
    res.json({ closes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar cierres diarios' });
  }
});

router.get('/daily/:date', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const date = req.params.date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Fecha inválida' });
  }
  try {
    const close = await dailyCashCloseRepo.getDailyCashClose(date);
    if (!close) return res.status(404).json({ error: 'Día sin cierre' });
    res.json({ close });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al consultar cierre' });
  }
});

router.post('/daily', requireAuth, requireSuperAdmin, async (req, res) => {
  const authReq = req as AuthRequest;
  const { date } = req.body as { date?: string };
  const dateYmd = typeof date === 'string' ? date.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return res.status(400).json({ error: 'Se requiere date (yyyy-MM-dd)' });
  }
  try {
    const close = await dailyCashCloseRepo.closeDailyCash(dateYmd, authReq.user!.id);
    res.status(201).json({ close });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al cerrar caja';
    const code = /ya fue cerrado/i.test(msg) ? 409 : 400;
    res.status(code).json({ error: msg });
  }
});

router.delete('/daily/:date', requireAuth, requireSuperAdmin, async (req, res) => {
  const date = req.params.date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Fecha inválida' });
  }
  try {
    const ok = await dailyCashCloseRepo.reopenDailyCash(date);
    if (!ok) return res.status(404).json({ error: 'Este día no estaba cerrado' });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al reabrir el día' });
  }
});

export default router;
