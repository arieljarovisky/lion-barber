import { Router } from 'express';
import { verifyGoogleToken, isAdminEmail, signJwt, verifyJwt } from '../auth.js';
import * as userRepo from '../repositories/users.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({ error: 'Se requiere idToken' });
  }
  try {
    const payload = await verifyGoogleToken(idToken);
    const googleUid = payload.sub;
    const email = payload.email ?? '';
    const name = payload.name ?? payload.email ?? 'Usuario';

    let user = await userRepo.findUserByGoogleUid(googleUid);
    if (!user) {
      user = await userRepo.findUserByEmail(email);
      if (user) {
        await userRepo.updateUserRole(user.id, isAdminEmail(email) ? 'admin' : user.role);
        user = (await userRepo.findUserById(user.id))!;
      }
    }
    if (!user) {
      const role = isAdminEmail(email) ? 'admin' : 'client';
      user = await userRepo.createUser({
        google_uid: googleUid,
        email,
        name,
        role,
      });
    } else if (isAdminEmail(email) && user.role !== 'admin') {
      await userRepo.updateUserRole(user.id, 'admin');
      user = (await userRepo.findUserById(user.id))!;
    }

    const token = signJwt({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(401).json({ error: 'Token de Google inválido o expirado' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const authReq = req as import('../middleware/auth.js').AuthRequest;
  const user = authReq.user!;
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
});

export default router;
