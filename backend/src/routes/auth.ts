import { Router } from 'express';
import { verifyGoogleToken, isAdminEmail, signJwt } from '../auth.js';
import * as userRepo from '../repositories/users.js';
import * as appointmentRepo from '../repositories/appointments.js';
import * as staffInvites from '../repositories/staffInvites.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/google', async (req, res) => {
  const body = req.body as { idToken?: string; linkPhone?: string };
  const { idToken, linkPhone: linkPhoneRaw } = body;
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
    const linkDigits = userRepo.normalizePhoneDigits(typeof linkPhoneRaw === 'string' ? linkPhoneRaw : '');

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

    /** Fichas manuales sin Google (email técnico o sin mail real): matcheo por celular o nombre único. */
    if (!user && !invite && !isAdminEmail(email)) {
      if (linkDigits.length >= 8) {
        const ids = await userRepo.findUnlinkedManualClientIdsByPhoneDigits(linkDigits);
        if (ids.length === 1) {
          const mailDup = email ? await userRepo.findUserByEmail(email) : null;
          if (!mailDup || mailDup.id === ids[0]) {
            const linked = await userRepo.linkGoogleIdentityToClient(ids[0], {
              googleUid,
              email,
              name,
              avatarUrl: picture,
            });
            if (linked) user = linked;
          }
        }
      }
      if (!user) {
        const nameId = await userRepo.findUnlinkedManualClientIdByExactNameForAutoLink(name);
        if (nameId != null) {
          const mailDup = await userRepo.findUserByEmail(email);
          if (!mailDup || mailDup.id === nameId) {
            const linked = await userRepo.linkGoogleIdentityToClient(nameId, {
              googleUid,
              email,
              name,
              avatarUrl: picture,
            });
            if (linked) user = linked;
          }
        }
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
      if (user.role === 'client' && linkDigits.length >= 8 && typeof linkPhoneRaw === 'string') {
        await userRepo.addClientPhone(user.id, linkPhoneRaw);
      }
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
    if (user.role === 'client') {
      await appointmentRepo.syncOrphanAppointmentsForClientPhones(user.id);
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
