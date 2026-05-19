import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import DashboardPanelShell, { type DashboardPanelId } from '../components/DashboardPanelShell';
import { api } from '../api';
import type { Appointment, Barber, Service } from '../api';
import { resolveAppointmentServiceAmountArs } from '../utils/money';

const BARBER_SHARE = 0.5;

function todayYmd(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function monthStartYmd(): string {
  return format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');
}

type BarberRow = {
  barberKey: string;
  barberId: string;
  barberName: string;
  appointmentId: string;
  date: string;
  time: string;
  clientName: string;
  serviceName: string;
  amount: number;
  earning: number;
};

export default function BarberStatsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [fromDate, setFromDate] = useState(monthStartYmd());
  const [toDate, setToDate] = useState(todayYmd());
  const [selectedBarberKey, setSelectedBarberKey] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const handlePanelNavigate = useCallback(
    (panel: DashboardPanelId) => {
      if (panel === 'clientes') {
        navigate('/dashboard/clientes');
        return;
      }
      if (panel === 'estadisticas') {
        navigate('/dashboard/estadisticas');
        return;
      }
      if (panel === 'cierreCaja') {
        navigate('/dashboard/cierre-caja');
        return;
      }
      navigate('/dashboard', { state: { openView: panel } });
    },
    [navigate]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([api.getBarbers(), api.getServices(), api.getAppointments()])
      .then(([barberList, serviceList, apps]) => {
        if (cancelled) return;
        setBarbers(barberList);
        setServices(serviceList);
        setAppointments(apps);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'No se pudieron cargar las estadísticas.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const from = fromDate.trim();
    const to = toDate.trim();
    const byId = new Map(barbers.map((b) => [b.id, b.name] as const));
    const out: BarberRow[] = [];

    for (const app of appointments) {
      if (app.status === 'cancelled') continue;
      const d = String(app.date).slice(0, 10);
      if (from && d < from) continue;
      if (to && d > to) continue;
      const barberId = app.barberId ?? '';
      const barberName = (barberId ? byId.get(barberId) : app.barber) ?? app.barber ?? 'Sin barbero';
      const barberKey = barberId || `name:${barberName}`;
      const amount = resolveAppointmentServiceAmountArs(app, services) ?? 0;
      const earning = Math.round(amount * BARBER_SHARE);
      out.push({
        barberKey,
        barberId: barberId || '',
        barberName,
        appointmentId: app.id,
        date: d,
        time: app.time,
        clientName: app.name,
        serviceName: app.service,
        amount,
        earning,
      });
    }
    out.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    return out;
  }, [appointments, barbers, services, fromDate, toDate]);

  const barberFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (!map.has(r.barberKey)) map.set(r.barberKey, r.barberName);
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (selectedBarberKey === 'all') return rows;
    return rows.filter((r) => r.barberKey === selectedBarberKey);
  }, [rows, selectedBarberKey]);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, selectedBarberKey]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage]);

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, row) => {
          acc.services += 1;
          acc.gross += row.amount;
          acc.earning += row.earning;
          return acc;
        },
        { services: 0, gross: 0, earning: 0 }
      ),
    [filteredRows]
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans flex">
      <DashboardPanelShell activePanel="estadisticas" onNavigate={handlePanelNavigate}>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Estadísticas de barberos</h1>
            <p className="mt-1 text-sm text-zinc-500">Ganancia estimada calculada como 50% del valor del servicio.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Desde
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Hasta
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Barbero
              <select
                value={selectedBarberKey}
                onChange={(e) => setSelectedBarberKey(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
              >
                <option value="all">Todos</option>
                {barberFilterOptions.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Servicios</p>
            <p className="mt-1 text-2xl font-black text-zinc-900">{totals.services}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Total servicios</p>
            <p className="mt-1 text-2xl font-black text-zinc-900">${totals.gross.toLocaleString('es-AR')}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Ganancia barberos (50%)</p>
            <p className="mt-1 text-2xl font-black text-emerald-700">${totals.earning.toLocaleString('es-AR')}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-zinc-500">Cargando estadísticas…</p>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-500">
            No hay servicios para el rango de fechas seleccionado.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-zinc-100 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Hora</th>
                    <th className="px-4 py-3">Barbero</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Servicio</th>
                    <th className="px-4 py-3 text-right">Valor servicio</th>
                    <th className="px-4 py-3 text-right">Ganancia (50%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {paginatedRows.map((r) => (
                    <tr key={r.appointmentId} className="hover:bg-zinc-50/70">
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">{r.date}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-800">{r.time}</td>
                      <td className="max-w-[12rem] truncate px-4 py-3 font-semibold text-zinc-900">{r.barberName}</td>
                      <td className="max-w-[16rem] truncate px-4 py-3 font-medium text-zinc-900">{r.clientName}</td>
                      <td className="max-w-[18rem] truncate px-4 py-3 text-zinc-700">{r.serviceName}</td>
                      <td className="px-4 py-3 text-right text-zinc-700">${r.amount.toLocaleString('es-AR')}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">${r.earning.toLocaleString('es-AR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3">
              <p className="text-xs text-zinc-500">
                Mostrando {(currentPage - 1) * pageSize + (paginatedRows.length > 0 ? 1 : 0)}-
                {(currentPage - 1) * pageSize + paginatedRows.length} de {filteredRows.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="text-xs font-bold text-zinc-600">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        )}
      </DashboardPanelShell>
    </div>
  );
}
