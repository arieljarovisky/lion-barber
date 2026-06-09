import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, Trash2, ShieldCheck, StickyNote, Save, Repeat, UserPlus, Users, X } from 'lucide-react';
import DashboardPanelShell, { type DashboardPanelId } from '../components/DashboardPanelShell';
import AdminClientAvatar from '../components/AdminClientAvatar';
import AppointmentPaymentBadge from '../components/AppointmentPaymentBadge';
import { api, ApiError } from '../api';
import { useAuth } from '../contexts/AuthContext';
import type { AdminClientWithHistory, SubscriptionPlan } from '../api';
import {
  adminAppointmentStatusBadge,
  formatAppointmentDateYmd,
  formatPhonesForInput,
  normalizeAppointmentTime,
  parsePhonesInput,
} from '../utils/adminClientHistory';
import { displayClientEmail, isPlaceholderManualClientEmail } from '../utils/manualClientEmail';
import {
  formatAppointmentProductsSummary,
  sumAppointmentProducts,
} from '../utils/appointmentProducts';
import { formatArs, parseSignedArsInput, clientAccountBalanceOwedArs } from '../utils/money';

function clientPhones(client: AdminClientWithHistory): string[] {
  if (Array.isArray(client.phones) && client.phones.length > 0) return client.phones.filter((p) => p.trim().length > 0);
  if (client.phone?.trim()) return [client.phone.trim()];
  return [];
}

export default function AdminClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [client, setClient] = useState<AdminClientWithHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveOk, setSaveOk] = useState('');

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhones, setFormPhones] = useState('');
  const [formPoints, setFormPoints] = useState('0');
  const [formAccountBalance, setFormAccountBalance] = useState('0');
  const [formNotes, setFormNotes] = useState('');
  const [formExempt, setFormExempt] = useState(false);
  const [formSubscriptionPlanId, setFormSubscriptionPlanId] = useState('');
  const [availablePlans, setAvailablePlans] = useState<SubscriptionPlan[]>([]);
  const [allClients, setAllClients] = useState<AdminClientWithHistory[]>([]);
  const [linkHostClientId, setLinkHostClientId] = useState('');
  const [addMemberClientId, setAddMemberClientId] = useState('');
  const [subscriptionActionLoading, setSubscriptionActionLoading] = useState(false);

  const idNum = Number(clientId);
  const invalidId = !Number.isFinite(idNum) || idNum < 1;
  const phones = client ? clientPhones(client) : [];
  const emailLocked = Boolean(client?.hasGoogleAccount);

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

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    api
      .getSubscriptionPlans()
      .then((r) => {
        if (!cancelled) setAvailablePlans(r.plans.filter((p) => p.active));
      })
      .catch(() => {
        if (!cancelled) setAvailablePlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    api
      .getAdminClientsWithHistory()
      .then((r) => {
        if (!cancelled) setAllClients(r.clients);
      })
      .catch(() => {
        if (!cancelled) setAllClients([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!client) return;
    setFormName(client.name);
    setFormEmail(isPlaceholderManualClientEmail(client.email) ? '' : client.email);
    setFormPhones(formatPhonesForInput(clientPhones(client)));
    setFormPoints(String(client.points));
    setFormAccountBalance(String(client.accountBalanceArs ?? 0));
    setFormNotes(client.adminNotes ?? '');
    setFormExempt(Boolean(client.depositExempt));
    setFormSubscriptionPlanId(client.subscription?.planId ?? '');
  }, [client]);

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

  const handleSave = useCallback(async () => {
    if (!client || saving) return;
    const name = formName.trim();
    if (!name) {
      setError('El nombre es obligatorio.');
      return;
    }
    const email = formEmail.trim();
    if (!emailLocked && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('El email no es válido.');
      return;
    }
    const pts = parseInt(formPoints, 10);
    if (!Number.isFinite(pts) || pts < 0) {
      setError('Los puntos deben ser un número ≥ 0.');
      return;
    }
    const balanceParsed = parseSignedArsInput(formAccountBalance);
    if (balanceParsed === 'invalid') {
      setError('El saldo de cuenta corriente no es válido.');
      return;
    }

    setSaving(true);
    setError('');
    setSaveOk('');
    try {
      const payload: Parameters<typeof api.updateAdminClient>[1] = {
        name,
        phones: parsePhonesInput(formPhones),
        points: pts,
        accountBalanceArs: balanceParsed,
        depositExempt: client.subscription ? undefined : formExempt,
        subscriptionPlanId: formSubscriptionPlanId || null,
        adminNotes: formNotes.trim() || null,
      };
      if (!emailLocked) {
        payload.email = email;
      }
      const res = await api.updateAdminClient(client.id, payload);
      setClient(res.client);
      setSaveOk('Cambios guardados.');
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'No se pudo guardar el cliente.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [
    client,
    saving,
    formName,
    formEmail,
    formPhones,
    formPoints,
    formAccountBalance,
    formNotes,
    formExempt,
    formSubscriptionPlanId,
    emailLocked,
  ]);

  const handleDeleteClient = useCallback(async () => {
    if (!client || deleting) return;
    const ok = window.confirm(
      `¿Eliminar la ficha de ${client.name}?\n\nSus turnos se conservarán en la agenda, pero se desvinculan de la cuenta.`
    );
    if (!ok) return;
    setDeleting(true);
    setError('');
    try {
      await api.deleteAdminClient(client.id);
      navigate('/dashboard/clientes', { replace: true });
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'No se pudo eliminar el cliente.';
      setError(msg);
    } finally {
      setDeleting(false);
    }
  }, [client, deleting, navigate]);

  const handleLinkToHostSubscription = useCallback(async () => {
    if (!client || !linkHostClientId) return;
    setSubscriptionActionLoading(true);
    setError('');
    try {
      const res = await api.linkAdminClientToSubscription(client.id, Number(linkHostClientId));
      setClient(res.client);
      setLinkHostClientId('');
      setSaveOk('Cliente vinculado al abono compartido.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo vincular al abono');
    } finally {
      setSubscriptionActionLoading(false);
    }
  }, [client, linkHostClientId]);

  const handleAddSubscriptionMember = useCallback(async () => {
    if (!client || !addMemberClientId) return;
    setSubscriptionActionLoading(true);
    setError('');
    try {
      const res = await api.addAdminClientSubscriptionMember(client.id, Number(addMemberClientId));
      setClient(res.client);
      setAddMemberClientId('');
      setSaveOk('Cliente agregado al abono compartido.');
      const all = await api.getAdminClientsWithHistory();
      setAllClients(all.clients);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo agregar al abono');
    } finally {
      setSubscriptionActionLoading(false);
    }
  }, [client, addMemberClientId]);

  const handleRemoveSubscriptionMember = useCallback(
    async (memberId: number) => {
      if (!client) return;
      setSubscriptionActionLoading(true);
      setError('');
      try {
        const res = await api.removeAdminClientSubscriptionMember(client.id, memberId);
        setClient(res.client);
        setSaveOk('Cliente quitado del abono compartido.');
        const all = await api.getAdminClientsWithHistory();
        setAllClients(all.clients);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'No se pudo quitar del abono');
      } finally {
        setSubscriptionActionLoading(false);
      }
    },
    [client]
  );

  const clientsWithActiveSubscription = useMemo(
    () =>
      allClients.filter(
        (c) =>
          c.id !== client?.id &&
          c.subscription &&
          c.subscription.cutsRemaining > 0
      ),
    [allClients, client?.id]
  );

  const subscriptionMemberIds = useMemo(() => {
    const ids = new Set<number>();
    if (client?.subscription?.sharedMembers?.length) {
      for (const m of client.subscription.sharedMembers) ids.add(m.id);
    } else if (client?.subscription) {
      ids.add(client.id);
    }
    return ids;
  }, [client]);

  const addableClients = useMemo(
    () =>
      allClients.filter(
        (c) => c.id !== client?.id && !c.subscription && !subscriptionMemberIds.has(c.id)
      ),
    [allClients, client?.id, subscriptionMemberIds]
  );

  const displayedMembers = useMemo(() => {
    if (!client?.subscription) return [];
    if (client.subscription.sharedMembers?.length) return client.subscription.sharedMembers;
    return [{ id: client.id, name: client.name, email: client.email }];
  }, [client]);

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

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/dashboard/clientes"
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900"
          >
            <ChevronLeft size={18} />
            Volver al listado
          </Link>
          {isAdmin && !loading && client && (
            <button
              type="button"
              onClick={() => void handleDeleteClient()}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 size={16} />
              {deleting ? 'Eliminando…' : 'Eliminar cliente'}
            </button>
          )}
        </div>

        {invalidId && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            ID de cliente no válido.
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {saveOk && !error && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {saveOk}
          </div>
        )}

        {!invalidId && loading ? (
          <p className="text-zinc-400">Cargando ficha…</p>
        ) : !invalidId && client ? (
          <>
            <div className="mb-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-gradient-to-br from-zinc-50 to-white px-5 py-6 sm:px-8 sm:py-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-4">
                    <AdminClientAvatar name={client.name} avatarUrl={client.avatarUrl} size="lg" />
                    <div className="min-w-0">
                      <h1 className="text-2xl font-black tracking-tight text-zinc-900 sm:text-3xl">{client.name}</h1>
                      <p className="mt-1 truncate text-sm text-zinc-500">{displayClientEmail(client.email)}</p>
                      {phones.length > 0 ? (
                        <div className="mt-1 text-sm font-medium text-zinc-700">
                          {phones.map((phone, idx) => (
                            <p key={`${phone}-${idx}`} className="truncate">
                              {phone}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <p className="mt-2 text-xs text-zinc-400">
                        Cliente desde{' '}
                        {format(parseISO(client.createdAt), "d 'de' MMMM yyyy · HH:mm", { locale: es })}
                        {client.hasGoogleAccount ? ' · Cuenta Google' : ' · Ficha manual'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    <div className="flex shrink-0 flex-col items-start gap-1 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 sm:items-end">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Puntos</span>
                      <span className="text-2xl font-black text-[#b39055]">{client.points}</span>
                    </div>
                    {clientAccountBalanceOwedArs(client.accountBalanceArs) > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                          Deuda cuenta corriente
                        </span>
                        <p className="text-2xl font-black tabular-nums text-amber-900">
                          ${formatArs(clientAccountBalanceOwedArs(client.accountBalanceArs))}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {clientAccountBalanceOwedArs(client.accountBalanceArs) > 0 && (
                <div className="border-t border-amber-200 bg-amber-50 px-5 py-4 sm:px-8">
                  <p className="text-sm font-semibold text-amber-900">
                    Este cliente debe{' '}
                    <span className="tabular-nums">
                      ${formatArs(clientAccountBalanceOwedArs(client.accountBalanceArs))}
                    </span>{' '}
                    en cuenta corriente.
                  </p>
                </div>
              )}

              {client.adminNotes?.trim() && (
                <div className="border-t border-amber-100 bg-amber-50/80 px-5 py-4 sm:px-8">
                  <div className="flex gap-2">
                    <StickyNote size={18} className="shrink-0 text-amber-700 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Recordatorio</p>
                      <p className="mt-1 text-sm text-amber-950 whitespace-pre-wrap">{client.adminNotes.trim()}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {isAdmin ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave();
              }}
              className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-5"
            >
              <h2 className="text-lg font-black text-zinc-900">Editar ficha</h2>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Nombre</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  disabled={emailLocked}
                  placeholder={emailLocked ? displayClientEmail(client.email) : 'opcional'}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm disabled:bg-zinc-100 disabled:text-zinc-500"
                />
                {emailLocked && (
                  <p className="mt-1 text-[11px] text-zinc-500">Vinculado a Google: el email no se edita desde acá.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
                  Teléfonos (uno por línea o separados por coma)
                </label>
                <textarea
                  value={formPhones}
                  onChange={(e) => setFormPhones(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-mono"
                  placeholder="11 2345 6789"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Puntos</label>
                <input
                  type="number"
                  min={0}
                  max={999999}
                  value={formPoints}
                  onChange={(e) => setFormPoints(e.target.value)}
                  className="w-32 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
                  Saldo cuenta corriente (ARS)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formAccountBalance}
                  onChange={(e) => setFormAccountBalance(e.target.value)}
                  className="w-full max-w-xs rounded-xl border border-zinc-200 px-4 py-2.5 text-sm tabular-nums"
                  placeholder="0 o -5000"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Negativo = el cliente debe plata. Al agendar un turno, el panel avisa si hay deuda.
                </p>
                {clientAccountBalanceOwedArs(client?.accountBalanceArs) > 0 && (
                  <p className="mt-2 text-sm font-semibold text-amber-800">
                    Debe ${formatArs(clientAccountBalanceOwedArs(client?.accountBalanceArs))}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1.5">
                  <StickyNote size={14} className="text-amber-600" />
                  Notas / recordatorios
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={4}
                  maxLength={8000}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm leading-relaxed"
                  placeholder="Ej. prefiere corte bajo, alérgico a cierto producto, siempre paga en efectivo…"
                />
                <p className="mt-1 text-[11px] text-zinc-400">{formNotes.length} / 8000 · Solo visible en el panel</p>
              </div>

              <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                    <Repeat size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-zinc-900">Plan de abono</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Sin seña en la web. El abono termina al usar todos los cortes o al vencer la fecha del plan, si
                      tiene vigencia configurada.
                    </p>
                    {client.subscription && (
                      <p className="mt-2 text-sm font-semibold text-violet-900">
                        {client.subscription.cutsRemaining} de {client.subscription.cutsPerMonth} cortes disponibles
                        {client.subscription.periodEnd
                          ? ` · vence ${client.subscription.periodEnd.slice(0, 10)}`
                          : ''}
                      </p>
                    )}
                  </div>
                </div>
                <select
                  value={formSubscriptionPlanId}
                  onChange={(e) => setFormSubscriptionPlanId(e.target.value)}
                  className="w-full rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm"
                >
                  <option value="">Sin abono</option>
                  {availablePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.monthlyPrice} ({p.cutsPerMonth} cortes
                      {p.validityDays != null ? `, ${p.validityDays} días` : ', sin vencimiento'})
                    </option>
                  ))}
                </select>

                {client.subscription ? (
                  <div className="rounded-xl border border-violet-200 bg-white/80 p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Users size={16} className="text-violet-700" />
                      <p className="text-xs font-bold uppercase tracking-wide text-violet-900">
                        Abono compartido
                      </p>
                    </div>
                    <ul className="divide-y divide-violet-100 rounded-lg border border-violet-100 bg-white">
                      {displayedMembers.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-zinc-900 truncate">{m.name}</p>
                            <p className="text-[11px] text-zinc-500 truncate">{displayClientEmail(m.email)}</p>
                          </div>
                          {displayedMembers.length > 1 && (
                            <button
                              type="button"
                              disabled={subscriptionActionLoading}
                              onClick={() => void handleRemoveSubscriptionMember(m.id)}
                              className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              title="Quitar del abono"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-zinc-500">
                      Todos comparten el mismo cupo de cortes. Al cobrar con «Abono» en cualquier turno vinculado, se
                      descuenta del pool común.
                    </p>
                    {addableClients.length > 0 && (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-0 flex-1 basis-48">
                          <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                            Agregar familiar / otro cliente
                          </label>
                          <select
                            value={addMemberClientId}
                            onChange={(e) => setAddMemberClientId(e.target.value)}
                            className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Elegir cliente…</option>
                            {addableClients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          disabled={!addMemberClientId || subscriptionActionLoading}
                          onClick={() => void handleAddSubscriptionMember()}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-50"
                        >
                          <UserPlus size={14} />
                          Agregar
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  clientsWithActiveSubscription.length > 0 && (
                    <div className="rounded-xl border border-dashed border-violet-200 bg-white/60 p-3 space-y-2">
                      <p className="text-xs font-semibold text-violet-900">
                        O vinculá este cliente al abono de otro (padre/hijo, hermanos…)
                      </p>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-0 flex-1 basis-48">
                          <select
                            value={linkHostClientId}
                            onChange={(e) => setLinkHostClientId(e.target.value)}
                            className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Cliente con abono activo…</option>
                            {clientsWithActiveSubscription.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.subscription!.cutsRemaining} cortes disp.)
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          disabled={!linkHostClientId || subscriptionActionLoading}
                          onClick={() => void handleLinkToHostSubscription()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-bold text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                        >
                          <UserPlus size={14} />
                          Vincular
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      formExempt ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
                    }`}
                  >
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900">Exento de pagar seña (manual)</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {client.subscription
                        ? 'Con abono activo la exención ya está incluida.'
                        : 'Reserva confirmada sin Mercado Pago.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFormExempt((v) => !v)}
                  disabled={Boolean(client.subscription)}
                  aria-pressed={formExempt}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-40 ${
                    formExempt ? 'bg-emerald-500' : 'bg-zinc-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      formExempt ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                <Save size={18} />
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </form>
            ) : (
              <p className="mb-8 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                Podés consultar la ficha y el historial. Solo un administrador puede editar datos del cliente.
              </p>
            )}

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
                        const productsSummary = formatAppointmentProductsSummary(app.products);
                        return (
                          <tr key={app.id} className="bg-white hover:bg-zinc-50/90 align-top">
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-zinc-700">
                              {formatAppointmentDateYmd(app.date)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-zinc-800">{normalizeAppointmentTime(app.time)}</td>
                            <td className="max-w-[14rem] px-4 py-3 font-medium text-zinc-900 sm:max-w-md">
                              <span className="block truncate">{app.service}</span>
                              {productsSummary && (
                                <span
                                  className="mt-0.5 block text-[11px] font-semibold text-amber-800"
                                  title={(app.products ?? [])
                                    .map(
                                      (l) =>
                                        `${l.quantity}× ${l.name} · $${formatArs(l.subtotal)}`
                                    )
                                    .join('\n')}
                                >
                                  + {productsSummary}
                                </span>
                              )}
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
                              <AppointmentPaymentBadge app={app} />
                              {sumAppointmentProducts(app.products) > 0 && (
                                <span className="mt-1 block text-[10px] text-zinc-500 tabular-nums">
                                  Productos ${formatArs(sumAppointmentProducts(app.products))}
                                </span>
                              )}
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
