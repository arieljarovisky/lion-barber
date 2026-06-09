import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  User,
  Clock,
  Calendar,
  Award,
  ChevronLeft,
  LogOut,
  LayoutDashboard,
  X,
  ChevronDown,
  Info,
  Scissors,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { api } from '../api';
import type { Appointment } from '../api';
import { DEPOSIT_PAYMENT_MINUTES } from '../constants/depositPayment';
import { formatAppointmentProductsSummary } from '../utils/appointmentProducts';
import { Wallet } from '@mercadopago/sdk-react';
import { format, isBefore, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCatalogPriceArs } from '../utils/money';

/** `new Date('yyyy-MM-dd')` en JS es UTC → en AR muestra el día anterior. Usar calendario local. */
function parseAppointmentDateOnly(dateStr: string): Date {
  const clean = dateStr.slice(0, 10);
  return parse(clean, 'yyyy-MM-dd', new Date());
}

function appointmentDateTime(a: Appointment): Date {
  const d = String(a.date).slice(0, 10);
  const t = (a.time || '00:00').slice(0, 5);
  return parse(`${d} ${t}`, 'yyyy-MM-dd HH:mm', new Date());
}

function secondsUntilPaymentDue(paymentDueAt: string): number {
  const raw = paymentDueAt.trim();
  const due = Date.parse(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(due)) return 0;
  return Math.max(0, Math.floor((due - Date.now()) / 1000));
}

function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Cabecera del turno + cuenta regresiva + acciones. El timer está acá para que el brick de MP
 * sea hermano (en el padre) y no se reinicialice cada segundo.
 */
function FutureAppointmentCardBody({
  a,
  senaLoadingId,
  actionBusy,
  onPaySena,
  openReschedule,
  onCancel,
}: {
  a: Appointment;
  senaLoadingId: string | null;
  actionBusy: boolean;
  onPaySena: (app: Appointment) => void;
  openReschedule: (app: Appointment) => void;
  onCancel: (app: Appointment) => void;
}) {
  const awaitingSena = a.status === 'pending_payment' && !a.depositPaid;
  const [sec, setSec] = useState(() =>
    awaitingSena && a.paymentDueAt ? secondsUntilPaymentDue(a.paymentDueAt) : -1
  );
  useEffect(() => {
    if (!awaitingSena || !a.paymentDueAt) {
      setSec(-1);
      return;
    }
    const due = a.paymentDueAt;
    const tick = () => setSec(secondsUntilPaymentDue(due));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [awaitingSena, a.paymentDueAt]);

  const canShowPayButton = awaitingSena && (!a.paymentDueAt || sec > 0);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-bold text-white text-sm sm:text-base truncate">{a.service}</p>
        <p className="text-xs sm:text-sm text-zinc-400 truncate">
          {format(parseAppointmentDateOnly(a.date), "EEEE d 'de' MMMM", { locale: es })} · {a.time}
        </p>
        {a.barber && <p className="text-xs text-zinc-500 mt-1 truncate">Barbero: {a.barber}</p>}
        {awaitingSena && (
          <p className="text-xs text-amber-400/95 mt-1 font-medium">
            Pendiente de pago de la seña
            {a.paymentDueAt && sec > 0 && (
              <span className="text-zinc-400 font-normal"> · queda {formatMmSs(sec)}</span>
            )}
            {a.paymentDueAt && sec === 0 && (
              <span className="text-zinc-500 font-normal"> · plazo vencido, actualizando…</span>
            )}
          </p>
        )}
        {a.depositPaid && !awaitingSena && (
          <p className="text-xs text-amber-400/90 mt-1">Seña abonada</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
        {canShowPayButton ? (
          <button
            type="button"
            disabled={
              Boolean(senaLoadingId) ||
              actionBusy ||
              (a.paymentDueAt != null && sec <= 0)
            }
            onClick={() => void onPaySena(a)}
            className="px-3 py-2 rounded-lg bg-[#e5c185] hover:bg-[#d4b074] text-zinc-950 text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {senaLoadingId === a.id ? 'Preparando…' : 'Pagar seña'}
          </button>
        ) : null}
        {a.canReschedule && a.barberId ? (
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => openReschedule(a)}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold disabled:opacity-50"
          >
            Reprogramar
          </button>
        ) : null}
        {a.canCancel ? (
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => void onCancel(a)}
            className="px-3 py-2 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-200 text-xs font-bold border border-red-900 disabled:opacity-50"
          >
            Cancelar
          </button>
        ) : null}
        {!a.canReschedule && !a.canCancel && !awaitingSena && (
          <p className="text-xs text-zinc-500 max-w-[220px]">
            Ya no podés modificar este turno (por ejemplo, el horario ya pasó).
          </p>
        )}
      </div>
    </div>
  );
}

const SenaWalletBrick = React.memo(function SenaWalletBrick({
  preferenceId,
  onError,
}: {
  preferenceId: string;
  onError: (message: string) => void;
}) {
  return (
    <Wallet
      initialization={{ preferenceId, redirectMode: 'self' }}
      locale="es-AR"
      customization={{ theme: 'dark' }}
      onError={(err) => onError(err.message || 'Error al cargar el botón de pago')}
    />
  );
});

export default function Perfil() {
  const { profile, logout, canAccessDashboard, refreshProfile } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [shopCutoffHours, setShopCutoffHours] = useState(12);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [rescheduleApp, setRescheduleApp] = useState<Appointment | null>(null);
  const [rsDate, setRsDate] = useState('');
  const [rsTime, setRsTime] = useState('');
  const [rsSlots, setRsSlots] = useState<string[]>([]);
  const [senaWallet, setSenaWallet] = useState<{ appointmentId: string; preferenceId: string } | null>(null);
  const [senaLoadingId, setSenaLoadingId] = useState<string | null>(null);
  const [senaError, setSenaError] = useState('');
  const [historyLimit, setHistoryLimit] = useState(8);
  const expiryReloadDoneRef = useRef(false);
  const appointmentsRef = useRef(appointments);
  appointmentsRef.current = appointments;

  const appointmentsSignature = useMemo(() => appointments.map((a) => a.id).join(','), [appointments]);

  useEffect(() => {
    setHistoryLimit(8);
  }, [profile?.id, appointmentsSignature]);

  const mpPublicKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY as string | undefined;

  const reload = useCallback(() => {
    setLoading(true);
    api
      .getMyAppointments()
      .then(setAppointments)
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  /** Abrir reprogramación desde enlace en emails (?reprogramar=id). */
  useEffect(() => {
    const rid = searchParams.get('reprogramar')?.trim();
    if (!rid || loading) return;
    const app = appointments.find((a) => a.id === rid);
    if (!app || app.status !== 'scheduled') return;
    setRescheduleApp(app);
    setRsDate(app.date);
    setRsTime('');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('reprogramar');
        return next;
      },
      { replace: true }
    );
  }, [loading, appointments, searchParams, setSearchParams]);

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (checkout === 'success') {
      setActionError('');
      setSenaWallet(null);
      setActionSuccess('¡Pago registrado! Tu turno quedó confirmado.');
      setSearchParams({}, { replace: true });
      reload();
    } else if (checkout === 'cancel' || checkout === 'failure') {
      setActionError('Pago cancelado o rechazado. Podés intentar de nuevo con «Pagar seña».');
      setSearchParams({}, { replace: true });
    } else if (checkout === 'pending') {
      setActionError(
        'Pago pendiente (ej. efectivo). Cuando Mercado Pago lo acredite, el turno se confirmará solo.'
      );
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, reload]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const apps = appointmentsRef.current;
      const overdue = apps.some(
        (a) =>
          a.status === 'pending_payment' &&
          !a.depositPaid &&
          a.paymentDueAt &&
          secondsUntilPaymentDue(a.paymentDueAt) === 0
      );
      if (!overdue) {
        expiryReloadDoneRef.current = false;
        return;
      }
      if (expiryReloadDoneRef.current) return;
      expiryReloadDoneRef.current = true;
      void reload();
    }, 1000);
    return () => clearInterval(id);
  }, [reload]);

  useEffect(() => {
    api.getShopSettings().then((s) => setShopCutoffHours(s.cutoffHours)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!rescheduleApp?.barberId || !rsDate) {
      setRsSlots([]);
      return;
    }
    const dur = rescheduleApp.durationMinutes ?? 30;
    api
      .getAvailability(rsDate, rescheduleApp.barberId, dur)
      .then((r) => setRsSlots(r.slots))
      .catch(() => setRsSlots([]));
  }, [rescheduleApp, rsDate]);

  useEffect(() => {
    if (!rsSlots.length) return;
    setRsTime((prev) => (rsSlots.includes(prev) ? prev : rsSlots[0] ?? ''));
  }, [rsSlots]);

  const now = new Date();
  const futureAppointments = appointments.filter((a) => {
    if (a.status === 'cancelled') return false;
    return !isBefore(appointmentDateTime(a), now);
  });
  const pastAppointments = appointments.filter((a) => isBefore(appointmentDateTime(a), now));

  const { pastActive, pastCancelled } = useMemo(() => {
    const active: Appointment[] = [];
    const cancelled: Appointment[] = [];
    for (const a of pastAppointments) {
      if (a.status === 'cancelled') cancelled.push(a);
      else active.push(a);
    }
    return { pastActive: active, pastCancelled: cancelled };
  }, [pastAppointments]);

  const HISTORY_STEP = 12;
  const visibleActive = pastActive.slice(0, historyLimit);
  const hasMoreActive = pastActive.length > visibleActive.length;

  if (!profile) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const openReschedule = (a: Appointment) => {
    setActionError('');
    setActionSuccess('');
    setRescheduleApp(a);
    setRsDate(a.date);
    setRsTime(a.time);
  };

  const closeReschedule = () => {
    setRescheduleApp(null);
    setActionError('');
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleApp || !rsDate || !rsTime) return;
    setActionBusy(true);
    setActionError('');
    try {
      await api.rescheduleMyAppointment(rescheduleApp.id, { date: rsDate, time: rsTime });
      closeReschedule();
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo reprogramar');
    } finally {
      setActionBusy(false);
    }
  };

  const handleWalletError = useCallback((message: string) => {
    setSenaError(message);
  }, []);

  const handlePaySena = async (a: Appointment) => {
    setSenaError('');
    const isExempt = Boolean(profile?.depositExempt);
    if (!isExempt) {
      const key = mpPublicKey?.trim();
      if (!key) {
        setSenaError(
          'Falta la clave pública de Mercado Pago en el sitio (VITE_MERCADOPAGO_PUBLIC_KEY). Pedile al administrador que la configure.'
        );
        return;
      }
    }
    setSenaLoadingId(a.id);
    try {
      const data = await api.createCheckoutSenaForAppointment(a.id);
      if ('exempt' in data && data.exempt) {
        setSenaWallet(null);
        setActionSuccess('Tu turno quedó confirmado (cuenta exenta de seña).');
        reload();
      } else if ('preferenceId' in data) {
        setSenaWallet({ appointmentId: data.appointmentId, preferenceId: data.preferenceId });
      }
    } catch (err) {
      setSenaError(err instanceof Error ? err.message : 'No se pudo iniciar el pago de la seña');
    } finally {
      setSenaLoadingId(null);
    }
  };

  const handleCancel = async (a: Appointment) => {
    const ok = await confirm({
      title: 'Cancelar turno',
      message:
        '¿Cancelar este turno? Si falta menos de 2 horas para el horario, la seña abonada no se reembolsa. ' +
        'Con al menos 2 horas de anticipación, el reembolso de la seña se procesa automáticamente en Mercado Pago.',
      variant: 'danger',
      confirmLabel: 'Sí, cancelar',
      cancelLabel: 'Volver',
    });
    if (!ok) return;
    setActionBusy(true);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await api.cancelMyAppointment(a.id);
      if (res.cancelNotice === 'refund_processed') {
        setActionSuccess(
          'Turno cancelado. El reembolso de la seña se envió por Mercado Pago; el acreditado depende del banco o tarjeta.'
        );
      } else if (res.cancelNotice === 'deposit_retained_short_notice') {
        setActionSuccess(
          'Turno cancelado. La seña no se reembolsa por cancelar con menos de 2 horas de anticipación.'
        );
      } else {
        setActionSuccess('Turno cancelado.');
      }
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo cancelar');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans min-w-0">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/50">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2 min-w-0">
          <Link
            to="/"
            className="flex items-center gap-1.5 sm:gap-2 text-zinc-400 hover:text-[#e5c185] transition-colors flex-shrink-0 py-2"
          >
            <ChevronLeft size={20} className="flex-shrink-0" />
            <span className="font-medium text-sm sm:text-base truncate">Volver</span>
          </Link>
          <span className="font-serif font-black tracking-widest uppercase text-white text-sm sm:text-base truncate">
            Mi perfil
          </span>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {canAccessDashboard && (
              <Link
                to="/dashboard"
                className="p-2 text-[#e5c185] hover:bg-zinc-800 rounded-lg transition-colors"
                title="Panel"
              >
                <LayoutDashboard size={20} />
              </Link>
            )}
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              title="Cerrar sesión"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </nav>

      <main className="pt-20 sm:pt-24 pb-12 sm:pb-16 px-3 sm:px-4 max-w-4xl mx-auto w-full min-w-0">
        {actionError && (
          <div className="mb-4 p-3 rounded-xl border border-red-800 bg-red-950/50 text-red-200 text-sm">{actionError}</div>
        )}
        {actionSuccess && (
          <div className="mb-4 p-3 rounded-xl border border-emerald-800 bg-emerald-950/40 text-emerald-100 text-sm">
            {actionSuccess}
          </div>
        )}

        <div className="flex flex-col items-center mb-8 sm:mb-10 text-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-zinc-800 border-2 border-[#e5c185] flex items-center justify-center mb-3 sm:mb-4 flex-shrink-0">
            <User size={32} className="sm:w-10 sm:h-10 text-[#e5c185]" />
          </div>
          <h1 className="text-xl sm:text-2xl font-serif font-black text-white break-words px-2">{profile.name}</h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1 break-all px-2 max-w-full">{profile.email}</p>
        </div>

        {profile.subscription && (() => {
          const sub = profile.subscription;
          const usedPct =
            sub.cutsPerMonth > 0
              ? Math.min(100, Math.round((sub.cutsUsed / sub.cutsPerMonth) * 100))
              : 0;
          const remainingPct = Math.max(0, 100 - usedPct);
          const activatedLabel = format(parseAppointmentDateOnly(sub.periodStart), "d MMM yyyy", {
            locale: es,
          });
          const expiryLabel = sub.periodEnd
            ? format(parseAppointmentDateOnly(sub.periodEnd), "d MMM yyyy", { locale: es })
            : null;
          return (
            <section
              id="mi-abono"
              className="bg-zinc-900/50 border border-[#e5c185]/30 rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 min-w-0"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#e5c185]/20 flex items-center justify-center flex-shrink-0">
                    <Scissors size={20} className="sm:w-[22px] sm:h-[22px] text-[#e5c185]" />
                  </div>
                  <div className="min-w-0 text-left">
                    <h2 className="text-base sm:text-lg font-bold text-white truncate">Mi abono</h2>
                    <p className="text-sm text-[#e5c185] font-semibold truncate">{sub.planName}</p>
                  </div>
                </div>
                {sub.monthlyPrice && (
                  <span className="text-xs font-bold text-zinc-400 bg-zinc-950/60 px-2.5 py-1 rounded-lg border border-zinc-800">
                    {formatCatalogPriceArs(sub.monthlyPrice)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
                <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Disponibles</p>
                  <p className="text-2xl sm:text-3xl font-black text-[#e5c185] tabular-nums">{sub.cutsRemaining}</p>
                </div>
                <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Usados</p>
                  <p className="text-2xl sm:text-3xl font-black text-white tabular-nums">{sub.cutsUsed}</p>
                </div>
                <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Del plan</p>
                  <p className="text-2xl sm:text-3xl font-black text-zinc-300 tabular-nums">{sub.cutsPerMonth}</p>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between text-[11px] text-zinc-500 mb-1.5">
                  <span>Cortes del abono</span>
                  <span className="tabular-nums">
                    {sub.cutsUsed}/{sub.cutsPerMonth} usados
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#e5c185] to-[#d4b074] transition-all"
                    style={{ width: `${remainingPct}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-zinc-500 mb-3">
                Activado el <span className="text-zinc-300">{activatedLabel}</span>
                {expiryLabel ? (
                  <>
                    {' '}
                    · Vence el <span className="text-zinc-300">{expiryLabel}</span>
                  </>
                ) : (
                  <> · Sin vencimiento por fecha (termina al usar todos los cortes)</>
                )}
              </p>

              {sub.cutsRemaining > 0 ? (
                <p className="text-sm text-zinc-300 mb-4">
                  Podés reservar turnos online <strong className="text-white">sin pagar seña</strong> mientras tengas
                  cortes disponibles.
                </p>
              ) : (
                <p className="text-sm font-semibold text-amber-300 mb-4">
                  No tenés cortes disponibles. Tu abono finalizó; podés comprar uno nuevo o pedir que te asignen otro
                  desde el local.
                </p>
              )}

              <Link
                to="/#reserva"
                className={`inline-flex items-center justify-center w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                  sub.cutsRemaining > 0
                    ? 'bg-[#e5c185] hover:bg-[#d4b074] text-zinc-950'
                    : 'bg-zinc-800 text-zinc-500 pointer-events-none opacity-60'
                }`}
                aria-disabled={sub.cutsRemaining <= 0}
              >
                Reservar turno
              </Link>
            </section>
          );
        })()}

        <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#e5c185]/20 flex items-center justify-center flex-shrink-0">
              <Award size={20} className="sm:w-[22px] sm:h-[22px] text-[#e5c185]" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white">Mis puntos</h2>
          </div>
          <p className="text-3xl sm:text-4xl font-black text-[#e5c185]">{profile.points}</p>
          <p className="text-zinc-500 text-xs sm:text-sm mt-2">Acumulás puntos en cada visita. Pronto podrás canjearlos.</p>
        </section>

        <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Calendar size={20} className="sm:w-[22px] sm:h-[22px] text-emerald-400" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white">Turnos futuros</h2>
          </div>
          <details className="group mb-3 rounded-lg border border-zinc-800/90 bg-zinc-950/40">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
              <Info size={14} className="shrink-0 text-[#e5c185]" />
              <span className="font-medium">Condiciones de seña, cancelación y reprogramación</span>
              <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-zinc-500 transition group-open:rotate-180" />
            </summary>
            <p className="border-t border-zinc-800/80 px-3 pb-3 pt-2 text-[11px] leading-relaxed text-zinc-500 sm:text-xs">
              Al reservar con seña online tenés{' '}
              <strong className="text-zinc-300">{DEPOSIT_PAYMENT_MINUTES} minutos</strong> para que el pago se
              apruebe; si no, el turno se libera solo. Podés pagar desde acá mientras no venza ese plazo. Podés cancelar
              hasta el inicio del turno: si cancelás con al menos <strong className="text-zinc-300">2 horas</strong> de
              anticipación, la seña se reembolsa por Mercado Pago; con menos tiempo, la seña no se devuelve. Para{' '}
              <strong className="text-zinc-300">reprogramar</strong> hace falta al menos {shopCutoffHours} horas de
              anticipación (configurable por el dueño).
            </p>
          </details>
          {senaError && (
            <div className="mb-3 p-3 rounded-xl border border-red-800 bg-red-950/50 text-red-200 text-sm">{senaError}</div>
          )}
          {loading ? (
            <p className="text-zinc-500 text-sm">Cargando...</p>
          ) : futureAppointments.length === 0 ? (
            <p className="text-zinc-500 text-sm">No tenés turnos programados.</p>
          ) : (
            <ul className="space-y-2">
              {futureAppointments.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-2.5 p-3 sm:p-3.5 bg-zinc-950/50 rounded-lg border border-zinc-800 min-w-0"
                >
                  <FutureAppointmentCardBody
                    a={a}
                    senaLoadingId={senaLoadingId}
                    actionBusy={actionBusy}
                    onPaySena={handlePaySena}
                    openReschedule={openReschedule}
                    onCancel={handleCancel}
                  />
                  {senaWallet?.appointmentId === a.id && (
                    <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-4">
                      <p className="text-xs text-zinc-400 mb-3 text-center w-full">
                        Completá el pago con Mercado Pago. Si te redirige al checkout, al volver verás el turno confirmado
                        acá.
                      </p>
                      <SenaWalletBrick
                        preferenceId={senaWallet.preferenceId}
                        onError={handleWalletError}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2 sm:mb-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-zinc-600/30 flex items-center justify-center flex-shrink-0">
                <Clock size={20} className="sm:w-[22px] sm:h-[22px] text-zinc-400" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white leading-tight">Historial</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Visitas y cancelaciones. La columna «Pago» indica seña online abonada cuando corresponde.
                </p>
              </div>
            </div>
            {pastAppointments.length > 0 && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-900/80 px-2 py-1 rounded-md border border-zinc-800">
                {pastAppointments.length} en total
              </span>
            )}
          </div>
          {loading ? (
            <p className="text-zinc-500 text-sm">Cargando...</p>
          ) : pastAppointments.length === 0 ? (
            <p className="text-zinc-500 text-sm">Aún no tenés historial de turnos.</p>
          ) : (
            <div className="space-y-3">
              <div className="max-h-[min(52vh,400px)] overflow-y-auto overscroll-contain rounded-lg border border-zinc-800/70 bg-zinc-950/30">
                <ul className="divide-y divide-zinc-800/80">
                  {visibleActive.map((a) => {
                    const productsSummary = formatAppointmentProductsSummary(a.products);
                    return (
                      <li key={a.id} className="flex items-center gap-2 sm:gap-3 px-2.5 py-2 sm:px-3 sm:py-2.5">
                        <div className="w-[4.75rem] sm:w-[5.5rem] shrink-0 text-[10px] sm:text-xs tabular-nums leading-tight">
                          <div className="text-zinc-500">
                            {format(parseAppointmentDateOnly(a.date), 'dd/MM/yy', { locale: es })}
                          </div>
                          <div className="font-semibold text-zinc-200">{a.time}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">{a.service}</p>
                          {productsSummary && (
                            <p
                              className="text-[10px] text-[#e5c185]/90 truncate"
                              title={(a.products ?? [])
                                .map((l) => `${l.quantity}× ${l.name}`)
                                .join(' · ')}
                            >
                              + {productsSummary}
                            </p>
                          )}
                          {a.barber && (
                            <p className="text-[10px] text-zinc-500 truncate sm:hidden">{a.barber}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          {a.depositPaid ? (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-400/95">
                              Seña
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">—</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {hasMoreActive && (
                <button
                  type="button"
                  onClick={() => setHistoryLimit((n) => n + HISTORY_STEP)}
                  className="w-full py-2 rounded-lg border border-zinc-700 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/80 transition-colors"
                >
                  Mostrar más ({pastActive.length - visibleActive.length} restantes)
                </button>
              )}

              {pastCancelled.length > 0 && (
                <details className="group rounded-lg border border-zinc-800/90 bg-zinc-950/50">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
                    <span className="font-medium text-zinc-300">
                      Turnos cancelados{' '}
                      <span className="text-red-400/90">({pastCancelled.length})</span>
                    </span>
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-zinc-500 transition group-open:rotate-180" />
                  </summary>
                  <ul className="max-h-[min(40vh,260px)] overflow-y-auto overscroll-contain border-t border-zinc-800/80 divide-y divide-zinc-800/60">
                    {pastCancelled.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 px-2.5 py-1.5 sm:px-3 opacity-90">
                        <div className="w-[4.75rem] sm:w-[5.5rem] shrink-0 text-[10px] tabular-nums text-zinc-500">
                          {format(parseAppointmentDateOnly(a.date), 'dd/MM/yy', { locale: es })}{' '}
                          <span className="text-zinc-400">{a.time}</span>
                        </div>
                        <p className="min-w-0 flex-1 truncate text-xs text-zinc-400">{a.service}</p>
                        <span className="text-[9px] font-bold uppercase text-red-400/90 shrink-0">Cancelado</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </section>
      </main>

      {rescheduleApp && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={closeReschedule}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-black text-white">Reprogramar turno</h3>
              <button type="button" onClick={closeReschedule} className="p-1 text-zinc-400 hover:text-white">
                <X size={22} />
              </button>
            </div>
            <p className="text-sm text-zinc-400 mb-4">{rescheduleApp.service}</p>
            {actionError && (
              <div className="mb-3 p-3 rounded-lg bg-red-950/50 border border-red-900 text-red-200 text-sm">{actionError}</div>
            )}
            <form onSubmit={handleRescheduleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Nueva fecha</label>
                <input
                  type="date"
                  required
                  value={rsDate}
                  onChange={(e) => setRsDate(e.target.value)}
                  className="w-full border border-zinc-700 rounded-xl px-4 py-3 bg-zinc-950 text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Hora</label>
                <select
                  required
                  value={rsTime}
                  onChange={(e) => setRsTime(e.target.value)}
                  className="w-full border border-zinc-700 rounded-xl px-4 py-3 bg-zinc-950 text-white"
                >
                  <option value="">Elegí hora</option>
                  {rsSlots.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {rsSlots.length === 0 && rsDate && (
                  <p className="text-xs text-amber-400 mt-2">No hay horarios libres ese día para este barbero.</p>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeReschedule}
                  className="flex-1 py-3 rounded-xl border border-zinc-600 text-zinc-300 font-bold"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={actionBusy || rsSlots.length === 0}
                  className="flex-1 py-3 rounded-xl bg-[#e5c185] text-zinc-950 font-bold disabled:opacity-50"
                >
                  {actionBusy ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
