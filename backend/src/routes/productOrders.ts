import { Router } from 'express';
import { getProductOrdersByUserId } from '../repositories/productOrders.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/mine', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const orders = await getProductOrdersByUserId(authReq.user!.id);
    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar pedidos' });
  }
});

export default router;
