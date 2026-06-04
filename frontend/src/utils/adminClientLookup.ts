import type { AdminClientWithHistory } from '../api';

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function adminClientMatchesPhoneDigits(c: AdminClientWithHistory, phoneDigits: string): boolean {
  if (phoneDigits.length < 6) return false;
  const phonesOnFile = Array.isArray(c.phones) && c.phones.length > 0 ? c.phones : c.phone ? [c.phone] : [];
  if (phonesOnFile.some((p) => normalizePhoneDigits(p) === phoneDigits)) return true;
  return c.appointments.some((a) => normalizePhoneDigits(a.phone || '') === phoneDigits);
}

export function adminClientPrimaryPhone(c: AdminClientWithHistory): string {
  const byFile = Array.isArray(c.phones) ? c.phones.find((p) => p.trim().length > 0) : null;
  if (byFile) return byFile.trim();
  if (c.phone?.trim()) return c.phone.trim();
  const byHistory = c.appointments
    .map((a) => (a.phone ?? '').trim())
    .find((p) => p.length > 0);
  return byHistory ?? '';
}

export function resolveClientForNewAppointment(
  adminClients: AdminClientWithHistory[],
  linkedClientId: number | null,
  name: string,
  phone: string
): AdminClientWithHistory | null {
  if (linkedClientId != null) {
    const byId = adminClients.find((c) => c.id === linkedClientId);
    if (byId) return byId;
  }
  const nameNorm = name.trim().toLowerCase();
  if (nameNorm) {
    const byName = adminClients.filter((c) => c.name.trim().toLowerCase() === nameNorm);
    if (byName.length === 1) return byName[0];
  }
  const phoneDigits = normalizePhoneDigits(phone);
  if (phoneDigits.length >= 8) {
    const byPhone = adminClients.filter((c) => adminClientMatchesPhoneDigits(c, phoneDigits));
    if (byPhone.length === 1) return byPhone[0];
  }
  return null;
}

export function resolveAdminClientId(input: {
  userId?: number | null;
  name?: string;
  phone?: string;
  adminClients?: AdminClientWithHistory[];
}): number | null {
  const uid = input.userId;
  if (uid != null && Number.isFinite(uid) && uid > 0) return uid;
  const clients = input.adminClients;
  if (!clients?.length) return null;
  const matched = resolveClientForNewAppointment(clients, null, input.name ?? '', input.phone ?? '');
  return matched?.id ?? null;
}
