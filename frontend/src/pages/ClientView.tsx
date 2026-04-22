import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Calendar, Clock, Scissors, MapPin, Phone, User, CheckCircle2, ChevronRight, ChevronLeft, Menu, X, Users, LogOut, LayoutDashboard } from 'lucide-react';
import { api } from '../store';
import { ANY_BARBER_ID } from '../api';
import type { Service, Barber } from '../api';
import { useAuth } from '../contexts/AuthContext';
import {
  format,
  parse,
  addDays,
  startOfToday,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isBefore,
  startOfDay,
  getISODay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { motion } from 'motion/react';
import { Wallet } from '@mercadopago/sdk-react';
import heroPortada from '../assets/hero-portada.png';

const TIME_SLOTS = [
  '10:00', '10:20', '10:40',
  '11:00', '11:20', '11:40',
  '12:00', '12:20', '12:40',
  '13:00', '13:20', '13:40',
  '14:00', '14:20', '14:40',
  '15:00', '15:20', '15:40',
  '16:00', '16:20', '16:40',
  '17:00', '17:20', '17:40',
  '18:00', '18:20', '18:40',
  '19:00', '19:20', '19:40'
];

type DayHours = { openTime: string; closeTime: string };

const DEFAULT_WEEKDAY_HOURS: Record<number, DayHours> = {
  1: { openTime: '10:00', closeTime: '20:00' },
  2: { openTime: '10:00', closeTime: '20:00' },
  3: { openTime: '10:00', closeTime: '20:00' },
  4: { openTime: '10:00', closeTime: '20:00' },
  5: { openTime: '10:00', closeTime: '20:00' },
  6: { openTime: '10:00', closeTime: '20:00' },
  7: { openTime: '10:00', closeTime: '20:00' },
};

function timeToMinutes(hhmm: string): number {
  const [hRaw, mRaw] = hhmm.split(':').map(Number);
  if (!Number.isFinite(hRaw) || !Number.isFinite(mRaw)) return NaN;
  return hRaw * 60 + mRaw;
}

function buildTimeSlotsInRange(openTime: string, closeTime: string): string[] {
  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);
  const safeOpen = Number.isFinite(openMinutes) ? Math.max(0, Math.min(24 * 60 - 20, openMinutes)) : 10 * 60;
  const safeClose = Number.isFinite(closeMinutes) ? Math.max(safeOpen + 20, Math.min(24 * 60, closeMinutes)) : 20 * 60;
  return TIME_SLOTS.filter((slot) => {
    const start = timeToMinutes(slot);
    return Number.isFinite(start) && start >= safeOpen && start + 20 <= safeClose;
  });
}

/** Anticipación mínima para reservar “hoy” (no mostrar turnos que empiezan antes). */
const BOOKING_LEAD_MINUTES = 15;

/** Inicio del turno en hora local (reloj del navegador; en AR suele ser UTC-3). */
function slotStartDate(dateStr: string, timeStr: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, m] = timeStr.split(':').map(Number);
  if (!y || !mo || !d) return new Date(NaN);
  return new Date(y, mo - 1, d, h, m, 0, 0);
}

function minBookableTimestampForToday(dateStr: string): number | null {
  const todayStr = format(startOfToday(), 'yyyy-MM-dd');
  if (dateStr !== todayStr) return null;
  return Date.now() + BOOKING_LEAD_MINUTES * 60 * 1000;
}

/** Si la fecha es hoy, quita turnos que ya pasaron o que empiezan en menos de BOOKING_LEAD_MINUTES minutos. */
function filterPastSlotsForToday(slots: string[], dateStr: string): string[] {
  const minTs = minBookableTimestampForToday(dateStr);
  if (minTs == null) return slots;
  return slots.filter((slot) => slotStartDate(dateStr, slot).getTime() > minTs);
}

function isSlotAlreadyPast(dateStr: string, timeStr: string): boolean {
  const minTs = minBookableTimestampForToday(dateStr);
  if (minTs == null) return false;
  return slotStartDate(dateStr, timeStr).getTime() <= minTs;
}

function getServiceInitials(name?: string): string {
  const n = (name ?? '').trim();
  if (!n) return 'SV';
  const words = n
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/g, ''))
    .filter(Boolean);
  if (words.length === 0) return n.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

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

export default function ClientView() {
  const { profile, logout, canAccessDashboard, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [openWeekdays, setOpenWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [shopCloseTime, setShopCloseTime] = useState('20:00');
  const [shopWeekdayHours, setShopWeekdayHours] = useState<Record<number, DayHours>>(DEFAULT_WEEKDAY_HOURS);

  useEffect(() => {
    api.getServices().then(setServices).catch(() => setServices([]));
    api.getBarbers().then(setBarbers).catch(() => setBarbers([]));
    api
      .getShopSettings()
      .then((s) => {
        setOpenWeekdays(s.openWeekdays.length ? s.openWeekdays : [1, 2, 3, 4, 5, 6, 7]);
        setShopCloseTime(s.closeTime || '20:00');
        const next: Record<number, DayHours> = { ...DEFAULT_WEEKDAY_HOURS };
        for (let d = 1; d <= 7; d++) {
          const h = s.weekdayHours?.[d];
          next[d] = { openTime: h?.openTime || '10:00', closeTime: h?.closeTime || (s.closeTime || '20:00') };
        }
        setShopWeekdayHours(next);
      })
      .catch(() => {});
  }, []);

  // Booking state
  const [selectedService, setSelectedService] = useState('');
  const [selectedBarber, setSelectedBarber] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(startOfToday(), 'yyyy-MM-dd'));
  const [selectedTime, setSelectedTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [pendingCheckoutSuccess, setPendingCheckoutSuccess] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [senaCheckoutPreferenceId, setSenaCheckoutPreferenceId] = useState<string | null>(null);
  const [senaCheckoutLoading, setSenaCheckoutLoading] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(startOfToday());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Drag to scroll state
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [dragged, setDragged] = useState(false);

  const selectedWeekday = getISODay(parse(selectedDate, 'yyyy-MM-dd', new Date()));
  const selectedDayHours = shopWeekdayHours[selectedWeekday] ?? { openTime: '10:00', closeTime: shopCloseTime };
  const businessTimeSlots = useMemo(
    () => buildTimeSlotsInRange(selectedDayHours.openTime, selectedDayHours.closeTime),
    [selectedDayHours.openTime, selectedDayHours.closeTime]
  );
  const [availableSlots, setAvailableSlots] = useState<string[]>(TIME_SLOTS);
  const [earliestAny, setEarliestAny] = useState<{ barberId: string; time: string } | null>(null);
  const [availableBarberIds, setAvailableBarberIds] = useState<string[]>([]);
  /** Solo para re-ejecutar el filtro de “hoy” cada minuto. */
  const [timeTick, setTimeTick] = useState(0);

  const barberPhotoClasses =
    'w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500';

  const barberOverlayClasses =
    'absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent opacity-80';

  const selectedServiceDuration = services.find((s) => s.id === selectedService)?.duration ?? 30;
  const visibleBarbers = useMemo(() => {
    if (!selectedDate || !selectedService) return barbers;
    const set = new Set(availableBarberIds);
    return barbers.filter((b) => set.has(b.id));
  }, [barbers, selectedDate, selectedService, availableBarberIds]);

  const visibleTimeSlots = useMemo(
    () => filterPastSlotsForToday(availableSlots, selectedDate),
    [availableSlots, selectedDate, timeTick]
  );

  useEffect(() => {
    const todayStr = format(startOfToday(), 'yyyy-MM-dd');
    if (selectedDate !== todayStr) return;
    const id = window.setInterval(() => setTimeTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [selectedDate]);

  const validateBookingForm = (): boolean => {
    if (!selectedService || !selectedBarber || !selectedDate || !selectedTime || !name || !phone) {
      setBookingError('Por favor completa todos los campos');
      return false;
    }
    const todayStr = format(startOfToday(), 'yyyy-MM-dd');
    if (selectedDate < todayStr) {
      setBookingError('No podés reservar en una fecha pasada.');
      return false;
    }
    const cleanName = name.trim();
    if (cleanName.length < 3) {
      setBookingError('Ingresá un nombre válido (mínimo 3 caracteres).');
      return false;
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      setBookingError('Ingresá un teléfono válido.');
      return false;
    }
    if (selectedBarber !== ANY_BARBER_ID && !visibleBarbers.some((b) => b.id === selectedBarber)) {
      setBookingError('Ese barbero no está disponible para la fecha elegida.');
      return false;
    }
    if (!visibleTimeSlots.includes(selectedTime)) {
      setBookingError('La hora elegida ya no está disponible. Elegí otra.');
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (!selectedDate || !selectedService || barbers.length === 0) {
      setAvailableBarberIds(barbers.map((b) => b.id));
      return;
    }
    let cancelled = false;
    Promise.all(
      barbers.map(async (b) => {
        try {
          const r = await api.getAvailability(selectedDate, b.id, selectedServiceDuration);
          return r.slots.length > 0 ? b.id : null;
        } catch {
          return b.id;
        }
      })
    ).then((ids) => {
      if (cancelled) return;
      setAvailableBarberIds(ids.filter((x): x is string => Boolean(x)));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedDate, selectedService, selectedServiceDuration, barbers]);

  useEffect(() => {
    if (!selectedBarber || selectedBarber === ANY_BARBER_ID) return;
    if (!visibleBarbers.some((b) => b.id === selectedBarber)) {
      setSelectedBarber('');
    }
  }, [selectedBarber, visibleBarbers]);

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (checkout === 'success') {
      setPendingCheckoutSuccess(true);
      setSearchParams({}, { replace: true });
    } else if (checkout === 'cancel' || checkout === 'failure') {
      setBookingError('Pago cancelado o rechazado. Podés intentar de nuevo desde la reserva.');
      setSearchParams({}, { replace: true });
    } else if (checkout === 'pending') {
      setBookingError(
        'Pago pendiente (ej. efectivo). Cuando Mercado Pago lo acredite, el turno se registrará automáticamente.'
      );
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setSenaCheckoutPreferenceId(null);
  }, [selectedService, selectedBarber, selectedDate, selectedTime]);

  useEffect(() => {
    if (!pendingCheckoutSuccess || authLoading) return;
    setBookingSuccess(true);
    setPendingCheckoutSuccess(false);
    window.requestAnimationFrame(() => {
      document.getElementById('reserva')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [pendingCheckoutSuccess, authLoading]);

  useEffect(() => {
    if (!selectedDate || !selectedService || !selectedBarber) {
      setAvailableSlots([]);
      setEarliestAny(null);
      return;
    }
    if (selectedBarber === ANY_BARBER_ID) {
      api
        .getAvailabilityAny(selectedDate, selectedServiceDuration)
        .then((r) => {
          setAvailableSlots(r.slots.length ? r.slots : []);
          setEarliestAny(r.earliest);
        })
        .catch(() => {
          setAvailableSlots(businessTimeSlots);
          setEarliestAny(null);
        });
      return;
    }
    api
      .getAvailability(selectedDate, selectedBarber, selectedServiceDuration)
      .then((r) => setAvailableSlots(r.slots.length ? r.slots : []))
      .catch(() => setAvailableSlots(businessTimeSlots));
    setEarliestAny(null);
  }, [selectedDate, selectedBarber, selectedService, selectedServiceDuration, services, businessTimeSlots]);

  useEffect(() => {
    if (selectedTime && visibleTimeSlots.length > 0 && !visibleTimeSlots.includes(selectedTime)) {
      setSelectedTime('');
    }
  }, [visibleTimeSlots, selectedTime]);

  useEffect(() => {
    if (!bookingSuccess) return;
    const t = window.setTimeout(() => {
      setBookingSuccess(false);
      setSelectedService('');
      setSelectedBarber('');
      setSelectedDate(format(startOfToday(), 'yyyy-MM-dd'));
      setSelectedTime('');
      setName('');
      setPhone('');
      setSenaCheckoutPreferenceId(null);
    }, 12000);
    return () => clearTimeout(t);
  }, [bookingSuccess]);

  const baseDays = useMemo(() => {
    const today = startOfToday();
    return Array.from({ length: 30 })
      .map((_, i) => addDays(today, i))
      .filter((d) => openWeekdays.includes(getISODay(d)));
  }, [openWeekdays]);

  /** Solo cuando cambian los días hábiles reales (no en cada referencia nueva del array de la API). */
  const openWeekdaysKey = [...openWeekdays].sort((a, b) => a - b).join(',');

  useEffect(() => {
    if (!openWeekdays.length) return;
    setSelectedDate((current) => {
      const d = parse(current, 'yyyy-MM-dd', new Date());
      if (openWeekdays.includes(getISODay(d))) return current;
      const t = startOfToday();
      for (let i = 0; i < 60; i++) {
        const cand = addDays(t, i);
        if (openWeekdays.includes(getISODay(cand))) {
          return format(cand, 'yyyy-MM-dd');
        }
      }
      return current;
    });
  }, [openWeekdaysKey]);

  const today = startOfToday();

  let displayDays = [...baseDays];
  if (selectedDate) {
    const isSelectedInBase = baseDays.some((d) => format(d, 'yyyy-MM-dd') === selectedDate);
    if (!isSelectedInBase) {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const customDate = new Date(year, month - 1, day);
      const notPast = !isBefore(startOfDay(customDate), startOfToday());
      if (openWeekdays.includes(getISODay(customDate)) && notPast) {
        displayDays = [customDate, ...baseDays];
      }
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

  const mpPublicKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY as string | undefined;

  const handlePaySena = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setBookingError('');
    if (!profile) {
      navigate('/login', { state: { from: { pathname: '/', hash: '#reserva' } } });
      return;
    }
    if (!validateBookingForm()) return;
    const key = mpPublicKey?.trim();
    if (!key) {
      setBookingError(
        'Falta la clave pública de Mercado Pago en el sitio (VITE_MERCADOPAGO_PUBLIC_KEY). Pedile al administrador que la configure.'
      );
      return;
    }
    setSenaCheckoutLoading(true);
    try {
      const data = await api.createCheckoutSena({
        name: name.trim(),
        phone: phone.trim(),
        service: services.find((s) => s.id === selectedService)?.name ?? selectedService,
        serviceId: selectedService,
        barberId: selectedBarber,
        date: selectedDate,
        time: selectedTime,
        userId: profile.id,
      });
      setSenaCheckoutPreferenceId(data.preferenceId);
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'No se pudo iniciar el pago de la seña');
    } finally {
      setSenaCheckoutLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-[#e5c185]/30">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/50">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 h-16 sm:h-20 flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-zinc-900 rounded-full flex items-center justify-center overflow-hidden border border-zinc-800 flex-shrink-0">
              <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS9afJTOOxlqBtn27Asuu-Jvmb0NQZP6tKPGg&s" alt="Lion Logo" className="w-full h-full object-cover" />
            </div>
            <span className="font-serif font-black tracking-widest uppercase text-sm sm:text-base md:text-lg text-white truncate">Lion Barber</span>
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-4 lg:gap-8 text-sm font-sans font-medium text-zinc-400 flex-wrap justify-end">
            <a href="#servicios" className="hover:text-[#e5c185] transition-colors whitespace-nowrap">Servicios</a>
            <a href="#barberos" className="hover:text-[#e5c185] transition-colors whitespace-nowrap">Barberos</a>
            <a href="#reserva" className="hover:text-[#e5c185] transition-colors whitespace-nowrap">Reservar</a>
            <a href="#contacto" className="hover:text-[#e5c185] transition-colors whitespace-nowrap">Contacto</a>
            {profile ? (
              <>
                <span className="text-zinc-500 text-xs uppercase tracking-wider hidden lg:inline">Hola, {profile.name.split(' ')[0]}</span>
                {canAccessDashboard && (
                  <Link
                    to="/dashboard"
                    className="hidden lg:inline-flex items-center gap-1.5 text-xs font-bold text-[#e5c185] hover:text-[#d4b074] uppercase tracking-wider whitespace-nowrap"
                  >
                    <LayoutDashboard size={16} />
                    Panel
                  </Link>
                )}
                <Link to="/perfil" className="text-xs font-sans font-bold text-zinc-950 bg-[#e5c185] hover:bg-[#d4b074] px-4 py-2 rounded-full transition-colors uppercase tracking-wider whitespace-nowrap">
                  Mi perfil
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-xs font-sans font-bold text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-2 rounded-full transition-colors uppercase tracking-wider whitespace-nowrap inline-flex items-center gap-1.5"
                >
                  <LogOut size={14} />
                  Salir
                </button>
              </>
            ) : (
              <Link to="/login" className="text-xs font-sans font-bold text-zinc-950 bg-[#e5c185] hover:bg-[#d4b074] px-4 py-2 rounded-full transition-colors uppercase tracking-wider whitespace-nowrap">
                Iniciar Sesión
              </Link>
            )}
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
            {profile ? (
              <>
                <p className="text-zinc-500 text-xs uppercase tracking-wider text-center">Hola, {profile.name.split(' ')[0]}</p>
                {canAccessDashboard && (
                  <Link
                    to="/dashboard"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-center text-xs font-bold text-[#e5c185] hover:text-[#d4b074] uppercase tracking-wider flex items-center justify-center gap-2 py-2"
                  >
                    <LayoutDashboard size={18} />
                    Panel
                  </Link>
                )}
                <Link to="/perfil" onClick={() => setIsMobileMenuOpen(false)} className="text-center text-xs font-sans font-bold text-zinc-950 bg-[#e5c185] hover:bg-[#d4b074] px-4 py-3 rounded-xl transition-colors uppercase tracking-wider block">
                  Mi perfil
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    void handleLogout();
                  }}
                  className="w-full text-center text-xs font-sans font-bold text-zinc-400 border border-zinc-700 px-4 py-3 rounded-xl uppercase tracking-wider inline-flex items-center justify-center gap-2"
                >
                  <LogOut size={18} />
                  Cerrar sesión
                </button>
              </>
            ) : (
              <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="text-center text-xs font-sans font-bold text-zinc-950 bg-[#e5c185] hover:bg-[#d4b074] px-4 py-3 rounded-xl transition-colors uppercase tracking-wider block">
                Iniciar Sesión
              </Link>
            )}
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-28 pb-16 sm:pt-32 sm:pb-20 md:pt-48 md:pb-32 px-4 sm:px-6 overflow-hidden min-h-[80vh] flex flex-col justify-center">
        <div className="absolute inset-0 z-0">
          <img 
            src={heroPortada}
            alt="Barbershop interior" 
            className="w-full h-full object-cover object-center opacity-45 brightness-110 contrast-105"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/30 via-zinc-950/55 to-zinc-950/85"></div>
        </div>

        <div className="max-w-4xl mx-auto relative z-10 flex flex-col items-center text-center pt-6 sm:pt-10 w-full min-w-0">
          <div className="relative flex flex-col items-center justify-center w-full min-w-0 overflow-visible">
            <img
              src="/lion-logo-hero-transparent.png"
              alt="Logo Lion Barber"
              className="w-40 sm:w-52 md:w-56 lg:w-64 h-auto drop-shadow-2xl mb-2 sm:mb-3"
            />
            <div className="relative flex flex-col items-center justify-center w-full min-w-0 overflow-visible">
              <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[6rem] xl:text-[120px] font-serif font-black uppercase tracking-tight text-white drop-shadow-2xl leading-none">
                Agenda
              </h1>
              <span className="text-5xl sm:text-7xl md:text-8xl lg:text-[6.5rem] xl:text-[140px] font-script text-[#e5c185] drop-shadow-lg absolute top-1/2 -translate-y-1/2 mt-4 sm:mt-6 md:mt-8 lg:mt-10 leading-none select-none whitespace-nowrap px-3">
                abierta
              </span>
            </div>
          </div>

          {/* Hanging OPEN Sign / Booking Button */}
          <a href="#reserva" className="relative mt-14 sm:mt-20 md:mt-28 lg:mt-40 flex flex-col items-center group cursor-pointer hover:scale-105 transition-transform w-full max-w-[90vw] sm:max-w-none">
            {/* Strings */}
            <div className="flex justify-between w-32 sm:w-40 md:w-56 absolute -top-16 sm:-top-20 md:-top-32 h-20 sm:h-24 md:h-36 z-0">
              <div className="w-1 bg-[#e5c185] h-full shadow-sm"></div>
              <div className="w-1 bg-[#e5c185] h-full shadow-sm"></div>
            </div>
            {/* Sign */}
            <div className="relative z-10 bg-[#e5c185] border-2 sm:border-4 border-black rounded-[1.5rem] sm:rounded-[2rem] md:rounded-[2.5rem] w-full max-w-[240px] sm:w-56 sm:max-w-none md:w-64 lg:w-80 py-3 sm:py-4 md:py-5 shadow-2xl flex items-center justify-center">
              {/* Little holes for strings */}
              <div className="absolute top-2 left-6 sm:left-8 md:left-12 w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 bg-black rounded-full"></div>
              <div className="absolute top-2 right-6 sm:right-8 md:right-12 w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 bg-black rounded-full"></div>
              {/* Inner border line */}
              <div className="absolute inset-1 sm:inset-1.5 md:inset-2 border-2 border-black rounded-[1.2rem] sm:rounded-[1.5rem] md:rounded-[2rem] pointer-events-none"></div>
              <span className="text-black font-sans font-black text-lg sm:text-2xl md:text-3xl lg:text-4xl tracking-widest uppercase relative z-10 px-2">
                Reservar
              </span>
            </div>
          </a>
        </div>
      </section>

      {/* Services Section */}
      <section id="servicios" className="py-12 sm:py-16 md:py-20 px-4 sm:px-6 bg-zinc-950 border-y border-zinc-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-serif font-black uppercase tracking-tight mb-3 sm:mb-4 text-white px-2">Nuestros Servicios</h2>
            <div className="w-20 sm:w-24 h-1 bg-[#e5c185] mx-auto rounded-full"></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
            {services.map((service) => (
              <div key={service.id} className="bg-zinc-900/50 border border-zinc-800 p-5 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl hover:border-[#e5c185]/50 transition-colors group min-w-0">
                <div className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] bg-zinc-950 border border-zinc-800 rounded-lg sm:rounded-xl flex items-center justify-center text-[#e5c185] mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-xl sm:text-2xl font-black tracking-wider select-none">
                    {getServiceInitials(service.name)}
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-serif font-bold mb-2 text-white break-words">{service.name}</h3>
                <p className="text-zinc-400 mb-4 sm:mb-6 min-h-[3rem] sm:min-h-[48px] font-sans font-light text-sm sm:text-base line-clamp-3">{service.desc}</p>
                <div className="flex flex-wrap items-end justify-between gap-2 mt-auto">
                  <span className="text-2xl sm:text-3xl font-sans font-black text-[#e5c185]">{service.price}</span>
                  <span className="text-xs sm:text-sm text-zinc-500 font-medium flex items-center gap-1">
                    <Clock size={14} className="flex-shrink-0" /> {service.duration} min
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Barbers Section */}
      <section id="barberos" className="py-12 sm:py-16 md:py-20 px-4 sm:px-6 bg-zinc-950 border-y border-zinc-900">
        <div className="max-w-6xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10 sm:mb-16"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-serif font-black uppercase tracking-tight mb-3 sm:mb-4 text-white px-2">Nuestros Barberos</h2>
            <div className="w-20 sm:w-24 h-1 bg-[#e5c185] mx-auto rounded-full"></div>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
            {barbers.map((barber, index) => (
              <motion.div 
                key={barber.id} 
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl sm:rounded-2xl overflow-hidden hover:border-[#e5c185]/50 transition-colors group min-w-0"
              >
                <div className="aspect-[4/5] min-h-[280px] sm:min-h-0 overflow-hidden relative">
                  <img 
                    src={barber.photo} 
                    alt={barber.name} 
                    className={barberPhotoClasses}
                    referrerPolicy="no-referrer"
                  />
                  <div className={barberOverlayClasses}></div>
                  <div className="absolute bottom-0 left-0 w-full p-4 sm:p-6">
                    <h3 className="text-2xl sm:text-3xl font-serif font-black text-white">{barber.name}</h3>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Booking Section */}
      <section id="reserva" className="py-12 sm:py-20 md:py-24 px-3 sm:px-4 md:px-6 relative bg-zinc-900/30">
        <div className="max-w-4xl mx-auto w-full min-w-0">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl sm:rounded-2xl md:rounded-3xl p-4 sm:p-6 md:p-8 lg:p-12 shadow-2xl relative overflow-hidden">
            {/* Decorative background element */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#e5c185]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-black uppercase tracking-tight mb-2 text-white">Reserva tu lugar</h2>
              <p className="text-sm sm:text-base text-zinc-400 mb-8 sm:mb-10 font-sans font-light">Completa los datos para agendar tu próximo corte.</p>

              {!profile && (
                <div className="mb-6 p-4 rounded-xl border border-amber-500/40 bg-amber-950/30 text-amber-100/90 text-sm">
                  Para confirmar el turno con la seña online tenés que{' '}
                  <Link to="/login" state={{ from: { pathname: '/', hash: '#reserva' } }} className="font-bold text-[#e5c185] underline underline-offset-2 hover:text-[#d4b074]">
                    iniciar sesión con Google
                  </Link>
                  .
                </div>
              )}

              {bookingError && (
                <div className="mb-6 p-4 bg-red-950/30 border border-red-500/30 rounded-xl text-red-400 text-sm">{bookingError}</div>
              )}

              {bookingSuccess ? (
                <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl sm:rounded-2xl p-8 sm:p-12 text-center animate-in fade-in zoom-in duration-500">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 text-emerald-400">
                    <CheckCircle2 size={32} className="sm:w-10 sm:h-10" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-serif font-black text-white mb-2">¡Reserva confirmada!</h3>
                  <p className="text-emerald-400/80 text-base sm:text-lg font-sans">
                    Tu turno quedó confirmado: la seña se registró correctamente. Te esperamos en Lion Barber.
                  </p>
                  <p className="mt-5 flex items-center justify-center gap-2 text-zinc-300 text-sm sm:text-base font-sans max-w-md mx-auto">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-[#e5c185] shrink-0" aria-hidden />
                    <span>
                      Recordá que hay <span className="font-semibold text-white">10 minutos de tolerancia</span> desde la
                      hora de tu turno.
                    </span>
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={(e) => e.preventDefault()}
                  className="space-y-6 font-sans"
                >
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
                        {services.map(s => (
                          <option key={s.id} value={s.id}>{s.name} - {s.price}</option>
                        ))}
                      </select>
                    </div>

                    {/* Barber Selection */}
                    <div className="space-y-2 md:col-span-2 min-w-0">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <User size={14} /> Barbero
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedBarber(ANY_BARBER_ID)}
                          className={`flex items-center gap-2 sm:gap-3 p-3 rounded-xl border transition-all text-left min-w-0 ${
                            selectedBarber === ANY_BARBER_ID
                              ? 'bg-[#e5c185] border-[#e5c185] text-black shadow-[0_0_15px_rgba(229,193,133,0.2)]'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-[#e5c185]/50 hover:text-zinc-200'
                          }`}
                        >
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                              selectedBarber === ANY_BARBER_ID ? 'bg-black/10 text-black' : 'bg-zinc-800 text-[#e5c185]'
                            }`}
                          >
                            <Users size={22} />
                          </div>
                          <div>
                            <div className={`font-bold ${selectedBarber === ANY_BARBER_ID ? 'text-black' : 'text-white'}`}>
                              Sin preferencia
                            </div>
                            <div className={`text-xs ${selectedBarber === ANY_BARBER_ID ? 'text-black/70' : 'text-zinc-500'}`}>
                              El turno más próximo
                            </div>
                          </div>
                        </button>
                        {visibleBarbers.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setSelectedBarber(b.id)}
                            className={`flex items-center gap-2 sm:gap-3 p-3 rounded-xl border transition-all text-left min-w-0 ${
                              selectedBarber === b.id
                                ? 'bg-[#e5c185] border-[#e5c185] text-black shadow-[0_0_15px_rgba(229,193,133,0.2)]'
                                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-[#e5c185]/50 hover:text-zinc-200'
                            }`}
                          >
                            <img src={b.photo} alt={b.name} className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                            <div className={`font-bold ${selectedBarber === b.id ? 'text-black' : 'text-white'}`}>{b.name}</div>
                          </button>
                        ))}
                      </div>
                      {selectedDate && selectedService && visibleBarbers.length === 0 && (
                        <p className="text-amber-500/90 text-sm mt-2">
                          No hay barberos disponibles ese día para este servicio (puede ser por franco u ocupación).
                        </p>
                      )}
                      {selectedBarber === ANY_BARBER_ID && (
                        <p className="text-xs text-zinc-500 mt-2">
                          Asignamos automáticamente al barbero libre en el horario que elijas (según la duración del servicio).
                        </p>
                      )}
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
                            const isPastDay = isBefore(startOfDay(date), startOfToday());
                            return (
                              <button
                                key={dateStr}
                                type="button"
                                disabled={isPastDay}
                                onClick={(e) => {
                                  if (dragged) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    return;
                                  }
                                  if (isPastDay) return;
                                  setSelectedDate(dateStr);
                                }}
                                className={`flex-shrink-0 w-16 sm:w-20 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border flex flex-col items-center justify-center transition-all snap-start min-w-0 ${
                                  isPastDay
                                    ? 'opacity-30 cursor-not-allowed border-zinc-800 text-zinc-600'
                                    : isSelected 
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
                            className="relative flex-shrink-0 w-16 sm:w-20 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-[#e5c185] hover:bg-zinc-900 hover:text-[#e5c185] flex flex-col items-center justify-center transition-all snap-start cursor-pointer group/calendar overflow-hidden min-w-0"
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
                      {!selectedBarber ? (
                        <p className="text-zinc-500 text-sm">
                          Elegí un barbero para ver los horarios disponibles.
                        </p>
                      ) : (
                        <>
                          {selectedBarber === ANY_BARBER_ID && earliestAny && !isSlotAlreadyPast(selectedDate, earliestAny.time) && (
                            <button
                              type="button"
                              onClick={() => setSelectedTime(earliestAny.time)}
                              className="mb-2 text-left text-xs font-bold uppercase tracking-wider text-[#e5c185] hover:text-[#d4b074] underline-offset-4 hover:underline"
                            >
                              Usar el próximo libre: {earliestAny.time}
                            </button>
                          )}
                          {visibleTimeSlots.length === 0 && availableSlots.length > 0 && selectedDate === format(startOfToday(), 'yyyy-MM-dd') && (
                            <p className="text-amber-500/90 text-sm mb-2">
                              Para hoy no quedan horarios con al menos {BOOKING_LEAD_MINUTES} minutos de anticipación. Elegí otro día.
                            </p>
                          )}
                          {availableSlots.length === 0 && selectedService && selectedBarber && (
                            <p className="text-amber-500/90 text-sm mb-2">
                              No hay horarios disponibles para esa fecha y duración. Probá otro día u otro barbero.
                            </p>
                          )}
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3">
                            {visibleTimeSlots.map(time => {
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
                        </>
                      )}
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

                  <div className="flex flex-col gap-3 mt-4">
                    <button
                      type="button"
                      onClick={handlePaySena}
                      disabled={senaCheckoutLoading}
                      className="bg-[#e5c185] hover:bg-[#d4b074] disabled:opacity-60 disabled:pointer-events-none text-black font-sans font-black uppercase tracking-widest py-5 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {senaCheckoutLoading
                        ? 'Preparando pago…'
                        : profile
                          ? senaCheckoutPreferenceId
                            ? 'Preferencia lista — pagá abajo'
                            : 'Pagar seña y confirmar turno'
                          : 'Iniciar sesión para confirmar'}
                    </button>
                    {senaCheckoutPreferenceId && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 min-h-[120px]">
                        <p className="text-xs text-zinc-400 mb-3 text-center">
                          Completá el pago con Mercado Pago. Si te redirige al checkout, al volver podés ver el estado del
                          turno en tu perfil.
                        </p>
                        <Wallet
                          initialization={{ preferenceId: senaCheckoutPreferenceId, redirectMode: 'self' }}
                          locale="es-AR"
                          customization={{ theme: 'dark' }}
                          onError={(err) => {
                            setBookingError(err.message || 'Error al cargar el botón de pago');
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-center text-[11px] text-zinc-500 mt-2">
                    Reservamos el horario por 15 minutos: si el pago de la seña no se aprueba en ese tiempo, la reserva se
                    cancela automáticamente. Podés volver a pagar desde tu perfil mientras no venza el plazo.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contacto" className="bg-zinc-950 border-t border-zinc-900 py-8 sm:py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-center text-center md:text-left">
          <div className="flex flex-col items-center md:items-start gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 bg-zinc-900 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border border-zinc-800">
                <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS9afJTOOxlqBtn27Asuu-Jvmb0NQZP6tKPGg&s" alt="Lion Logo" className="w-full h-full object-cover" />
              </div>
              <span className="font-serif font-black tracking-widest uppercase text-white text-sm sm:text-base">Lion Barber</span>
            </div>
            <p className="text-zinc-500 text-xs sm:text-sm font-sans">Estilo y precisión en cada corte.</p>
          </div>
          
          <div className="flex flex-col items-center md:items-start gap-2 text-zinc-400 text-xs sm:text-sm font-sans">
            <p className="flex items-center gap-2 flex-wrap justify-center md:justify-start"><MapPin size={16} className="text-[#e5c185] flex-shrink-0" /> <span className="break-words">Dr. Nicolas Repeto 1602, CABA</span></p>
            <p className="flex items-center gap-2 flex-wrap justify-center md:justify-start"><Clock size={16} className="text-[#e5c185] flex-shrink-0" /> <span>Lun a Vie: 10-20hs | Sáb: 10-18hs</span></p>
          </div>

          <div className="flex justify-center md:justify-end gap-4">
            <a href="https://wa.link/xxyvs9" target="_blank" rel="noreferrer" className="w-10 h-10 sm:w-11 sm:h-11 bg-zinc-900 rounded-full flex items-center justify-center hover:bg-[#e5c185] hover:text-zinc-950 transition-colors flex-shrink-0">
              <Phone size={18} />
            </a>
          </div>
        </div>
      </footer>

      {/* Custom Calendar Modal */}
      {showCalendarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto" onClick={() => setShowCalendarModal(false)}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 w-full max-w-sm my-auto shadow-2xl" onClick={e => e.stopPropagation()}>
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
                const isClosedDay = !openWeekdays.includes(getISODay(day));
                
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isPast || isClosedDay}
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
                      ${isPast || isClosedDay ? 'opacity-30 cursor-not-allowed' : 'hover:bg-zinc-900 hover:text-[#e5c185]'}
                      ${isSelected ? 'bg-[#e5c185] text-black font-bold shadow-[0_0_15px_rgba(229,193,133,0.3)] hover:bg-[#d4b074] hover:text-black' : (isCurrentMonth && !isPast && !isClosedDay ? 'text-zinc-300' : '')}
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
