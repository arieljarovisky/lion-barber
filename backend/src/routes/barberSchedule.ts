import { Router } from 'express';
import { requireAuth, requireStaffOrAdmin, type AuthRequest } from '../middleware/auth.js';
import * as scheduleRepo from '../repositories/barberSchedule.js';
import { getBarberById } from '../repositories/barbers.js';
import { timeToMinutes } from '../slotUtils.js';

const router = Router();

function parseWeekday(v: unknown): number | null {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 7) return null;
  return n;
}

router.get('/:barberId', requireAuth, requireStaffOrAdmin, async (req: AuthRequest, res) => {
  const { barberId } = req.params;
  const barber = await getBarberById(barberId);
  if (!barber) return res.status(404).json({ error: 'Barbero no encontrado' });
  const francos = await scheduleRepo.listFrancos(barberId);
  const blocks = await scheduleRepo.listBlocks(barberId);
  res.json({ francos, blocks });
});

router.post('/:barberId/francos', requireAuth, requireStaffOrAdmin, async (req: AuthRequest, res) => {
  const { barberId } = req.params;
  if (req.user!.role === 'staff') {
    if (!req.user!.barberId || req.user!.barberId !== barberId) {
      return res.status(403).json({ error: 'No autorizado' });
    }
  }
  const barber = await getBarberById(barberId);
  if (!barber) return res.status(404).json({ error: 'Barbero no encontrado' });
  const weekday = parseWeekday(req.body.weekday);
  if (weekday == null) {
    return res.status(400).json({ error: 'weekday debe ser 1 (Lun) a 7 (Dom)' });
  }
  try {
    const created = await scheduleRepo.addFranco(barberId, weekday);
    res.status(201).json(created);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese día de franco ya está definido para el barbero' });
    }
    console.error(e);
    res.status(500).json({ error: 'No se pudo guardar el franco' });
  }
});

router.delete('/:barberId/francos/:francoId', requireAuth, requireStaffOrAdmin, async (req: AuthRequest, res) => {
  const { barberId } = req.params;
  if (req.user!.role === 'staff') {
    if (!req.user!.barberId || req.user!.barberId !== barberId) {
      return res.status(403).json({ error: 'No autorizado' });
    }
  }
  const francoId = parseInt(req.params.francoId, 10);
  if (!Number.isFinite(francoId)) return res.status(400).json({ error: 'ID inválido' });
  const ok = await scheduleRepo.deleteFrancoForBarber(francoId, barberId);
  if (!ok) return res.status(404).json({ error: 'Franco no encontrado' });
  res.status(204).send();
});

router.post('/:barberId/blocks', requireAuth, requireStaffOrAdmin, async (req: AuthRequest, res) => {
  const { barberId } = req.params;
  if (req.user!.role === 'staff') {
    if (!req.user!.barberId || req.user!.barberId !== barberId) {
      return res.status(403).json({ error: 'No autorizado' });
    }
  }
  const barber = await getBarberById(barberId);
  if (!barber) return res.status(404).json({ error: 'Barbero no encontrado' });

  const blockDate = typeof req.body.blockDate === 'string' && req.body.blockDate ? req.body.blockDate : null;
  const weekday =
    req.body.weekday != null && req.body.weekday !== '' ? parseWeekday(req.body.weekday) : null;
  const timeStart = typeof req.body.timeStart === 'string' ? req.body.timeStart.trim() : '';
  const timeEnd = typeof req.body.timeEnd === 'string' ? req.body.timeEnd.trim() : '';

  if (!timeStart || !timeEnd) {
    return res.status(400).json({ error: 'timeStart y timeEnd son obligatorios (HH:MM)' });
  }
  if ((blockDate && weekday != null) || (!blockDate && weekday == null)) {
    return res.status(400).json({
      error: 'Definí solo una opción: blockDate (bloqueo en una fecha) o weekday (cada semana ese día)',
    });
  }

  const startMin = timeToMinutes(timeStart);
  const endMin = timeToMinutes(timeEnd);
  if (endMin <= startMin) {
    return res.status(400).json({ error: 'La hora de fin debe ser mayor que la de inicio' });
  }

  try {
    const created = await scheduleRepo.addTimeBlock(barberId, {
      blockDate,
      weekday,
      timeStart,
      timeEnd,
    });
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo crear el bloque' });
  }
});

router.delete('/:barberId/blocks/:blockId', requireAuth, requireStaffOrAdmin, async (req: AuthRequest, res) => {
  const { barberId } = req.params;
  if (req.user!.role === 'staff') {
    if (!req.user!.barberId || req.user!.barberId !== barberId) {
      return res.status(403).json({ error: 'No autorizado' });
    }
  }
  const blockId = parseInt(req.params.blockId, 10);
  if (!Number.isFinite(blockId)) return res.status(400).json({ error: 'ID inválido' });
  const ok = await scheduleRepo.deleteTimeBlockForBarber(blockId, barberId);
  if (!ok) return res.status(404).json({ error: 'Bloque no encontrado' });
  res.status(204).send();
});

export default router;
