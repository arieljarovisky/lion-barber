import { Router } from 'express';
import * as repo from '../repositories/expenses.js';
import { getBarberById } from '../repositories/barbers.js';
import { requireAuth, requireStaffOrAdmin, requireSuperAdmin, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

/** Nombre que se muestra en caja: el del barbero vinculado, o el del usuario. */
async function cashExpenseAuthor(user: AuthRequest['user']): Promise<{
  userId: number | null;
  name: string | null;
}> {
  if (!user) return { userId: null, name: null };
  let name = user.name?.trim() || null;
  if (user.barberId) {
    const barber = await getBarberById(user.barberId);
    const barberName = barber?.name?.trim();
    if (barberName) name = barberName;
  }
  return { userId: user.id, name };
}

router.get('/fixed', requireSuperAdmin, async (_req, res) => {
  try {
    res.json({ items: await repo.listFixedMonthlyExpenses() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar gastos fijos' });
  }
});

router.post('/fixed', requireSuperAdmin, async (req, res) => {
  const { description, amount, active } = req.body as {
    description?: string;
    amount?: unknown;
    active?: boolean;
  };
  try {
    const item = await repo.createFixedMonthlyExpense({
      description: String(description ?? ''),
      amount: Number(amount),
      active,
    });
    res.status(201).json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al crear gasto fijo';
    res.status(400).json({ error: msg });
  }
});

router.patch('/fixed/:id', requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  const body = req.body as {
    description?: string;
    amount?: unknown;
    active?: boolean;
  };
  try {
    const item = await repo.updateFixedMonthlyExpense(id, {
      ...(body.description !== undefined ? { description: String(body.description) } : {}),
      ...(body.amount !== undefined ? { amount: Number(body.amount) } : {}),
      ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
    });
    if (!item) return res.status(404).json({ error: 'Gasto fijo no encontrado' });
    res.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al actualizar';
    res.status(400).json({ error: msg });
  }
});

router.delete('/fixed/:id', requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const ok = await repo.deleteFixedMonthlyExpense(id);
    if (!ok) return res.status(404).json({ error: 'Gasto fijo no encontrado' });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

router.get('/cash', requireStaffOrAdmin, async (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from.slice(0, 10) : '';
  const to = typeof req.query.to === 'string' ? req.query.to.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: 'Se requieren from y to (yyyy-MM-dd)' });
  }
  try {
    res.json({ items: await repo.listCashExpensesInRange(from, to) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar gastos de caja' });
  }
});

router.post('/cash', requireStaffOrAdmin, async (req: AuthRequest, res) => {
  const { expenseDate, description, amount } = req.body as {
    expenseDate?: string;
    description?: string;
    amount?: unknown;
  };
  try {
    const author = await cashExpenseAuthor(req.user);
    const item = await repo.createCashExpense({
      expenseDate: String(expenseDate ?? ''),
      description: String(description ?? ''),
      amount: Number(amount),
      createdByUserId: author.userId,
      createdByName: author.name,
    });
    res.status(201).json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al crear gasto';
    res.status(400).json({ error: msg });
  }
});

router.patch('/cash/:id', requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  const body = req.body as {
    expenseDate?: string;
    description?: string;
    amount?: unknown;
  };
  try {
    const item = await repo.updateCashExpense(id, {
      ...(body.expenseDate !== undefined ? { expenseDate: String(body.expenseDate) } : {}),
      ...(body.description !== undefined ? { description: String(body.description) } : {}),
      ...(body.amount !== undefined ? { amount: Number(body.amount) } : {}),
    });
    if (!item) return res.status(404).json({ error: 'Gasto no encontrado' });
    res.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al actualizar';
    res.status(400).json({ error: msg });
  }
});

router.delete('/cash/:id', requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const ok = await repo.deleteCashExpense(id);
    if (!ok) return res.status(404).json({ error: 'Gasto no encontrado' });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

export default router;
