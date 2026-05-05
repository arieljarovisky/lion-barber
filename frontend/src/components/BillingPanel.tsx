import React, { useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, FileDown, Loader2, Receipt, Search, SlidersHorizontal } from 'lucide-react';
import type { Appointment, Barber, Service } from '../api';
import { formatArs, resolveAppointmentServiceAmountArs } from '../utils/money';
import { printLionBarberInvoice } from '../utils/invoicePrint';

const WINDOW_DAYS = 120;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

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
  bulkInvoicing?: boolean;
  onInvoiceClick: (app: Appointment) => void;
  onBulkInvoice: (appointmentIds: string[]) => void;
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
  bulkInvoicing = false,
  onInvoiceClick,
  onBulkInvoice,
}: BillingPanelProps) {
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), WINDOW_DAYS), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>('all');
  const [barberId, setBarberId] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const startIdx = (pageClamped - 1) * pageSize;
  const pageRows = rows.slice(startIdx, startIdx + pageSize);
  const selectableRows = useMemo(
    () => rows.filter((a) => !a.afipCae && resolveAppointmentServiceAmountArs(a, services) != null),
    [rows, services]
  );
  const selectableIds = useMemo(() => new Set(selectableRows.map((a) => a.id)), [selectableRows]);
  const pageSelectableRows = useMemo(
    () => pageRows.filter((a) => !a.afipCae && resolveAppointmentServiceAmountArs(a, services) != null),
    [pageRows, services]
  );
  const pageSelectableIds = useMemo(() => pageSelectableRows.map((a) => a.id), [pageSelectableRows]);
  const selectedCount = selectedIds.length;
  const allSelectableSelected = selectableRows.length > 0 && selectedCount === selectableRows.length;
  const allPageSelected =
    pageSelectableIds.length > 0 && pageSelectableIds.every((id) => selectedIds.includes(id));

  useEffect(() => {
    setPage(1);
  }, [search, dateFrom, dateTo, invoiceFilter, barberId]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages, pageSize]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => selectableIds.has(id)));
  }, [selectableIds]);

  const resetFilters = () => {
    setSearch('');
    setDateFrom(format(subDays(new Date(), WINDOW_DAYS), 'yyyy-MM-dd'));
    setDateTo(format(new Date(), 'yyyy-MM-dd'));
    setInvoiceFilter('all');
    setBarberId('');
    setPage(1);
  };

  const toggleRowSelection = (appointmentId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(appointmentId) ? prev : [...prev, appointmentId];
      return prev.filter((id) => id !== appointmentId);
    });
  };

  const toggleSelectAllFiltered = (checked: boolean) => {
    setSelectedIds(checked ? selectableRows.map((a) => a.id) : []);
  };

  const toggleSelectPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        const merged = new Set([...prev, ...pageSelectableIds]);
        return Array.from(merged);
      }
      const removeSet = new Set(pageSelectableIds);
      return prev.filter((id) => !removeSet.has(id));
    });
  };

  const handleBulkInvoiceClick = () => {
    if (selectedIds.length === 0) return;
    onBulkInvoice(selectedIds);
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <p>
            <strong className="text-zinc-800">{totalRows}</strong> turno(s) con estos filtros.
          </p>
          <label className="flex items-center gap-2 font-medium text-zinc-600">
            <span className="uppercase tracking-wide">Por página</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
          <button
            type="button"
            onClick={() => toggleSelectAllFiltered(!allSelectableSelected)}
            disabled={selectableRows.length === 0 || bulkInvoicing}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {allSelectableSelected ? 'Deseleccionar filtrados' : 'Seleccionar filtrados'}
          </button>
          <button
            type="button"
            onClick={() => toggleSelectPage(!allPageSelected)}
            disabled={pageSelectableIds.length === 0 || bulkInvoicing}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {allPageSelected ? 'Deseleccionar página' : 'Seleccionar página'}
          </button>
          <button
            type="button"
            onClick={handleBulkInvoiceClick}
            disabled={selectedCount === 0 || bulkInvoicing}
            className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Receipt size={12} />
            {bulkInvoicing ? 'Facturando…' : `Facturar seleccionados (${selectedCount})`}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="w-10 px-3 py-3 text-center">
                  <span className="sr-only">Seleccionar</span>
                </th>
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
              {totalRows === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                    No hay turnos con estos filtros.
                  </td>
                </tr>
              ) : (
                pageRows.map((app) => {
                  const amt = resolveAppointmentServiceAmountArs(app, services);
                  const selectable = !app.afipCae && amt != null;
                  const checked = selectedIds.includes(app.id);
                  return (
                    <tr key={app.id} className="bg-white hover:bg-zinc-50/80">
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!selectable || bulkInvoicing}
                          onChange={(e) => toggleRowSelection(app.id, e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
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
                                  barbers,
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
        {totalRows > 0 && (
          <div className="flex flex-col gap-3 border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-600">
              Mostrando{' '}
              <strong className="text-zinc-900">
                {startIdx + 1}–{Math.min(startIdx + pageSize, totalRows)}
              </strong>{' '}
              de <strong className="text-zinc-900">{totalRows}</strong>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pageClamped <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Anterior
              </button>
              <span className="min-w-[7rem] text-center text-xs font-semibold text-zinc-700">
                Página {pageClamped} / {totalPages}
              </span>
              <button
                type="button"
                disabled={pageClamped >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
