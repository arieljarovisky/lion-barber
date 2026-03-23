import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  User,
  Clock,
  Calendar,
  Award,
  CreditCard,
  ChevronLeft,
  LogOut,
  LayoutDashboard,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import type { Appointment } from '../api';
import { format, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';

function appointmentDateTime(a: Appointment): Date {
  return new Date(`${a.date}T${a.time}:00`);
}

export default function Perfil() {
  const { profile, logout, canAccessDashboard } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [shopCutoffHours, setShopCutoffHours] = useState(12);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [rescheduleApp, setRescheduleApp] = useState<Appointment | null>(null);
  const [rsDate, setRsDate] = useState('');
  const [rsTime, setRsTime] = useState('');
  const [rsSlots, setRsSlots] = useState<string[]>([]);

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

  if (!profile) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const openReschedule = (a: Appointment) => {
    setActionError('');
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

  const handleCancel = async (a: Appointment) => {
    if (
      !confirm(
        '¿Cancelar este turno? Solo podés hacerlo con la anticipación configurada por la barbería; si estás dentro del plazo mínimo, la operación no está permitida y la seña no se reembolsa si ya pagaste.'
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      await api.cancelMyAppointment(a.id);
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

        <div className="flex flex-col items-center mb-8 sm:mb-10 text-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-zinc-800 border-2 border-[#e5c185] flex items-center justify-center mb-3 sm:mb-4 flex-shrink-0">
            <User size={32} className="sm:w-10 sm:h-10 text-[#e5c185]" />
          </div>
          <h1 className="text-xl sm:text-2xl font-serif font-black text-white break-words px-2">{profile.name}</h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1 break-all px-2 max-w-full">{profile.email}</p>
        </div>

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
          <p className="text-zinc-500 text-xs sm:text-sm mb-3">
            Cancelar o reprogramar requiere al menos {shopCutoffHours} horas de anticipación (configurable por el dueño).
            Dentro de ese margen no podés hacerlo desde la web y la seña abonada no se reembolsa.
          </p>
          {loading ? (
            <p className="text-zinc-500 text-sm">Cargando...</p>
          ) : futureAppointments.length === 0 ? (
            <p className="text-zinc-500 text-sm">No tenés turnos programados.</p>
          ) : (
            <ul className="space-y-2 sm:space-y-3">
              {futureAppointments.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 bg-zinc-950/50 rounded-lg sm:rounded-xl border border-zinc-800 min-w-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white text-sm sm:text-base truncate">{a.service}</p>
                    <p className="text-xs sm:text-sm text-zinc-400 truncate">
                      {format(new Date(a.date), "EEEE d 'de' MMMM", { locale: es })} · {a.time}
                    </p>
                    {a.barber && <p className="text-xs text-zinc-500 mt-1 truncate">Barbero: {a.barber}</p>}
                    {a.depositPaid && <p className="text-xs text-amber-400/90 mt-1">Seña abonada</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    {a.canRescheduleOrCancel && a.barberId ? (
                      <>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => openReschedule(a)}
                          className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold disabled:opacity-50"
                        >
                          Reprogramar
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void handleCancel(a)}
                          className="px-3 py-2 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-200 text-xs font-bold border border-red-900 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-500 max-w-[220px]">
                        Ya no podés modificar este turno (plazo mínimo o turno no vinculado a tu cuenta).
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-zinc-600/30 flex items-center justify-center flex-shrink-0">
              <Clock size={20} className="sm:w-[22px] sm:h-[22px] text-zinc-400" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white">Turnos anteriores</h2>
          </div>
          {loading ? (
            <p className="text-zinc-500 text-sm">Cargando...</p>
          ) : pastAppointments.length === 0 ? (
            <p className="text-zinc-500 text-sm">Aún no tenés historial de turnos.</p>
          ) : (
            <ul className="space-y-2 sm:space-y-3">
              {pastAppointments.slice(0, 10).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 bg-zinc-950/50 rounded-lg sm:rounded-xl border border-zinc-800 min-w-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white text-sm sm:text-base truncate">{a.service}</p>
                    <p className="text-xs sm:text-sm text-zinc-400">
                      {format(new Date(a.date), "d/MM/yyyy", { locale: es })} · {a.time}
                    </p>
                    {a.status === 'cancelled' && (
                      <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider text-red-400">
                        Cancelado
                      </span>
                    )}
                  </div>
                </li>
              ))}
              {pastAppointments.length > 10 && (
                <p className="text-zinc-500 text-xs sm:text-sm">y {pastAppointments.length - 10} más</p>
              )}
            </ul>
          )}
        </section>

        <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <CreditCard size={20} className="sm:w-[22px] sm:h-[22px] text-amber-400" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white">Pagos</h2>
          </div>
          {pastAppointments.length === 0 ? (
            <p className="text-zinc-500 text-xs sm:text-sm">No hay pagos registrados. Los turnos realizados se muestran aquí.</p>
          ) : (
            <ul className="space-y-2 sm:space-y-3">
              {pastAppointments.slice(0, 5).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 bg-zinc-950/50 rounded-lg sm:rounded-xl border border-zinc-800 min-w-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white text-sm sm:text-base truncate">{a.service}</p>
                    <p className="text-xs sm:text-sm text-zinc-400">{format(new Date(a.date), "d/MM/yyyy", { locale: es })}</p>
                  </div>
                  <span className="text-emerald-400 text-xs sm:text-sm font-medium flex-shrink-0">
                    {a.status === 'cancelled' ? '—' : 'Pagado'}
                  </span>
                </li>
              ))}
              {pastAppointments.length > 5 && (
                <p className="text-zinc-500 text-xs sm:text-sm">y {pastAppointments.length - 5} pagos más</p>
              )}
            </ul>
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
