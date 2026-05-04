import React, { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileDown, Loader2, Receipt, Search, SlidersHorizontal } from 'lucide-react';
import type { Appointment, Barber, Service } from '../api';
import { formatArs, resolveAppointmentServiceAmountArs } from '../utils/money';
import { printLionBarberInvoice } from '../utils/invoicePrint';

const WINDOW_DAYS = 120;

type InvoiceFilter = 'all' | 'pending' | 'invoiced';

type BillingPanelProps = {
  appointments: Appointment[];
  services: Service[];
  barbers: Barber[];
  loading: boolean;
  afipConfigured: boolean;
  afipEmitterCuit?: string | null;
  afipCbteTipo?: number;
  invoicingId: string | null;
  onInvoiceClick: (app: Appointment) => void;
};

export default function BillingPanel({
  appointments,
  services,
  barbers,
  loading,
  afipConfigured,
  afipEmitterCuit,
  afipCbteTipo,
  invoicingId,
  onInvoiceClick,
}: BillingPanelProps) {
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), WINDOW_DAYS), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>('all');
  const [barberId, setBarberId] = useState<string>('');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = appointments.filter((a) => {
      if ((a.status ?? 'scheduled') === 'cancelled') return false;
      if (a.date < dateFrom || a.date > dateTo) return false;
      if (invoiceFilter === 'pending' && a.afipCae) return false;
      if (invoiceFilter === 'invoiced' && !a.afipCae) return false;
      if (barberId) {
        const bid = a.barberId ?? barbers.find((b) => b.name === a.barber)?.id;
        if (bid !== barberId) return false;
      }
      if (q) {
        const hay = `${a.name} ${a.phone} ${a.service} ${a.barber ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      const da = a.date.localeCompare(b.date);
      if (da !== 0) return -da;
      return (b.time || '').localeCompare(a.time || '');
    });
    return list;
  }, [appointments, search, dateFrom, dateTo, invoiceFilter, barberId, barbers]);

  const resetFilters = () => {
    setSearch('');
    setDateFrom(format(subDays(new Date(), WINDOW_DAYS), 'yyyy-MM-dd'));
    setDateTo(format(new Date(), 'yyyy-MM-dd'));
    setInvoiceFilter('all');
    setBarberId('');
  };

  if (!afipConfigured) {
    return (
      <div className="max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
        <p className="font-bold">AFIP no configurado</p>
        <p className="mt-1 text-amber-900/90">
          Definí <code className="rounded bg-white/80 px-1 text-xs">AFIP_ACCESS_TOKEN</code> y{' '}
          <code className="rounded bg-white/80 px-1 text-xs">AFIP_CUIT</code> en el servidor; para tu CUIT,
          sumá certificado y clave con <code className="rounded bg-white/80 px-1 text-xs">AFIP_CERT_PATH</code> +{' '}
          <code className="rounded bg-white/80 px-1 text-xs">AFIP_KEY_PATH</code> (en el servidor con archivos), o
          pegá el <strong>contenido PEM completo</strong> (no la ruta del archivo) en{' '}
          <code className="rounded bg-white/80 px-1 text-xs">AFIP_CERT</code> y{' '}
          <code className="rounded bg-white/80 px-1 text-xs">AFIP_KEY</code>. Si definís cert/clave a medias, la
          integración queda inválida hasta completarlas. Monotributo: en el servidor usá{' '}
          <code className="rounded bg-white/80 px-1 text-xs">AFIP_CBTE_TIPO=11</code> (Factura C).
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
        Filtrá por fechas, cliente, estado de factura o barbero. El PDF usa la identidad visual Lion Barber; al
        imprimir elegí «Guardar como PDF» en el navegador.
      </p>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-zinc-800">
          <SlidersHorizontal className="h-4 w-4 text-[#b39055]" aria-hidden />
          <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">Filtros</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
          <label className="lg:col-span-3">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">Buscar</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre, teléfono, servicio…"
                className="w-full rounded-xl border border-zinc-200 py-2.5 pl-9 pr-3 text-sm text-zinc-900 outline-none focus:border-[#b39055] focus:ring-1 focus:ring-[#b39055]/30"
              />
            </div>
          </label>
          <label className="lg:col-span-2">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-[#b39055]"
            />
          </label>
          <label className="lg:col-span-2">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">Hasta</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-[#b39055]"
            />
          </label>
          <label className="lg:col-span-2">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">Factura</span>
            <select
              value={invoiceFilter}
              onChange={(e) => setInvoiceFilter(e.target.value as InvoiceFilter)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-[#b39055]"
            >
              <option value="all">Todas</option>
              <option value="pending">Pendientes</option>
              <option value="invoiced">Ya facturadas</option>
            </select>
          </label>
          <label className="lg:col-span-2">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">Barbero</span>
            <select
              value={barberId}
              onChange={(e) => setBarberId(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-[#b39055]"
            >
              <option value="">Todos</option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 lg:col-span-1 lg:justify-end">
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-xl border border-zinc-200 px-3 py-2.5 text-xs font-bold text-zinc-600 hover:bg-zinc-50"
            >
              Reiniciar
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Mostrando <strong className="text-zinc-800">{rows.length}</strong> turno(s).
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Fecha / hora</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Servicio</th>
                <th className="hidden px-4 py-3 sm:table-cell">Barbero</th>
                <th className="px-4 py-3 text-right">Importe serv.</th>
                <th className="px-4 py-3">Factura</th>
                <th className="w-44 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                    No hay turnos con estos filtros.
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
                      <td className="hidden max-w-[8rem] truncate px-4 py-3 text-zinc-600 sm:table-cell">
                        {app.barber ?? '—'}
                      </td>
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
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {app.afipCae && (
                            <button
                              type="button"
                              onClick={() =>
                                printLionBarberInvoice({
                                  appointment: app,
                                  services,
                                  emitterCuit: afipEmitterCuit,
                                  cbteTipo: afipCbteTipo,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-[#b39055]/50 bg-[#fefce8] px-2.5 py-1.5 text-[11px] font-bold text-[#7a5c32] hover:bg-[#fef9c3]"
                            >
                              <FileDown size={12} />
                              PDF
                            </button>
                          )}
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
                        </div>
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
