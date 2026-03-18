import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, Clock, Calendar, Award, CreditCard, ChevronLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import type { Appointment } from '../api';
import { format, isBefore, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Perfil() {
  const { profile } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getMyAppointments()
      .then(setAppointments)
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  }, []);

  const today = startOfDay(new Date());
  const futureAppointments = appointments.filter(
    (a) => !isBefore(new Date(a.date + 'T' + a.time), today)
  );
  const pastAppointments = appointments.filter((a) =>
    isBefore(new Date(a.date + 'T' + a.time), today)
  );

  if (!profile) return null;

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
          <span className="font-serif font-black tracking-widest uppercase text-white text-sm sm:text-base truncate">Mi perfil</span>
          <div className="w-14 sm:w-16 flex-shrink-0" aria-hidden />
        </div>
      </nav>

      <main className="pt-20 sm:pt-24 pb-12 sm:pb-16 px-3 sm:px-4 max-w-4xl mx-auto w-full min-w-0">
        <div className="flex flex-col items-center mb-8 sm:mb-10 text-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-zinc-800 border-2 border-[#e5c185] flex items-center justify-center mb-3 sm:mb-4 flex-shrink-0">
            <User size={32} className="sm:w-10 sm:h-10 text-[#e5c185]" />
          </div>
          <h1 className="text-xl sm:text-2xl font-serif font-black text-white break-words px-2">{profile.name}</h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1 break-all px-2 max-w-full">{profile.email}</p>
        </div>

        {/* Puntos */}
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

        {/* Turnos futuros */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Calendar size={20} className="sm:w-[22px] sm:h-[22px] text-emerald-400" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white">Turnos futuros</h2>
          </div>
          {loading ? (
            <p className="text-zinc-500 text-sm">Cargando...</p>
          ) : futureAppointments.length === 0 ? (
            <p className="text-zinc-500 text-sm">No tenés turnos programados.</p>
          ) : (
            <ul className="space-y-2 sm:space-y-3">
              {futureAppointments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 bg-zinc-950/50 rounded-lg sm:rounded-xl border border-zinc-800 min-w-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white text-sm sm:text-base truncate">{a.service}</p>
                    <p className="text-xs sm:text-sm text-zinc-400 truncate">
                      {format(new Date(a.date), "EEEE d 'de' MMMM", { locale: es })} · {a.time}
                    </p>
                    {a.barber && <p className="text-xs text-zinc-500 mt-1 truncate">Barbero: {a.barber}</p>}
                  </div>
                  <Clock size={18} className="text-zinc-500 flex-shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Turnos anteriores */}
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
                  </div>
                </li>
              ))}
              {pastAppointments.length > 10 && (
                <p className="text-zinc-500 text-xs sm:text-sm">y {pastAppointments.length - 10} más</p>
              )}
            </ul>
          )}
        </section>

        {/* Pagos */}
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
                  <span className="text-emerald-400 text-xs sm:text-sm font-medium flex-shrink-0">Pagado</span>
                </li>
              ))}
              {pastAppointments.length > 5 && (
                <p className="text-zinc-500 text-xs sm:text-sm">y {pastAppointments.length - 5} pagos más</p>
              )}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
