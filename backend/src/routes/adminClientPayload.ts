import type { Appointment } from '../types.js';
import { dbDateTimeToIsoUtc } from '../dbDateTime.js';
import type { DbUser } from '../repositories/users.js';
import * as userRepo from '../repositories/users.js';

export function toAdminClientPayload(
  user: DbUser,
  phones: string[],
  appointments: Appointment[] = []
) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: phones[0] ?? null,
    phones,
    points: user.points,
    avatarUrl: user.avatar_url ?? null,
    depositExempt: userRepo.isUserDepositExempt(user),
    adminNotes: user.admin_notes?.trim() ? user.admin_notes.trim() : null,
    hasGoogleAccount: Boolean(user.google_uid),
    createdAt: dbDateTimeToIsoUtc(user.created_at),
    appointments,
  };
}
