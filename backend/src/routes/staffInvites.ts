import { Router } from 'express';
import * as repo from '../repositories/staffInvites.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const list = await repo.listInvites();
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar invitaciones' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const name = req.body.name != null ? String(req.body.name).trim() : null;
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  try {
    const created = await repo.createInvite(email, name || null);
    res.status(201).json(created);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese email ya tiene una invitación pendiente' });
    }
    console.error(e);
    res.status(500).json({ error: 'No se pudo crear la invitación' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  const ok = await repo.deleteInviteById(id);
  if (!ok) return res.status(404).json({ error: 'Invitación no encontrada' });
  res.status(204).send();
});

export default router;
