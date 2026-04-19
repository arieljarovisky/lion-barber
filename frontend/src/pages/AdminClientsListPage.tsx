import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Users, ChevronRight } from 'lucide-react';
import DashboardPanelShell, { type DashboardPanelId } from '../components/DashboardPanelShell';
import { api } from '../api';
import type { AdminClientWithHistory } from '../api';

export default function AdminClientsListPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<AdminClientWithHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .getAdminClientsWithHistory()
      .then((data) => {
        if (!cancelled) setClients(data.clients);
      })
      .catch(() => {
        if (!cancelled) {
          setError('No se pudo cargar la base de clientes.');
          setClients([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        <div className="mb-8">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-500 sm:text-base">
            Elegí un cliente para abrir su ficha con el historial completo de turnos.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e5c185]/25 text-[#8a6a3e]">
              <Users size={22} />
            </div>
            <div>
              <h2 className="font-bold text-zinc-900">Cuentas registradas</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Solo clientes con rol &quot;cliente&quot; y turnos vinculados al iniciar sesión. Reservas sin cuenta no
                figuran acá.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-zinc-400">Cargando…</p>
        ) : clients.length === 0 ? (
          <p className="text-zinc-500">No hay clientes registrados todavía.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/dashboard/clientes/${c.id}`}
                  className="group flex h-full flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-[#e5c185]/80 hover:shadow-md"
                >
                  <div>
                    <p className="font-bold text-zinc-900 group-hover:text-zinc-950 truncate">{c.name}</p>
                    <p className="mt-1 text-xs text-zinc-500 truncate">{c.email}</p>
                    <p className="mt-2 text-[11px] text-zinc-400">
                      Alta{' '}
                      {format(parseISO(c.createdAt), "d/MM/yyyy HH:mm", { locale: es })}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-4">
                    <div className="flex gap-3 text-xs">
                      <span className="font-bold text-[#b39055]">{c.points} pts</span>
                      <span className="text-zinc-500">
                        {c.appointments.length} turno{c.appointments.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <ChevronRight
                      size={18}
                      className="text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-[#b39055]"
                      aria-hidden
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DashboardPanelShell>
    </div>
  );
}
