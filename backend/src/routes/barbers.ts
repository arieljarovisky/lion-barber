import { Router } from 'express';
import * as repo from '../repositories/barbers.js';

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

export default router;
