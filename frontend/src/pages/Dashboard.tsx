import React, { useState, useEffect } from 'react';
import { format, isSameDay, parseISO } from 'date-fns';
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
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { getAppointments, Appointment } from '../store';

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    // In a real app, this would fetch from an API or Firebase
    setAppointments(getAppointments());
  }, []);

  const handlePrevDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const handleNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  // Filter appointments for the selected date and sort by time
  const dayAppointments = appointments
    .filter(app => isSameDay(parseISO(app.date), selectedDate))
    .sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      {/* Top Navigation */}
      <nav className="bg-zinc-950 text-white px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-900 rounded-full flex items-center justify-center overflow-hidden border border-zinc-800">
            <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS9afJTOOxlqBtn27Asuu-Jvmb0NQZP6tKPGg&s" alt="Lion Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="font-black tracking-widest uppercase text-sm">Lion Barber</h1>
            <p className="text-xs text-[#e5c185] font-bold tracking-wider">PANEL DE CONTROL</p>
          </div>
        </div>
        <a href="/" className="text-zinc-400 hover:text-white flex items-center gap-2 text-sm font-medium transition-colors bg-zinc-900 px-4 py-2 rounded-full">
          <LogOut size={16} />
          <span className="hidden sm:inline">Volver a la web</span>
        </a>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {/* Header & Date Selector */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          <div>
            <h2 className="text-3xl font-black tracking-tight">Agenda de Turnos</h2>
            <p className="text-zinc-500 mt-1">Gestiona las reservas de tus clientes.</p>
          </div>

          <div className="bg-white border border-zinc-200 shadow-sm rounded-2xl p-2 flex items-center gap-2 w-full md:w-auto">
            <button 
              onClick={handlePrevDay}
              className="p-3 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-600"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex-grow md:flex-grow-0 flex items-center justify-center gap-2 px-4 min-w-[200px]">
              <CalendarIcon className="text-[#e5c185]" size={20} />
              <span className="font-bold capitalize text-zinc-800">
                {format(selectedDate, "EEEE, d 'de' MMMM", { locale: es })}
              </span>
            </div>
            <button 
              onClick={handleNextDay}
              className="p-3 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-600"
            >
              <ChevronRight size={20} />
            </button>
            <button 
              onClick={handleToday}
              className="ml-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-sm font-bold transition-colors"
            >
              Hoy
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-sm">
            <p className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-1">Turnos Hoy</p>
            <p className="text-4xl font-black text-zinc-900">{dayAppointments.length}</p>
          </div>
          <div className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-sm">
            <p className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-1">Ingresos Est.</p>
            <p className="text-4xl font-black text-emerald-600">
              ${dayAppointments.reduce((acc, curr) => {
                let price = 0;
                if (curr.service.includes('Corte de cabello')) price = 20000;
                else if (curr.service.includes('Corte de niños')) price = 22000;
                else if (curr.service.includes('Cabellos largos')) price = 22000;
                else if (curr.service.includes('Arreglo de barba')) price = 10000;
                else if (curr.service.includes('Perfilado de cejas')) price = 1000;
                else if (curr.service.includes('Rapado')) price = 10000;
                else if (curr.service.includes('Afeitado tradicional')) price = 8000;
                return acc + price;
              }, 0).toLocaleString('es-AR')}
            </p>
          </div>
        </div>

        {/* Appointments List */}
        <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
            <h3 className="font-bold text-lg text-zinc-800">Listado de Turnos</h3>
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
              <p className="mt-2">No hay turnos programados para esta fecha.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {dayAppointments.map((app) => (
                <div key={app.id} className="p-6 hover:bg-zinc-50 transition-colors flex flex-col md:flex-row md:items-center gap-6 group">
                  {/* Time Badge */}
                  <div className="flex-shrink-0 w-28 flex flex-col items-center justify-center bg-zinc-950 text-white rounded-2xl py-4 shadow-md group-hover:scale-105 transition-transform">
                    <Clock size={18} className="text-[#e5c185] mb-1" />
                    <span className="font-black text-2xl tracking-tight">{app.time}</span>
                  </div>
                  
                  {/* Details Grid */}
                  <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-6">
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
                      <a href={`https://wa.me/549${app.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="font-bold text-lg text-zinc-900 hover:text-[#b39055] transition-colors">
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
                  </div>
                  
                  {/* Actions */}
                  <div className="flex-shrink-0 flex md:flex-col gap-2 mt-4 md:mt-0 border-t md:border-t-0 md:border-l border-zinc-100 pt-4 md:pt-0 md:pl-6">
                    <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-sm font-bold transition-colors">
                      <CheckCircle2 size={18} />
                      <span>Listo</span>
                    </button>
                    <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-sm font-bold transition-colors">
                      <XCircle size={18} />
                      <span>Falta</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
