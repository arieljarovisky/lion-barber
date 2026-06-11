import { Router } from 'express';
import { requireAuth, requireSuperAdmin, type AuthRequest } from '../middleware/auth.js';
import * as userRepo from '../repositories/users.js';
import { staffPermissionsFromDbUser } from '../services/staffPermissions.js';
import { getBarberById } from '../repositories/barbers.js';

const router = Router();

router.get('/', requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    const staff = await userRepo.listStaffUsers();
    res.json(
      staff.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        barberId: u.barber_id ?? null,
        permissions: staffPermissionsFromDbUser(u),
        createdAt: u.created_at,
      }))
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar empleados' });
  }
});

router.patch('/:userId', requireAuth, requireSuperAdmin, async (req, res) => {
  const authReq = req as AuthRequest;
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'ID inválido' });
  if (userId === authReq.user!.id) {
    return res.status(400).json({ error: 'No podés modificar tus propios permisos desde acá' });
  }

  const body = req.body as { viewAllAgendas?: unknown; editAllAgendas?: unknown };
  const hasView = typeof body.viewAllAgendas === 'boolean';
  const hasEdit = typeof body.editAllAgendas === 'boolean';
  if (!hasView && !hasEdit) {
    return res.status(400).json({ error: 'Indicá al menos un permiso (viewAllAgendas o editAllAgendas)' });
  }

  const existing = await userRepo.findUserById(userId);
  if (!existing || existing.role !== 'staff') {
    return res.status(404).json({ error: 'Empleado no encontrado' });
  }

  const current = staffPermissionsFromDbUser(existing)!;
  let viewAllAgendas = hasView ? Boolean(body.viewAllAgendas) : current.viewAllAgendas;
  let editAllAgendas = hasEdit ? Boolean(body.editAllAgendas) : current.editAllAgendas;
  if (editAllAgendas) viewAllAgendas = true;

  try {
    const updated = await userRepo.updateStaffPermissions(userId, { viewAllAgendas, editAllAgendas });
    if (!updated) return res.status(404).json({ error: 'Empleado no encontrado' });
    const barber = updated.barber_id ? await getBarberById(updated.barber_id) : null;
    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      barberId: updated.barber_id ?? null,
      barberName: barber?.name ?? null,
      permissions: staffPermissionsFromDbUser(updated),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudieron guardar los permisos' });
  }
});

export default router;
