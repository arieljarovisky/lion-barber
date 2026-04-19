import { Router } from 'express';
import { verifyGoogleToken, isAdminEmail, signJwt } from '../auth.js';
import * as userRepo from '../repositories/users.js';
import * as staffInvites from '../repositories/staffInvites.js';
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
    const picture = payload.picture?.trim() || null;
    const emailLower = email.toLowerCase();

    const invite = await staffInvites.findInviteByEmail(emailLower);

    let user = await userRepo.findUserByGoogleUid(googleUid);
    if (!user) {
      const byEmail = await userRepo.findUserByEmail(email);
      if (byEmail) {
        if (byEmail.google_uid !== googleUid) {
          await userRepo.updateUserGoogleUid(byEmail.id, googleUid);
        }
        user = (await userRepo.findUserById(byEmail.id))!;
      }
    }

    if (!user) {
      let role = 'client';
      if (isAdminEmail(email)) role = 'admin';
      else if (invite) role = 'staff';

      const inviteBarberId = invite?.barberId ?? null;
      user = await userRepo.createUser({
        google_uid: googleUid,
        email,
        name,
        role,
        barberId: role === 'staff' ? inviteBarberId : null,
      });
      if (invite) await staffInvites.deleteInviteByEmail(emailLower);
    } else {
      if (isAdminEmail(email) && user.role !== 'admin') {
        await userRepo.updateUserRole(user.id, 'admin');
      } else if (invite && user.role !== 'admin') {
        await userRepo.updateUserRole(user.id, 'staff');
        if (invite.barberId) {
          await userRepo.updateUserBarberId(user.id, invite.barberId);
        }
      }
      if (invite) await staffInvites.deleteInviteByEmail(emailLower);
      user = (await userRepo.findUserById(user.id))!;
    }

    await userRepo.updateUserProfile(user.id, { name, avatarUrl: picture });
    user = (await userRepo.findUserById(user.id))!;

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
        points: user.points ?? 0,
        barberId: user.barber_id ?? null,
        avatarUrl: user.avatar_url ?? null,
      },
    });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(401).json({ error: 'Token de Google inválido o expirado' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const authReq = req as import('../middleware/auth.js').AuthRequest;
  const user = await userRepo.findUserById(authReq.user!.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    points: user.points ?? 0,
    barberId: user.barber_id ?? null,
    avatarUrl: user.avatar_url ?? null,
  });
});

export default router;
