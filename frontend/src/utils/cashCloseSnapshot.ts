import type { Appointment, AppointmentCashClosePaymentSnapshot } from '../api';

export function applyCashClosePaymentSnapshot(
  app: Appointment,
  snapshot: AppointmentCashClosePaymentSnapshot
): Appointment {
  return {
    ...app,
    servicePaymentSplits:
      snapshot.servicePaymentSplits !== undefined
        ? snapshot.servicePaymentSplits
        : app.servicePaymentSplits,
    servicePaymentMethod:
      snapshot.servicePaymentMethod !== undefined
        ? snapshot.servicePaymentMethod
        : app.servicePaymentMethod,
    tipAmount: snapshot.tipAmount !== undefined ? snapshot.tipAmount : app.tipAmount,
    depositPaid: snapshot.depositPaid !== undefined ? snapshot.depositPaid : app.depositPaid,
    depositAmountArs:
      snapshot.depositAmountArs !== undefined ? snapshot.depositAmountArs : app.depositAmountArs,
    subscriptionCutApplied:
      snapshot.subscriptionCutApplied !== undefined
        ? snapshot.subscriptionCutApplied
        : app.subscriptionCutApplied,
    products: snapshot.products !== undefined ? snapshot.products : app.products,
  };
}

export function appointmentsWithCashCloseSnapshots(
  appointments: Appointment[],
  snapshots: AppointmentCashClosePaymentSnapshot[]
): Appointment[] {
  if (!snapshots.length) return appointments;
  const byId = new Map(snapshots.map((s) => [s.appointmentId, s]));
  return appointments.map((app) => {
    const snap = byId.get(app.id);
    return snap ? applyCashClosePaymentSnapshot(app, snap) : app;
  });
}
