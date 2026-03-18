import React, { useState, useEffect, useCallback } from 'react';
import { format, addDays, subDays, addWeeks, subWeeks, startOfDay, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Phone,
  Scissors,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  X,
  Package,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import type { Appointment, Barber, Service } from '../api';

const TIME_SLOTS = [
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30',
];

const SERVICE_PRICES: Record<string, number> = {
  'Corte de cabello': 20000,
  'Corte de niños 0 a 6': 22000,
  'Cabellos largos 10cm': 22000,
  'Arreglo de barba': 10000,
  'Perfilado de cejas': 1000,
  'Rapado': 10000,
  'Afeitado tradicional': 8000,
};

function getPrice(service: string): number {
  return SERVICE_PRICES[service] ?? 0;
}

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedBarberId, setSelectedBarberId] = useState<string | 'all'>('all');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', service: '', barberId: '', date: '', time: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'agenda' | 'servicios'>('agenda');
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceForm, setServiceForm] = useState({ name: '', price: '', duration: 30, desc: '', emoji: '' });
  const [savingService, setSavingService] = useState(false);
  const [serviceError, setServiceError] = useState('');

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const isWeekView = selectedBarberId !== 'all';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [appRes, barbersRes, servicesRes] = await Promise.all([
        isWeekView
          ? api.getAppointments({ barberId: selectedBarberId })
          : api.getAppointments({ date: dateStr }),
        api.getBarbers(),
        api.getServices(),
      ]);
      setAppointments(appRes);
      setBarbers(barbersRes);
      setServices(servicesRes);
    } catch {
      setAppointments([]);
      setBarbers([]);
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [dateStr, selectedBarberId, isWeekView]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePrevDay = () => setSelectedDate((d) => subDays(d, 1));
  const handleNextDay = () => setSelectedDate((d) => addDays(d, 1));
  const handleToday = () => setSelectedDate(startOfDay(new Date()));
  const handlePrevWeek = () => setSelectedDate((d) => subWeeks(d, 1));
  const handleNextWeek = () => setSelectedDate((d) => addWeeks(d, 1));
  const handleThisWeek = () => setSelectedDate(startOfDay(new Date()));

  const dayAppointments = appointments
    .filter((app) => app.date === dateStr)
    .sort((a, b) => a.time.localeCompare(b.time));

  const appointmentsByBarber = barbers.map((barber) => ({
    barber,
    appointments: dayAppointments.filter(
      (a) => a.barberId === barber.id || a.barber === barber.name
    ),
  }));

  const selectedBarber = barbers.find((b) => b.id === selectedBarberId);
  const weekAppointmentsByDay = weekDays.map((day) => ({
    date: day,
    dateStr: format(day, 'yyyy-MM-dd'),
    appointments: appointments
      .filter((a) => a.date === format(day, 'yyyy-MM-dd'))
      .sort((a, b) => a.time.localeCompare(b.time)),
  }));

  const openCreateModal = () => {
    setEditingAppointment(null);
    setForm({
      name: '',
      phone: '',
      service: services[0]?.id ?? '',
      barberId: barbers[0]?.id ?? '',
      date: dateStr,
      time: TIME_SLOTS[0] ?? '10:00',
    });
    setError('');
    setModalOpen(true);
  };

  const openEditModal = (app: Appointment) => {
    setEditingAppointment(app);
    const barberId = app.barberId ?? barbers.find((b) => b.name === app.barber)?.id ?? '';
    setForm({
      name: app.name,
      phone: app.phone,
      service: services.find((s) => s.name === app.service)?.id ?? app.service,
      barberId,
      date: app.date,
      time: app.time,
    });
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingAppointment(null);
    setError('');
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const serviceName = services.find((s) => s.id === form.service)?.name ?? form.service;
    const barber = barbers.find((b) => b.id === form.barberId);
    try {
      if (editingAppointment) {
        await api.updateAppointment(editingAppointment.id, {
          name: form.name,
          phone: form.phone,
          service: serviceName,
          barberId: form.barberId,
          date: form.date,
          time: form.time,
        });
      } else {
        await api.createAppointment({
          name: form.name,
          phone: form.phone,
          service: serviceName,
          barberId: form.barberId,
          barber: barber?.name,
          date: form.date,
          time: form.time,
        });
      }
      closeModal();
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta cita?')) return;
    try {
      await api.deleteAppointment(id);
      loadData();
    } catch {
      setError('Error al eliminar');
    }
  };

  const openCreateServiceModal = () => {
    setEditingService(null);
    setServiceForm({ name: '', price: '', duration: 30, desc: '', emoji: '✂️' });
    setServiceError('');
    setServiceModalOpen(true);
  };

  const openEditServiceModal = (s: Service) => {
    setEditingService(s);
    setServiceForm({
      name: s.name,
      price: s.price,
      duration: s.duration,
      desc: s.desc ?? '',
      emoji: s.emoji ?? '',
    });
    setServiceError('');
    setServiceModalOpen(true);
  };

  const closeServiceModal = () => {
    setServiceModalOpen(false);
    setEditingService(null);
    setServiceError('');
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    setServiceError('');
    setSavingService(true);
    try {
      if (editingService) {
        await api.updateService(editingService.id, {
          name: serviceForm.name,
          price: serviceForm.price,
          duration: Number(serviceForm.duration),
          desc: serviceForm.desc,
          emoji: serviceForm.emoji || undefined,
        });
      } else {
        await api.createService({
          name: serviceForm.name,
          price: serviceForm.price,
          duration: Number(serviceForm.duration),
          desc: serviceForm.desc,
          emoji: serviceForm.emoji || undefined,
        });
      }
      closeServiceModal();
      loadData();
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSavingService(false);
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm('¿Eliminar este servicio?')) return;
    try {
      await api.deleteService(id);
      loadData();
    } catch {
      setServiceError('Error al eliminar');
    }
  };

  const totalIncome = dayAppointments.reduce((acc, curr) => acc + getPrice(curr.service), 0);
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      <nav className="bg-zinc-950 text-white px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-900 rounded-full flex items-center justify-center overflow-hidden border border-zinc-800">
            <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS9afJTOOxlqBtn27Asuu-Jvmb0NQZP6tKPGg&s" alt="Lion Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="font-black tracking-widest uppercase text-sm">Lion Barber</h1>
            <p className="text-xs text-[#e5c185] font-bold tracking-wider">PANEL DE CONTROL</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {profile && (
            <span className="text-zinc-400 text-sm hidden sm:inline">
              {profile.name} {profile.role === 'admin' && <span className="text-[#e5c185]">(Admin)</span>}
            </span>
          )}
          <a href="/" className="text-zinc-400 hover:text-white flex items-center gap-2 text-sm font-medium transition-colors px-3 py-2">
            <span className="hidden sm:inline">Web</span>
          </a>
          <button
            type="button"
            onClick={handleLogout}
            className="text-zinc-400 hover:text-white flex items-center gap-2 text-sm font-medium transition-colors bg-zinc-900 hover:bg-zinc-800 px-4 py-2 rounded-full"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-3 sm:p-4 md:p-8 w-full min-w-0">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full min-w-0">
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight truncate">Agenda de Turnos</h2>
              <p className="text-zinc-500 mt-1 text-sm sm:text-base">Calendario por peluquero y gestión de reservas.</p>
            </div>
            <div className="flex rounded-xl border border-zinc-200 bg-white p-1 shadow-sm flex-shrink-0">
              <button
                type="button"
                onClick={() => setView('agenda')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${view === 'agenda' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}
              >
                <CalendarIcon size={18} />
                Agenda
              </button>
              <button
                type="button"
                onClick={() => setView('servicios')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${view === 'servicios' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}
              >
                <Package size={18} />
                Servicios
              </button>
            </div>
          </div>

          {view === 'agenda' && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto">
              <div className="bg-white border border-zinc-200 shadow-sm rounded-xl sm:rounded-2xl p-1.5 sm:p-2 flex items-center gap-1 sm:gap-2 min-w-0 flex-1 sm:flex-initial">
                <button
                  type="button"
                  onClick={isWeekView ? handlePrevWeek : handlePrevDay}
                  className="p-2 sm:p-3 hover:bg-zinc-100 rounded-lg sm:rounded-xl transition-colors text-zinc-600 flex-shrink-0"
                >
                  <ChevronLeft size={18} className="sm:w-5 sm:h-5" />
                </button>
                <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 min-w-0 flex-1">
                  <CalendarIcon className="text-[#e5c185] flex-shrink-0" size={18} />
                  <span className="font-bold capitalize text-zinc-800 text-xs sm:text-sm truncate">
                    {isWeekView
                      ? `Semana ${format(weekStart, 'd')}–${format(weekEnd, 'd')} ${format(weekStart, 'MMM', { locale: es })}`
                      : format(selectedDate, "EEEE, d 'de' MMMM", { locale: es })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={isWeekView ? handleNextWeek : handleNextDay}
                  className="p-2 sm:p-3 hover:bg-zinc-100 rounded-lg sm:rounded-xl transition-colors text-zinc-600 flex-shrink-0"
                >
                  <ChevronRight size={18} className="sm:w-5 sm:h-5" />
                </button>
                <button
                  type="button"
                  onClick={handleThisWeek}
                  className="px-3 sm:px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-colors flex-shrink-0"
                >
                  {isWeekView ? 'Esta semana' : 'Hoy'}
                </button>
              </div>

              <select
                value={selectedBarberId}
                onChange={(e) => setSelectedBarberId(e.target.value as 'all' | string)}
                className="bg-white border border-zinc-200 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 font-medium text-zinc-800 shadow-sm text-sm w-full sm:w-auto min-w-0"
              >
                <option value="all">Todos los barberos</option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={openCreateModal}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#e5c185] hover:bg-[#d4b074] text-zinc-950 font-bold rounded-xl transition-colors"
              >
                <Plus size={20} />
                Nueva cita
              </button>
            </div>
          )}
          {view === 'servicios' && (
            <button
              type="button"
              onClick={openCreateServiceModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#e5c185] hover:bg-[#d4b074] text-zinc-950 font-bold rounded-xl transition-colors"
            >
              <Plus size={20} />
              Nuevo servicio
            </button>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        )}
        {serviceError && view === 'servicios' && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{serviceError}</div>
        )}

        {view === 'agenda' && (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-sm">
            <p className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-1">Turnos del día</p>
            <p className="text-4xl font-black text-zinc-900">{dayAppointments.length}</p>
          </div>
          <div className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-sm">
            <p className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-1">Ingresos est.</p>
            <p className="text-4xl font-black text-emerald-600">${totalIncome.toLocaleString('es-AR')}</p>
          </div>
        </div>

        {/* Vista semana: calendario del barbero seleccionado */}
        {isWeekView && selectedBarber && (
          <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden mb-8">
            <div className="bg-gradient-to-r from-zinc-50 to-amber-50/30">
              <div className="px-6 pt-4 pb-0 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img src={selectedBarber.photo} alt={selectedBarber.name} className="w-12 h-12 rounded-full object-cover border-2 border-[#e5c185] shadow-md" referrerPolicy="no-referrer" />
                  <div>
                    <h3 className="font-black text-lg text-zinc-900 tracking-tight">Calendario de la semana</h3>
                    <p className="text-[#b39055] font-bold uppercase tracking-wider text-xs mt-0.5">{selectedBarber.name} · {selectedBarber.role}</p>
                  </div>
                </div>
                <p className="text-sm text-zinc-500 font-medium">
                  {format(weekStart, "d 'de' MMMM", { locale: es })} – {format(weekEnd, "d 'de' MMMM yyyy", { locale: es })}
                </p>
              </div>
              {!loading && (
                <div className="border-t border-zinc-200 bg-zinc-100 flex min-w-0">
                  <div className="w-20 min-w-[5rem] flex-shrink-0 py-3 px-4 bg-zinc-900 text-white font-bold text-sm uppercase tracking-wider flex items-center">
                    Hora
                  </div>
                  {weekDays.map((day) => (
                    <div
                      key={day.toISOString()}
                      className="py-3 px-2 text-center min-w-[110px] flex-1 border-l border-zinc-200"
                    >
                      <span className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">
                        {format(day, 'EEE', { locale: es })}
                      </span>
                      <span className="block text-2xl font-black text-zinc-900 mt-1">{format(day, 'd')}</span>
                      <span className="block text-xs text-zinc-400 mt-0.5">{format(day, 'MMM', { locale: es })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {loading ? (
              <div className="p-12 text-center text-zinc-400">Cargando...</div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)] sm:max-h-[calc(100vh-320px)] -mx-2 sm:mx-0">
                <table className="w-full min-w-[640px] sm:min-w-[720px] border-collapse table-fixed">
                  <tbody>
                    {TIME_SLOTS.map((slot) => (
                      <tr key={slot} className="border-b border-zinc-100 hover:bg-zinc-50/70 transition-colors">
                        <td className="py-2 px-4 font-mono text-sm font-semibold text-zinc-600 sticky left-0 bg-white z-10 border-r border-zinc-100 whitespace-nowrap">
                          {slot}
                        </td>
                        {weekAppointmentsByDay.map(({ dateStr, appointments: dayApps }) => {
                          const app = dayApps.find((a) => a.time === slot);
                          return (
                            <td key={dateStr} className="py-2 px-2 align-top border-l border-zinc-100">
                              {app ? (
                                <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-sm shadow-sm hover:shadow transition-shadow">
                                  <p className="font-bold text-zinc-900 truncate" title={app.name}>{app.name}</p>
                                  <p className="text-zinc-600 text-xs truncate mt-0.5">{app.service}</p>
                                  <div className="flex gap-1 mt-2">
                                    <button
                                      type="button"
                                      onClick={() => openEditModal(app)}
                                      className="p-1.5 text-zinc-500 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
                                      title="Editar"
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(app.id)}
                                      className="p-1.5 text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Eliminar"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="h-[3.5rem] rounded-lg bg-zinc-50 border border-zinc-100" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Calendario por peluquero (vista día, todos) */}
        {!isWeekView && (
          <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden mb-8">
            <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
              <h3 className="font-bold text-lg text-zinc-800">Calendario por peluquero</h3>
            </div>
            {loading ? (
              <div className="p-12 text-center text-zinc-400">Cargando...</div>
            ) : (
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                {appointmentsByBarber.map(({ barber, appointments: barberAppointments }) => (
                  <div key={barber.id} className="border border-zinc-200 rounded-2xl overflow-hidden">
                    <div className="bg-zinc-900 text-white p-4 flex items-center gap-3">
                      <img src={barber.photo} alt={barber.name} className="w-12 h-12 rounded-full object-cover" referrerPolicy="no-referrer" />
                      <div>
                        <p className="font-bold text-lg">{barber.name}</p>
                        <p className="text-xs text-[#e5c185] font-medium">{barber.role}</p>
                      </div>
                    </div>
                    <div className="p-3 divide-y divide-zinc-100 max-h-[320px] overflow-y-auto">
                      {TIME_SLOTS.map((slot) => {
                        const app = barberAppointments.find((a) => a.time === slot);
                        return (
                          <div
                            key={slot}
                            className="flex items-center gap-2 py-2 text-sm"
                          >
                            <span className="w-14 font-mono text-zinc-500 flex-shrink-0">{slot}</span>
                            {app ? (
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                <span className="font-medium text-zinc-800 truncate">{app.name}</span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(app)}
                                    className="p-1.5 text-zinc-400 hover:text-[#e5c185] hover:bg-amber-50 rounded-lg transition-colors"
                                    title="Editar"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(app.id)}
                                    className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Eliminar"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span className="text-zinc-300">—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Listado de turnos */}
        <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
            <h3 className="font-bold text-lg text-zinc-800">Listado de turnos</h3>
            <span className="bg-[#e5c185]/20 text-[#b39055] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              {dayAppointments.length} programados
            </span>
          </div>

          {dayAppointments.length === 0 ? (
            <div className="p-20 text-center text-zinc-400 flex flex-col items-center bg-zinc-50/30">
              <div className="w-24 h-24 bg-zinc-100 rounded-full flex items-center justify-center mb-6">
                <CalendarIcon size={40} className="text-zinc-300" />
              </div>
              <p className="text-xl font-medium text-zinc-600">Día libre</p>
              <p className="mt-2">No hay turnos para esta fecha.</p>
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-[#e5c185] hover:bg-[#d4b074] text-zinc-950 font-bold rounded-xl transition-colors"
              >
                <Plus size={18} />
                Crear cita
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {dayAppointments.map((app) => (
                <div key={app.id} className="p-6 hover:bg-zinc-50 transition-colors flex flex-col md:flex-row md:items-center gap-6 group">
                  <div className="flex-shrink-0 w-28 flex flex-col items-center justify-center bg-zinc-950 text-white rounded-2xl py-4 shadow-md">
                    <Clock size={18} className="text-[#e5c185] mb-1" />
                    <span className="font-black text-2xl tracking-tight">{app.time}</span>
                  </div>
                  <div className="flex-grow grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div>
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <User size={14} /> Cliente
                      </p>
                      <p className="font-bold text-lg text-zinc-900">{app.name}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Phone size={14} /> Teléfono
                      </p>
                      <a href={`https://wa.me/549${app.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="font-bold text-lg text-zinc-900 hover:text-[#b39055] transition-colors">
                        {app.phone}
                      </a>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Scissors size={14} /> Servicio
                      </p>
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-zinc-100 text-zinc-800">
                        {app.service}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Barbero</p>
                      <span className="font-medium text-zinc-800">{app.barber ?? '—'}</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex flex-wrap gap-2 border-t md:border-t-0 md:border-l border-zinc-100 pt-4 md:pt-0 md:pl-6">
                    <button
                      type="button"
                      onClick={() => openEditModal(app)}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded-xl text-sm font-bold transition-colors"
                    >
                      <Pencil size={18} />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(app.id)}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-sm font-bold transition-colors"
                    >
                      <Trash2 size={18} />
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </>
        )}

        {view === 'servicios' && (
          <div className="bg-white border border-zinc-200 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden min-w-0">
            <div className="p-4 sm:p-6 border-b border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <h3 className="font-bold text-base sm:text-lg text-zinc-800">Servicios</h3>
              <span className="text-zinc-500 text-sm">{services.length} servicios</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/50">
                    <th className="text-left py-3 px-4 text-xs font-bold text-zinc-500 uppercase tracking-wider w-14">Emoji</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Nombre</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Precio</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Duración</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-zinc-500 uppercase tracking-wider hidden md:table-cell">Descripción</th>
                    <th className="text-right py-3 px-4 text-xs font-bold text-zinc-500 uppercase tracking-wider w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s) => (
                    <tr key={s.id} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                      <td className="py-4 px-4 text-2xl">{s.emoji || '—'}</td>
                      <td className="py-4 px-4 font-medium text-zinc-900">{s.name}</td>
                      <td className="py-4 px-4 text-zinc-700">{s.price}</td>
                      <td className="py-4 px-4 text-zinc-700">{s.duration} min</td>
                      <td className="py-4 px-4 text-zinc-500 text-sm hidden md:table-cell max-w-[200px] truncate" title={s.desc}>{s.desc || '—'}</td>
                      <td className="py-4 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEditServiceModal(s)}
                          className="p-2 text-zinc-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteService(s.id)}
                          className="p-2 text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {services.length === 0 && (
              <div className="p-20 text-center text-zinc-400">
                <Package size={48} className="mx-auto mb-4 opacity-50" />
                <p className="font-medium">No hay servicios cargados.</p>
                <button
                  type="button"
                  onClick={openCreateServiceModal}
                  className="mt-4 text-[#e5c185] font-bold hover:underline"
                >
                  Crear el primero
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal crear/editar cita */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={closeModal}>
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto my-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-zinc-200 flex justify-between items-center">
              <h3 className="text-xl font-black text-zinc-900">
                {editingAppointment ? 'Editar cita' : 'Nueva cita'}
              </h3>
              <button type="button" onClick={closeModal} className="p-2 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSaveAppointment} className="p-6 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Cliente</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                  placeholder="Nombre completo"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Teléfono</label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                  placeholder="Ej. 11 2345 6789"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Servicio</label>
                <select
                  value={form.service}
                  onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} - {s.price}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Barbero</label>
                <select
                  value={form.barberId}
                  onChange={(e) => setForm((f) => ({ ...f, barberId: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                >
                  {barbers.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} - {b.role}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Fecha</label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Hora</label>
                  <select
                    value={form.time}
                    onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                  >
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-3 rounded-xl border border-zinc-200 text-zinc-700 font-bold hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-[#e5c185] hover:bg-[#d4b074] text-zinc-950 font-bold disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : editingAppointment ? 'Guardar cambios' : 'Crear cita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal crear/editar servicio */}
      {serviceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={closeServiceModal}>
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto my-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-zinc-200 flex justify-between items-center">
              <h3 className="text-xl font-black text-zinc-900">
                {editingService ? 'Editar servicio' : 'Nuevo servicio'}
              </h3>
              <button type="button" onClick={closeServiceModal} className="p-2 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSaveService} className="p-6 space-y-4">
              {serviceError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{serviceError}</div>}
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Emoji</label>
                <input
                  type="text"
                  value={serviceForm.emoji}
                  onChange={(e) => setServiceForm((f) => ({ ...f, emoji: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-2xl text-center"
                  placeholder="✂️"
                  maxLength={10}
                />
                <p className="text-xs text-zinc-400 mt-1">Pega un emoji (ej. ✂️ 💈 🧔)</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={serviceForm.name}
                  onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                  placeholder="Ej. Corte de cabello"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Precio</label>
                  <input
                    type="text"
                    required
                    value={serviceForm.price}
                    onChange={(e) => setServiceForm((f) => ({ ...f, price: e.target.value }))}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                    placeholder="Ej. $20.000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Duración (min)</label>
                  <input
                    type="number"
                    required
                    min={5}
                    step={5}
                    value={serviceForm.duration}
                    onChange={(e) => setServiceForm((f) => ({ ...f, duration: Number(e.target.value) || 30 }))}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Descripción</label>
                <textarea
                  value={serviceForm.desc}
                  onChange={(e) => setServiceForm((f) => ({ ...f, desc: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 min-h-[80px]"
                  placeholder="Descripción opcional del servicio"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeServiceModal}
                  className="flex-1 py-3 rounded-xl border border-zinc-200 text-zinc-700 font-bold hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingService}
                  className="flex-1 py-3 rounded-xl bg-[#e5c185] hover:bg-[#d4b074] text-zinc-950 font-bold disabled:opacity-50"
                >
                  {savingService ? 'Guardando...' : editingService ? 'Guardar cambios' : 'Crear servicio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
