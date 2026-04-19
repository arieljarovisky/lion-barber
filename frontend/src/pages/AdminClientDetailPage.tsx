import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, User } from 'lucide-react';
import DashboardPanelShell, { type DashboardPanelId } from '../components/DashboardPanelShell';
import { api, ApiError } from '../api';
import type { AdminClientWithHistory } from '../api';
import {
  adminAppointmentStatusBadge,
  formatAppointmentDateYmd,
  getAdminAppointmentPaymentBadge,
  normalizeAppointmentTime,
} from '../utils/adminClientHistory';

export default function AdminClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<AdminClientWithHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const idNum = Number(clientId);
  const invalidId = !Number.isFinite(idNum) || idNum < 1;

  useEffect(() => {
    if (invalidId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .getAdminClient(idNum)
      .then((data) => {
        if (!cancelled) setClient(data.client);
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof ApiError && e.status === 404 ? 'Cliente no encontrado.' : 'No se pudo cargar el cliente.';
          setError(msg);
          setClient(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idNum, invalidId]);

  const handlePanelNavigate = useCallback(
    (panel: DashboardPanelId) => {
      if (panel === 'clientes') {
        navigate('/dashboard/clientes');
        return;
      }
      navigate('/dashboard', { state: { openView: panel } });
    },
    [navigate]
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans flex">
      <DashboardPanelShell activePanel="clientes" onNavigate={handlePanelNavigate}>
        <nav className="mb-6 text-sm text-zinc-500" aria-label="Migas de pan">
          <Link to="/dashboard/clientes" className="font-medium text-[#b39055] hover:underline">
            Clientes
          </Link>
          <span className="mx-2 text-zinc-300">/</span>
          <span className="text-zinc-700">{client?.name ?? '…'}</span>
        </nav>

        <Link
          to="/dashboard/clientes"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900"
        >
          <ChevronLeft size={18} />
          Volver al listado
        </Link>

        {invalidId && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            ID de cliente no válido.
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {!invalidId && loading ? (
          <p className="text-zinc-400">Cargando ficha…</p>
        ) : !invalidId && client ? (
          <>
            <div className="mb-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-gradient-to-br from-zinc-50 to-white px-5 py-6 sm:px-8 sm:py-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-[#e5c185]">
                      <User size={32} strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-2xl font-black tracking-tight text-zinc-900 sm:text-3xl">{client.name}</h1>
                      <p className="mt-1 truncate text-sm text-zinc-500">{client.email}</p>
                      <p className="mt-2 text-xs text-zinc-400">
                        Cliente desde{' '}
                        {format(parseISO(client.createdAt), "d 'de' MMMM yyyy · HH:mm", { locale: es })}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-1 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 sm:items-end">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Puntos</span>
                    <span className="text-2xl font-black text-[#b39055]">{client.points}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-zinc-900">Historial de turnos</h2>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                {client.appointments.length} registro{client.appointments.length === 1 ? '' : 's'}
              </span>
            </div>

            {client.appointments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500">
                Sin turnos vinculados a esta cuenta. Si reservó sin iniciar sesión, el turno solo aparece en la agenda
                con nombre y teléfono.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="max-h-[min(70vh,560px)] overflow-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-zinc-100 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Hora</th>
                        <th className="px-4 py-3">Servicio</th>
                        <th className="px-4 py-3">Barbero</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3 text-right">Seña</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {client.appointments.map((app) => {
                        const st = adminAppointmentStatusBadge(app);
                        const pay = getAdminAppointmentPaymentBadge(app);
                        return (
                          <tr key={app.id} className="bg-white hover:bg-zinc-50/90">
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-zinc-700">
                              {formatAppointmentDateYmd(app.date)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-zinc-800">{normalizeAppointmentTime(app.time)}</td>
                            <td className="max-w-[12rem] px-4 py-3 font-medium text-zinc-900 truncate sm:max-w-xs">
                              {app.service}
                            </td>
                            <td className="max-w-[8rem] px-4 py-3 text-xs text-zinc-600 truncate">{app.barber ?? '—'}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${st.className}`}
                              >
                                {st.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${pay.className}`}
                              >
                                {pay.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : null}
      </DashboardPanelShell>
    </div>
  );
}
