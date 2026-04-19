import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Users, ChevronRight, LayoutGrid, List, Plus, X } from 'lucide-react';
import DashboardPanelShell, { type DashboardPanelId } from '../components/DashboardPanelShell';
import { api, ApiError } from '../api';
import type { AdminClientWithHistory } from '../api';

const VIEW_STORAGE_KEY = 'lion-barber-admin-clients-view';

type LayoutMode = 'grid' | 'rows';

function readLayoutMode(): LayoutMode {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    if (v === 'rows' || v === 'grid') return v;
  } catch {
    /* ignore */
  }
  return 'grid';
}

export default function AdminClientsListPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<AdminClientWithHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [layout, setLayout] = useState<LayoutMode>(() =>
    typeof window !== 'undefined' ? readLayoutMode() : 'grid'
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPoints, setFormPoints] = useState('0');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadClients = useCallback(() => {
    setLoading(true);
    setError('');
    return api
      .getAdminClientsWithHistory()
      .then((data) => setClients(data.clients))
      .catch(() => {
        setError('No se pudo cargar la base de clientes.');
        setClients([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, layout);
    } catch {
      /* ignore */
    }
  }, [layout]);

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

  const openModal = () => {
    setFormError('');
    setFormName('');
    setFormEmail('');
    setFormPoints('0');
    setModalOpen(true);
  };

  const closeModal = () => {
    if (!saving) setModalOpen(false);
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const name = formName.trim();
    const email = formEmail.trim();
    if (!name || !email) {
      setFormError('Completá nombre y email.');
      return;
    }
    const pts = parseInt(formPoints, 10);
    setSaving(true);
    try {
      await api.createAdminClient({
        name,
        email,
        points: Number.isFinite(pts) ? pts : 0,
      });
      setModalOpen(false);
      await loadClients();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo crear el cliente.';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans flex">
      <DashboardPanelShell activePanel="clientes" onNavigate={handlePanelNavigate}>
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Clientes</h1>
            <p className="mt-1 text-sm text-zinc-500 sm:text-base">
              Creá fichas manualmente o abrí cada una para ver el historial de turnos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <div className="flex rounded-xl border border-zinc-200 bg-white p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setLayout('grid')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide ${
                  layout === 'grid' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-800'
                }`}
                aria-pressed={layout === 'grid'}
                title="Vista en tarjetas"
              >
                <LayoutGrid size={16} />
                Tarjetas
              </button>
              <button
                type="button"
                onClick={() => setLayout('rows')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide ${
                  layout === 'rows' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-800'
                }`}
                aria-pressed={layout === 'rows'}
                title="Vista en filas"
              >
                <List size={16} />
                Filas
              </button>
            </div>
            <button
              type="button"
              onClick={openModal}
              className="inline-flex items-center gap-2 rounded-xl bg-[#e5c185] px-4 py-2.5 text-sm font-bold text-zinc-950 shadow-sm transition hover:bg-[#d4b074]"
            >
              <Plus size={18} />
              Nuevo cliente
            </button>
          </div>
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
              <h2 className="font-bold text-zinc-900">Cuentas de cliente</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Podés dar de alta un cliente sin que haya entrado con Google; cuando use el mismo email al iniciar sesión,
                la cuenta se vincula sola. Los turnos sin usuario siguen solo en la agenda con nombre y teléfono.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-zinc-400">Cargando…</p>
        ) : clients.length === 0 ? (
          <p className="text-zinc-500">No hay clientes registrados todavía. Usá «Nuevo cliente» para agregar uno.</p>
        ) : layout === 'grid' ? (
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
                      Alta {format(parseISO(c.createdAt), "d/MM/yyyy HH:mm", { locale: es })}
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
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3 text-right">Puntos</th>
                    <th className="px-4 py-3 text-right">Turnos</th>
                    <th className="px-4 py-3">Alta</th>
                    <th className="w-10 px-2 py-3" aria-hidden />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {clients.map((c) => (
                    <tr
                      key={c.id}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer bg-white hover:bg-zinc-50/90"
                      onClick={() => navigate(`/dashboard/clientes/${c.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/dashboard/clientes/${c.id}`);
                        }
                      }}
                    >
                      <td className="px-4 py-3 font-semibold text-zinc-900">{c.name}</td>
                      <td className="max-w-[14rem] truncate px-4 py-3 text-zinc-600">{c.email}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#b39055]">{c.points}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-600">{c.appointments.length}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                        {format(parseISO(c.createdAt), "d/MM/yyyy HH:mm", { locale: es })}
                      </td>
                      <td className="px-2 py-3 text-zinc-400">
                        <ChevronRight size={18} className="ml-auto" aria-hidden />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DashboardPanelShell>

      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-client-title"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h2 id="new-client-title" className="text-lg font-black text-zinc-900">
                Nuevo cliente
              </h2>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateClient} className="space-y-4 px-5 py-5">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>
              )}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">Nombre</label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-4 py-3 text-zinc-900"
                  placeholder="Ej. Juan Pérez"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-4 py-3 text-zinc-900"
                  placeholder="mismo email que usará con Google"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">Puntos iniciales</label>
                <input
                  type="number"
                  min={0}
                  max={999999}
                  value={formPoints}
                  onChange={(e) => setFormPoints(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-4 py-3 text-zinc-900"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="flex-1 rounded-xl border border-zinc-200 py-3 font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-zinc-900 py-3 font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {saving ? 'Guardando…' : 'Crear cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
