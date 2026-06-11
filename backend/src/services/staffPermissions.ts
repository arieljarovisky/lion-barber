import type { DbUser } from '../repositories/users.js';

export interface StaffPermissions {
  viewAllAgendas: boolean;
  editAllAgendas: boolean;
}

export type StaffPermissionUser = {
  role: string;
  barberId?: string | null;
  permViewAllAgendas?: boolean;
  permEditAllAgendas?: boolean;
};

function flagOn(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  return false;
}

export function staffPermissionsFromDbUser(user: Pick<DbUser, 'role' | 'perm_view_all_agendas' | 'perm_edit_all_agendas'>): StaffPermissions | null {
  if (user.role !== 'staff') return null;
  const editAll = flagOn(user.perm_edit_all_agendas);
  const viewAll = flagOn(user.perm_view_all_agendas) || editAll;
  return { viewAllAgendas: viewAll, editAllAgendas: editAll };
}

export function staffPermissionsFromFlags(user: StaffPermissionUser): StaffPermissions | null {
  if (user.role !== 'staff') return null;
  const editAll = Boolean(user.permEditAllAgendas);
  const viewAll = Boolean(user.permViewAllAgendas) || editAll;
  return { viewAllAgendas: viewAll, editAllAgendas: editAll };
}

export function staffCanViewAllAgendas(user: StaffPermissionUser): boolean {
  if (user.role === 'admin') return true;
  if (user.role !== 'staff') return false;
  return Boolean(user.permViewAllAgendas) || Boolean(user.permEditAllAgendas);
}

export function staffCanEditBarberAgenda(user: StaffPermissionUser, barberId: string): boolean {
  if (user.role === 'admin') return true;
  if (user.role !== 'staff' || !user.barberId) return false;
  if (user.permEditAllAgendas) return true;
  return user.barberId === barberId;
}

export function staffCanEditAllAgendas(user: StaffPermissionUser): boolean {
  if (user.role === 'admin') return true;
  if (user.role !== 'staff') return false;
  return Boolean(user.permEditAllAgendas);
}
