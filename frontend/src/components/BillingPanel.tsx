import React, { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Receipt } from 'lucide-react';
import type { Appointment, Service } from '../api';
import { formatArs, resolveAppointmentServiceAmountArs } from '../utils/money';

const WINDOW_DAYS = 120;

type BillingPanelProps = {
  appointments: Appointment[];
  services: Service[];
  loading: boolean;
  afipConfigured: boolean;
  invoicingId: string | null;
  onInvoiceClick: (app: Appointment) => void;
};

export default function BillingPanel({
  appointments,
  services,
  loading,
  afipConfigured,
  invoicingId,
  onInvoiceClick,
}: BillingPanelProps) {
  const rows = useMemo(() => {
    const cutoffStr = format(subDays(new Date(), WINDOW_DAYS), 'yyyy-MM-dd');
    const list = appointments.filter((a) => {
      if ((a.status ?? 'scheduled') === 'cancelled') return false;
      return a.date >= cutoffStr;
    });
    list.sort((a, b) => {
      const da = a.date.localeCompare(b.date);
      if (da !== 0) return -da;
      return (b.time || '').localeCompare(a.time || '');
    });
    return list;
  }, [appointments]);

  if (!afipConfigured) {
    return (
      <div className="max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
        <p className="font-bold">AFIP no configurado</p>
        <p className="mt-1 text-amber-900/90">
          Definí <code className="rounded bg-white/80 px-1 text-xs">AFIP_ACCESS_TOKEN</code> y{' '}
          <code className="rounded bg-white/80 px-1 text-xs">AFIP_CUIT</code> en el servidor; para tu CUIT,
          sumá certificado y clave con <code className="rounded bg-white/80 px-1 text-xs">AFIP_CERT_PATH</code> +{' '}
          <code className="rounded bg-white/80 px-1 text-xs">AFIP_KEY_PATH</code> (o PEM en{' '}
          <code className="rounded bg-white/80 px-1 text-xs">AFIP_CERT</code> /{' '}
          <code className="rounded bg-white/80 px-1 text-xs">AFIP_KEY</code>). Si definís cert/clave a medias, la
          integración queda inválida hasta completarlas.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Cargando turnos…
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-4">
      <p className="text-sm text-zinc-600">
        Turnos de los últimos {WINDOW_DAYS} días (no cancelados). Podés facturar desde aquí o desde la agenda del día.
      </p>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Fecha / hora</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Servicio</th>
                <th className="px-4 py-3 text-right">Importe serv.</th>
                <th className="px-4 py-3">Factura</th>
                <th className="w-36 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                    No hay turnos en este período.
                  </td>
                </tr>
              ) : (
                rows.map((app) => {
                  const amt = resolveAppointmentServiceAmountArs(app, services);
                  return (
                    <tr key={app.id} className="bg-white hover:bg-zinc-50/80">
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-800">
                        {format(new Date(app.date + 'T12:00:00'), 'd MMM yyyy', { locale: es })} · {app.time}
                      </td>
                      <td className="max-w-[10rem] truncate px-4 py-3 font-medium text-zinc-900">{app.name}</td>
                      <td className="max-w-[12rem] truncate px-4 py-3 text-zinc-700">{app.service}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-800">
                        {amt != null ? `$ ${formatArs(amt)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {app.afipCae ? (
                          <span className="text-emerald-800">
                            {app.afipPtoVta}-{app.afipCbteNro} · CAE {app.afipCae}
                          </span>
                        ) : (
                          <span className="text-zinc-400">Pendiente</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!app.afipCae && (
                          <button
                            type="button"
                            onClick={() => onInvoiceClick(app)}
                            disabled={invoicingId === app.id || amt == null}
                            className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                          >
                            <Receipt size={12} />
                            {invoicingId === app.id ? '…' : 'Facturar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
