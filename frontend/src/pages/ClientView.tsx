import React, { useState, useRef } from 'react';
import { Calendar, Clock, Scissors, MapPin, Phone, User, CheckCircle2, ChevronRight, ChevronLeft, Menu, X } from 'lucide-react';
import { addAppointment } from '../store';
import { format, addDays, startOfToday, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isBefore, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion } from 'motion/react';

const SERVICES = [
  { id: 'corte', name: 'Corte de cabello', price: '$20.000', duration: 30, desc: 'Corte clásico o degradado con terminaciones a navaja.' },
  { id: 'corte_ninos', name: 'Corte de niños 0 a 6', price: '$22.000', duration: 30, desc: 'Corte especial para los más pequeños.' },
  { id: 'cabellos_largos', name: 'Cabellos largos 10cm', price: '$22.000', duration: 45, desc: 'Corte y estilizado para cabellos largos.' },
  { id: 'arreglo_barba', name: 'Arreglo de barba', price: '$10.000', duration: 30, desc: 'Perfilado, rebaje y toallas calientes.' },
  { id: 'perfilado_cejas', name: 'Perfilado de cejas', price: '$1.000', duration: 15, desc: 'Diseño y perfilado de cejas.' },
  { id: 'rapado', name: 'Rapado', price: '$10.000', duration: 20, desc: 'Rapado completo a máquina.' },
  { id: 'afeitado_tradicional', name: 'Afeitado tradicional', price: '$8.000', duration: 30, desc: 'Afeitado clásico con navaja y toallas calientes.' },
];

const TIME_SLOTS = [
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30'
];

const Logo = ({ className = "w-32 h-32" }) => (
  <div className={`bg-white rounded-full border-4 border-zinc-900 flex flex-col items-center justify-center relative shadow-2xl ${className}`}>
    <div className="absolute inset-1.5 border-2 border-zinc-800 rounded-full"></div>
    <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full animate-[spin_20s_linear_infinite]">
      <path id="curve" d="M 20 50 A 30 30 0 1 1 80 50" fill="transparent" />
      <text className="text-[12px] font-black uppercase tracking-widest" fill="#18181b">
        <textPath href="#curve" startOffset="50%" textAnchor="middle">Lion Barber</textPath>
      </text>
    </svg>
    <div className="w-12 h-12 z-10 mt-4 rounded-full overflow-hidden border-2 border-zinc-900">
      <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS9afJTOOxlqBtn27Asuu-Jvmb0NQZP6tKPGg&s" alt="Lion Logo" className="w-full h-full object-cover" />
    </div>
    <div className="text-zinc-900 text-[8px] font-bold z-10 mt-1 uppercase tracking-widest">BS AS</div>
  </div>
);

const BARBERS = [
  {
    id: 'barber_1',
    name: 'Agus',
    role: 'Master Barber',
    photo: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?q=80&w=500&auto=format&fit=crop',
    desc: 'Especialista en cortes clásicos y perfilado de barba.'
  },
  {
    id: 'barber_2',
    name: 'Valen',
    role: 'Senior Barber',
    photo: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=500&auto=format&fit=crop',
    desc: 'Experto en degradados y estilos urbanos modernos.'
  },
  {
    id: 'barber_3',
    name: 'Toni',
    role: 'Barber',
    photo: 'https://images.unsplash.com/photo-1605406575497-015ab0d21b9b?q=80&w=500&auto=format&fit=crop',
    desc: 'Detallista y perfeccionista. Especialista en tijera.'
  }
];

export default function ClientView() {
  // Booking state
  const [selectedService, setSelectedService] = useState('');
  const [selectedBarber, setSelectedBarber] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(startOfToday(), 'yyyy-MM-dd'));
  const [selectedTime, setSelectedTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(startOfToday());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Drag to scroll state
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [dragged, setDragged] = useState(false);

  const today = startOfToday();
  const baseDays = Array.from({ length: 30 }).map((_, i) => addDays(today, i));

  let displayDays = [...baseDays];
  if (selectedDate) {
    const isSelectedInBase = baseDays.some(d => format(d, 'yyyy-MM-dd') === selectedDate);
    if (!isSelectedInBase) {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const customDate = new Date(year, month - 1, day);
      displayDays = [customDate, ...baseDays];
    }
  }

  const scrollDates = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setDragged(false);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    if (Math.abs(walk) > 5) {
      setDragged(true);
    }
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService || !selectedBarber || !selectedDate || !selectedTime || !name || !phone) {
      alert('Por favor completa todos los campos');
      return;
    }

    addAppointment({
      name,
      phone,
      service: SERVICES.find(s => s.id === selectedService)?.name || 'Servicio',
      barber: BARBERS.find(b => b.id === selectedBarber)?.name || 'Barbero',
      date: selectedDate,
      time: selectedTime,
    });

    setBookingSuccess(true);
    setTimeout(() => {
      setBookingSuccess(false);
      setSelectedService('');
      setSelectedBarber('');
      setSelectedDate('');
      setSelectedTime('');
      setName('');
      setPhone('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-[#e5c185]/30">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-zinc-900 rounded-full flex items-center justify-center overflow-hidden border border-zinc-800">
              <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS9afJTOOxlqBtn27Asuu-Jvmb0NQZP6tKPGg&s" alt="Lion Logo" className="w-full h-full object-cover" />
            </div>
            <span className="font-serif font-black tracking-widest uppercase text-base sm:text-lg text-white">Lion Barber</span>
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8 text-sm font-sans font-medium text-zinc-400">
            <a href="#servicios" className="hover:text-[#e5c185] transition-colors">Servicios</a>
            <a href="#barberos" className="hover:text-[#e5c185] transition-colors">Barberos</a>
            <a href="#reserva" className="hover:text-[#e5c185] transition-colors">Reservar</a>
            <a href="#contacto" className="hover:text-[#e5c185] transition-colors">Contacto</a>
            <a href="/dashboard" className="text-xs font-sans font-bold text-zinc-950 bg-[#e5c185] hover:bg-[#d4b074] px-4 py-2 rounded-full transition-colors uppercase tracking-wider">
              Iniciar Sesión
            </a>
          </div>

          {/* Mobile Menu Toggle */}
          <button 
            className="md:hidden text-zinc-400 hover:text-[#e5c185] transition-colors p-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-20 left-0 w-full bg-zinc-950 border-b border-zinc-800/50 flex flex-col py-4 px-6 gap-4 shadow-2xl">
            <a href="#servicios" onClick={() => setIsMobileMenuOpen(false)} className="text-zinc-400 hover:text-[#e5c185] font-medium transition-colors">Servicios</a>
            <a href="#barberos" onClick={() => setIsMobileMenuOpen(false)} className="text-zinc-400 hover:text-[#e5c185] font-medium transition-colors">Barberos</a>
            <a href="#reserva" onClick={() => setIsMobileMenuOpen(false)} className="text-zinc-400 hover:text-[#e5c185] font-medium transition-colors">Reservar</a>
            <a href="#contacto" onClick={() => setIsMobileMenuOpen(false)} className="text-zinc-400 hover:text-[#e5c185] font-medium transition-colors">Contacto</a>
            <div className="h-px bg-zinc-800/50 my-2"></div>
            <a href="/dashboard" className="text-center text-xs font-sans font-bold text-zinc-950 bg-[#e5c185] hover:bg-[#d4b074] px-4 py-3 rounded-xl transition-colors uppercase tracking-wider">
              Iniciar Sesión
            </a>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-4 sm:px-6 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&q=80" 
            alt="Barbershop interior" 
            className="w-full h-full object-cover opacity-20"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/50 via-zinc-950/80 to-zinc-950"></div>
        </div>

        <div className="max-w-4xl mx-auto relative z-10 flex flex-col items-center text-center pt-10">
          <p className="text-xs sm:text-sm md:text-base font-sans tracking-[0.4em] text-zinc-200 mb-4 sm:mb-6 uppercase">
            De 10 a 20 hs
          </p>
          
          <div className="relative flex flex-col items-center justify-center w-full">
            <h1 className="text-6xl sm:text-7xl md:text-[140px] font-serif font-black uppercase tracking-tight text-white drop-shadow-2xl leading-none">
              Agenda
            </h1>
            <span className="text-7xl sm:text-8xl md:text-[160px] font-script text-[#e5c185] drop-shadow-lg absolute top-1/2 -translate-y-1/2 mt-6 sm:mt-8 md:mt-16 leading-none">
              abierta
            </span>
          </div>

          {/* Hanging OPEN Sign / Booking Button */}
          <a href="#reserva" className="relative mt-20 sm:mt-28 md:mt-40 flex flex-col items-center group cursor-pointer hover:scale-105 transition-transform">
            {/* Strings */}
            <div className="flex justify-between w-40 md:w-56 absolute -top-20 sm:-top-24 md:-top-32 h-24 sm:h-28 md:h-36 z-0">
              <div className="w-1 bg-[#e5c185] h-full shadow-sm"></div>
              <div className="w-1 bg-[#e5c185] h-full shadow-sm"></div>
            </div>
            {/* Sign */}
            <div className="relative z-10 bg-[#e5c185] border-4 border-black rounded-[2rem] md:rounded-[2.5rem] w-56 sm:w-64 md:w-80 py-4 md:py-5 shadow-2xl flex items-center justify-center">
              {/* Little holes for strings */}
              <div className="absolute top-3 left-8 md:left-12 w-3 h-3 md:w-4 md:h-4 bg-black rounded-full"></div>
              <div className="absolute top-3 right-8 md:right-12 w-3 h-3 md:w-4 md:h-4 bg-black rounded-full"></div>
              {/* Inner border line */}
              <div className="absolute inset-1.5 md:inset-2 border-2 border-black rounded-[1.5rem] md:rounded-[2rem] pointer-events-none"></div>
              <span className="text-black font-sans font-black text-2xl sm:text-3xl md:text-4xl tracking-widest uppercase relative z-10">
                Reservar
              </span>
            </div>
          </a>
        </div>
      </section>

      {/* Services Section */}
      <section id="servicios" className="py-20 px-6 bg-zinc-950 border-y border-zinc-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-serif font-black uppercase tracking-tight mb-4 text-white">Nuestros Servicios</h2>
            <div className="w-24 h-1 bg-[#e5c185] mx-auto rounded-full"></div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {SERVICES.map((service) => (
              <div key={service.id} className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl hover:border-[#e5c185]/50 transition-colors group">
                <div className="w-14 h-14 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-center text-[#e5c185] mb-6 group-hover:scale-110 transition-transform">
                  <Scissors size={28} />
                </div>
                <h3 className="text-2xl font-serif font-bold mb-2 text-white">{service.name}</h3>
                <p className="text-zinc-400 mb-6 min-h-[48px] font-sans font-light">{service.desc}</p>
                <div className="flex items-end justify-between mt-auto">
                  <span className="text-3xl font-sans font-black text-[#e5c185]">{service.price}</span>
                  <span className="text-sm text-zinc-500 font-medium flex items-center gap-1">
                    <Clock size={14} /> {service.duration} min
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Barbers Section */}
      <section id="barberos" className="py-20 px-6 bg-zinc-950 border-y border-zinc-900">
        <div className="max-w-6xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-serif font-black uppercase tracking-tight mb-4 text-white">Nuestros Barberos</h2>
            <div className="w-24 h-1 bg-[#e5c185] mx-auto rounded-full"></div>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {BARBERS.map((barber, index) => (
              <motion.div 
                key={barber.id} 
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden hover:border-[#e5c185]/50 transition-colors group"
              >
                <div className="aspect-[4/5] overflow-hidden relative">
                  <img 
                    src={barber.photo} 
                    alt={barber.name} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent opacity-80"></div>
                  <div className="absolute bottom-0 left-0 w-full p-6">
                    <h3 className="text-3xl font-serif font-black text-white mb-1">{barber.name}</h3>
                    <p className="text-[#e5c185] font-sans font-bold text-sm uppercase tracking-widest">{barber.role}</p>
                  </div>
                </div>
                <div className="p-6">
                  <p className="text-zinc-400 font-sans font-light leading-relaxed">{barber.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Booking Section */}
      <section id="reserva" className="py-20 sm:py-24 px-4 sm:px-6 relative bg-zinc-900/30">
        <div className="max-w-4xl mx-auto">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-12 shadow-2xl relative overflow-hidden">
            {/* Decorative background element */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#e5c185]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-black uppercase tracking-tight mb-2 text-white">Reserva tu lugar</h2>
              <p className="text-sm sm:text-base text-zinc-400 mb-8 sm:mb-10 font-sans font-light">Completa los datos para agendar tu próximo corte.</p>

              {bookingSuccess ? (
                <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-2xl p-12 text-center animate-in fade-in zoom-in duration-500">
                  <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-400">
                    <CheckCircle2 size={40} />
                  </div>
                  <h3 className="text-3xl font-serif font-black text-white mb-2">¡Turno Confirmado!</h3>
                  <p className="text-emerald-400/80 text-lg font-sans">Te esperamos en Lion Barber.</p>
                </div>
              ) : (
                <form onSubmit={handleBook} className="space-y-6 font-sans">
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Service Selection */}
                    <div className="space-y-2 md:col-span-2 min-w-0">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Scissors size={14} /> Servicio
                      </label>
                      <select 
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white focus:ring-2 focus:ring-[#e5c185] focus:border-[#e5c185] outline-none transition-all appearance-none"
                        value={selectedService}
                        onChange={(e) => setSelectedService(e.target.value)}
                        required
                      >
                        <option value="" disabled>Selecciona un servicio</option>
                        {SERVICES.map(s => (
                          <option key={s.id} value={s.id}>{s.name} - {s.price}</option>
                        ))}
                      </select>
                    </div>

                    {/* Barber Selection */}
                    <div className="space-y-2 md:col-span-2 min-w-0">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <User size={14} /> Barbero
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {BARBERS.map(b => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setSelectedBarber(b.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                              selectedBarber === b.id 
                                ? 'bg-[#e5c185] border-[#e5c185] text-black shadow-[0_0_15px_rgba(229,193,133,0.2)]' 
                                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-[#e5c185]/50 hover:text-zinc-200'
                            }`}
                          >
                            <img src={b.photo} alt={b.name} className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                            <div>
                              <div className={`font-bold ${selectedBarber === b.id ? 'text-black' : 'text-white'}`}>{b.name}</div>
                              <div className={`text-xs ${selectedBarber === b.id ? 'text-black/70' : 'text-zinc-500'}`}>{b.role}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Date Selection */}
                    <div className="space-y-3 md:col-span-2 min-w-0">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Calendar size={14} /> Fecha
                      </label>
                      <div className="relative group">
                        {/* Left Gradient & Button */}
                        <div className="absolute left-0 top-0 bottom-2 w-12 bg-gradient-to-r from-zinc-950 to-transparent z-10 pointer-events-none"></div>
                        <button 
                          type="button" 
                          onClick={() => scrollDates('left')} 
                          className="absolute left-0 top-1/2 -translate-y-1/2 -mt-1 z-20 bg-zinc-800/80 hover:bg-[#e5c185] hover:text-black p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all hidden md:block shadow-lg"
                        >
                          <ChevronLeft size={20} />
                        </button>

                        <div 
                          ref={scrollContainerRef} 
                          className={`flex gap-3 overflow-x-auto pb-2 hide-scrollbar w-full relative z-0 px-1 select-none ${isDragging ? 'cursor-grabbing' : 'snap-x cursor-grab'}`}
                          onMouseDown={handleMouseDown}
                          onMouseLeave={handleMouseLeave}
                          onMouseUp={handleMouseUp}
                          onMouseMove={handleMouseMove}
                        >
                          {displayDays.map(date => {
                            const dateStr = format(date, 'yyyy-MM-dd');
                            const isSelected = selectedDate === dateStr;
                            return (
                              <button
                                key={dateStr}
                                type="button"
                                onClick={(e) => {
                                  if (dragged) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    return;
                                  }
                                  setSelectedDate(dateStr);
                                }}
                                className={`flex-shrink-0 w-20 py-3 rounded-2xl border flex flex-col items-center justify-center transition-all snap-start ${
                                  isSelected 
                                    ? 'bg-[#e5c185] border-[#e5c185] text-black shadow-[0_0_15px_rgba(229,193,133,0.3)]' 
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-[#e5c185]/50 hover:text-zinc-200'
                                }`}
                              >
                                <span className="text-xs font-bold uppercase tracking-wider mb-1">
                                  {format(date, 'EEE', { locale: es }).replace('.', '')}
                                </span>
                                <span className={`text-2xl font-black ${isSelected ? 'text-black' : 'text-white'}`}>
                                  {format(date, 'd')}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-widest mt-1">
                                  {format(date, 'MMM', { locale: es }).replace('.', '')}
                                </span>
                              </button>
                            );
                          })}

                          {/* Botón de Más Fechas */}
                          <button 
                            type="button"
                            className="relative flex-shrink-0 w-20 py-3 rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-[#e5c185] hover:bg-zinc-900 hover:text-[#e5c185] flex flex-col items-center justify-center transition-all snap-start cursor-pointer group/calendar overflow-hidden"
                            onClick={(e) => {
                              if (dragged) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              setShowCalendarModal(true);
                            }}
                          >
                            <span className="text-xs font-bold uppercase tracking-wider mb-1 group-hover/calendar:text-[#e5c185] transition-colors relative z-0">
                              MÁS
                            </span>
                            <span className="text-2xl font-black text-white group-hover/calendar:text-[#e5c185] transition-colors relative z-0 flex items-center justify-center h-[32px]">
                              <Calendar size={26} strokeWidth={2.5} />
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-widest mt-1 group-hover/calendar:text-[#e5c185] transition-colors relative z-0">
                              FECHAS
                            </span>
                          </button>
                        </div>

                        {/* Right Gradient & Button */}
                        <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-zinc-950 to-transparent z-10 pointer-events-none"></div>
                        <button 
                          type="button" 
                          onClick={() => scrollDates('right')} 
                          className="absolute right-0 top-1/2 -translate-y-1/2 -mt-1 z-20 bg-zinc-800/80 hover:bg-[#e5c185] hover:text-black p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all hidden md:block shadow-lg"
                        >
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    </div>

                    {/* Time Selection */}
                    <div className="space-y-3 md:col-span-2 min-w-0">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Clock size={14} /> Hora
                      </label>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3">
                        {TIME_SLOTS.map(time => {
                          const isSelected = selectedTime === time;
                          return (
                            <button
                              key={time}
                              type="button"
                              onClick={() => setSelectedTime(time)}
                              className={`py-3 rounded-xl border text-sm font-bold transition-all flex items-center justify-center ${
                                isSelected
                                  ? 'bg-[#e5c185] border-[#e5c185] text-black shadow-[0_0_15px_rgba(229,193,133,0.3)]'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-[#e5c185]/50 hover:text-zinc-200'
                              }`}
                            >
                              {time}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Name Input */}
                    <div className="space-y-2 min-w-0">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <User size={14} /> Nombre Completo
                      </label>
                      <input 
                        type="text" 
                        placeholder="Ej. Juan Pérez"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white focus:ring-2 focus:ring-[#e5c185] focus:border-[#e5c185] outline-none transition-all placeholder:text-zinc-600"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>

                    {/* Phone Input */}
                    <div className="space-y-2 min-w-0">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Phone size={14} /> Teléfono (WhatsApp)
                      </label>
                      <input 
                        type="tel" 
                        placeholder="Ej. 11 2345 6789"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white focus:ring-2 focus:ring-[#e5c185] focus:border-[#e5c185] outline-none transition-all placeholder:text-zinc-600"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    className="w-full bg-[#e5c185] hover:bg-[#d4b074] text-black font-sans font-black uppercase tracking-widest py-5 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] mt-4"
                  >
                    Confirmar Reserva
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contacto" className="bg-zinc-950 border-t border-zinc-900 py-12 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8 items-center text-center md:text-left">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-zinc-900 rounded-full flex items-center justify-center overflow-hidden border border-zinc-800">
                <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS9afJTOOxlqBtn27Asuu-Jvmb0NQZP6tKPGg&s" alt="Lion Logo" className="w-full h-full object-cover" />
              </div>
              <span className="font-serif font-black tracking-widest uppercase text-white">Lion Barber</span>
            </div>
            <p className="text-zinc-500 text-sm font-sans">Estilo y precisión en cada corte.</p>
          </div>
          
          <div className="flex flex-col items-center md:items-start gap-2 text-zinc-400 text-sm font-sans">
            <p className="flex items-center gap-2"><MapPin size={16} className="text-[#e5c185]" /> Dr. Nicolas Repeto 1602, CABA</p>
            <p className="flex items-center gap-2"><Clock size={16} className="text-[#e5c185]" /> Lun a Vie: 10-20hs | Sáb: 10-18hs</p>
          </div>

          <div className="flex justify-center md:justify-end gap-4">
            <a href="https://wa.link/xxyvs9" target="_blank" rel="noreferrer" className="w-10 h-10 bg-zinc-900 rounded-full flex items-center justify-center hover:bg-[#e5c185] hover:text-zinc-950 transition-colors">
              <Phone size={18} />
            </a>
          </div>
        </div>
      </footer>

      {/* Custom Calendar Modal */}
      {showCalendarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowCalendarModal(false)}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <button 
                type="button"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-2 hover:bg-zinc-900 rounded-full text-zinc-400 hover:text-[#e5c185] transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <h2 className="text-lg font-bold text-white uppercase tracking-widest">
                {format(currentMonth, 'MMMM yyyy', { locale: es })}
              </h2>
              <button 
                type="button"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-2 hover:bg-zinc-900 rounded-full text-zinc-400 hover:text-[#e5c185] transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            
            <div className="grid grid-cols-7 gap-2 mb-2">
              {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'].map(day => (
                <div key={day} className="text-center text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  {day}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-2">
              {eachDayOfInterval({
                start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 }),
                end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 })
              }).map((day, idx) => {
                const isSelected = selectedDate === format(day, 'yyyy-MM-dd');
                const isPast = isBefore(startOfDay(day), startOfDay(today));
                const isCurrentMonth = isSameMonth(day, startOfMonth(currentMonth));
                
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isPast}
                    onClick={() => {
                      setSelectedDate(format(day, 'yyyy-MM-dd'));
                      setShowCalendarModal(false);
                      setTimeout(() => {
                        if (scrollContainerRef.current) {
                          scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                        }
                      }, 50);
                    }}
                    className={`
                      w-full aspect-square rounded-xl flex items-center justify-center text-sm font-medium transition-all
                      ${!isCurrentMonth ? 'text-zinc-700' : ''}
                      ${isPast ? 'opacity-30 cursor-not-allowed' : 'hover:bg-zinc-900 hover:text-[#e5c185]'}
                      ${isSelected ? 'bg-[#e5c185] text-black font-bold shadow-[0_0_15px_rgba(229,193,133,0.3)] hover:bg-[#d4b074] hover:text-black' : (isCurrentMonth && !isPast ? 'text-zinc-300' : '')}
                    `}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>
            
            <div className="mt-6 flex justify-end">
              <button 
                type="button"
                onClick={() => setShowCalendarModal(false)}
                className="px-6 py-2 rounded-xl text-sm font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
