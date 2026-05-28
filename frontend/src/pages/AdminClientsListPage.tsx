import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Users,
  ChevronRight,
  LayoutGrid,
  List,
  Plus,
  X,
  Search,
  SlidersHorizontal,
  RotateCcw,
  Trash2,
  ShieldCheck,
  StickyNote,
} from 'lucide-react';
import DashboardPanelShell, { type DashboardPanelId } from '../components/DashboardPanelShell';
import AdminClientAvatar from '../components/AdminClientAvatar';
import { api, ApiError } from '../api';
import type { AdminClientWithHistory } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { displayClientEmail, isPlaceholderManualClientEmail } from '../utils/manualClientEmail';
import { formatPhonesForInput, parsePhonesInput } from '../utils/adminClientHistory';

const VIEW_STORAGE_KEY = 'lion-barber-admin-clients-view';

type LayoutMode = 'grid' | 'rows';

/** Orden de la lista (después de filtros y búsqueda). */
type ClientSort =
  | 'recent'
  | 'name_asc'
  | 'name_desc'
  | 'points_desc'
  | 'bookings_desc';

/** Filtro por “perfil” de cliente. */
type ClientFilterPreset =
  | 'all'
  | 'with_bookings'
  | 'no_bookings'
  | 'new_30d'
  | 'vip_points'
  | 'frequent_visits'
  | 'exempt';

const VIP_POINTS_MIN = 25;
const FREQUENT_BOOKINGS_MIN = 3;
const NEW_CLIENT_DAYS = 30;

function clientPhones(c: AdminClientWithHistory): string[] {
  if (Array.isArray(c.phones) && c.phones.length > 0) return c.phones.filter((p) => p.trim().length > 0);
  if (c.phone?.trim()) return [c.phone.trim()];
  return [];
}

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
  const { isAdmin } = useAuth();
  const [clients, setClients] = useState<AdminClientWithHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [layout, setLayout] = useState<LayoutMode>(() =>
    typeof window !== 'undefined' ? readLayoutMode() : 'grid'
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPoints, setFormPoints] = useState('0');
  const [saving, setSaving] = useState(false);
  const [deletingClientId, setDeletingClientId] = useState<number | null>(null);
  const [formError, setFormError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<ClientSort>('recent');
  const [filterPreset, setFilterPreset] = useState<ClientFilterPreset>('all');

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

  const openModal = () => {
    setFormError('');
    setFormName('');
    setFormEmail('');
    setFormPhone('');
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
    if (!name) {
      setFormError('Completá el nombre.');
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Si cargás email, tiene que ser válido.');
      return;
    }
    const pts = parseInt(formPoints, 10);
    setSaving(true);
    try {
      const phones = parsePhonesInput(formPhone);
      const phone = phones[0] ?? '';
      await api.createAdminClient({
        name,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(phones.length > 0 ? { phones } : {}),
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

  const handleDeleteClient = async (client: AdminClientWithHistory) => {
    if (deletingClientId != null) return;
    const ok = window.confirm(
      `¿Eliminar la ficha de ${client.name}?\n\nSus turnos se conservarán en la agenda, pero se desvinculan de la cuenta.`
    );
    if (!ok) return;
    setDeletingClientId(client.id);
    setError('');
    try {
      await api.deleteAdminClient(client.id);
      setClients((prev) => prev.filter((c) => c.id !== client.id));
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo eliminar el cliente.';
      setError(msg);
    } finally {
      setDeletingClientId(null);
    }
  };

  const filteredClients = useMemo(() => {
    let list = [...clients];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.adminNotes ?? '').toLowerCase().includes(q) ||
          clientPhones(c).some((p) => p.toLowerCase().includes(q))
      );
    }
    const cutoffNew = subDays(new Date(), NEW_CLIENT_DAYS).getTime();
    switch (filterPreset) {
      case 'with_bookings':
        list = list.filter((c) => c.appointments.length > 0);
        break;
      case 'no_bookings':
        list = list.filter((c) => c.appointments.length === 0);
        break;
      case 'new_30d':
        list = list.filter((c) => parseISO(c.createdAt).getTime() >= cutoffNew);
        break;
      case 'vip_points':
        list = list.filter((c) => c.points >= VIP_POINTS_MIN);
        break;
      case 'frequent_visits':
        list = list.filter((c) => c.appointments.length >= FREQUENT_BOOKINGS_MIN);
        break;
      case 'exempt':
        list = list.filter((c) => Boolean(c.depositExempt));
        break;
      default:
        break;
    }
    list.sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime();
        case 'name_asc':
          return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
        case 'name_desc':
          return b.name.localeCompare(a.name, 'es', { sensitivity: 'base' });
        case 'points_desc':
          return b.points - a.points;
        case 'bookings_desc':
          return b.appointments.length - a.appointments.length;
        default:
          return 0;
      }
    });
    return list;
  }, [clients, searchQuery, sortBy, filterPreset]);

  const filtersActive =
    searchQuery.trim() !== '' || filterPreset !== 'all' || sortBy !== 'recent';

  const resetFilters = () => {
    setSearchQuery('');
    setFilterPreset('all');
    setSortBy('recent');
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
            {isAdmin && (
              <button
                type="button"
                onClick={openModal}
                className="inline-flex items-center gap-2 rounded-xl bg-[#e5c185] px-4 py-2.5 text-sm font-bold text-zinc-950 shadow-sm transition hover:bg-[#d4b074]"
              >
                <Plus size={18} />
                Nuevo cliente
              </button>
            )}
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

        {!loading && clients.length > 0 && (
          <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-800">
                <SlidersHorizontal size={18} className="text-[#b39055]" aria-hidden />
                Buscar y filtrar
              </div>
              {filtersActive && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-600 hover:bg-zinc-100"
                >
                  <RotateCcw size={14} aria-hidden />
                  Limpiar
                </button>
              )}
            </div>
            <div className="relative mb-4">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                aria-hidden
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, email o teléfono…"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/80 py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#e5c185] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#e5c185]/30"
                autoComplete="off"
              />
            </div>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-bold uppercase tracking-wide text-zinc-500">
                Ordenar por
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as ClientSort)}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-900 focus:border-[#e5c185] focus:outline-none focus:ring-2 focus:ring-[#e5c185]/30"
                >
                  <option value="recent">Más recientes (fecha de alta)</option>
                  <option value="name_asc">Nombre A → Z</option>
                  <option value="name_desc">Nombre Z → A</option>
                  <option value="points_desc">Más puntos</option>
                  <option value="bookings_desc">Más turnos (frecuentes)</option>
                </select>
              </label>
            </div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Filtros rápidos</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'all' as const, label: 'Todos' },
                  { id: 'with_bookings' as const, label: 'Con turnos' },
                  { id: 'no_bookings' as const, label: 'Sin turnos' },
                  { id: 'new_30d' as const, label: `Nuevos (${NEW_CLIENT_DAYS} días)` },
                  {
                    id: 'vip_points' as const,
                    label: `VIP puntos (≥${VIP_POINTS_MIN})`,
                  },
                  {
                    id: 'frequent_visits' as const,
                    label: `Frecuentes (≥${FREQUENT_BOOKINGS_MIN} turnos)`,
                  },
                  { id: 'exempt' as const, label: 'Exentos de seña' },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilterPreset(id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    filterPreset === id
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              Mostrando <strong className="text-zinc-800">{filteredClients.length}</strong> de {clients.length}{' '}
              cliente{clients.length === 1 ? '' : 's'}
              {filteredClients.length === 0 && clients.length > 0 && (
                <span className="ml-1 text-amber-700">· probá otra búsqueda o filtros</span>
              )}
            </p>
          </div>
        )}

        {loading ? (
          <p className="text-zinc-400">Cargando…</p>
        ) : clients.length === 0 ? (
          <p className="text-zinc-500">No hay clientes registrados todavía. Usá «Nuevo cliente» para agregar uno.</p>
        ) : filteredClients.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 px-6 py-10 text-center">
            <p className="font-medium text-zinc-700">Ningún cliente coincide con tu búsqueda o filtros.</p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 text-sm font-bold text-[#b39055] hover:underline"
            >
              Limpiar búsqueda y filtros
            </button>
          </div>
        ) : layout === 'grid' ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClients.map((c) => {
              const phones = clientPhones(c);
              const mainPhone = phones[0] ?? '';
              const extraPhones = phones.length - 1;
              return (
                <li key={c.id} className="relative">
                  <Link
                    to={`/dashboard/clientes/${c.id}`}
                    className="group flex h-full flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-[#e5c185]/80 hover:shadow-md"
                  >
                    <div className="flex gap-3">
                      <AdminClientAvatar name={c.name} avatarUrl={c.avatarUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <p className="font-bold text-zinc-900 group-hover:text-zinc-950 truncate flex-1">{c.name}</p>
                          {c.adminNotes?.trim() && (
                            <span
                              className="inline-flex shrink-0 items-center text-amber-600"
                              title={c.adminNotes.trim()}
                            >
                              <StickyNote size={14} />
                            </span>
                          )}
                          {c.subscription && (
                            <span
                              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700"
                              title={`Abono: ${c.subscription.cutsRemaining}/${c.subscription.cutsPerMonth} cortes este mes`}
                            >
                              Abono
                            </span>
                          )}
                          {c.depositExempt && !c.subscription && (
                            <span
                              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700"
                              title="Cliente exento de pagar seña"
                            >
                              <ShieldCheck size={10} />
                              Sin seña
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-zinc-500 truncate">{displayClientEmail(c.email)}</p>
                        {mainPhone ? (
                          <p className="mt-0.5 text-xs font-medium text-zinc-600 truncate">
                            {mainPhone}
                            {extraPhones > 0 ? ` +${extraPhones}` : ''}
                          </p>
                        ) : null}
                        <p className="mt-2 text-[11px] text-zinc-400">
                          Alta {format(parseISO(c.createdAt), "d/MM/yyyy HH:mm", { locale: es })}
                        </p>
                      </div>
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
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleDeleteClient(c);
                      }}
                      disabled={deletingClientId === c.id}
                      className="absolute right-3 top-3 inline-flex items-center justify-center rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      title="Eliminar cliente"
                      aria-label={`Eliminar cliente ${c.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Teléfono</th>
                    <th className="px-4 py-3 text-right">Puntos</th>
                    <th className="px-4 py-3 text-right">Turnos</th>
                    <th className="px-4 py-3">Alta</th>
                    <th className="w-24 px-2 py-3 text-right" aria-hidden />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredClients.map((c) => {
                    const phones = clientPhones(c);
                    const mainPhone = phones[0] ?? '';
                    const extraPhones = phones.length - 1;
                    return (
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
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <AdminClientAvatar name={c.name} avatarUrl={c.avatarUrl} size="sm" />
                            <span className="font-semibold text-zinc-900">{c.name}</span>
                            {c.adminNotes?.trim() && (
                              <span
                                className="inline-flex text-amber-600"
                                title={c.adminNotes.trim()}
                              >
                                <StickyNote size={14} aria-label="Tiene nota recordatoria" />
                              </span>
                            )}
                            {c.subscription && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700"
                                title={`Abono: ${c.subscription.cutsRemaining}/${c.subscription.cutsPerMonth} cortes`}
                              >
                                Abono
                              </span>
                            )}
                            {c.depositExempt && !c.subscription && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700"
                                title="Cliente exento de pagar seña"
                              >
                                <ShieldCheck size={10} />
                                Sin seña
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="max-w-[14rem] truncate px-4 py-3 text-zinc-600">{displayClientEmail(c.email)}</td>
                        <td className="max-w-[10rem] truncate px-4 py-3 text-zinc-600">
                          {mainPhone ? `${mainPhone}${extraPhones > 0 ? ` +${extraPhones}` : ''}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-[#b39055]">{c.points}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-600">{c.appointments.length}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                          {format(parseISO(c.createdAt), "d/MM/yyyy HH:mm", { locale: es })}
                        </td>
                        <td className="px-2 py-3 text-zinc-400">
                          <div className="flex items-center justify-end gap-1.5">
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteClient(c);
                                }}
                                disabled={deletingClientId === c.id}
                                className="inline-flex items-center justify-center rounded-md border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                title="Eliminar cliente"
                                aria-label={`Eliminar cliente ${c.name}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                            <ChevronRight size={18} className="ml-auto" aria-hidden />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Teléfonos <span className="font-normal normal-case text-zinc-400">(opcional)</span>
                </label>
                <textarea
                  rows={3}
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-4 py-3 text-zinc-900"
                  placeholder={'Uno por línea o separados por coma.\nEj: 11 2345 6789, 11 8888 7777'}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Email <span className="font-normal normal-case text-zinc-400">(opcional)</span>
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-4 py-3 text-zinc-900"
                  placeholder="Si lo dejás vacío, la ficha se crea igual"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Si más adelante inicia sesión con Google, podés usar el mismo email para vincular la cuenta.
                </p>
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
