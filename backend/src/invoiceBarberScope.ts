import { isSuperAdminEmail } from './auth.js';
import { getAllBarbers, getBarberById } from './repositories/barbers.js';

/** Super admin sin `barber_id` en users: email → id de barbero (misma regla que en frontend). */
export const SUPER_ADMIN_BARBER_BY_EMAIL: Record<string, string> = {
  'agustincarluccio@gmail.com': 'barber_1',
};

/** Vincula barber_id en users para super admins conocidos (idempotente). */
export async function syncSuperAdminBarberLinks(): Promise<void> {
  const { default: pool } = await import('./db.js');
  for (const [email, barberId] of Object.entries(SUPER_ADMIN_BARBER_BY_EMAIL)) {
    await pool.execute(
      'UPDATE users SET barber_id = ? WHERE LOWER(email) = ? AND (barber_id IS NULL OR barber_id = "")',
      [barberId, email]
    );
  }
}

export type InvoiceBarberScope =
  | { kind: 'restricted'; barberId: string; barberName: string }
  | { kind: 'unrestricted' };

function inferBarberIdFromEmail(email: string, barbers: { id: string; name: string }[]): string | null {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (!local) return null;
  for (const b of barbers) {
    const name = b.name.toLowerCase();
    const compact = name.replace(/\s+/g, '');
    if (compact.length >= 3 && local.includes(compact)) return b.id;
    if (/agus|agustin/i.test(local) && /agus/i.test(name)) return b.id;
    if (/valen|valentin/i.test(local) && /valen/i.test(name)) return b.id;
    if (/toni|jaime/i.test(local) && /(toni|jaime)/i.test(name)) return b.id;
  }
  return null;
}

export async function resolveInvoiceBarberScope(user: {
  email: string;
  barberId: string | null;
  role: string;
}): Promise<InvoiceBarberScope> {
  const email = user.email.trim().toLowerCase();
  if (user.role !== 'admin' || !isSuperAdminEmail(email)) {
    throw new Error('No tenés permiso para facturar con AFIP.');
  }

  let barberId = user.barberId?.trim() || SUPER_ADMIN_BARBER_BY_EMAIL[email] || null;
  if (!barberId) {
    const barbers = await getAllBarbers();
    barberId = inferBarberIdFromEmail(email, barbers);
  }

  if (barberId) {
    const barber = await getBarberById(barberId);
    if (!barber) {
      throw new Error('Tu usuario está vinculado a un barbero que no existe en la agenda.');
    }
    return { kind: 'restricted', barberId: barber.id, barberName: barber.name };
  }

  return { kind: 'unrestricted' };
}

export function assertAppointmentInInvoiceScope(
  scope: InvoiceBarberScope,
  appointmentBarberId: string | null | undefined
): void {
  if (scope.kind === 'unrestricted') return;
  const bid = appointmentBarberId?.trim();
  if (!bid) {
    throw new Error('El turno no tiene barbero asignado.');
  }
  if (bid !== scope.barberId) {
    throw new Error(
      `Solo podés facturar turnos de ${scope.barberName}. Este turno pertenece a otro barbero.`
    );
  }
}
