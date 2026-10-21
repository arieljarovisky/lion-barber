import { parseArsAmount } from '../arsAmount.js';
import { query } from '../db.js';
import type { Appointment, ServicePaymentSplit } from '../types.js';
import {
  getSubscriptionPlanById,
  type SubscriptionPlan,
} from '../repositories/subscriptionPlans.js';
import * as groups from '../repositories/clientSubscriptionGroups.js';

export interface ClientSubscriptionMember {
  id: number;
  name: string;
  email: string;
}

export interface ClientSubscriptionStatus {
  planId: string;
  planName: string;
  cutsPerMonth: number;
  cutsUsed: number;
  cutsRemaining: number;
  /** Fecha de activación del abono (YYYY-MM-DD). */
  periodStart: string;
  /** Fecha de vencimiento solo si el plan tiene vigencia configurada; si no, null. */
  periodEnd: string | null;
  validityDays: number | null;
  monthlyPrice: string;
  /** Grupo compartido (padre/hijos, hermanos, etc.). */
  groupId?: number;
  ownerUserId?: number | null;
  sharedMembers?: ClientSubscriptionMember[];
}

/** Fecha calendario actual en Argentina (YYYY-MM-DD). */
export function currentArgentinaYmd(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

/** Suma días calendario a una fecha YYYY-MM-DD. */
export function addDaysYmd(startYmd: string, days: number): string {
  const [y, m, d] = startYmd.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function subscriptionExpiresAtYmd(
  activatedAt: string,
  validityDays: number | null | undefined
): string | null {
  if (validityDays == null || !Number.isFinite(validityDays) || validityDays <= 0) return null;
  return addDaysYmd(activatedAt, Math.floor(validityDays));
}

export function isSubscriptionExpiredByDate(
  activatedAt: string,
  validityDays: number | null | undefined
): boolean {
  const expiresAt = subscriptionExpiresAtYmd(activatedAt, validityDays);
  if (!expiresAt) return false;
  return currentArgentinaYmd() > expiresAt;
}

async function expireSubscriptionGroup(groupId: number): Promise<void> {
  await groups.deleteSubscriptionGroup(groupId);
}

async function maybeExpireSubscriptionGroup(
  groupId: number,
  plan: SubscriptionPlan,
  activatedAt: string,
  cutsUsed: number,
  cutsAllowance: number
): Promise<boolean> {
  if (isSubscriptionExpiredByDate(activatedAt, plan.validityDays)) {
    await expireSubscriptionGroup(groupId);
    return true;
  }
  if (cutsUsed >= cutsAllowance) {
    await expireSubscriptionGroup(groupId);
    return true;
  }
  return false;
}

async function resolveGroupIdForUser(userId: number): Promise<number | null> {
  let groupId = await groups.getSubscriptionGroupIdForUser(userId);
  if (groupId != null) return groupId;
  return groups.migrateLegacyUserSubscriptionToGroup(userId);
}

async function buildStatusFromGroup(
  groupId: number,
  viewerUserId: number
): Promise<ClientSubscriptionStatus | null> {
  const group = await groups.getSubscriptionGroupById(groupId);
  if (!group) {
    await groups.unlinkUserFromGroup(viewerUserId);
    return null;
  }

  const plan = await getSubscriptionPlanById(group.subscription_plan_id);
  if (!plan || !plan.active) {
    await expireSubscriptionGroup(groupId);
    return null;
  }

  const activatedAt =
    groups.periodStartYmd(group.period_start) ?? currentArgentinaYmd();
  const cutsUsed = Math.max(0, Number(group.cuts_used ?? 0));
  const cutsAllowance = groups.resolveCutsAllowance(group, plan.cutsPerMonth);

  if (await maybeExpireSubscriptionGroup(groupId, plan, activatedAt, cutsUsed, cutsAllowance)) {
    return null;
  }

  const cutsRemaining = Math.max(0, cutsAllowance - cutsUsed);
  const members = await groups.listSubscriptionGroupMembers(groupId);

  return {
    planId: plan.id,
    planName: plan.name,
    /** Cupo total vigente (incluye cortes apilados de compras anteriores). */
    cutsPerMonth: cutsAllowance,
    cutsUsed,
    cutsRemaining,
    periodStart: activatedAt,
    periodEnd: subscriptionExpiresAtYmd(activatedAt, plan.validityDays),
    validityDays: plan.validityDays ?? null,
    monthlyPrice: plan.monthlyPrice,
    groupId,
    ownerUserId: group.owner_user_id,
    sharedMembers: members.length > 1 ? members : undefined,
  };
}

export async function getClientSubscriptionStatus(
  userId: number
): Promise<ClientSubscriptionStatus | null> {
  const groupId = await resolveGroupIdForUser(userId);
  if (groupId == null) return null;
  return buildStatusFromGroup(groupId, userId);
}

export function userHasActiveSubscriptionPlan(
  u: { subscription_plan_id?: string | null; subscription_group_id?: number | null }
): boolean {
  return Boolean(u.subscription_group_id) || Boolean(u.subscription_plan_id?.trim());
}

/** Abono activo con cortes disponibles → sin seña en la web (además del flag manual deposit_exempt). */
export async function isClientDepositExempt(userId: number): Promise<boolean> {
  const status = await getClientSubscriptionStatus(userId);
  if (status != null && status.cutsRemaining > 0) return true;
  const rows = await query<Pick<{ deposit_exempt: number | boolean }, 'deposit_exempt'>[]>(
    'SELECT deposit_exempt FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  const u = rows[0];
  return Boolean(u?.deposit_exempt === true || u?.deposit_exempt === 1);
}

/**
 * Si el cliente ya tiene un abono vigente, suma los cortes del plan al cupo.
 * Devuelve el groupId si apiló; null si hay que crear uno nuevo.
 * @param samePlanOnly Si true, solo apila cuando el plan nuevo es el mismo (asignación admin/web).
 */
async function tryStackCutsOntoExistingSubscription(
  userId: number,
  plan: SubscriptionPlan,
  opts?: { samePlanOnly?: boolean }
): Promise<number | null> {
  const existingGroupId = await resolveGroupIdForUser(userId);
  if (existingGroupId == null) return null;

  const group = await groups.getSubscriptionGroupById(existingGroupId);
  if (!group) return null;

  if (opts?.samePlanOnly && group.subscription_plan_id !== plan.id) {
    return null;
  }

  const existingPlan = await getSubscriptionPlanById(group.subscription_plan_id);
  if (!existingPlan || !existingPlan.active) {
    await expireSubscriptionGroup(existingGroupId);
    return null;
  }

  const activatedAt =
    groups.periodStartYmd(group.period_start) ?? currentArgentinaYmd();
  const cutsUsed = Math.max(0, Number(group.cuts_used ?? 0));
  const currentAllowance = groups.resolveCutsAllowance(group, existingPlan.cutsPerMonth);

  if (isSubscriptionExpiredByDate(activatedAt, existingPlan.validityDays)) {
    await expireSubscriptionGroup(existingGroupId);
    return null;
  }
  if (cutsUsed >= currentAllowance) {
    await expireSubscriptionGroup(existingGroupId);
    return null;
  }

  const cutsToAdd = Math.max(1, Math.floor(plan.cutsPerMonth));
  await groups.addCutsToGroupAllowance(existingGroupId, {
    cutsToAdd,
    planId: plan.id,
    periodStart: currentArgentinaYmd(),
    currentAllowance,
  });
  return existingGroupId;
}

export async function assignSubscriptionPlanToClient(
  userId: number,
  planId: string | null
): Promise<boolean> {
  await assertClientRole(userId);

  if (planId == null || planId === '') {
    const hadSubscription = await groups.userHasAnySubscriptionLink(userId);
    await removeClientFromSubscription(userId);
    return hadSubscription;
  }

  const plan = await getSubscriptionPlanById(planId);
  if (!plan || !plan.active) {
    throw new Error('Plan de abono no encontrado o inactivo');
  }

  // Misma plan vigente (p. ej. recompra web): sumar cortes. Otro plan: reemplazar.
  const stackedGroupId = await tryStackCutsOntoExistingSubscription(userId, plan, {
    samePlanOnly: true,
  });
  if (stackedGroupId != null) {
    return true;
  }

  await removeClientFromSubscription(userId, { skipExpireGroup: false });

  const activatedAt = currentArgentinaYmd();
  const groupId = await groups.createSubscriptionGroup({
    planId,
    periodStart: activatedAt,
    ownerUserId: userId,
    cutsUsed: 0,
    cutsAllowance: plan.cutsPerMonth,
  });
  await groups.linkUserToGroup(userId, groupId);
  return true;
}

export type PurchasedSubscriptionResult = {
  groupId: number;
  planName: string;
  priceArs: number;
  /** Cortes que sumó esta compra al cupo. */
  cutsAdded: number;
  /** true si se apilaron sobre un abono que el cliente ya tenía. */
  stacked: boolean;
};

/** Compra en el local: si el cliente ya tiene abono vigente, suma los cortes al cupo. */
export async function purchaseSubscriptionPlanForClient(
  userId: number,
  planId: string
): Promise<PurchasedSubscriptionResult> {
  await assertClientRole(userId);
  const plan = await getSubscriptionPlanById(planId);
  if (!plan || !plan.active) {
    throw new Error('Plan de abono no encontrado o inactivo.');
  }
  const price = parseArsAmount(plan.monthlyPrice);
  if (price == null || price <= 0) {
    throw new Error(`«${plan.name}» no tiene un precio válido.`);
  }

  const cutsAdded = Math.max(1, Math.floor(plan.cutsPerMonth));
  // Venta en el local: siempre suma al abono vigente, aunque el plan sea otro.
  const stackedGroupId = await tryStackCutsOntoExistingSubscription(userId, plan);
  if (stackedGroupId != null) {
    return {
      groupId: stackedGroupId,
      planName: plan.name,
      priceArs: Math.round(price),
      cutsAdded,
      stacked: true,
    };
  }

  const groupId = await groups.createSubscriptionGroup({
    planId: plan.id,
    periodStart: currentArgentinaYmd(),
    ownerUserId: userId,
    cutsUsed: 0,
    cutsAllowance: cutsAdded,
  });
  try {
    await groups.linkUserToGroup(userId, groupId);
  } catch (err) {
    await groups.deleteSubscriptionGroup(groupId).catch(() => undefined);
    throw err;
  }
  return {
    groupId,
    planName: plan.name,
    priceArs: Math.round(price),
    cutsAdded,
    stacked: false,
  };
}

/**
 * Deshace un abono vendido en mostrador.
 * Si la venta había apilado cortes, los resta del cupo (solo si aún quedan sin usar).
 * Si era un abono nuevo sin usos, lo elimina.
 */
export async function revokePurchasedSubscription(
  userId: number,
  groupId: number,
  opts?: { planId?: string | null; cutsAdded?: number | null }
): Promise<void> {
  const group = await groups.getSubscriptionGroupById(groupId);
  if (!group) return;

  const current = await groups.getSubscriptionGroupIdForUser(userId);
  if (current != null && current !== groupId) return;

  const groupPlan = await getSubscriptionPlanById(group.subscription_plan_id);
  const cutsUsed = Math.max(0, Number(group.cuts_used ?? 0));
  const currentAllowance = groups.resolveCutsAllowance(
    group,
    groupPlan?.cutsPerMonth ?? 1
  );

  let cutsToRemove =
    opts?.cutsAdded != null && Number.isFinite(Number(opts.cutsAdded)) && Number(opts.cutsAdded) > 0
      ? Math.floor(Number(opts.cutsAdded))
      : null;

  if (cutsToRemove == null && opts?.planId) {
    const salePlan = await getSubscriptionPlanById(opts.planId);
    if (salePlan) cutsToRemove = Math.max(1, Math.floor(salePlan.cutsPerMonth));
  }

  const remaining = Math.max(0, currentAllowance - cutsUsed);
  const wasStacked =
    cutsToRemove != null && currentAllowance > cutsToRemove && remaining >= 0;

  if (wasStacked && cutsToRemove != null) {
    if (remaining < cutsToRemove) {
      throw new Error(
        'Ya se usaron cortes de este abono. No se puede anular la venta.'
      );
    }
    const nextAllowance = currentAllowance - cutsToRemove;
    if (nextAllowance <= cutsUsed) {
      const members = await groups.listSubscriptionGroupMembers(groupId);
      for (const member of members) {
        await groups.unlinkUserFromGroup(member.id);
      }
      await groups.deleteSubscriptionGroup(groupId);
      return;
    }
    await groups.setGroupSubscriptionUsage(groupId, { cutsAllowance: nextAllowance });
    return;
  }

  if (cutsUsed > 0) {
    throw new Error('Este abono ya tiene cortes usados. No se puede anular la venta.');
  }

  const members = await groups.listSubscriptionGroupMembers(groupId);
  for (const member of members) {
    await groups.unlinkUserFromGroup(member.id);
  }
  await groups.deleteSubscriptionGroup(groupId);
}

/** Ajuste manual de cortes usados y/o fecha de activación (migración / corrección admin). */
export async function updateClientSubscriptionUsage(
  userId: number,
  data: { cutsUsed?: number; periodStart?: string }
): Promise<void> {
  await assertClientRole(userId);

  if (data.cutsUsed === undefined && data.periodStart === undefined) return;

  const groupId = await resolveGroupIdForUser(userId);
  if (groupId == null) {
    throw new Error('El cliente no tiene un abono activo.');
  }

  const group = await groups.getSubscriptionGroupById(groupId);
  if (!group) {
    throw new Error('Abono no encontrado.');
  }

  const plan = await getSubscriptionPlanById(group.subscription_plan_id);
  if (!plan) {
    throw new Error('Plan de abono no encontrado.');
  }

  const patch: { cutsUsed?: number; periodStart?: string } = {};

  if (data.cutsUsed !== undefined) {
    const n = typeof data.cutsUsed === 'number' ? data.cutsUsed : parseInt(String(data.cutsUsed), 10);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error('Los cortes usados deben ser un número ≥ 0.');
    }
    const allowance = groups.resolveCutsAllowance(group, plan.cutsPerMonth);
    if (n > allowance) {
      throw new Error(`Los cortes usados no pueden superar ${allowance}.`);
    }
    patch.cutsUsed = Math.floor(n);
  }

  if (data.periodStart !== undefined) {
    const ymd = String(data.periodStart).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      throw new Error('La fecha de activación debe ser YYYY-MM-DD.');
    }
    patch.periodStart = ymd;
  }

  await groups.setGroupSubscriptionUsage(groupId, patch);
}

/** Vincula un cliente al abono compartido de otro (mismo cupo de cortes). */
export async function linkClientToSharedSubscription(
  userId: number,
  hostUserId: number
): Promise<void> {
  if (userId === hostUserId) {
    throw new Error('Elegí otro cliente distinto.');
  }
  await assertClientRole(userId);
  await assertClientRole(hostUserId);

  const hostGroupId = await resolveGroupIdForUser(hostUserId);
  if (hostGroupId == null) {
    throw new Error('El cliente elegido no tiene un abono activo.');
  }

  const hostStatus = await buildStatusFromGroup(hostGroupId, hostUserId);
  if (!hostStatus || hostStatus.cutsRemaining <= 0) {
    throw new Error('El abono del cliente elegido no tiene cortes disponibles.');
  }

  const existingGroupId = await groups.getSubscriptionGroupIdForUser(userId);
  if (existingGroupId === hostGroupId) return;

  if (await groups.userHasAnySubscriptionLink(userId)) {
    await removeClientFromSubscription(userId);
  }

  await groups.linkUserToGroup(userId, hostGroupId);
}

/** Agrega un cliente al mismo grupo de abono (admin). */
export async function addMemberToClientSubscriptionGroup(
  hostUserId: number,
  memberUserId: number
): Promise<void> {
  await linkClientToSharedSubscription(memberUserId, hostUserId);
}

/** Quita a un cliente del abono compartido sin cancelar el grupo (salvo que sea el único). */
export async function removeClientFromSubscription(
  userId: number,
  opts?: { skipExpireGroup?: boolean }
): Promise<void> {
  await assertClientRole(userId);
  const groupId = await groups.getSubscriptionGroupIdForUser(userId);
  if (groupId == null) {
    await groups.unlinkUserFromGroup(userId);
    return;
  }

  const memberCount = await groups.countGroupMembers(groupId);
  await groups.unlinkUserFromGroup(userId);

  if (opts?.skipExpireGroup) return;

  const remaining = memberCount - 1;
  if (remaining <= 0) {
    await expireSubscriptionGroup(groupId);
  }
}

export async function getSubscriptionGroupForClient(userId: number): Promise<{
  groupId: number;
  members: ClientSubscriptionMember[];
  subscription: ClientSubscriptionStatus;
} | null> {
  const groupId = await resolveGroupIdForUser(userId);
  if (groupId == null) return null;
  const subscription = await buildStatusFromGroup(groupId, userId);
  if (!subscription) return null;
  const members = await groups.listSubscriptionGroupMembers(groupId);
  return { groupId, members, subscription };
}

/** Consume un corte del abono si hay cupo. Devuelve false si no aplica o no hay cortes. */
export async function tryConsumeSubscriptionCut(userId: number): Promise<boolean> {
  const groupId = await resolveGroupIdForUser(userId);
  if (groupId == null) return false;

  const status = await buildStatusFromGroup(groupId, userId);
  if (!status || status.cutsRemaining <= 0) return false;

  const ok = await groups.incrementGroupCutsUsed(
    groupId,
    status.planId,
    status.cutsPerMonth
  );
  if (ok && status.cutsRemaining === 1) {
    await expireSubscriptionGroup(groupId);
  }
  return ok;
}

export async function restoreSubscriptionCut(userId: number): Promise<void> {
  const groupId = await resolveGroupIdForUser(userId);
  if (groupId == null) return;
  const group = await groups.getSubscriptionGroupById(groupId);
  if (!group) return;
  await groups.decrementGroupCutsUsed(groupId);
}

export async function assertClientCanBookWithSubscription(userId: number): Promise<void> {
  const status = await getClientSubscriptionStatus(userId);
  if (!status) return;
  if (status.cutsRemaining <= 0) {
    throw new Error(
      `El abono «${status.planName}» no tiene cortes disponibles (${status.cutsUsed}/${status.cutsPerMonth} usados).`
    );
  }
}

function splitsUseSubscription(splits: ServicePaymentSplit[] | null | undefined): boolean {
  return Boolean(splits?.some((s) => s.method === 'subscription' && s.amount > 0));
}

async function clearAppointmentSubscriptionCut(appointmentId: string): Promise<void> {
  await query(
    `UPDATE appointments
     SET subscription_cut_applied = 0,
         subscription_plan_id = NULL,
         subscription_plan_price_ars = NULL,
         subscription_plan_cuts = NULL
     WHERE id = ?`,
    [appointmentId]
  );
}

async function markAppointmentSubscriptionCut(
  appointmentId: string,
  status: ClientSubscriptionStatus
): Promise<void> {
  const price = parseArsAmount(status.monthlyPrice);
  // Comisión por corte: precio del plan ÷ cortes del plan de catálogo (no el cupo apilado).
  const plan = await getSubscriptionPlanById(status.planId);
  const planCuts =
    plan && plan.cutsPerMonth > 0 ? plan.cutsPerMonth : status.cutsPerMonth > 0 ? status.cutsPerMonth : null;
  await query(
    `UPDATE appointments
     SET subscription_cut_applied = 1,
         subscription_plan_id = ?,
         subscription_plan_price_ars = ?,
         subscription_plan_cuts = ?
     WHERE id = ?`,
    [
      status.planId,
      price != null ? Math.round(price) : null,
      planCuts,
      appointmentId,
    ]
  );
}

export async function syncSubscriptionCutWithPayment(
  appointment: Appointment,
  newSplits: ServicePaymentSplit[] | null | undefined
): Promise<void> {
  const wasApplied = Boolean(appointment.subscriptionCutApplied);
  const usesNow = splitsUseSubscription(newSplits);

  if (usesNow && !wasApplied) {
    const uid = appointment.userId;
    if (uid == null || !Number.isFinite(Number(uid))) {
      throw new Error('Vinculá el turno al cliente para cobrar con abono.');
    }
    const status = await getClientSubscriptionStatus(Number(uid));
    if (!status || status.cutsRemaining <= 0) {
      throw new Error('El abono no tiene cortes disponibles.');
    }
    const consumed = await tryConsumeSubscriptionCut(Number(uid));
    if (!consumed) {
      throw new Error('El abono no tiene cortes disponibles.');
    }
    await markAppointmentSubscriptionCut(appointment.id, status);
  } else if (!usesNow && wasApplied) {
    const uid = appointment.userId;
    if (uid != null && Number.isFinite(Number(uid))) {
      await restoreSubscriptionCut(Number(uid));
    }
    await clearAppointmentSubscriptionCut(appointment.id);
  }
}

export async function onAppointmentConfirmed(_appointment: {
  id: string;
  userId?: number;
  status?: string;
  subscriptionCutApplied?: boolean;
}): Promise<void> {
  /* sin consumo automático */
}

export async function onAppointmentCancelled(appointment: {
  id: string;
  userId?: number;
  subscriptionCutApplied?: boolean;
}): Promise<void> {
  const uid = appointment.userId;
  if (uid == null || !appointment.subscriptionCutApplied) return;
  await restoreSubscriptionCut(Number(uid));
  await clearAppointmentSubscriptionCut(appointment.id);
}

async function assertClientRole(userId: number): Promise<void> {
  const rows = await query<{ role: string }[]>('SELECT role FROM users WHERE id = ? LIMIT 1', [
    userId,
  ]);
  if (!rows[0] || rows[0].role !== 'client') {
    throw new Error('Cliente no encontrado');
  }
}

export type { SubscriptionPlan };
