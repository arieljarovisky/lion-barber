import type { Appointment } from '../api';

export type AppointmentPaymentBadgeInfo = {
  label: string;
  className: string;
};

export function getAppointmentPaymentBadgeInfo(app: Appointment): AppointmentPaymentBadgeInfo {
  if (app.status === 'pending_payment') {
    return {
      label: 'Pago pendiente',
      className: 'bg-amber-100 text-amber-900 border border-amber-300',
    };
  }
  if (app.depositPaid) {
    return {
      label: 'Seña pagada',
      className: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    };
  }
  return {
    label: 'Sin seña',
    className: 'bg-zinc-100 text-zinc-700 border border-zinc-200',
  };
}

type Props = {
  app: Appointment;
  className?: string;
};

export default function AppointmentPaymentBadge({ app, className = '' }: Props) {
  const badge = getAppointmentPaymentBadgeInfo(app);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className} ${className}`.trim()}
    >
      {badge.label}
    </span>
  );
}
