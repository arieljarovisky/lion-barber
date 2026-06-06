import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Calendar, Clock, Scissors, MapPin, Phone, User, CheckCircle2, ChevronRight, ChevronLeft, Menu, X, Users, LogOut, LayoutDashboard, AlertTriangle, ExternalLink } from 'lucide-react';
import { BOOKING_FALLBACK_WHATSAPP_URL, checkBackendHealth } from '../utils/backendHealth';
import {
  SHOP_ADDRESS,
  SHOP_MAPS_DIRECTIONS_URL,
  SHOP_MAPS_EMBED_URL,
} from '../constants/shopLocation';
import { SHOP_INSTAGRAM_URL } from '../constants/shopSocial';
import { WhatsAppIcon, whatsAppLionButtonClassName } from '../components/WhatsAppIcon';
import { InstagramIcon } from '../components/InstagramIcon';
import ClientMobileNav from '../components/ClientMobileNav';
import { api } from '../store';
import { ANY_BARBER_ID, ApiError } from '../api';
import type { Service, Barber, SubscriptionPlan, SitePromotion } from '../api';
import { useAuth } from '../contexts/AuthContext';
import SitePromotionBanner from '../components/SitePromotionBanner';
import { SubscriptionPricingCards } from '../components/SubscriptionPricingCards';
import { DEPOSIT_PERCENT } from '../constants/deposit';
import { DEPOSIT_PAYMENT_MINUTES } from '../constants/depositPayment';
import { calculateDepositAmountArs, parseArsAmount } from '../utils/money';
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
    return Number.isFinite(start) && start >= safeOpen && start + 20 < safeClose;
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
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [shopCloseTime, setShopCloseTime] = useState('20:00');
  const [shopWeekdayHours, setShopWeekdayHours] = useState<Record<number, DayHours>>(DEFAULT_WEEKDAY_HOURS);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [publicPromotions, setPublicPromotions] = useState<SitePromotion[]>([]);
  const [publicSubscriptionPlans, setPublicSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [publicCatalogLoading, setPublicCatalogLoading] = useState(true);
  const [subscriptionCheckoutPlanId, setSubscriptionCheckoutPlanId] = useState<string | null>(null);
  const [subscriptionCheckoutPreferenceId, setSubscriptionCheckoutPreferenceId] = useState<string | null>(null);
  const [subscriptionCheckoutLoading, setSubscriptionCheckoutLoading] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadBookingCatalog = () => {
    api.getServices().then(setServices).catch(() => setServices([]));
    api.getBarbers().then(setBarbers).catch(() => setBarbers([]));
    setPublicCatalogLoading(true);
    Promise.all([
      api.getPublicPromotions().catch(() => ({ promotions: [] as SitePromotion[] })),
      api.getPublicSubscriptionPlans().catch(() => ({ plans: [] as SubscriptionPlan[] })),
    ])
      .then(([promos, plans]) => {
        setPublicPromotions(promos.promotions);
        setPublicSubscriptionPlans(plans.plans);
      })
      .finally(() => setPublicCatalogLoading(false));
    api
      .getShopSettings()
      .then((s) => {
        setOpenWeekdays(s.openWeekdays.length ? s.openWeekdays : [1, 2, 3, 4, 5, 6, 7]);
        setClosedDates(Array.isArray(s.closedDates) ? s.closedDates : []);
        setShopCloseTime(s.closeTime || '20:00');
        const next: Record<number, DayHours> = { ...DEFAULT_WEEKDAY_HOURS };
        for (let d = 1; d <= 7; d++) {
          const h = s.weekdayHours?.[d];
          next[d] = { openTime: h?.openTime || '10:00', closeTime: h?.closeTime || (s.closeTime || '20:00') };
        }
        setShopWeekdayHours(next);
      })
      .catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    void checkBackendHealth().then((ok) => {
      if (cancelled) return;
      setBackendReachable(ok);
      if (ok) loadBookingCatalog();
    });
    return () => {
      cancelled = true;
    };
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
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(startOfToday());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const heroSectionRef = useRef<HTMLElement | null>(null);
  const heroWasInViewRef = useRef(false);
  const lastTypingTriggerAtRef = useRef(Date.now());
  const [titleTypingRun, setTitleTypingRun] = useState(0);
  
  // Drag to scroll state
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [dragged, setDragged] = useState(false);

  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToReserva = useCallback(() => {
    setIsMobileMenuOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById('reserva')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const selectedWeekday = getISODay(parse(selectedDate, 'yyyy-MM-dd', new Date()));
  const isSelectedDateClosed = !openWeekdays.includes(selectedWeekday) || closedDates.includes(selectedDate);
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

  const selectedServiceRow = services.find((s) => s.id === selectedService);
  const selectedServiceDuration = selectedServiceRow?.duration ?? 30;
  const serviceSelected = Boolean(selectedService);
  const depositPreviewArs = useMemo(() => {
    if (!selectedServiceRow?.price || profile?.depositExempt) return null;
    const price = parseArsAmount(selectedServiceRow.price);
    if (price == null) return null;
    return calculateDepositAmountArs(price, DEPOSIT_PERCENT);
  }, [selectedServiceRow, profile?.depositExempt]);
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
    if (!selectedService) {
      setSelectedBarber('');
      setSelectedTime('');
    }
  }, [selectedService]);

  useEffect(() => {
    const todayStr = format(startOfToday(), 'yyyy-MM-dd');
    if (selectedDate !== todayStr) return;
    const id = window.setInterval(() => setTimeTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [selectedDate]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const el = heroSectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!heroWasInViewRef.current) {
            const now = Date.now();
            if (now - lastTypingTriggerAtRef.current >= 8000) {
              setTitleTypingRun((n) => n + 1);
              lastTypingTriggerAtRef.current = now;
            }
          }
          heroWasInViewRef.current = true;
          return;
        }
        heroWasInViewRef.current = false;
      },
      { threshold: 0.45 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
    if (isSelectedDateClosed) {
      setBookingError('La barbería está cerrada en la fecha elegida.');
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
    } else if (checkout === 'subscription_success') {
      setSubscriptionMessage({
        kind: 'ok',
        text: '¡Pago recibido! Tu abono se activará en unos instantes. Revisá tu perfil para ver los cortes disponibles.',
      });
      setSearchParams({}, { replace: true });
      window.requestAnimationFrame(() => {
        document.getElementById('abonos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else if (checkout === 'subscription_failure') {
      setSubscriptionMessage({ kind: 'err', text: 'El pago del abono fue rechazado o cancelado.' });
      setSearchParams({}, { replace: true });
    } else if (checkout === 'subscription_pending') {
      setSubscriptionMessage({
        kind: 'err',
        text: 'Pago del abono pendiente. Cuando Mercado Pago lo acredite, tu plan se activará automáticamente.',
      });
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
    if (!selectedDate || !selectedService || !selectedBarber || isSelectedDateClosed) {
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
  }, [selectedDate, selectedBarber, selectedService, selectedServiceDuration, services, businessTimeSlots, isSelectedDateClosed]);

  useEffect(() => {
    if (!isSelectedDateClosed) return;
    setSelectedTime('');
  }, [isSelectedDateClosed]);

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
      .filter((d) => openWeekdays.includes(getISODay(d)))
      .filter((d) => !closedDates.includes(format(d, 'yyyy-MM-dd')));
  }, [openWeekdays, closedDates]);

  /** Solo cuando cambian los días hábiles reales (no en cada referencia nueva del array de la API). */
  const openWeekdaysKey = [...openWeekdays].sort((a, b) => a - b).join(',');
  const closedDatesKey = [...closedDates].sort((a, b) => a.localeCompare(b)).join(',');

  useEffect(() => {
    if (!openWeekdays.length) return;
    setSelectedDate((current) => {
      const d = parse(current, 'yyyy-MM-dd', new Date());
      const currentYmd = format(d, 'yyyy-MM-dd');
      if (openWeekdays.includes(getISODay(d)) && !closedDates.includes(currentYmd)) return current;
      const t = startOfToday();
      for (let i = 0; i < 60; i++) {
        const cand = addDays(t, i);
        const ymd = format(cand, 'yyyy-MM-dd');
        if (openWeekdays.includes(getISODay(cand)) && !closedDates.includes(ymd)) {
          return format(cand, 'yyyy-MM-dd');
        }
      }
      return current;
    });
  }, [openWeekdaysKey, closedDatesKey]);

  const today = startOfToday();

  let displayDays = [...baseDays];
  if (selectedDate) {
    const isSelectedInBase = baseDays.some((d) => format(d, 'yyyy-MM-dd') === selectedDate);
    if (!isSelectedInBase) {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const customDate = new Date(year, month - 1, day);
      const notPast = !isBefore(startOfDay(customDate), startOfToday());
      const customYmd = format(customDate, 'yyyy-MM-dd');
      if (openWeekdays.includes(getISODay(customDate)) && !closedDates.includes(customYmd) && notPast) {
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
    const isExempt = Boolean(profile.depositExempt);
    if (!isExempt) {
      const key = mpPublicKey?.trim();
      if (!key) {
        setBookingError(
          'Falta la clave pública de Mercado Pago en el sitio (VITE_MERCADOPAGO_PUBLIC_KEY). Pedile al administrador que la configure.'
        );
        return;
      }
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
      if ('exempt' in data && data.exempt) {
        setBookingSuccess(true);
        setSenaCheckoutPreferenceId(null);
        window.requestAnimationFrame(() => {
          document.getElementById('reserva')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      } else if ('preferenceId' in data) {
        setSenaCheckoutPreferenceId(data.preferenceId);
      }
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

  const handleBuySubscription = async (planId: string) => {
    setSubscriptionCheckoutLoading(true);
    setSubscriptionCheckoutPlanId(planId);
    setSubscriptionCheckoutPreferenceId(null);
    setSubscriptionMessage(null);
    try {
      const result = await api.createCheckoutSubscription(planId);
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      setSubscriptionCheckoutPreferenceId(result.preferenceId);
      window.requestAnimationFrame(() => {
        document.getElementById('abonos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (e) {
      setSubscriptionMessage({
        kind: 'err',
        text: e instanceof ApiError ? e.message : 'No se pudo iniciar el pago del abono',
      });
    } finally {
      setSubscriptionCheckoutLoading(false);
    }
  };

  const handleSubscriptionLoginRequired = () => {
    navigate('/login', { state: { from: { pathname: '/', hash: '#abonos' } } });
  };

  const showAbonosSection = publicCatalogLoading || publicSubscriptionPlans.length > 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-[#e5c185]/30">
      {/* Navbar */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 border-b transition-all duration-200 ${
          headerScrolled
            ? 'border-zinc-800 bg-zinc-950/95 shadow-lg shadow-black/30 backdrop-blur-md'
            : 'border-zinc-800/50 bg-zinc-950/80 backdrop-blur-md'
        }`}
      >
        <div className="mx-auto flex h-16 min-w-0 max-w-7xl items-center justify-between gap-2 px-3 sm:h-20 sm:px-4 md:px-6">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex min-w-0 flex-shrink-0 items-center gap-2 sm:gap-3"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900 sm:h-10 sm:w-10">
              <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS9afJTOOxlqBtn27Asuu-Jvmb0NQZP6tKPGg&s" alt="Lion Logo" className="h-full w-full object-cover" />
            </div>
            <span className="truncate font-serif text-sm font-black uppercase tracking-widest text-white sm:text-base md:text-lg">
              Lion Barber
            </span>
          </a>

          {/* Enlaces — centro en desktop grande */}
          <div className="hidden min-w-0 flex-1 items-center justify-center gap-1 px-2 lg:flex xl:gap-2">
            {(
              [
                { href: '#servicios', label: 'Servicios' },
                { href: '#barberos', label: 'Barberos' },
                ...(showAbonosSection ? [{ href: '#abonos', label: 'Abonos' }] : []),
                { href: '#contacto', label: 'Contacto' },
              ] as const
            ).map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-900/80 hover:text-[#e5c185] xl:px-4"
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* Móvil / tablet: CTA + menú */}
          <div className="flex flex-shrink-0 items-center gap-2 lg:hidden">
            <a
              href="#reserva"
              onClick={(e) => {
                e.preventDefault();
                scrollToReserva();
              }}
              className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-[#e5c185] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-zinc-950 transition-colors hover:bg-[#d4b074] sm:px-4 sm:text-xs"
            >
              Reservar turno
            </a>
            <button
              type="button"
              className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
                isMobileMenuOpen
                  ? 'border-[#e5c185]/40 bg-[#e5c185]/10 text-[#e5c185]'
                  : 'border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900 hover:text-[#e5c185]'
              }`}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="client-mobile-nav"
            >
              {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>

          {/* Desktop: reservar + cuenta */}
          <div className="hidden flex-shrink-0 items-center gap-3 lg:flex">
            <a
              href="#reserva"
              onClick={(e) => {
                e.preventDefault();
                scrollToReserva();
              }}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-[#e5c185] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-zinc-950 transition-colors hover:bg-[#d4b074]"
            >
              Reservar turno
            </a>

            {profile ? (
              <div className="flex items-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
                <Link
                  to="/perfil"
                  className="flex max-w-[140px] items-center gap-2 px-3 py-2 transition-colors hover:bg-zinc-800/60"
                  title="Mi perfil"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e5c185]/15 text-xs font-black uppercase text-[#e5c185]">
                    {profile.name.trim().charAt(0) || '?'}
                  </span>
                  <span className="truncate text-sm font-medium text-zinc-200">
                    {profile.name.split(' ')[0]}
                  </span>
                </Link>
                {canAccessDashboard && (
                  <>
                    <span className="h-8 w-px shrink-0 bg-zinc-800" aria-hidden />
                    <Link
                      to="/dashboard"
                      className="flex shrink-0 items-center justify-center p-2.5 text-[#e5c185] transition-colors hover:bg-zinc-800/60"
                      title="Panel"
                    >
                      <LayoutDashboard size={18} />
                    </Link>
                  </>
                )}
                <span className="h-8 w-px shrink-0 bg-zinc-800" aria-hidden />
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="flex shrink-0 items-center justify-center p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-white"
                  title="Cerrar sesión"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="rounded-lg border border-zinc-700 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-zinc-300 transition-colors hover:border-[#e5c185]/40 hover:text-[#e5c185]"
              >
                Iniciar sesión
              </Link>
            )}
          </div>
        </div>

        <ClientMobileNav
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          showAbonosSection={showAbonosSection}
          profile={profile}
          canAccessDashboard={canAccessDashboard}
          onLogout={handleLogout}
          onReserva={scrollToReserva}
        />
      </nav>

      {/* Hero Section */}
      <section ref={heroSectionRef} className="relative pt-28 pb-16 sm:pt-32 sm:pb-20 md:pt-48 md:pb-32 px-4 sm:px-6 overflow-hidden min-h-[80vh] flex flex-col justify-center">
        <div className="absolute inset-0 z-0">
          <img 
            src={heroPortada}
            alt="Barbershop interior" 
            className="w-full h-full object-cover object-center opacity-45 brightness-110 contrast-105"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/30 via-zinc-950/55 to-zinc-950/85"></div>
        </div>

        <div className="max-w-5xl mx-auto relative z-10 flex flex-col items-center text-center pt-6 sm:pt-10 w-full min-w-0">
          <h1 className="relative z-30 -translate-y-[20px] text-5xl sm:text-6xl md:text-7xl lg:text-[6.2rem] xl:text-[7rem] font-serif font-black uppercase tracking-tight text-white drop-shadow-2xl leading-none">
            <span key={titleTypingRun} className="typing-title">Lion Barber</span>
          </h1>
          <a
            href="#reserva"
            className="relative z-20 mt-10 sm:mt-12 md:mt-14 inline-flex w-full max-w-[90vw] sm:max-w-none justify-center"
          >
            <span className="inline-flex items-center justify-center rounded-2xl sm:rounded-3xl border-2 sm:border-[3px] border-black bg-[#e5c185] px-8 py-3.5 font-sans text-lg font-black uppercase tracking-wide text-black shadow-2xl transition-transform duration-200 hover:scale-105 hover:bg-[#d4b074] sm:px-12 sm:py-4 sm:text-xl md:px-14 md:py-5 md:text-2xl">
              Reserva tu turno
            </span>
          </a>
        </div>

      </section>

      <SitePromotionBanner promotions={publicPromotions} />

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

      {showAbonosSection && (
        <section id="abonos" className="border-y border-zinc-900 bg-zinc-950 py-12 sm:py-16 md:py-20 px-4 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 text-center sm:mb-16">
              <h2 className="font-serif text-2xl font-black uppercase tracking-tight text-white sm:text-3xl md:text-4xl lg:text-5xl">
                Elegí tu plan
              </h2>
              <div className="mx-auto mt-3 h-1 w-20 rounded-full bg-[#e5c185] sm:w-24" />
              <p className="mx-auto mt-4 max-w-2xl font-sans text-sm font-light text-zinc-400 sm:text-base">
                Pagá online con Mercado Pago y reservá sin seña mientras tengas cortes disponibles en el mes.
              </p>
            </div>

            {subscriptionMessage && (
              <div
                className={`mx-auto mb-8 max-w-2xl rounded-xl border px-4 py-3 text-sm ${
                  subscriptionMessage.kind === 'ok'
                    ? 'border-[#e5c185]/40 bg-[#e5c185]/10 text-[#e5c185]'
                    : 'border-red-900/50 bg-red-950/40 text-red-300'
                }`}
              >
                {subscriptionMessage.text}
              </div>
            )}

            <SubscriptionPricingCards
              plans={publicSubscriptionPlans}
              loading={publicCatalogLoading}
              checkoutPlanId={subscriptionCheckoutPlanId}
              checkoutLoading={subscriptionCheckoutLoading}
              onBuy={(planId) => void handleBuySubscription(planId)}
              isLoggedIn={Boolean(profile)}
              onLoginRequired={handleSubscriptionLoginRequired}
            />

            {subscriptionCheckoutPreferenceId && (
              <div className="mx-auto mt-8 max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-6">
                <p className="mb-3 text-center text-xs text-zinc-400">
                  Completá el pago con Mercado Pago para activar tu abono.
                </p>
                <Wallet
                  initialization={{ preferenceId: subscriptionCheckoutPreferenceId, redirectMode: 'self' }}
                  locale="es-AR"
                  customization={{ theme: 'dark' }}
                  onError={(err) => {
                    setSubscriptionMessage({
                      kind: 'err',
                      text: err.message || 'Error al cargar el botón de pago',
                    });
                  }}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Booking Section */}
      <section id="reserva" className="py-12 sm:py-20 md:py-24 px-3 sm:px-4 md:px-6 relative bg-zinc-900/30">
        <div className="max-w-4xl mx-auto w-full min-w-0">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl sm:rounded-2xl md:rounded-3xl p-4 sm:p-6 md:p-8 lg:p-12 shadow-2xl relative overflow-hidden">
            {/* Decorative background element */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#e5c185]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-black uppercase tracking-tight mb-2 text-white">Reserva tu lugar</h2>
              <p className="text-sm sm:text-base text-zinc-400 mb-8 sm:mb-10 font-sans font-light">Completa los datos para agendar tu próximo corte.</p>

              {backendReachable !== false && !profile && (
                <div className="mb-6 p-4 rounded-xl border border-amber-500/40 bg-amber-950/30 text-amber-100/90 text-sm">
                  Para confirmar el turno con la seña online tenés que{' '}
                  <Link to="/login" state={{ from: { pathname: '/', hash: '#reserva' } }} className="font-bold text-[#e5c185] underline underline-offset-2 hover:text-[#d4b074]">
                    iniciar sesión con Google
                  </Link>
                  .
                </div>
              )}

              {profile?.subscription && (
                <div className="mb-6 p-4 rounded-xl border border-violet-500/30 bg-violet-950/30 text-violet-100 text-sm">
                  <p className="font-bold">Abono {profile.subscription.planName}</p>
                  <p className="mt-1 text-violet-200/90">
                    {profile.subscription.cutsRemaining > 0
                      ? `Te quedan ${profile.subscription.cutsRemaining} de ${profile.subscription.cutsPerMonth} cortes. Confirmás sin pagar seña.`
                      : `Usaste los ${profile.subscription.cutsPerMonth} cortes de tu abono. No podés reservar online hasta que compres o te asignen uno nuevo.`}
                  </p>
                </div>
              )}
              {bookingError && backendReachable && (
                <div className="mb-6 p-4 bg-red-950/30 border border-red-500/30 rounded-xl text-red-400 text-sm">{bookingError}</div>
              )}

              {backendReachable === null ? (
                <div className="rounded-xl sm:rounded-2xl border border-zinc-800 bg-zinc-900/50 p-10 sm:p-12 text-center">
                  <p className="text-zinc-400 text-sm font-sans">Comprobando disponibilidad del sistema…</p>
                </div>
              ) : backendReachable === false && !bookingSuccess ? (
                <div className="rounded-xl sm:rounded-2xl border border-amber-500/40 bg-amber-950/25 p-8 sm:p-12 text-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-amber-500/15 rounded-full flex items-center justify-center mx-auto mb-5 sm:mb-6 text-amber-400">
                    <AlertTriangle size={36} className="sm:w-10 sm:h-10" aria-hidden />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-serif font-black text-white mb-3 uppercase tracking-tight">
                    Sistema caído
                  </h3>
                  <p className="text-amber-100/85 text-base sm:text-lg font-sans max-w-md mx-auto leading-relaxed">
                    La reserva online no está disponible en este momento. Reservá tu turno por WhatsApp y te respondemos a la
                    brevedad.
                  </p>
                  <a
                    href={BOOKING_FALLBACK_WHATSAPP_URL}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center justify-center gap-3 mt-8 rounded-xl px-8 py-4 font-sans text-sm font-black uppercase tracking-widest ${whatsAppLionButtonClassName}`}
                  >
                    <WhatsAppIcon size={22} className="text-zinc-950" />
                    Reservar por WhatsApp
                  </a>
                </div>
              ) : bookingSuccess ? (
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
                      {!serviceSelected && (
                        <p className="text-xs text-zinc-500 mt-1">
                          Elegí un servicio para continuar con barbero, fecha y hora.
                        </p>
                      )}
                    </div>

                    <div
                      className={`md:col-span-2 space-y-6 transition-opacity ${
                        serviceSelected ? '' : 'opacity-40 pointer-events-none select-none'
                      }`}
                      aria-disabled={!serviceSelected}
                    >
                    {/* Barber Selection */}
                    <div className="space-y-2 md:col-span-2 min-w-0">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <User size={14} /> Barbero
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                        <button
                          type="button"
                          disabled={!serviceSelected}
                          onClick={() => setSelectedBarber(ANY_BARBER_ID)}
                          className={`flex items-center gap-2 sm:gap-3 p-3 rounded-xl border transition-all text-left min-w-0 disabled:cursor-not-allowed ${
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
                            disabled={!serviceSelected}
                            onClick={() => setSelectedBarber(b.id)}
                            className={`flex items-center gap-2 sm:gap-3 p-3 rounded-xl border transition-all text-left min-w-0 disabled:cursor-not-allowed ${
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
                          disabled={!serviceSelected}
                          onClick={() => scrollDates('left')} 
                          className="absolute left-0 top-1/2 -translate-y-1/2 -mt-1 z-20 bg-zinc-800/80 hover:bg-[#e5c185] hover:text-black p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all hidden md:block shadow-lg disabled:pointer-events-none"
                        >
                          <ChevronLeft size={20} />
                        </button>

                        <div 
                          ref={scrollContainerRef} 
                          className={`flex gap-3 overflow-x-auto pb-2 hide-scrollbar w-full relative z-0 px-1 select-none ${
                            !serviceSelected ? 'cursor-not-allowed' : isDragging ? 'cursor-grabbing' : 'snap-x cursor-grab'
                          }`}
                          onMouseDown={serviceSelected ? handleMouseDown : undefined}
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
                                disabled={!serviceSelected || isPastDay}
                                onClick={(e) => {
                                  if (!serviceSelected) return;
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
                            disabled={!serviceSelected}
                            className="relative flex-shrink-0 w-16 sm:w-20 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-[#e5c185] hover:bg-zinc-900 hover:text-[#e5c185] flex flex-col items-center justify-center transition-all snap-start cursor-pointer group/calendar overflow-hidden min-w-0 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={(e) => {
                              if (!serviceSelected) return;
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
                          disabled={!serviceSelected}
                          onClick={() => scrollDates('right')} 
                          className="absolute right-0 top-1/2 -translate-y-1/2 -mt-1 z-20 bg-zinc-800/80 hover:bg-[#e5c185] hover:text-black p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all hidden md:block shadow-lg disabled:pointer-events-none"
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
                      {isSelectedDateClosed && (
                        <p className="text-red-400 text-sm">
                          La barbería está cerrada ese día. Elegí otra fecha para ver horarios.
                        </p>
                      )}
                      {!serviceSelected ? (
                        <p className="text-zinc-500 text-sm">
                          Elegí un servicio para ver los horarios disponibles.
                        </p>
                      ) : !selectedBarber ? (
                        <p className="text-zinc-500 text-sm">
                          Elegí un barbero para ver los horarios disponibles.
                        </p>
                      ) : (
                        <>
                          {!isSelectedDateClosed && selectedBarber === ANY_BARBER_ID && earliestAny && !isSlotAlreadyPast(selectedDate, earliestAny.time) && (
                            <button
                              type="button"
                              onClick={() => setSelectedTime(earliestAny.time)}
                              className="mb-2 text-left text-xs font-bold uppercase tracking-wider text-[#e5c185] hover:text-[#d4b074] underline-offset-4 hover:underline"
                            >
                              Usar el próximo libre: {earliestAny.time}
                            </button>
                          )}
                          {!isSelectedDateClosed && visibleTimeSlots.length === 0 && availableSlots.length > 0 && selectedDate === format(startOfToday(), 'yyyy-MM-dd') && (
                            <p className="text-amber-500/90 text-sm mb-2">
                              Para hoy no quedan horarios con al menos {BOOKING_LEAD_MINUTES} minutos de anticipación. Elegí otro día.
                            </p>
                          )}
                          {!isSelectedDateClosed && availableSlots.length === 0 && selectedService && selectedBarber && (
                            <p className="text-amber-500/90 text-sm mb-2">
                              No hay horarios disponibles para esa fecha y duración. Probá otro día u otro barbero.
                            </p>
                          )}
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3">
                            {(isSelectedDateClosed ? [] : visibleTimeSlots).map(time => {
                              const isSelected = selectedTime === time;
                              return (
                                <button
                                  key={time}
                                  type="button"
                                  disabled={!serviceSelected}
                                  onClick={() => setSelectedTime(time)}
                                  className={`py-3 rounded-xl border text-sm font-bold transition-all flex items-center justify-center disabled:cursor-not-allowed ${
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

                    <div className="grid md:grid-cols-2 gap-6">
                    {/* Name Input */}
                    <div className="space-y-2 min-w-0">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <User size={14} /> Nombre Completo
                      </label>
                      <input 
                        type="text" 
                        placeholder="Ej. Juan Pérez"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white focus:ring-2 focus:ring-[#e5c185] focus:border-[#e5c185] outline-none transition-all placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={!serviceSelected}
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
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white focus:ring-2 focus:ring-[#e5c185] focus:border-[#e5c185] outline-none transition-all placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={!serviceSelected}
                        required
                      />
                    </div>
                    </div>
                    </div>
                  </div>

                  <div className={`flex flex-col gap-3 mt-4 transition-opacity ${serviceSelected ? '' : 'opacity-40 pointer-events-none'}`}>
                    {depositPreviewArs != null && (
                      <p className="text-center text-sm text-zinc-400">
                        Seña online:{' '}
                        <strong className="text-[#e5c185] tabular-nums">
                          ${depositPreviewArs.toLocaleString('es-AR')}
                        </strong>{' '}
                        ({DEPOSIT_PERCENT}% del servicio · el resto se abona en el local)
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handlePaySena}
                      disabled={
                        !serviceSelected ||
                        senaCheckoutLoading ||
                        Boolean(profile?.subscription && profile.subscription.cutsRemaining <= 0)
                      }
                      className="bg-[#e5c185] hover:bg-[#d4b074] disabled:opacity-60 disabled:pointer-events-none text-black font-sans font-black uppercase tracking-widest py-5 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {senaCheckoutLoading ? (
                        profile?.depositExempt ? (
                          'Confirmando turno…'
                        ) : (
                          'Preparando pago…'
                        )
                      ) : profile ? (
                        profile.depositExempt ? (
                          'Confirmar turno'
                        ) : (
                          senaCheckoutPreferenceId
                            ? 'Preferencia lista — pagá abajo'
                            : 'Pagar seña y confirmar turno'
                        )
                      ) : (
                        'Iniciar sesión para confirmar'
                      )}
                    </button>
                    {senaCheckoutPreferenceId && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 min-h-[120px]">
                        <p className="text-xs text-zinc-400 mb-3 text-center w-full">
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
                  {!profile?.depositExempt && (
                    <p className="text-center text-[11px] text-zinc-500 mt-2">
                      Reservamos el horario por {DEPOSIT_PAYMENT_MINUTES} minutos: si el pago de la seña no se aprueba en ese tiempo, la reserva se
                      cancela automáticamente. Podés volver a pagar desde tu perfil mientras no venza el plazo.
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Ubicación */}
      <section id="contacto" className="border-y border-zinc-900 bg-zinc-950 px-4 py-12 sm:px-6 sm:py-16 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center sm:mb-12">
            <h2 className="font-serif text-2xl font-black uppercase tracking-tight text-white sm:text-3xl md:text-4xl">
              Ubicación
            </h2>
            <div className="mx-auto mt-3 h-1 w-20 rounded-full bg-[#e5c185] sm:w-24" />
            <p className="mx-auto mt-4 max-w-2xl font-sans text-sm font-light text-zinc-400 sm:text-base">
              Encontranos en el corazón de la ciudad. Abrí el mapa para ver cómo llegar.
            </p>
          </div>

          <div className="grid items-stretch gap-8 lg:grid-cols-2 lg:gap-10">
            <div className="flex flex-col justify-center gap-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 sm:p-8">
              <div className="space-y-4">
                <p className="flex items-start gap-3 text-sm text-zinc-300 sm:text-base">
                  <MapPin size={20} className="mt-0.5 shrink-0 text-[#e5c185]" aria-hidden />
                  <span>
                    <span className="block text-xs font-bold uppercase tracking-widest text-zinc-500">Dirección</span>
                    <span className="mt-1 block font-medium text-white">{SHOP_ADDRESS}</span>
                  </span>
                </p>
                <p className="flex items-start gap-3 text-sm text-zinc-300 sm:text-base">
                  <Clock size={20} className="mt-0.5 shrink-0 text-[#e5c185]" aria-hidden />
                  <span>
                    <span className="block text-xs font-bold uppercase tracking-widest text-zinc-500">Horarios</span>
                    <span className="mt-1 block">Lun a Vie: 10–20 hs · Sáb: 10–18 hs</span>
                  </span>
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a
                  href={SHOP_MAPS_DIRECTIONS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-black bg-[#e5c185] px-5 py-3 text-xs font-black uppercase tracking-wider text-zinc-950 transition-colors hover:bg-[#d4b074]"
                >
                  <ExternalLink size={16} />
                  Cómo llegar
                </a>
                <a
                  href={BOOKING_FALLBACK_WHATSAPP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-zinc-950 bg-[#e5c185] px-5 py-3 text-xs font-black uppercase tracking-wider text-zinc-950 transition-colors hover:bg-[#d4b074]"
                >
                  <WhatsAppIcon size={18} className="text-zinc-950" />
                  WhatsApp
                </a>
                <a
                  href={SHOP_INSTAGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 px-5 py-3 text-xs font-bold uppercase tracking-wider text-zinc-300 transition-colors hover:border-[#e5c185]/50 hover:text-[#e5c185]"
                >
                  <InstagramIcon size={18} className="text-[#e5c185]" />
                  Instagram
                </a>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30 shadow-2xl">
              <iframe
                title="Mapa de ubicación de Lion Barber"
                src={SHOP_MAPS_EMBED_URL}
                className="h-[280px] w-full sm:h-[320px] lg:h-full lg:min-h-[360px]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-zinc-950 border-t border-zinc-900 py-8 sm:py-12 px-4 sm:px-6">
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
            <p className="flex items-center gap-2 flex-wrap justify-center md:justify-start">
              <MapPin size={16} className="text-[#e5c185] flex-shrink-0" />
              <span className="break-words">{SHOP_ADDRESS}</span>
            </p>
            <p className="flex items-center gap-2 flex-wrap justify-center md:justify-start">
              <Clock size={16} className="text-[#e5c185] flex-shrink-0" />
              <span>Lun a Vie: 10-20hs | Sáb: 10-18hs</span>
            </p>
          </div>

          <div className="flex justify-center gap-3 md:justify-end">
            <a
              href={SHOP_INSTAGRAM_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-shrink-0 items-center justify-center transition-transform hover:scale-105"
              aria-label="Instagram de Lion Barber"
            >
              <InstagramIcon size={44} variant="lion" />
            </a>
            <a
              href={BOOKING_FALLBACK_WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-shrink-0 items-center justify-center transition-transform hover:scale-105"
              aria-label="WhatsApp"
            >
              <WhatsAppIcon size={44} variant="lion" />
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
                const ymd = format(day, 'yyyy-MM-dd');
                const isClosedDay = !openWeekdays.includes(getISODay(day)) || closedDates.includes(ymd);
                
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
