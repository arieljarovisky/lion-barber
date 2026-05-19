import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  format,
  parseISO,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  startOfDay,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Phone,
  Scissors,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Pencil,
  Trash2,
  X,
  Package,
  Ban,
  UserPlus,
  Settings,
  CheckCircle2,
  AlertCircle,
  Receipt,
  MessageCircle,
  Banknote,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ConfirmContext';
import DashboardPanelShell, { type DashboardPanelId } from '../components/DashboardPanelShell';
import PointsProgramPanel from '../components/PointsProgramPanel';
import PointsRedemptionPanel from '../components/PointsRedemptionPanel';
import ShopProductsPanel from '../components/ShopProductsPanel';
import ProductPointsPanel from '../components/ProductPointsPanel';
import BillingPanel from '../components/BillingPanel';
import AfipInvoiceModal from '../components/AfipInvoiceModal';
import AppointmentPaymentSplitsModal from '../components/AppointmentPaymentSplitsModal';
import ServicePaymentSplitsEditor from '../components/ServicePaymentSplitsEditor';
import { api, ApiError } from '../api';
import { resolveAppointmentServiceAmountArs } from '../utils/money';
import { displayClientEmail } from '../utils/manualClientEmail';
import type {
  Appointment,
  Barber,
  Service,
  BarberFrancoRow,
  BarberTimeBlockRow,
  StaffInviteRow,
  ShopProduct,
  AdminClientWithHistory,
  type PointsRedemptionOption,
  type ServicePaymentSplit,
} from '../api';
import {
  appointmentLocalPendingArs,
  cleanServicePaymentSplits,
  formatServicePaymentSplits,
  initialSplitsFromAppointment,
} from '../utils/servicePaymentMethod';
function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

function adminClientMatchesPhoneDigits(c: AdminClientWithHistory, phoneDigits: string): boolean {
  if (phoneDigits.length < 6) return false;
  const phonesOnFile = Array.isArray(c.phones) && c.phones.length > 0 ? c.phones : c.phone ? [c.phone] : [];
  if (phonesOnFile.some((p) => normalizePhoneDigits(p) === phoneDigits)) return true;
  return c.appointments.some((a) => normalizePhoneDigits(a.phone || '') === phoneDigits);
}

function adminClientPrimaryPhone(c: AdminClientWithHistory): string {
  const byFile = Array.isArray(c.phones) ? c.phones.find((p) => p.trim().length > 0) : null;
  if (byFile) return byFile.trim();
  if (c.phone?.trim()) return c.phone.trim();
  const byHistory = c.appointments
    .map((a) => (a.phone ?? '').trim())
    .find((p) => p.length > 0);
  return byHistory ?? '';
}

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
  '19:00', '19:20', '19:40',
];

type DayHours = { openTime: string; closeTime: string };

function timeToMinutes(hhmm: string): number {
  const [hRaw, mRaw] = hhmm.split(':').map(Number);
  if (!Number.isFinite(hRaw) || !Number.isFinite(mRaw)) return NaN;
  return hRaw * 60 + mRaw;
}

function buildTimeSlotsInRange(openTime: string, closeTime: string): string[] {
  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);
  const safeOpen = Number.isFinite(openMinutes) ? Math.max(0, Math.min(24 * 60 - SLOT_STEP_MINUTES, openMinutes)) : 10 * 60;
  const safeClose = Number.isFinite(closeMinutes)
    ? Math.max(safeOpen + SLOT_STEP_MINUTES, Math.min(24 * 60, closeMinutes))
    : 20 * 60;
  return TIME_SLOTS.filter((slot) => {
    const start = timeToMinutes(slot);
    return Number.isFinite(start) && start >= safeOpen && start + SLOT_STEP_MINUTES < safeClose;
  });
}

function getServiceIconSource(icon?: string): { kind: 'svg' | 'emoji' | 'none'; value: string } {
  const raw = (icon ?? '').trim();
  if (!raw) return { kind: 'none', value: '' };
  const lower = raw.toLowerCase();
  if (lower.endsWith('.svg') || lower.startsWith('data:image/svg+xml')) {
    return { kind: 'svg', value: raw };
  }
  return { kind: 'emoji', value: raw };
}

/** MySQL TIME puede devolver "10:30:00"; la grilla usa "10:30". */
function normalizeAppointmentTime(t: string | undefined): string {
  if (!t) return '';
  const s = t.trim();
  return s.length >= 5 ? s.slice(0, 5) : s;
}

/** Intervalo de la grilla (coincide con backend). */
const SLOT_STEP_MINUTES = 20;
/** Altura visual mínima por “franja” de 20 min en el timeline (rem). */
const TIMELINE_ROW_UNIT_REM = 3.75;
/** Regla fija solicitada: ingreso estimado del barbero = 50% del servicio. */
const BARBER_ESTIMATED_SHARE = 0.5;

function appointmentSlotSpan(app: Appointment): number {
  const dm = app.durationMinutes ?? 30;
  return Math.max(1, Math.ceil(dm / SLOT_STEP_MINUTES));
}

/** Una fila por bloque libre o turno que ocupa N franjas de 20 min. */
function buildDayTimelineRows(
  apps: Appointment[],
  slots: string[],
  blockedSlots?: Set<string>
): Array<
  { kind: 'free'; slot: string } | { kind: 'blocked'; slot: string } | { kind: 'appointment'; slot: string; app: Appointment; span: number }
> {
  const byStart = new Map<string, Appointment>();
  for (const a of apps) {
    const k = normalizeAppointmentTime(a.time);
    if (k) byStart.set(k, a);
  }
  const rows: Array<
    { kind: 'free'; slot: string } | { kind: 'blocked'; slot: string } | { kind: 'appointment'; slot: string; app: Appointment; span: number }
  > = [];
  let i = 0;
  while (i < slots.length) {
    const slot = slots[i];
    const app = byStart.get(slot);
    if (app) {
      const rawSpan = appointmentSlotSpan(app);
      const span = Math.min(rawSpan, slots.length - i);
      rows.push({ kind: 'appointment', slot, app, span });
      i += span;
    } else if (blockedSlots?.has(slot)) {
      rows.push({ kind: 'blocked', slot });
      i += 1;
    } else {
      rows.push({ kind: 'free', slot });
      i += 1;
    }
  }
  return rows;
}

/** Para tabla semanal: por índice de franja, celda libre, inicio de turno (con rowspan) o skip por rowspan. */
function buildWeekColumnCells(
  apps: Appointment[],
  slots: string[],
  blockedSlots?: Set<string>
): Array<'skip' | { kind: 'free' } | { kind: 'blocked' } | { kind: 'app'; app: Appointment; rowspan: number }> {
  const result: Array<'skip' | { kind: 'free' } | { kind: 'blocked' } | { kind: 'app'; app: Appointment; rowspan: number }> = slots.map(
    (slot) => (blockedSlots?.has(slot) ? { kind: 'blocked' as const } : { kind: 'free' as const })
  );
  for (const a of apps) {
    const startIdx = slots.indexOf(normalizeAppointmentTime(a.time));
    if (startIdx < 0) continue;
    const rawSpan = appointmentSlotSpan(a);
    const span = Math.min(rawSpan, slots.length - startIdx);
    result[startIdx] = { kind: 'app', app: a, rowspan: span };
    for (let j = 1; j < span; j++) {
      if (startIdx + j < result.length) result[startIdx + j] = 'skip';
    }
  }
  return result;
}

function addMinutesToClock(hhmm: string, minutes: number): string {
  const parts = hhmm.trim().slice(0, 5).split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  let total = h * 60 + m + minutes;
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const H = Math.floor(total / 60);
  const M = total % 60;
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
}

function getAppointmentPaymentBadge(app: Appointment): { label: string; className: string } {
  if (app.status === 'pending_payment') {
    return {
      label: 'Pago pendiente',
      className: 'bg-amber-100 text-amber-900 border border-amber-300',
    };
  }
  if (app.depositPaid) {
    return {
      label: 'Senia pagada',
      className: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    };
  }
  return {
    label: 'Sin senia',
    className: 'bg-zinc-100 text-zinc-700 border border-zinc-200',
  };
}

/** El botón de WhatsApp se ofrece para turnos confirmados sin seña pagada (hay que coordinar manualmente). */
function appointmentNeedsManualContact(app: Appointment): boolean {
  if (app.status === 'cancelled' || app.status === 'pending_payment') return false;
  if (app.depositPaid) return false;
  return normalizePhoneDigits(app.phone ?? '').length >= 8;
}

/** Convierte el teléfono a E.164 argentino para wa.me (asume número AR sin código de país). */
function buildWhatsappPhone(rawPhone: string): string | null {
  const digits = normalizePhoneDigits(rawPhone);
  if (digits.length < 8) return null;
  if (digits.startsWith('54')) return digits;
  if (digits.startsWith('15')) {
    return `549${digits.slice(2)}`;
  }
  if (digits.length >= 10) {
    return `549${digits}`;
  }
  return `549${digits}`;
}

function formatAppointmentDateForMessage(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

/** Texto de ayuda en configuración (coincide con el mensaje por defecto si dejás el campo vacío). */
const WHATSAPP_TEMPLATE_HELP = `Podés usar: {nombre}, {nombre_completo}, {fecha}, {hora}, {servicio}, {barbero}. Si dejás vacío, se usa el mensaje clásico de Lion Barber.`;

function applyWhatsappMessageTemplate(template: string | null | undefined, app: Appointment): string {
  const t = (template ?? '').trim();
  const greetingName = (app.name ?? '').trim().split(/\s+/)[0] || 'Hola';
  const fullName = (app.name ?? '').trim() || greetingName;
  const fecha = formatAppointmentDateForMessage(app.date);
  const hora = app.time;
  const servicio = app.service;
  const barbero = (app.barber ?? '').trim();
  if (!t) {
    const lines = [
      `Hola ${greetingName}! Te confirmo tu turno en Lion Barber:`,
      '',
      `Fecha: ${fecha}`,
      `Hora: ${hora}`,
      `Servicio: ${servicio}`,
    ];
    if (barbero) lines.push(`Barbero: ${barbero}`);
    lines.push('', '¿Podés confirmármelo?');
    return lines.join('\n');
  }
  return t
    .split('{nombre_completo}')
    .join(fullName)
    .split('{nombre}')
    .join(greetingName)
    .split('{fecha}')
    .join(fecha)
    .split('{hora}')
    .join(hora)
    .split('{servicio}')
    .join(servicio)
    .split('{barbero}')
    .join(barbero);
}

function buildAppointmentWhatsappUrl(app: Appointment, messageTemplate: string | null): string | null {
  const phone = buildWhatsappPhone(app.phone ?? '');
  if (!phone) return null;
  const body = applyWhatsappMessageTemplate(messageTemplate, app);
  const text = encodeURIComponent(body);
  return `https://wa.me/${phone}?text=${text}`;
}

const WEEKDAY_SHORT: { value: number; label: string }[] = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
];

const DEFAULT_WEEKDAY_HOURS: Record<number, DayHours> = {
  1: { openTime: '10:00', closeTime: '20:00' },
  2: { openTime: '10:00', closeTime: '20:00' },
  3: { openTime: '10:00', closeTime: '20:00' },
  4: { openTime: '10:00', closeTime: '20:00' },
  5: { openTime: '10:00', closeTime: '20:00' },
  6: { openTime: '10:00', closeTime: '20:00' },
  7: { openTime: '10:00', closeTime: '20:00' },
};

function getIsoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function getIsoWeekdayFromYmd(dateStr: string): number {
  return getIsoWeekday(new Date(`${dateStr}T12:00:00`));
}

function normalizeWeekdayHours(input: Record<number, DayHours> | undefined, closeTimeFallback = '20:00'): Record<number, DayHours> {
  const out: Record<number, DayHours> = { ...DEFAULT_WEEKDAY_HOURS };
  for (let d = 1; d <= 7; d++) {
    const fromInput = input?.[d];
    out[d] = {
      openTime: fromInput?.openTime || DEFAULT_WEEKDAY_HOURS[d].openTime,
      closeTime: fromInput?.closeTime || closeTimeFallback,
    };
  }
  return out;
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
  const [form, setForm] = useState({
    name: '',
    phone: '',
    service: '',
    barberId: '',
    date: '',
    time: '',
    servicePaymentSplits: [] as ServicePaymentSplit[],
  });
  const [paymentSplitsModalApp, setPaymentSplitsModalApp] = useState<Appointment | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  /** Solo admin — modal nueva cita: '' | 'new' | id de cliente */
  /** Cliente elegido desde sugerencias o coincidencia exacta de nombre (solo admin, nueva cita). */
  const [linkedClientId, setLinkedClientId] = useState<number | null>(null);
  const [newClientEmail, setNewClientEmail] = useState('');
  const [adminClients, setAdminClients] = useState<AdminClientWithHistory[]>([]);
  const [adminClientsLoading, setAdminClientsLoading] = useState(false);
  const [nameSuggestionsOpen, setNameSuggestionsOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameSuggestionsRef = useRef<HTMLUListElement>(null);
  const [agendaRestrictionsByBarber, setAgendaRestrictionsByBarber] = useState<
    Record<string, { offWeekdays: Set<number>; blocks: BarberTimeBlockRow[] }>
  >({});
  const [availableFormSlots, setAvailableFormSlots] = useState<string[]>([]);
  const [availableFormSlotsLoading, setAvailableFormSlotsLoading] = useState(false);
  const [view, setView] = useState<
    | 'agenda'
    | 'servicios'
    | 'horarios'
    | 'equipo'
    | 'puntos'
    | 'productos'
    | 'facturacion'
    | 'configuracion'
  >('agenda');
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceForm, setServiceForm] = useState({
    name: '',
    price: '',
    duration: 30,
    desc: '',
    emoji: '',
    pointsReward: '0',
  });
  const [savingService, setSavingService] = useState(false);
  const [sortingServices, setSortingServices] = useState(false);
  const [dragServiceId, setDragServiceId] = useState<string | null>(null);
  const [dragOverServiceId, setDragOverServiceId] = useState<string | null>(null);
  const [serviceError, setServiceError] = useState('');
  const [scheduleBarberId, setScheduleBarberId] = useState('');
  const [francos, setFrancos] = useState<BarberFrancoRow[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<BarberTimeBlockRow[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [blockMode, setBlockMode] = useState<'once' | 'weekly'>('once');
  const [blockDate, setBlockDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [blockWeekday, setBlockWeekday] = useState(1);
  const [blockTimeStart, setBlockTimeStart] = useState('13:00');
  const [blockTimeEnd, setBlockTimeEnd] = useState('14:00');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [staffInvites, setStaffInvites] = useState<StaffInviteRow[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteBarberId, setInviteBarberId] = useState('');
  const [savingInvite, setSavingInvite] = useState(false);
  const [shopCutoff, setShopCutoff] = useState(12);
  const [shopDays, setShopDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [shopDepositPercent, setShopDepositPercent] = useState(30);
  const [shopCloseTime, setShopCloseTime] = useState('20:00');
  const [shopWeekdayHours, setShopWeekdayHours] = useState<Record<number, DayHours>>(DEFAULT_WEEKDAY_HOURS);
  const [shopClosedDates, setShopClosedDates] = useState<string[]>([]);
  const [closedDateInput, setClosedDateInput] = useState('');
  const [shopWhatsappMessageTemplate, setShopWhatsappMessageTemplate] = useState('');
  const [shopLoading, setShopLoading] = useState(false);
  const [shopSaving, setShopSaving] = useState(false);
  const [shopError, setShopError] = useState('');
  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'err' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shopProducts, setShopProducts] = useState<ShopProduct[]>([]);
  const [pointsPanelLoading, setPointsPanelLoading] = useState(false);
  const [shopProductsPanelLoading, setShopProductsPanelLoading] = useState(false);
  const [redemptionOptions, setRedemptionOptions] = useState<PointsRedemptionOption[]>([]);
  const [redemptionOptionsLoading, setRedemptionOptionsLoading] = useState(false);
  const [afipConfigured, setAfipConfigured] = useState(false);
  const [afipEmitterCuit, setAfipEmitterCuit] = useState<string | null>(null);
  const [afipCbteTipo, setAfipCbteTipo] = useState(6);
  const [afipInvoiceApp, setAfipInvoiceApp] = useState<Appointment | null>(null);
  const [afipInvoiceBusy, setAfipInvoiceBusy] = useState(false);
  const [billingAppointments, setBillingAppointments] = useState<Appointment[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const knownPaidAppointmentIdsRef = useRef<Set<string>>(new Set());
  const didInitPaidAppointmentsRef = useRef(false);
  const requestedBrowserNotificationPermissionRef = useRef(false);

  const showToast = useCallback((message: string, kind: 'ok' | 'err' = 'ok') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, kind });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const { profile, isAdmin, canAccessDashboard } = useAuth();
  const confirm = useConfirm();
  const staffBarberId = profile?.role === 'staff' ? profile.barberId ?? null : null;
  const isStaffBarber = Boolean(staffBarberId);

  const notifyBarberForPaidAppointments = useCallback(
    (list: Appointment[]) => {
      if (profile?.role !== 'staff') return;
      const paidScheduled = list.filter(
        (a) => a.status === 'scheduled' && a.depositPaid && a.status !== 'cancelled'
      );
      const nextKnown = new Set(paidScheduled.map((a) => a.id));
      if (!didInitPaidAppointmentsRef.current) {
        knownPaidAppointmentIdsRef.current = nextKnown;
        didInitPaidAppointmentsRef.current = true;
        return;
      }
      const newPaid = paidScheduled.filter((a) => !knownPaidAppointmentIdsRef.current.has(a.id));
      knownPaidAppointmentIdsRef.current = nextKnown;
      if (newPaid.length === 0) return;

      for (const app of newPaid) {
        showToast(`Nueva seña confirmada: ${app.time} - ${app.name}`, 'ok');
        if (typeof window === 'undefined' || !('Notification' in window)) continue;
        if (Notification.permission === 'granted') {
          new Notification('Nuevo turno con seña confirmada', {
            body: `${app.name} - ${app.date} ${app.time}`,
          });
          continue;
        }
        if (
          Notification.permission === 'default' &&
          !requestedBrowserNotificationPermissionRef.current
        ) {
          requestedBrowserNotificationPermissionRef.current = true;
          void Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
              new Notification('Nuevo turno con seña confirmada', {
                body: `${app.name} - ${app.date} ${app.time}`,
              });
            }
          });
        }
      }
    },
    [profile?.role, showToast]
  );

  useEffect(() => {
    if (!modalOpen || !isAdmin || editingAppointment) return;
    let cancelled = false;
    setAdminClientsLoading(true);
    api
      .getAdminClientsWithHistory()
      .then((r) => {
        if (!cancelled) setAdminClients(r.clients);
      })
      .catch(() => {
        if (!cancelled) setAdminClients([]);
      })
      .finally(() => {
        if (!cancelled) setAdminClientsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen, isAdmin, editingAppointment]);

  const clientNameSuggestions = useMemo(() => {
    if (!isAdmin || editingAppointment || !modalOpen) return [];
    const q = form.name.trim().toLowerCase();
    const phoneDigits = normalizePhoneDigits(form.phone);
    if (q.length < 1 && phoneDigits.length < 6) return [];
    return adminClients
      .filter((c) => {
        const nameOrEmail =
          q.length >= 1 &&
          (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
        const byPhone = adminClientMatchesPhoneDigits(c, phoneDigits);
        return nameOrEmail || byPhone;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
      .slice(0, 8);
  }, [isAdmin, editingAppointment, modalOpen, form.name, form.phone, adminClients]);

  useEffect(() => {
    if (!nameSuggestionsOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (nameInputRef.current?.contains(target)) return;
      if (nameSuggestionsRef.current?.contains(target)) return;
      setNameSuggestionsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNameSuggestionsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [nameSuggestionsOpen]);

  useEffect(() => {
    if (!modalOpen) setNameSuggestionsOpen(false);
  }, [modalOpen]);

  const loadServicePointsPanel = useCallback(async () => {
    setPointsPanelLoading(true);
    try {
      const s = await api.getServices();
      setServices(s);
    } catch {
      showToast('No se pudo cargar los puntos por servicio', 'err');
    } finally {
      setPointsPanelLoading(false);
    }
  }, [showToast]);

  const loadShopProductsPanel = useCallback(async () => {
    setShopProductsPanelLoading(true);
    try {
      const p = await api.getShopProducts();
      setShopProducts(p);
    } catch {
      showToast('No se pudo cargar los productos', 'err');
    } finally {
      setShopProductsPanelLoading(false);
    }
  }, [showToast]);

  const loadRedemptionOptionsPanel = useCallback(async () => {
    setRedemptionOptionsLoading(true);
    try {
      const r = await api.getPointsRedemptionOptions();
      setRedemptionOptions(r.options);
    } catch {
      showToast('No se pudo cargar las opciones de canje', 'err');
    } finally {
      setRedemptionOptionsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (view !== 'puntos') return;
    void loadServicePointsPanel();
  }, [view, loadServicePointsPanel]);

  useEffect(() => {
    if (view !== 'puntos') return;
    void loadRedemptionOptionsPanel();
  }, [view, loadRedemptionOptionsPanel]);

  useEffect(() => {
    if (view !== 'productos' && view !== 'puntos') return;
    void loadShopProductsPanel();
  }, [view, loadShopProductsPanel]);

  useEffect(() => {
    if (view !== 'facturacion' || !isAdmin) return;
    let cancelled = false;
    setBillingLoading(true);
    api
      .getAppointments()
      .then((list) => {
        if (!cancelled) setBillingAppointments(list);
      })
      .catch(() => {
        if (!cancelled) showToast('No se pudo cargar turnos para facturación', 'err');
      })
      .finally(() => {
        if (!cancelled) setBillingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, isAdmin, showToast]);

  useEffect(() => {
    if (view !== 'agenda' || barbers.length === 0) {
      setAgendaRestrictionsByBarber({});
      return;
    }
    let cancelled = false;
    Promise.all(
      barbers.map(async (b) => {
        const data = await api.getBarberSchedule(b.id);
        return [b.id, data] as const;
      })
    )
      .then((entries) => {
        if (cancelled) return;
        const next: Record<string, { offWeekdays: Set<number>; blocks: BarberTimeBlockRow[] }> = {};
        for (const [barberId, data] of entries) {
          next[barberId] = {
            offWeekdays: new Set(data.francos.map((f) => f.weekday)),
            blocks: data.blocks,
          };
        }
        setAgendaRestrictionsByBarber(next);
      })
      .catch(() => {
        if (!cancelled) setAgendaRestrictionsByBarber({});
      });
    return () => {
      cancelled = true;
    };
  }, [view, barbers]);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const selectedDayHours = shopWeekdayHours[getIsoWeekday(selectedDate)] ?? { openTime: '10:00', closeTime: shopCloseTime };
  const agendaTimeSlots = useMemo(
    () => buildTimeSlotsInRange(selectedDayHours.openTime, selectedDayHours.closeTime),
    [selectedDayHours.openTime, selectedDayHours.closeTime]
  );
  const blockEndTimeOptions = useMemo(() => {
    const close = selectedDayHours.closeTime;
    return agendaTimeSlots.includes(close) ? agendaTimeSlots : [...agendaTimeSlots, close];
  }, [agendaTimeSlots, selectedDayHours.closeTime]);
  /** Vista semana solo para admin (elige un peluquero). Los barberos usan vista por día (día actual / calendario). */
  const isWeekView = selectedBarberId !== 'all' && !isStaffBarber;
  const isDayToday = isSameDay(selectedDate, new Date());
  /** Un solo peluquero en pantalla (ej. cuenta barbero): layout de día ampliado */
  const isSingleBarberDayView = !isWeekView && barbers.length === 1;

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [appRes, barbersRes, servicesRes] = await Promise.all([
        isWeekView
          ? api.getAppointments({ barberId: selectedBarberId })
          : api.getAppointments({ date: dateStr }),
        api.getBarbers(),
        api.getServices(),
      ]);
      setAppointments(appRes);
      notifyBarberForPaidAppointments(appRes);
      const staffBid = profile?.role === 'staff' ? profile.barberId ?? null : null;
      setBarbers(staffBid ? barbersRes.filter((b) => b.id === staffBid) : barbersRes);
      setServices(servicesRes);
    } catch {
      setAppointments([]);
      setBarbers([]);
      setServices([]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [dateStr, selectedBarberId, isWeekView, profile?.role, profile?.barberId, notifyBarberForPaidAppointments]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (profile?.role !== 'staff' || view !== 'agenda') return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void loadData({ silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [profile?.role, view, loadData]);

  useEffect(() => {
    if (!isAdmin) {
      setAfipConfigured(false);
      setAfipEmitterCuit(null);
      setAfipCbteTipo(6);
      return;
    }
    api
      .getAfipStatus()
      .then((s) => {
        setAfipConfigured(s.configured);
        setAfipEmitterCuit(s.emitterCuit ?? null);
        setAfipCbteTipo(typeof s.cbteTipo === 'number' ? s.cbteTipo : 6);
      })
      .catch(() => {
        setAfipConfigured(false);
        setAfipEmitterCuit(null);
        setAfipCbteTipo(6);
      });
  }, [isAdmin]);

  useEffect(() => {
    if (profile?.role === 'staff' && profile.barberId) {
      setSelectedBarberId(profile.barberId);
      setScheduleBarberId(profile.barberId);
    }
  }, [profile?.role, profile?.barberId]);

  useEffect(() => {
    if (view === 'horarios' && barbers.length && !scheduleBarberId) {
      setScheduleBarberId(barbers[0].id);
    }
  }, [view, barbers, scheduleBarberId]);

  const loadSchedule = useCallback(async () => {
    if (!scheduleBarberId) return;
    setScheduleLoading(true);
    setScheduleError('');
    try {
      const data = await api.getBarberSchedule(scheduleBarberId);
      setFrancos(data.francos);
      setTimeBlocks(data.blocks);
    } catch {
      setFrancos([]);
      setTimeBlocks([]);
      setScheduleError('No se pudo cargar la disponibilidad del barbero.');
    } finally {
      setScheduleLoading(false);
    }
  }, [scheduleBarberId]);

  useEffect(() => {
    if (view === 'horarios' && scheduleBarberId) {
      loadSchedule();
    }
  }, [view, scheduleBarberId, loadSchedule]);

  useEffect(() => {
    if (!isAdmin && (view === 'servicios' || view === 'equipo' || view === 'configuracion' || view === 'facturacion')) {
      setView('agenda');
    }
  }, [isAdmin, view]);

  /** Cierre y horario por día de la barbería para la grilla de agenda. Sin esto, solo se aplicaba al abrir Configuración. */
  useEffect(() => {
    if (!canAccessDashboard) return;
    let cancelled = false;
    api
      .getShopSettings()
      .then((s) => {
        if (cancelled) return;
        setShopDays(s.openWeekdays.length ? s.openWeekdays : [1, 2, 3, 4, 5, 6, 7]);
        setShopCloseTime(s.closeTime || '20:00');
        setShopWeekdayHours(normalizeWeekdayHours(s.weekdayHours, s.closeTime || '20:00'));
        setShopClosedDates(Array.isArray(s.closedDates) ? s.closedDates : []);
        setShopWhatsappMessageTemplate(s.whatsappMessageTemplate ?? '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canAccessDashboard]);

  useEffect(() => {
    if (view !== 'configuracion' || !isAdmin) return;
    let cancelled = false;
    setShopLoading(true);
    setShopError('');
    api
      .getShopSettings()
      .then((s) => {
        if (!cancelled) {
          setShopCutoff(s.cutoffHours);
          setShopDays(s.openWeekdays.length ? s.openWeekdays : [1, 2, 3, 4, 5, 6, 7]);
          setShopDepositPercent(s.depositPercent);
          setShopCloseTime(s.closeTime || '20:00');
          setShopWeekdayHours(normalizeWeekdayHours(s.weekdayHours, s.closeTime || '20:00'));
          setShopClosedDates(Array.isArray(s.closedDates) ? s.closedDates : []);
          setShopWhatsappMessageTemplate(s.whatsappMessageTemplate ?? '');
          setClosedDateInput('');
        }
      })
      .catch(() => {
        if (!cancelled) setShopError('No se pudo cargar la configuración.');
      })
      .finally(() => {
        if (!cancelled) setShopLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, isAdmin]);

  const loadStaffInvites = useCallback(async () => {
    setTeamLoading(true);
    setTeamError('');
    try {
      const list = await api.getStaffInvites();
      setStaffInvites(list);
    } catch {
      setStaffInvites([]);
      setTeamError('No se pudo cargar el equipo.');
    } finally {
      setTeamLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'equipo' && isAdmin) {
      loadStaffInvites();
    }
  }, [view, isAdmin, loadStaffInvites]);

  const toggleFranco = async (weekday: number) => {
    if (!scheduleBarberId || !canAccessDashboard) return;
    const existing = francos.find((f) => f.weekday === weekday);
    setSavingSchedule(true);
    setScheduleError('');
    try {
      if (existing) {
        await api.deleteBarberFranco(scheduleBarberId, existing.id);
      } else {
        await api.addBarberFranco(scheduleBarberId, weekday);
      }
      await loadSchedule();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Error al actualizar franco');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleAddTimeBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleBarberId || !canAccessDashboard) return;
    if (timeToMinutes(blockTimeEnd) <= timeToMinutes(blockTimeStart)) {
      setScheduleError('La hora "hasta" debe ser posterior a "desde".');
      return;
    }
    setSavingSchedule(true);
    setScheduleError('');
    try {
      await api.addBarberTimeBlock(scheduleBarberId, {
        blockDate: blockMode === 'once' ? blockDate : null,
        weekday: blockMode === 'weekly' ? blockWeekday : null,
        timeStart: blockTimeStart,
        timeEnd: blockTimeEnd,
      });
      await loadSchedule();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Error al crear bloqueo');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleAddStaffInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    if (!inviteBarberId) {
      setTeamError('Elegí el barbero para esta cuenta.');
      return;
    }
    setSavingInvite(true);
    setTeamError('');
    try {
      await api.createStaffInvite({
        email: inviteEmail.trim(),
        name: inviteName.trim() || undefined,
        barberId: inviteBarberId,
      });
      setInviteEmail('');
      setInviteName('');
      setInviteBarberId('');
      await loadStaffInvites();
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : 'Error al invitar');
    } finally {
      setSavingInvite(false);
    }
  };

  const handleDeleteStaffInvite = async (id: number) => {
    const ok = await confirm({
      title: 'Eliminar invitación',
      message: '¿Eliminar esta invitación pendiente?',
      variant: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    setTeamError('');
    try {
      await api.deleteStaffInvite(id);
      await loadStaffInvites();
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const deleteBlock = async (id: number) => {
    if (!scheduleBarberId || !canAccessDashboard) return;
    const ok = await confirm({
      title: 'Quitar bloqueo',
      message: '¿Quitar este bloqueo de horario?',
      variant: 'danger',
      confirmLabel: 'Quitar bloqueo',
    });
    if (!ok) return;
    setSavingSchedule(true);
    setScheduleError('');
    try {
      await api.deleteBarberTimeBlock(scheduleBarberId, id);
      await loadSchedule();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handlePrevDay = () => setSelectedDate((d) => subDays(d, 1));
  const handleNextDay = () => setSelectedDate((d) => addDays(d, 1));
  const handleToday = () => setSelectedDate(startOfDay(new Date()));
  const handlePrevWeek = () => setSelectedDate((d) => subWeeks(d, 1));
  const handleNextWeek = () => setSelectedDate((d) => addWeeks(d, 1));
  const handleThisWeek = () => setSelectedDate(startOfDay(new Date()));
  const handleJumpToDate = (value: string) => {
    const v = value.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    const d = parseISO(`${v}T00:00:00`);
    if (Number.isNaN(d.getTime())) return;
    setSelectedDate(startOfDay(d));
  };

  const dayAppointments = appointments
    .filter((app) => app.date === dateStr && app.status !== 'cancelled')
    .sort((a, b) => a.time.localeCompare(b.time));

  const barberById = useMemo(() => {
    const map = new Map<string, Barber>();
    for (const b of barbers) map.set(b.id, b);
    return map;
  }, [barbers]);

  function resolveBarberForApp(app: Appointment): Barber | undefined {
    if (app.barberId) {
      const direct = barberById.get(app.barberId);
      if (direct) return direct;
    }
    if (app.barber) {
      return barbers.find((b) => b.name === app.barber);
    }
    return undefined;
  }

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
      .filter((a) => a.date === format(day, 'yyyy-MM-dd') && a.status !== 'cancelled')
      .sort((a, b) => a.time.localeCompare(b.time)),
  }));

  const getBlockedSlotsForBarberDate = useCallback(
    (barberId: string | undefined, dateStrValue: string): Set<string> => {
      const weekday = getIsoWeekdayFromYmd(dateStrValue);
      const shopClosedByWeekday = !shopDays.includes(weekday);
      const shopClosedByDate = shopClosedDates.includes(dateStrValue);
      if (shopClosedByWeekday || shopClosedByDate) return new Set<string>(agendaTimeSlots);
      if (!barberId) return new Set<string>();
      const cfg = agendaRestrictionsByBarber[barberId];
      if (!cfg) return new Set<string>();
      if (cfg.offWeekdays.has(weekday)) return new Set<string>(agendaTimeSlots);
      const blocked = new Set<string>();
      for (const slot of agendaTimeSlots) {
        const slotMin = timeToMinutes(slot);
        const hit = cfg.blocks.some((b) => {
          const appliesByDate = b.blockDate != null && b.blockDate === dateStrValue;
          const appliesByWeekday = b.blockDate == null && b.weekday === weekday;
          if (!appliesByDate && !appliesByWeekday) return false;
          const start = timeToMinutes(b.timeStart);
          const end = timeToMinutes(b.timeEnd);
          if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
          return slotMin >= start && slotMin < end;
        });
        if (hit) blocked.add(slot);
      }
      return blocked;
    },
    [agendaRestrictionsByBarber, agendaTimeSlots, shopDays, shopClosedDates]
  );

  useEffect(() => {
    if (!agendaTimeSlots.length) return;
    setBlockTimeStart((prev) => (agendaTimeSlots.includes(prev) ? prev : agendaTimeSlots[0]));
    setBlockTimeEnd((prev) => {
      if (blockEndTimeOptions.includes(prev)) return prev;
      return agendaTimeSlots[1] ?? agendaTimeSlots[0];
    });
    setForm((prev) => ({
      ...prev,
      time: agendaTimeSlots.includes(prev.time) ? prev.time : agendaTimeSlots[0],
    }));
  }, [agendaTimeSlots, blockEndTimeOptions]);

  useEffect(() => {
    if (!modalOpen || editingAppointment) {
      setAvailableFormSlots([]);
      setAvailableFormSlotsLoading(false);
      return;
    }
    const barberId = staffBarberId ?? form.barberId;
    if (!form.date || !barberId) {
      setAvailableFormSlots([]);
      return;
    }
    const serviceDuration = services.find((s) => s.id === form.service)?.duration ?? 30;
    let cancelled = false;
    setAvailableFormSlotsLoading(true);
    api
      .getAvailability(form.date, barberId, serviceDuration)
      .then((res) => {
        if (cancelled) return;
        setAvailableFormSlots(res.slots);
        setForm((prev) => ({
          ...prev,
          time: res.slots.includes(prev.time) ? prev.time : (res.slots[0] ?? ''),
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setAvailableFormSlots([]);
      })
      .finally(() => {
        if (!cancelled) setAvailableFormSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen, editingAppointment, staffBarberId, form.barberId, form.date, form.service, services]);

  const weekColumnCellsByDay = weekAppointmentsByDay.map(({ dateStr: dayDate, appointments: dayApps }) =>
    buildWeekColumnCells(dayApps, agendaTimeSlots, getBlockedSlotsForBarberDate(selectedBarberId, dayDate))
  );

  const openCreateModal = () => {
    setEditingAppointment(null);
    setLinkedClientId(null);
    setNewClientEmail('');
    const defaultBarber = staffBarberId ?? barbers[0]?.id ?? '';
    setForm({
      name: '',
      phone: '',
      service: services[0]?.id ?? '',
      barberId: defaultBarber,
      date: dateStr,
      time: agendaTimeSlots[0] ?? '10:00',
      servicePaymentSplits: [],
    });
    setError('');
    setModalOpen(true);
  };

  /** Nuevo turno en fecha/hora concretas (clic en hueco libre del calendario). */
  const openCreateModalForSlot = (slotDateStr: string, slotTime: string, explicitBarberId?: string) => {
    setEditingAppointment(null);
    setLinkedClientId(null);
    setNewClientEmail('');
    const defaultBarber =
      staffBarberId ?? explicitBarberId ?? selectedBarberId ?? barbers[0]?.id ?? '';
    setForm({
      name: '',
      phone: '',
      service: services[0]?.id ?? '',
      barberId: defaultBarber,
      date: slotDateStr,
      time: slotTime,
      servicePaymentSplits: [],
    });
    setError('');
    setModalOpen(true);
  };

  const openEditModal = (app: Appointment) => {
    setEditingAppointment(app);
    setLinkedClientId(null);
    setNewClientEmail('');
    const barberId = app.barberId ?? barbers.find((b) => b.name === app.barber)?.id ?? '';
    setForm({
      name: app.name,
      phone: app.phone,
      service: services.find((s) => s.name === app.service)?.id ?? app.service,
      barberId,
      date: app.date,
      time: app.time,
      servicePaymentSplits: initialSplitsFromAppointment(app, services, shopDepositPercent),
    });
    setError('');
    setModalOpen(true);
  };

  const patchAppointmentInState = useCallback((updated: Appointment) => {
    setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

  const renderPaymentSplitsTrigger = (app: Appointment, compact?: boolean) => {
    if (app.status !== 'scheduled') return null;
    const local = appointmentLocalPendingArs(app, services, shopDepositPercent);
    const label = formatServicePaymentSplits(
      app.servicePaymentSplits,
      app.servicePaymentMethod,
      local
    );
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPaymentSplitsModalApp(app);
        }}
        className={
          compact
            ? 'mt-1.5 w-full max-w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-left text-[10px] font-semibold text-zinc-800 hover:border-[#e5c185] hover:bg-amber-50/80 truncate'
            : 'w-full max-w-[11rem] rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-left text-[11px] font-semibold text-zinc-800 hover:border-[#e5c185] hover:bg-amber-50/80'
        }
        title="Registrar cobros (varios métodos)"
      >
        <span className="inline-flex items-center gap-1 truncate">
          <Banknote size={compact ? 12 : 14} className="shrink-0 text-[#b39055]" />
          <span className="truncate">{label}</span>
        </span>
      </button>
    );
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingAppointment(null);
    setLinkedClientId(null);
    setNewClientEmail('');
    setError('');
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const serviceName = services.find((s) => s.id === form.service)?.name ?? form.service;
    const effectiveBarberId = staffBarberId ?? form.barberId;
    const barber = barbers.find((b) => b.id === effectiveBarberId);
    try {
      if (editingAppointment) {
        const updated = await api.updateAppointment(editingAppointment.id, {
          name: form.name,
          phone: form.phone,
          service: serviceName,
          serviceId: form.service,
          barberId: effectiveBarberId,
          date: form.date,
          time: form.time,
          servicePaymentSplits: cleanServicePaymentSplits(form.servicePaymentSplits),
        });
        patchAppointmentInState(updated);
      } else {
        let userId: number | undefined;
        let nameForApp = form.name.trim();
        const phoneForApp = form.phone.trim();

        if (!nameForApp) {
          setError('El nombre es obligatorio.');
          setSaving(false);
          return;
        }
        if (!isAdmin && !phoneForApp) {
          setError('El teléfono es obligatorio.');
          setSaving(false);
          return;
        }

        if (isAdmin && !editingAppointment) {
          if (linkedClientId != null) {
            const c = adminClients.find((x) => x.id === linkedClientId);
            if (c && c.name.trim().toLowerCase() === nameForApp.toLowerCase()) {
              userId = c.id;
              nameForApp = c.name;
            }
          }
          if (userId == null) {
            const email = newClientEmail.trim().toLowerCase();
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
              setError('Si completás el email, tiene que ser válido.');
              setSaving(false);
              return;
            }
            try {
              const { client } = await api.createAdminClient({
                name: nameForApp,
                ...(phoneForApp ? { phone: phoneForApp } : {}),
                ...(email ? { email } : {}),
                points: 0,
              });
              userId = client.id;
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'No se pudo crear el cliente');
              setSaving(false);
              return;
            }
          }
        }

        await api.createAppointment({
          name: nameForApp,
          phone: phoneForApp,
          service: serviceName,
          serviceId: form.service,
          barberId: effectiveBarberId,
          barber: barber?.name,
          date: form.date,
          time: form.time,
          ...(userId != null ? { userId } : {}),
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
    const ok = await confirm({
      title: 'Eliminar cita',
      message: '¿Eliminar esta cita del calendario?',
      variant: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await api.deleteAppointment(id);
      loadData();
    } catch {
      setError('Error al eliminar');
    }
  };

  const openAfipInvoiceModal = useCallback(
    (app: Appointment) => {
      setAfipInvoiceApp(app);
      if (shopProducts.length === 0) void loadShopProductsPanel();
    },
    [shopProducts.length, loadShopProductsPanel]
  );

  const handleAfipInvoiceSuccess = useCallback(() => {
    void loadData();
    if (view === 'facturacion') {
      void api.getAppointments().then(setBillingAppointments).catch(() => {});
    }
  }, [loadData, view]);

  const handleBulkAfipInvoice = useCallback(
    async (appointmentIds: string[]) => {
      const ids = [...new Set(appointmentIds.map((id) => String(id).trim()).filter(Boolean))];
      if (ids.length === 0) return;
      setAfipInvoiceBusy(true);
      let ok = 0;
      let failed = 0;
      for (const id of ids) {
        try {
          await api.createAfipInvoice(id);
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      setAfipInvoiceBusy(false);
      void loadData();
      if (view === 'facturacion') {
        void api.getAppointments().then(setBillingAppointments).catch(() => {});
      }
      if (ok > 0 && failed === 0) {
        showToast(`Facturación masiva completada: ${ok} turno(s) facturado(s).`, 'ok');
      } else if (ok > 0 && failed > 0) {
        showToast(`Facturación masiva parcial: ${ok} ok, ${failed} con error.`, 'err');
      } else {
        showToast('No se pudo facturar ninguno de los turnos seleccionados.', 'err');
      }
    },
    [loadData, showToast, view]
  );

  const openCreateServiceModal = () => {
    setEditingService(null);
    setServiceForm({ name: '', price: '', duration: 30, desc: '', emoji: '✂️', pointsReward: '0' });
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
      pointsReward: String(s.pointsReward ?? 0),
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
      const pr = parseInt(serviceForm.pointsReward, 10);
      const pointsReward = Number.isFinite(pr) && pr >= 0 ? pr : 0;
      if (editingService) {
        await api.updateService(editingService.id, {
          name: serviceForm.name,
          price: serviceForm.price,
          duration: Number(serviceForm.duration),
          desc: serviceForm.desc,
          emoji: serviceForm.emoji || undefined,
          pointsReward,
        });
      } else {
        await api.createService({
          name: serviceForm.name,
          price: serviceForm.price,
          duration: Number(serviceForm.duration),
          desc: serviceForm.desc,
          emoji: serviceForm.emoji || undefined,
          pointsReward,
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

  const handleIconFileUpload = (file: File | null) => {
    if (!file) return;
    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    if (!isSvg) {
      setServiceError('Solo se permiten archivos SVG para el icono.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setServiceForm((f) => ({ ...f, emoji: reader.result as string }));
        setServiceError('');
      }
    };
    reader.onerror = () => {
      setServiceError('No se pudo leer el archivo SVG.');
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteService = async (id: string) => {
    const ok = await confirm({
      title: 'Eliminar servicio',
      message: '¿Eliminar este servicio? Esta acción no se puede deshacer.',
      variant: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await api.deleteService(id);
      loadData();
    } catch {
      setServiceError('Error al eliminar');
    }
  };

  const persistServiceOrder = async (next: Service[], before: Service[]) => {
    if (sortingServices) return;
    setServices(next);
    setSortingServices(true);
    setServiceError('');
    try {
      const ordered = await api.reorderServices(next.map((s) => s.id));
      setServices(ordered);
      showToast('Orden de servicios actualizado');
    } catch (err) {
      setServices(before);
      const msg = err instanceof Error ? err.message : 'No se pudo reordenar';
      setServiceError(msg);
      showToast(msg, 'err');
    } finally {
      setSortingServices(false);
    }
  };

  const handleServiceDragStart = (e: React.DragEvent<HTMLTableRowElement>, serviceId: string) => {
    if (sortingServices) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', serviceId);
    setDragServiceId(serviceId);
    setDragOverServiceId(serviceId);
  };

  const handleServiceDragOver = (e: React.DragEvent<HTMLTableRowElement>, serviceId: string) => {
    e.preventDefault();
    if (!dragServiceId || dragServiceId === serviceId) return;
    setDragOverServiceId(serviceId);
  };

  const handleServiceDrop = async (targetId: string) => {
    if (!dragServiceId || dragServiceId === targetId || sortingServices) return;
    const before = [...services];
    const fromIndex = before.findIndex((s) => s.id === dragServiceId);
    const toIndex = before.findIndex((s) => s.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...before];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setDragServiceId(null);
    setDragOverServiceId(null);
    await persistServiceOrder(next, before);
  };

  const handleServiceDragEnd = () => {
    setDragServiceId(null);
    setDragOverServiceId(null);
  };

  const barberProfileIncomeShare = isStaffBarber ? BARBER_ESTIMATED_SHARE : 1;
  const totalIncome = dayAppointments.reduce((acc, curr) => {
    const serviceAmount = resolveAppointmentServiceAmountArs(curr, services) ?? 0;
    return acc + serviceAmount * barberProfileIncomeShare;
  }, 0);
  const barberStats = useMemo(() => {
    if (!isAdmin) return [];
    return barbers
      .map((b) => {
        const apps = dayAppointments.filter((a) => a.barberId === b.id || a.barber === b.name);
        const gross = apps.reduce((acc, curr) => acc + (resolveAppointmentServiceAmountArs(curr, services) ?? 0), 0);
        const estimatedIncome = Math.round(gross * BARBER_ESTIMATED_SHARE);
        return {
          barber: b,
          appointments: apps.length,
          gross,
          estimatedIncome,
        };
      })
      .sort((a, b) => b.estimatedIncome - a.estimatedIncome || b.appointments - a.appointments);
  }, [isAdmin, barbers, dayAppointments, services]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const open = (location.state as { openView?: typeof view } | null)?.openView;
    if (!open) return;
    setView(open);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  const handlePanelNavigate = useCallback((panel: DashboardPanelId) => {
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
    setView(panel);
  }, [navigate]);

  const toggleShopDay = (day: number) => {
    setShopDays((prev) => {
      const next = prev.includes(day) ? prev.filter((x) => x !== day) : [...prev, day].sort((a, b) => a - b);
      return next.length === 0 ? prev : next;
    });
  };

  const handleDayHoursChange = (day: number, key: 'openTime' | 'closeTime', value: string) => {
    setShopWeekdayHours((prev) => {
      const current = prev[day] ?? { openTime: '10:00', closeTime: shopCloseTime };
      return { ...prev, [day]: { ...current, [key]: value } };
    });
  };

  const handleAddClosedDate = () => {
    const date = closedDateInput.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setShopError('Ingresá una fecha válida para feriado/cierre.');
      return;
    }
    setShopError('');
    setShopClosedDates((prev) => {
      if (prev.includes(date)) return prev;
      return [...prev, date].sort((a, b) => a.localeCompare(b));
    });
    setClosedDateInput('');
  };

  const handleRemoveClosedDate = (date: string) => {
    setShopClosedDates((prev) => prev.filter((d) => d !== date));
  };

  const handleSaveShopSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (shopDays.length === 0) {
      setShopError('Elegí al menos un día abierto.');
      return;
    }
    setShopSaving(true);
    setShopError('');
    try {
      const updated = await api.updateShopSettings({
        cutoffHours: shopCutoff,
        openWeekdays: shopDays,
        depositPercent: shopDepositPercent,
        closeTime: shopCloseTime,
        weekdayHours: shopWeekdayHours,
        closedDates: shopClosedDates,
        whatsappMessageTemplate: shopWhatsappMessageTemplate.trim() === '' ? null : shopWhatsappMessageTemplate.trim(),
      });
      setShopWhatsappMessageTemplate(updated.whatsappMessageTemplate ?? '');
      showToast('Configuración guardada correctamente');
    } catch (err) {
      setShopError(err instanceof Error ? err.message : 'Error al guardar');
      showToast(err instanceof Error ? err.message : 'Error al guardar', 'err');
    } finally {
      setShopSaving(false);
    }
  };

  const viewHeading =
    view === 'agenda'
      ? {
          title: 'Agenda de Turnos',
          subtitle: isStaffBarber
            ? 'Solo tus turnos y tu calendario.'
            : 'Calendario por peluquero y gestión de reservas.',
        }
      : view === 'servicios'
        ? { title: 'Servicios', subtitle: 'Precios, duración e iconos mostrados en la web.' }
        : view === 'horarios'
          ? {
              title: 'Horarios y disponibilidad',
              subtitle: isStaffBarber
                ? 'Tus francos y bloqueos (solo afectan tu agenda).'
                : 'Francos semanales y bloqueos por barbero.',
            }
          : view === 'puntos'
            ? {
                title: 'Programa de puntos',
                subtitle:
                  'Puntos por servicio y por producto. Los catálogos se editan en Servicios y en Productos.',
              }
            : view === 'productos'
              ? {
                  title: 'Productos',
                  subtitle: 'Alta y edición del catálogo de venta (nombre y precio). Los puntos se asignan en Puntos.',
                }
              : view === 'facturacion'
                ? {
                    title: 'Facturación',
                    subtitle: 'Facturas electrónicas AFIP por turno; al emitir podés sumar productos de venta.',
                  }
                : view === 'configuracion'
              ? {
                  title: 'Configuración del local',
                  subtitle: 'Plazo de gestión, seña online, días abiertos y comisiones por barbero.',
                }
              : { title: 'Equipo', subtitle: 'Invitaciones para el panel (empleados).' };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans flex">
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-[200] max-w-[min(100vw-2rem,22rem)] pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <div
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${
              toast.kind === 'ok'
                ? 'border-zinc-800 bg-zinc-950 text-white'
                : 'border-red-800 bg-red-950 text-red-50'
            }`}
          >
            {toast.kind === 'ok' ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden />
            )}
            <p className="text-sm font-medium leading-snug">{toast.message}</p>
          </div>
        </div>
      )}
      <DashboardPanelShell activePanel={view as DashboardPanelId} onNavigate={handlePanelNavigate}>
        {profile?.role === 'staff' && !staffBarberId && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Tu cuenta de empleado no está vinculada a un barbero. Pedile al administrador que te envíe una invitación
            desde Equipo eligiendo tu nombre en la agenda.
          </div>
        )}
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-black tracking-tight sm:text-3xl">{viewHeading.title}</h2>
            <p className="mt-1 text-sm text-zinc-500 sm:text-base">{viewHeading.subtitle}</p>
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
              <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
                <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Ir a</span>
                <input
                  type="date"
                  value={format(selectedDate, 'yyyy-MM-dd')}
                  onChange={(e) => handleJumpToDate(e.target.value)}
                  className="rounded-lg border border-zinc-200 px-2 py-1 text-sm text-zinc-800 outline-none focus:border-[#b39055]"
                />
              </label>

              {isStaffBarber ? (
                <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-bold text-white w-full sm:w-auto">
                  {barbers[0]?.name ?? 'Barbero'}
                </div>
              ) : (
                <select
                  value={selectedBarberId}
                  onChange={(e) => setSelectedBarberId(e.target.value as 'all' | string)}
                  className="bg-white border border-zinc-200 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 font-medium text-zinc-800 shadow-sm text-sm w-full sm:w-auto min-w-0"
                >
                  <option value="all">Todos los barberos</option>
                  {barbers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}

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
          {view === 'horarios' && (
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <label className="text-sm font-bold text-zinc-600 sr-only sm:not-sr-only sm:inline">Barbero</label>
              {isStaffBarber ? (
                <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-bold text-white min-w-[180px]">
                  {barbers[0]?.name ?? '—'}
                </div>
              ) : (
                <select
                  value={scheduleBarberId}
                  onChange={(e) => setScheduleBarberId(e.target.value)}
                  className="bg-white border border-zinc-200 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 font-medium text-zinc-800 shadow-sm text-sm min-w-[180px]"
                >
                  {barbers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
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
        {!isSingleBarberDayView && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 max-w-2xl">
            <div className="bg-white border border-zinc-200 p-5 sm:p-6 rounded-2xl shadow-sm relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-900 rounded-l-2xl" aria-hidden />
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 pl-2">Turnos del día</p>
              <p className="text-3xl sm:text-4xl font-black text-zinc-900 tabular-nums pl-2">{dayAppointments.length}</p>
            </div>
            <div className="bg-white border border-zinc-200 p-5 sm:p-6 rounded-2xl shadow-sm relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-l-2xl" aria-hidden />
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 pl-2">Ingresos est.</p>
              <p className="text-3xl sm:text-4xl font-black text-emerald-600 tabular-nums pl-2">
                ${totalIncome.toLocaleString('es-AR')}
              </p>
            </div>
          </div>
        )}
        {isAdmin && !isSingleBarberDayView && barberStats.length > 0 && (
          <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-black text-zinc-900">Estadísticas por barbero</h3>
              <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Ingreso estimado: 50% del servicio
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {barberStats.map((row) => (
                <article key={row.barber.id} className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5">
                  <p className="font-bold text-zinc-900 truncate">{row.barber.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {row.appointments} turno{row.appointments === 1 ? '' : 's'}
                  </p>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Total servicios</p>
                      <p className="text-sm font-semibold text-zinc-700">${row.gross.toLocaleString('es-AR')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Ingreso est.</p>
                      <p className="text-lg font-black text-emerald-700">${row.estimatedIncome.toLocaleString('es-AR')}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {isSingleBarberDayView && barbers[0] && (
          <div className="mb-8 rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white shadow-xl overflow-hidden">
            <div className="p-6 sm:p-8">
              <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
                <div className="flex items-center gap-5 min-w-0">
                  <div className="relative shrink-0">
                    <img
                      src={barbers[0].photo}
                      alt={barbers[0].name}
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover ring-2 ring-[#e5c185]/40 shadow-lg"
                      referrerPolicy="no-referrer"
                    />
                    {isDayToday && (
                      <span className="absolute -bottom-1 -right-1 rounded-lg bg-[#e5c185] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-zinc-950 shadow">
                        Hoy
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[#e5c185] text-[11px] font-bold uppercase tracking-[0.2em] mb-1">
                      {isStaffBarber ? 'Tu agenda' : 'Vista del día'}
                    </p>
                    <h3 className="text-2xl sm:text-3xl font-black tracking-tight truncate">{barbers[0].name}</h3>
                    <p className="text-zinc-400 mt-1.5 text-sm sm:text-base capitalize">
                      {format(selectedDate, "EEEE d 'de' MMMM yyyy", { locale: es })}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-6 sm:gap-10 lg:ml-auto">
                  <div>
                    <p className="text-zinc-500 text-[10px] sm:text-xs font-bold uppercase tracking-wider">Turnos</p>
                    <p className="text-3xl sm:text-4xl font-black tabular-nums text-white mt-0.5">{dayAppointments.length}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-[10px] sm:text-xs font-bold uppercase tracking-wider">Ingresos est.</p>
                    <p className="text-3xl sm:text-4xl font-black tabular-nums text-emerald-400 mt-0.5">
                      ${totalIncome.toLocaleString('es-AR')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Vista semana: calendario del barbero seleccionado */}
        {isWeekView && selectedBarber && (
          <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden mb-8">
            <div className="bg-gradient-to-r from-zinc-50 to-amber-50/30">
              <div className="px-6 pt-4 pb-0 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img src={selectedBarber.photo} alt={selectedBarber.name} className="w-12 h-12 rounded-full object-cover border-2 border-[#e5c185] shadow-md" referrerPolicy="no-referrer" />
                  <div>
                    <h3 className="font-black text-lg text-zinc-900 tracking-tight">Calendario de la semana</h3>
                    <p className="text-[#b39055] font-bold uppercase tracking-wider text-xs mt-0.5">{selectedBarber.name}</p>
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
                    {agendaTimeSlots.map((slot, slotIndex) => (
                      <tr key={slot} className="border-b border-zinc-100 hover:bg-zinc-50/70 transition-colors">
                        <td className="py-2 px-4 font-mono text-sm font-semibold text-zinc-600 sticky left-0 bg-white z-10 border-r border-zinc-100 whitespace-nowrap">
                          {slot}
                        </td>
                        {weekAppointmentsByDay.map(({ dateStr }, dayIdx) => {
                          const col = weekColumnCellsByDay[dayIdx][slotIndex];
                          if (col === 'skip') {
                            return <React.Fragment key={dateStr} />;
                          }
                          if (col.kind === 'app') {
                            const app = col.app;
                            const dm = app.durationMinutes ?? 30;
                            const endClock = addMinutesToClock(normalizeAppointmentTime(app.time) ?? slot, dm);
                            return (
                              <td
                                key={dateStr}
                                rowSpan={col.rowspan}
                                className="py-2 px-2 align-top border-l border-zinc-100"
                              >
                                <div
                                  className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-sm shadow-sm hover:shadow transition-shadow flex flex-col"
                                  style={{ minHeight: `${col.rowspan * TIMELINE_ROW_UNIT_REM}rem` }}
                                >
                                  <p className="font-bold text-zinc-900 truncate" title={app.name}>
                                    {app.name}
                                  </p>
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide mt-1 ${getAppointmentPaymentBadge(app).className}`}
                                  >
                                    {getAppointmentPaymentBadge(app).label}
                                  </span>
                                  {renderPaymentSplitsTrigger(app, true)}
                                  <p className="text-zinc-500 text-[10px] mt-0.5 tabular-nums">
                                    {normalizeAppointmentTime(app.time)} – {endClock} · {dm} min
                                  </p>
                                  <p className="text-zinc-600 text-xs truncate mt-0.5">{app.service}</p>
                                  <div className="flex gap-1 mt-auto pt-2">
                                    {appointmentNeedsManualContact(app) && (() => {
                                      const waUrl = buildAppointmentWhatsappUrl(app, shopWhatsappMessageTemplate);
                                      if (!waUrl) return null;
                                      return (
                                        <a
                                          href={waUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                                          title="Enviar WhatsApp"
                                        >
                                          <MessageCircle size={14} />
                                        </a>
                                      );
                                    })()}
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
                              </td>
                            );
                          }
                          if (col.kind === 'blocked') {
                            return (
                              <td key={dateStr} className="py-2 px-2 align-top border-l border-zinc-100">
                                <div
                                  className="w-full rounded-lg border border-red-200 bg-red-50/80"
                                  style={{ minHeight: `${TIMELINE_ROW_UNIT_REM}rem` }}
                                  title={`Bloqueado · ${format(parseISO(dateStr + 'T12:00:00'), 'EEE d MMM', { locale: es })} ${slot}`}
                                >
                                  <span className="flex h-full min-h-[2.5rem] w-full items-center justify-center px-1 text-[10px] font-bold uppercase tracking-wide text-red-600">
                                    Bloqueado
                                  </span>
                                </div>
                              </td>
                            );
                          }
                          return (
                            <td key={dateStr} className="py-2 px-2 align-top border-l border-zinc-100">
                              <button
                                type="button"
                                onClick={() => openCreateModalForSlot(dateStr, slot, selectedBarberId)}
                                className="group w-full rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 text-left transition-colors hover:border-[#e5c185] hover:bg-amber-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c185]/50"
                                style={{ minHeight: `${TIMELINE_ROW_UNIT_REM}rem` }}
                                title={`Nuevo turno · ${format(parseISO(dateStr + 'T12:00:00'), 'EEE d MMM', { locale: es })} ${slot}`}
                              >
                                <span className="flex h-full min-h-[2.5rem] w-full items-center justify-center gap-1 px-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400 group-hover:text-[#b39055]">
                                  <Plus size={14} strokeWidth={2.5} className="opacity-70" aria-hidden />
                                  <span className="hidden sm:inline">Turno</span>
                                </span>
                              </button>
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

        {/* Vista día: timeline (un barbero) o grilla (varios) */}
        {!isWeekView && (
          <div className="mb-8">
            {loading ? (
              <div className="py-16 text-center text-zinc-400 rounded-2xl border border-zinc-200 bg-white">
                Cargando agenda…
              </div>
            ) : isSingleBarberDayView && appointmentsByBarber[0] ? (
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between gap-4 mb-4 px-1">
                  <h3 className="font-bold text-lg text-zinc-900">Horarios del día</h3>
                  <span className="text-xs text-zinc-500 hidden sm:inline">Deslizá si hay muchos turnos</span>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                  <div className="max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain">
                    <ul className="divide-y divide-zinc-100">
                      {buildDayTimelineRows(
                        appointmentsByBarber[0].appointments,
                        agendaTimeSlots,
                        getBlockedSlotsForBarberDate(appointmentsByBarber[0]?.barber.id, dateStr)
                      ).map((row) => {
                        if (row.kind === 'free') {
                          const bid = appointmentsByBarber[0]?.barber.id;
                          return (
                            <li key={row.slot} className="flex gap-3 sm:gap-5 p-3 sm:p-4 bg-zinc-50/30 min-h-[3.25rem]">
                              <div className="w-16 sm:w-20 shrink-0 text-right pt-0.5">
                                <span className="font-mono text-sm font-bold text-zinc-900 tabular-nums">
                                  {row.slot}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0 border-l-2 border-zinc-200 pl-4 sm:pl-5 -ml-px">
                                <button
                                  type="button"
                                  onClick={() => openCreateModalForSlot(dateStr, row.slot, bid)}
                                  className="flex w-full items-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-white/60 px-3 py-2.5 text-left text-sm text-zinc-500 transition-colors hover:border-[#e5c185] hover:bg-amber-50/50 hover:text-[#b39055] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c185]/50"
                                  title={`Nuevo turno a las ${row.slot}`}
                                >
                                  <Plus size={16} className="shrink-0 opacity-60" aria-hidden />
                                  <span className="font-semibold">Libre — clic para agendar</span>
                                </button>
                              </div>
                            </li>
                          );
                        }
                        if (row.kind === 'blocked') {
                          return (
                            <li key={`blocked-${row.slot}`} className="flex gap-3 sm:gap-5 p-3 sm:p-4 bg-red-50/60 min-h-[3.25rem]">
                              <div className="w-16 sm:w-20 shrink-0 text-right pt-0.5">
                                <span className="font-mono text-sm font-bold text-red-700 tabular-nums">{row.slot}</span>
                              </div>
                              <div className="flex-1 min-w-0 border-l-2 border-red-200 pl-4 sm:pl-5 -ml-px">
                                <div className="flex w-full items-center gap-2 rounded-xl border border-red-200 bg-red-100/70 px-3 py-2.5 text-left text-sm text-red-700">
                                  <span className="font-semibold">Bloqueado</span>
                                </div>
                              </div>
                            </li>
                          );
                        }
                        const { app, span, slot } = row;
                        const dm = app.durationMinutes ?? 30;
                        const blockRem = span * TIMELINE_ROW_UNIT_REM;
                        const endClock = addMinutesToClock(slot, dm);
                        return (
                          <li
                            key={`${app.id}-${slot}`}
                            className="flex gap-3 sm:gap-5 p-3 sm:p-4 bg-amber-50/40"
                            style={{ minHeight: `${blockRem}rem` }}
                          >
                            <div className="w-16 sm:w-20 shrink-0 text-right pt-0.5 flex flex-col">
                              <span className="font-mono text-sm font-bold text-zinc-900 tabular-nums">{slot}</span>
                              {span > 1 && (
                                <span className="font-mono text-[11px] text-zinc-500 mt-1 tabular-nums leading-tight">
                                  {endClock}
                                </span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 border-l-2 border-amber-200/60 pl-4 sm:pl-5 -ml-px flex flex-col">
                              <div className="rounded-xl border border-amber-200/80 bg-white p-3 sm:p-4 shadow-sm flex-1 flex flex-col min-h-0">
                                <div className="flex flex-wrap items-start justify-between gap-3 flex-1">
                                  <div className="min-w-0">
                                    <p className="font-bold text-zinc-900 text-base leading-tight">{app.name}</p>
                                    <p className="text-sm text-zinc-600 mt-1">{app.service}</p>
                                    <p className="text-[11px] text-zinc-500 mt-1">
                                      {slot} – {endClock} · {dm} min
                                    </p>
                                    <span
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide mt-2 ${getAppointmentPaymentBadge(app).className}`}
                                    >
                                      {getAppointmentPaymentBadge(app).label}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {appointmentNeedsManualContact(app) && (() => {
                                      const waUrl = buildAppointmentWhatsappUrl(app, shopWhatsappMessageTemplate);
                                      if (!waUrl) return null;
                                      return (
                                        <a
                                          href={waUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="p-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                                          title="Enviar WhatsApp"
                                        >
                                          <MessageCircle size={16} />
                                        </a>
                                      );
                                    })()}
                                    <button
                                      type="button"
                                      onClick={() => openEditModal(app)}
                                      className="p-2 text-zinc-500 hover:text-amber-800 hover:bg-amber-100 rounded-lg transition-colors"
                                      title="Editar"
                                    >
                                      <Pencil size={16} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(app.id)}
                                      className="p-2 text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Eliminar"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-zinc-100 bg-gradient-to-r from-zinc-50 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h3 className="font-black text-lg text-zinc-900">Calendario por peluquero</h3>
                  <p className="text-xs text-zinc-500 capitalize">
                    {format(selectedDate, "EEEE d MMMM", { locale: es })}
                  </p>
                </div>
                <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {appointmentsByBarber.map(({ barber, appointments: barberAppointments }) => (
                    <div
                      key={barber.id}
                      className="border border-zinc-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white"
                    >
                      <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 text-white p-4 flex items-center gap-3">
                        <img
                          src={barber.photo}
                          alt={barber.name}
                          className="w-11 h-11 rounded-xl object-cover ring-2 ring-white/10"
                          referrerPolicy="no-referrer"
                        />
                        <p className="font-bold text-base leading-tight">{barber.name}</p>
                      </div>
                      <div className="p-3 divide-y divide-zinc-100 max-h-[300px] overflow-y-auto">
                        {buildDayTimelineRows(
                          barberAppointments,
                          agendaTimeSlots,
                          getBlockedSlotsForBarberDate(barber.id, dateStr)
                        ).map((row) => {
                          if (row.kind === 'free') {
                            return (
                              <button
                                key={row.slot}
                                type="button"
                                onClick={() => openCreateModalForSlot(dateStr, row.slot, barber.id)}
                                className="flex w-full items-center gap-2 rounded-lg py-2 text-left text-sm min-h-[2.25rem] transition-colors hover:bg-emerald-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c185]/40"
                                title={`Nuevo turno con ${barber.name} · ${row.slot}`}
                              >
                                <span className="w-14 font-mono text-zinc-500 flex-shrink-0 text-xs font-semibold">
                                  {row.slot}
                                </span>
                                <span className="flex flex-1 items-center gap-1.5 border border-dashed border-zinc-200/80 rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:border-[#e5c185] hover:text-[#b39055]">
                                  <Plus size={12} aria-hidden />
                                  Libre
                                </span>
                              </button>
                            );
                          }
                          if (row.kind === 'blocked') {
                            return (
                              <div
                                key={`blocked-${barber.id}-${row.slot}`}
                                className="flex items-center gap-2 rounded-lg py-2 text-left text-sm min-h-[2.25rem] bg-red-50/70"
                                title={`Bloqueado · ${barber.name} · ${row.slot}`}
                              >
                                <span className="w-14 font-mono text-red-700 flex-shrink-0 text-xs font-semibold">
                                  {row.slot}
                                </span>
                                <span className="flex flex-1 items-center gap-1.5 border border-red-200 rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wide text-red-600">
                                  Bloqueado
                                </span>
                              </div>
                            );
                          }
                          const { app, span, slot } = row;
                          const dm = app.durationMinutes ?? 30;
                          const endClock = addMinutesToClock(slot, dm);
                          return (
                            <div
                              key={`${app.id}-${slot}`}
                              className="flex items-stretch gap-2 py-2 text-sm"
                              style={{ minHeight: `${span * 2.5}rem` }}
                            >
                              <span className="w-14 font-mono text-zinc-500 flex-shrink-0 text-xs font-semibold pt-0.5">
                                {slot}
                                {span > 1 ? (
                                  <span className="block text-[10px] text-zinc-400 mt-0.5">{endClock}</span>
                                ) : null}
                              </span>
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-2 border border-amber-200/80 bg-amber-50/50 rounded-lg px-2 py-1.5">
                                <div className="min-w-0">
                                  <span className="font-medium text-zinc-800 truncate block">{app.name}</span>
                                  <span className="text-[10px] text-zinc-500">{dm} min</span>
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide mt-1 ${getAppointmentPaymentBadge(app).className}`}
                                  >
                                    {getAppointmentPaymentBadge(app).label}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {appointmentNeedsManualContact(app) && (() => {
                                    const waUrl = buildAppointmentWhatsappUrl(app, shopWhatsappMessageTemplate);
                                    if (!waUrl) return null;
                                    return (
                                      <a
                                        href={waUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                                        title="Enviar WhatsApp"
                                      >
                                        <MessageCircle size={14} />
                                      </a>
                                    );
                                  })()}
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
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Listado de turnos */}
        <div
          className={`bg-white border rounded-2xl shadow-sm overflow-hidden ${
            isSingleBarberDayView ? 'border-zinc-200/80 border-dashed' : 'border-zinc-200'
          }`}
        >
          <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center gap-3">
            <div>
              <h3 className="font-semibold text-sm sm:text-base text-zinc-800">
                {isSingleBarberDayView ? 'Mismo día · vista lista' : 'Listado de turnos'}
              </h3>
              {isSingleBarberDayView && (
                <p className="text-[11px] text-zinc-500 mt-0.5">Orden cronológico para revisar o anotar</p>
              )}
              {isAdmin && !afipConfigured && (
                <p className="text-[10px] text-amber-800/90 mt-1 max-w-md">
                  Facturación AFIP: <code className="text-[10px] bg-zinc-100 px-1 rounded">AFIP_ACCESS_TOKEN</code>,{' '}
                  <code className="text-[10px] bg-zinc-100 px-1 rounded">AFIP_CUIT</code>; cert/clave opcionales salvo tu CUIT
                  real (<code className="text-[10px] bg-zinc-100 px-1 rounded">AFIP_CERT_PATH</code> +{' '}
                  <code className="text-[10px] bg-zinc-100 px-1 rounded">AFIP_KEY_PATH</code>).
                </p>
              )}
            </div>
            <span className="bg-[#e5c185]/20 text-[#b39055] text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
              {dayAppointments.length} programados
            </span>
          </div>

          {dayAppointments.length === 0 ? (
            <div className="py-12 px-4 text-center text-zinc-400 flex flex-col items-center bg-zinc-50/30">
              <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
                <CalendarIcon size={28} className="text-zinc-300" />
              </div>
              <p className="text-base font-medium text-zinc-600">Día libre</p>
              <p className="mt-1 text-sm">No hay turnos para esta fecha.</p>
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#e5c185] hover:bg-[#d4b074] text-zinc-950 text-sm font-semibold rounded-lg transition-colors"
              >
                <Plus size={16} />
                Crear cita
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {dayAppointments.map((app) => {
                const dm = app.durationMinutes ?? 30;
                const endClock = addMinutesToClock(app.time, dm);
                const badge = getAppointmentPaymentBadge(app);
                const barberInfo = resolveBarberForApp(app);
                const phoneDigits = normalizePhoneDigits(app.phone ?? '');
                const phoneHref = phoneDigits ? `https://wa.me/549${phoneDigits}` : null;
                const waUrl = appointmentNeedsManualContact(app) ? buildAppointmentWhatsappUrl(app, shopWhatsappMessageTemplate) : null;
                const showAfipBlock = isAdmin && afipConfigured && app.status !== 'cancelled';
                const initials = (app.name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
                return (
                  <li
                    key={app.id}
                    className="relative flex flex-col gap-3 px-3 py-3 sm:px-4 sm:py-3 hover:bg-zinc-50/60 transition-colors sm:flex-row sm:items-center sm:gap-4 group"
                  >
                    {/* Hora */}
                    <div className="flex sm:flex-col items-center justify-center gap-2 sm:gap-0.5 bg-zinc-950 text-white rounded-lg px-3 py-2 sm:min-w-[4.25rem] flex-shrink-0">
                      <span className="font-bold text-base sm:text-[15px] tabular-nums leading-none">{app.time}</span>
                      <span className="hidden sm:block text-[10px] text-zinc-400 tabular-nums mt-1 leading-none">
                        hasta {endClock}
                      </span>
                      <span className="sm:hidden text-xs text-zinc-400 tabular-nums">· {dm} min</span>
                    </div>

                    {/* Cliente + teléfono */}
                    <div className="flex items-center gap-3 min-w-0 sm:w-56 sm:flex-shrink-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#e5c185] to-[#b39055] text-zinc-900 flex items-center justify-center text-xs font-black tracking-tight flex-shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-zinc-900 truncate leading-tight">{app.name}</p>
                        {phoneHref ? (
                          <a
                            href={phoneHref}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-emerald-700 transition-colors truncate max-w-full"
                          >
                            <Phone size={10} className="shrink-0" />
                            <span className="truncate">{app.phone}</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-zinc-400 italic">Sin teléfono</span>
                        )}
                      </div>
                    </div>

                    {/* Servicio */}
                    <div className="min-w-0 sm:flex-1 sm:min-w-[8rem]">
                      <p className="hidden sm:block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">Servicio</p>
                      <p className="text-sm font-medium text-zinc-800 truncate flex items-center gap-1.5">
                        <Scissors size={12} className="text-zinc-400 shrink-0 sm:hidden" />
                        <span className="truncate">{app.service}</span>
                      </p>
                      <p className="text-[11px] text-zinc-500 tabular-nums hidden sm:block">{dm} min</p>
                    </div>

                    {/* Barbero */}
                    <div className="min-w-0 sm:w-36 sm:flex-shrink-0">
                      <p className="hidden sm:block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">Barbero</p>
                      <div className="flex items-center gap-2 min-w-0">
                        {barberInfo?.photo ? (
                          <img
                            src={barberInfo.photo}
                            alt={barberInfo.name}
                            className="w-6 h-6 rounded-full object-cover ring-1 ring-zinc-200 flex-shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-600 flex-shrink-0">
                            {(app.barber ?? '?').slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm font-medium text-zinc-700 truncate">{app.barber ?? '—'}</span>
                      </div>
                    </div>

                    {/* Estado pago + AFIP */}
                    <div className="flex flex-col gap-1.5 sm:w-44 sm:flex-shrink-0">
                      <div className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        {showAfipBlock && app.afipCae && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800"
                            title={`AFIP ${app.afipPtoVta}-${app.afipCbteNro} · CAE ${app.afipCae}${app.afipCaeVto ? ` · vto ${app.afipCaeVto}` : ''}`}
                          >
                            <Receipt size={11} className="shrink-0" />
                            <span className="tabular-nums">#{app.afipCbteNro}</span>
                          </span>
                        )}
                      </div>
                      {renderPaymentSplitsTrigger(app)}
                    </div>

                    {/* Acciones (ancho fijo para mantener alineación entre filas) */}
                    <div className="flex items-center justify-end gap-1 flex-wrap sm:flex-nowrap sm:w-[10.5rem] sm:flex-shrink-0 sm:border-l sm:border-zinc-100 sm:pl-3">
                      {showAfipBlock && !app.afipCae ? (
                        <button
                          type="button"
                          onClick={() => openAfipInvoiceModal(app)}
                          disabled={afipInvoiceBusy && afipInvoiceApp?.id === app.id}
                          title={afipInvoiceBusy && afipInvoiceApp?.id === app.id ? 'Facturando…' : 'Facturar AFIP'}
                          className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                        >
                          <Receipt size={16} />
                        </button>
                      ) : (
                        <span className="hidden sm:inline-block h-9 w-9" aria-hidden="true" />
                      )}
                      {waUrl ? (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={`Enviar WhatsApp a ${app.name}`}
                          className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-emerald-700 hover:bg-emerald-50 transition-colors"
                        >
                          <MessageCircle size={16} />
                        </a>
                      ) : (
                        <span className="hidden sm:inline-block h-9 w-9" aria-hidden="true" />
                      )}
                      <button
                        type="button"
                        onClick={() => openEditModal(app)}
                        title="Editar turno"
                        className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-amber-800 hover:bg-amber-50 transition-colors"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(app.id)}
                        title="Eliminar turno"
                        className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        </>
        )}

        {view === 'servicios' && (
          <div className="bg-white border border-zinc-200 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden min-w-0">
            <div className="p-4 sm:p-6 border-b border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h3 className="font-bold text-base sm:text-lg text-zinc-800">Servicios</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Podés ordenar arrastrando desde las barritas</p>
              </div>
              <span className="text-zinc-500 text-sm">
                {sortingServices ? 'Guardando orden…' : `${services.length} servicios`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/50">
                    <th className="text-center py-3 px-2 text-xs font-bold text-zinc-500 uppercase tracking-wider w-16">
                      Mover
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-zinc-500 uppercase tracking-wider w-14">Icono</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Nombre</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Precio</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Duración</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-zinc-500 uppercase tracking-wider hidden md:table-cell">Descripción</th>
                    <th className="text-right py-3 px-4 text-xs font-bold text-zinc-500 uppercase tracking-wider w-28">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s) => (
                    <tr
                      key={s.id}
                      draggable={!sortingServices}
                      onDragStart={(e) => handleServiceDragStart(e, s.id)}
                      onDragOver={(e) => handleServiceDragOver(e, s.id)}
                      onDrop={() => void handleServiceDrop(s.id)}
                      onDragEnd={handleServiceDragEnd}
                      className={`border-b border-zinc-100 hover:bg-zinc-50/50 ${
                        dragOverServiceId === s.id && dragServiceId !== s.id ? 'bg-amber-50' : ''
                      } ${dragServiceId === s.id ? 'opacity-60' : ''}`}
                    >
                      <td className="py-4 px-2">
                        <div
                          className={`mx-auto w-8 h-8 rounded-md border flex items-center justify-center ${
                            sortingServices
                              ? 'border-zinc-200 text-zinc-300 cursor-not-allowed'
                              : 'border-zinc-300 text-zinc-500 cursor-grab active:cursor-grabbing'
                          }`}
                          title="Arrastrar para reordenar"
                        >
                          <GripVertical size={16} />
                        </div>
                      </td>
                      <td className="py-4 px-4">{(() => {
                        const icon = getServiceIconSource(s.emoji);
                        if (icon.kind === 'svg') {
                          return (
                            <img
                              src={icon.value}
                              alt={s.name}
                              className="w-8 h-8 object-contain"
                              referrerPolicy="no-referrer"
                            />
                          );
                        }
                        if (icon.kind === 'emoji') return <span className="text-2xl">{icon.value}</span>;
                        return <span className="text-zinc-400">—</span>;
                      })()}</td>
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

        {view === 'horarios' && (
          <div className="space-y-6 max-w-4xl">
            {scheduleError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{scheduleError}</div>
            )}
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-black text-lg text-zinc-900 flex items-center gap-2">
                <Ban className="text-[#b39055]" size={22} />
                Francos fijos (semanal)
              </h3>
              <p className="text-sm text-zinc-500 mt-1">
                Días en que el barbero no atiende (se repite cada semana). Afecta la web y la agenda.
              </p>
              {scheduleLoading ? (
                <p className="text-zinc-400 mt-4">Cargando...</p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-4">
                  {WEEKDAY_SHORT.map(({ value, label }) => {
                    const on = francos.some((f) => f.weekday === value);
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!canAccessDashboard || savingSchedule}
                        onClick={() => toggleFranco(value)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                          on
                            ? 'bg-red-100 border-red-300 text-red-900'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-zinc-300'
                        } ${!canAccessDashboard ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {label}
                        {on ? ' · no trabaja' : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-black text-lg text-zinc-900">Bloqueos de horario</h3>
              <p className="text-sm text-zinc-500 mt-1">
                Rangos no disponibles (almuerzo, cierre puntual, etc.): por una fecha o cada semana ese día.
              </p>

              <form onSubmit={handleAddTimeBlock} className="mt-6 space-y-4 border border-zinc-100 rounded-xl p-4 bg-zinc-50/50">
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="blockMode"
                      checked={blockMode === 'once'}
                      onChange={() => setBlockMode('once')}
                      disabled={!canAccessDashboard}
                    />
                    <span className="text-sm font-medium text-zinc-800">Una fecha</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="blockMode"
                      checked={blockMode === 'weekly'}
                      onChange={() => setBlockMode('weekly')}
                      disabled={!canAccessDashboard}
                    />
                    <span className="text-sm font-medium text-zinc-800">Cada semana</span>
                  </label>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {blockMode === 'once' ? (
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Fecha</label>
                      <input
                        type="date"
                        required
                        value={blockDate}
                        onChange={(e) => setBlockDate(e.target.value)}
                        className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                        disabled={!canAccessDashboard}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Día</label>
                      <select
                        value={blockWeekday}
                        onChange={(e) => setBlockWeekday(Number(e.target.value))}
                        className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                        disabled={!canAccessDashboard}
                      >
                        {WEEKDAY_SHORT.map(({ value, label }) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Desde</label>
                      <select
                        value={blockTimeStart}
                        onChange={(e) => setBlockTimeStart(e.target.value)}
                        className="w-full border border-zinc-200 rounded-xl px-3 py-3 text-zinc-900 text-sm"
                        disabled={!canAccessDashboard}
                      >
                        {agendaTimeSlots.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Hasta</label>
                      <select
                        value={blockTimeEnd}
                        onChange={(e) => setBlockTimeEnd(e.target.value)}
                        className="w-full border border-zinc-200 rounded-xl px-3 py-3 text-zinc-900 text-sm"
                        disabled={!canAccessDashboard}
                      >
                        {blockEndTimeOptions.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!canAccessDashboard || savingSchedule}
                  className="px-5 py-2.5 bg-[#e5c185] hover:bg-[#d4b074] text-zinc-950 font-bold rounded-xl disabled:opacity-50"
                >
                  {savingSchedule ? 'Guardando...' : 'Agregar bloqueo'}
                </button>
              </form>

              {timeBlocks.length > 0 && (
                <ul className="mt-6 divide-y divide-zinc-100 border border-zinc-100 rounded-xl overflow-hidden">
                  {timeBlocks.map((b) => (
                    <li
                      key={b.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white text-sm"
                    >
                      <span className="text-zinc-800">
                        {b.blockDate
                          ? `${format(parseISO(b.blockDate), "d MMM yyyy", { locale: es })}`
                          : `Cada ${WEEKDAY_SHORT.find((w) => w.value === b.weekday)?.label ?? '—'}`}
                        {' · '}
                        <span className="font-mono font-bold">
                          {b.timeStart} – {b.timeEnd}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={!canAccessDashboard || savingSchedule}
                        onClick={() => deleteBlock(b.id)}
                        className="text-red-600 hover:text-red-800 font-bold text-xs uppercase tracking-wider disabled:opacity-50"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!scheduleLoading && timeBlocks.length === 0 && (
                <p className="text-zinc-400 text-sm mt-4">No hay bloqueos por hora para este barbero.</p>
              )}
            </div>
          </div>
        )}

        {view === 'puntos' && (profile?.role === 'admin' || profile?.role === 'staff') && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_minmax(280px,380px)] gap-8 lg:gap-10 items-start">
            <div className="space-y-10 min-w-0">
              <PointsProgramPanel
                services={services}
                loading={pointsPanelLoading}
                onRefresh={loadServicePointsPanel}
                showToast={showToast}
              />
              <ProductPointsPanel
                shopProducts={shopProducts}
                loading={shopProductsPanelLoading}
                onRefresh={loadShopProductsPanel}
                showToast={showToast}
              />
            </div>
            <PointsRedemptionPanel
              options={redemptionOptions}
              loading={redemptionOptionsLoading}
              onRefresh={loadRedemptionOptionsPanel}
              showToast={showToast}
            />
          </div>
        )}

        {view === 'productos' && (profile?.role === 'admin' || profile?.role === 'staff') && (
          <ShopProductsPanel
            shopProducts={shopProducts}
            loading={shopProductsPanelLoading}
            onRefresh={loadShopProductsPanel}
            showToast={showToast}
          />
        )}

        {view === 'facturacion' && isAdmin && (
          <BillingPanel
            appointments={billingAppointments}
            services={services}
            barbers={barbers}
            loading={billingLoading}
            afipConfigured={afipConfigured}
            afipEmitterCuit={afipEmitterCuit}
            afipCbteTipo={afipCbteTipo}
            invoicingId={afipInvoiceBusy && afipInvoiceApp ? afipInvoiceApp.id : null}
            bulkInvoicing={afipInvoiceBusy && !afipInvoiceApp}
            onInvoiceClick={openAfipInvoiceModal}
            onBulkInvoice={handleBulkAfipInvoice}
          />
        )}

        {view === 'equipo' && isAdmin && (
          <div className="max-w-2xl space-y-6">
            {teamError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{teamError}</div>
            )}
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-black text-lg text-zinc-900 flex items-center gap-2">
                <UserPlus className="text-[#b39055]" size={22} />
                Invitar empleado
              </h3>
              <p className="text-sm text-zinc-500 mt-2">
                Ingresá el correo de Google del barbero y elegí a qué puesto de la agenda corresponde. En el primer
                acceso con esa cuenta solo verá sus turnos y podrá bloquear sus horarios.
              </p>
              <form onSubmit={handleAddStaffInvite} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                    placeholder="empleado@gmail.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Barbero</label>
                  <select
                    required
                    value={inviteBarberId}
                    onChange={(e) => setInviteBarberId(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                  >
                    <option value="">Seleccioná el barbero</option>
                    {barbers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Nombre (opcional)
                  </label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                    placeholder="Para identificar en la lista"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingInvite}
                  className="px-5 py-2.5 bg-[#e5c185] hover:bg-[#d4b074] text-zinc-950 font-bold rounded-xl disabled:opacity-50"
                >
                  {savingInvite ? 'Guardando...' : 'Agregar invitación'}
                </button>
              </form>
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-zinc-100 bg-zinc-50/50">
                <h4 className="font-bold text-zinc-800">Pendientes de primer acceso</h4>
                <p className="text-xs text-zinc-500 mt-1">{staffInvites.length} invitación(es)</p>
              </div>
              {teamLoading ? (
                <p className="p-6 text-zinc-400">Cargando...</p>
              ) : staffInvites.length === 0 ? (
                <p className="p-6 text-zinc-500 text-sm">No hay invitaciones pendientes.</p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {staffInvites.map((inv) => (
                    <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium text-zinc-900">{inv.email}</p>
                        {inv.name && <p className="text-zinc-500 text-xs">{inv.name}</p>}
                        <p className="text-zinc-600 text-xs mt-1">
                          Agenda:{' '}
                          <span className="font-semibold">
                            {barbers.find((b) => b.id === inv.barberId)?.name ?? inv.barberId ?? '—'}
                          </span>
                        </p>
                        <p className="text-zinc-400 text-xs mt-1">
                          Invitado {format(parseISO(inv.createdAt), "d/MM/yyyy HH:mm", { locale: es })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteStaffInvite(inv.id)}
                        className="text-red-600 hover:text-red-800 font-bold text-xs uppercase tracking-wider"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {view === 'configuracion' && isAdmin && (
          <div className="max-w-3xl space-y-6">
            {shopError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{shopError}</div>
            )}
            <form
              onSubmit={handleSaveShopSettings}
              className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6"
            >
              <div>
                <h3 className="font-black text-lg text-zinc-900">Cancelar y reprogramar (clientes)</h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Con menos de este margen de horas previas al turno, no se podrá cancelar ni reprogramar desde la web; la
                  seña abonada no se reembolsa en ese caso.
                </p>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mt-4 mb-1">
                  Horas mínimas de anticipación
                </label>
                <input
                  type="number"
                  min={0}
                  max={168}
                  value={shopCutoff}
                  onChange={(e) => setShopCutoff(Number(e.target.value))}
                  className="w-32 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                />
              </div>
              <div>
                <h3 className="font-black text-lg text-zinc-900">Seña online</h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Se calcula automáticamente como porcentaje del precio del servicio al iniciar Mercado Pago.
                </p>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mt-4 mb-1">
                  Porcentaje de seña
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={shopDepositPercent}
                    onChange={(e) => setShopDepositPercent(Number(e.target.value))}
                    className="w-32 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                  />
                  <span className="text-zinc-600 text-sm font-medium">%</span>
                </div>
              </div>
              <div>
                <h3 className="font-black text-lg text-zinc-900">Mensaje de WhatsApp</h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Texto que se prellena al tocar «WhatsApp» en la agenda para turnos sin seña pagada. Dejalo vacío para usar el
                  mensaje por defecto.
                </p>
                <p className="text-xs text-zinc-500 mt-2">{WHATSAPP_TEMPLATE_HELP}</p>
                <textarea
                  value={shopWhatsappMessageTemplate}
                  onChange={(e) => setShopWhatsappMessageTemplate(e.target.value)}
                  rows={8}
                  maxLength={8000}
                  spellCheck={false}
                  className="mt-3 w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-900 font-mono leading-relaxed"
                  placeholder={`Hola {nombre}! Te confirmo tu turno…\n\nFecha: {fecha}\nHora: {hora}\nServicio: {servicio}\nBarbero: {barbero}`}
                />
                <p className="text-[11px] text-zinc-400 mt-1">
                  {shopWhatsappMessageTemplate.length} / 8000 caracteres
                </p>
              </div>
              <div>
                <h3 className="font-black text-lg text-zinc-900">Días abiertos</h3>
                <p className="text-sm text-zinc-500 mt-1">Solo los días marcados permiten reservar en la web.</p>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mt-4 mb-1">
                  Cierre general (respaldo)
                </label>
                <input
                  type="time"
                  step={1200}
                  value={shopCloseTime}
                  onChange={(e) => setShopCloseTime(e.target.value)}
                  className="w-40 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                />
                <p className="text-xs text-zinc-500 mt-2">
                  Se usa como respaldo para días sin horario específico.
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  {WEEKDAY_SHORT.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleShopDay(value)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold border ${
                        shopDays.includes(value)
                          ? 'bg-[#e5c185] border-[#e5c185] text-zinc-950'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-5 space-y-2">
                  {WEEKDAY_SHORT.map(({ value, label }) => {
                    const dayHours = shopWeekdayHours[value] ?? { openTime: '10:00', closeTime: shopCloseTime };
                    const disabled = !shopDays.includes(value);
                    return (
                      <div key={`hours-${value}`} className="flex items-center gap-3">
                        <span className="w-12 text-sm font-semibold text-zinc-700">{label}</span>
                        <input
                          type="time"
                          step={1200}
                          value={dayHours.openTime}
                          disabled={disabled}
                          onChange={(e) => handleDayHoursChange(value, 'openTime', e.target.value)}
                          className="w-32 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-400"
                        />
                        <span className="text-zinc-400 text-sm">a</span>
                        <input
                          type="time"
                          step={1200}
                          value={dayHours.closeTime}
                          disabled={disabled}
                          onChange={(e) => handleDayHoursChange(value, 'closeTime', e.target.value)}
                          className="w-32 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-400"
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6">
                  <h4 className="font-black text-base text-zinc-900">Feriados / cierres puntuales</h4>
                  <p className="text-sm text-zinc-500 mt-1">
                    Fechas específicas en las que la barbería no abre (anula la reserva web ese día).
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={closedDateInput}
                      onChange={(e) => setClosedDateInput(e.target.value)}
                      className="w-44 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                    />
                    <button
                      type="button"
                      onClick={handleAddClosedDate}
                      className="px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-800 text-sm font-bold hover:bg-zinc-100"
                    >
                      Agregar fecha cerrada
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {shopClosedDates.map((date) => (
                      <span
                        key={date}
                        className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-900"
                      >
                        {format(parseISO(`${date}T00:00:00`), 'd MMM yyyy', { locale: es })}
                        <button
                          type="button"
                          onClick={() => handleRemoveClosedDate(date)}
                          className="text-red-700 hover:text-red-900"
                          aria-label={`Quitar ${date}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {shopClosedDates.length === 0 && (
                      <span className="text-xs text-zinc-400">No hay fechas cerradas cargadas.</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="submit"
                disabled={shopSaving || shopLoading}
                className="px-5 py-2.5 bg-zinc-900 text-white font-bold rounded-xl disabled:opacity-50"
              >
                {shopSaving ? 'Guardando...' : 'Guardar configuración'}
              </button>
            </form>
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-black text-lg text-zinc-900">Barberos y comisiones</h3>
              <p className="text-sm text-zinc-500 mt-1">
                Podés editar el nombre público y la comisión de referencia de cada barbero.
              </p>
              {shopLoading ? (
                <p className="text-zinc-400 mt-4">Cargando...</p>
              ) : (
                <ul className="mt-4 divide-y divide-zinc-100">
                  {barbers.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="flex items-center gap-2 min-w-[260px]">
                        <input
                          type="text"
                          defaultValue={b.name}
                          key={`${b.id}-${b.name}`}
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (!next || next === b.name) return;
                            void api
                              .updateBarber(b.id, { name: next })
                              .then(() => {
                                loadData();
                                showToast(`Nombre de ${b.name} actualizado`);
                              })
                              .catch((err) =>
                                showToast(err instanceof Error ? err.message : 'No se pudo actualizar el nombre', 'err')
                              );
                          }}
                          className="w-48 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900"
                        />
                        <span className="text-xs text-zinc-500">{b.role}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          defaultValue={b.commissionPercent ?? 0}
                          key={`${b.id}-${String(b.commissionPercent ?? 0)}`}
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!Number.isFinite(v)) return;
                            void api
                              .updateBarber(b.id, { commissionPercent: v })
                              .then(() => {
                                loadData();
                                showToast(`Comisión de ${b.name} guardada`);
                              })
                              .catch(() => showToast('No se pudo guardar la comisión', 'err'));
                          }}
                          className="w-24 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900"
                        />
                        <span className="text-zinc-500 text-sm">%</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DashboardPanelShell>

      {afipInvoiceApp && (
        <AfipInvoiceModal
          appointment={afipInvoiceApp}
          services={services}
          shopProducts={shopProducts}
          showToast={showToast}
          onBusyChange={setAfipInvoiceBusy}
          onClose={() => setAfipInvoiceApp(null)}
          onSuccess={handleAfipInvoiceSuccess}
        />
      )}

      <AppointmentPaymentSplitsModal
        app={paymentSplitsModalApp}
        services={services}
        depositPercent={shopDepositPercent}
        onClose={() => setPaymentSplitsModalApp(null)}
        onSaved={(updated) => {
          patchAppointmentInState(updated);
          showToast('Cobros guardados', 'ok');
        }}
        onError={(msg) => showToast(msg, 'err')}
      />

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
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Nombre</label>
                <div className="relative">
                  <input
                    ref={nameInputRef}
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, name: v }));
                      setLinkedClientId((prev) => {
                        if (prev == null) return null;
                        const c = adminClients.find((x) => x.id === prev);
                        if (!c) return null;
                        if (c.name.trim().toLowerCase() === v.trim().toLowerCase()) return prev;
                        return null;
                      });
                      if (isAdmin && !editingAppointment) {
                        setNameSuggestionsOpen(true);
                      }
                    }}
                    onFocus={() => {
                      if (isAdmin && !editingAppointment) {
                        setNameSuggestionsOpen(true);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setNameSuggestionsOpen(false);
                      } else if (e.key === 'Enter' && nameSuggestionsOpen) {
                        e.preventDefault();
                        setNameSuggestionsOpen(false);
                      }
                    }}
                    onBlur={() => {
                      if (!isAdmin || editingAppointment) return;
                      const t = form.name.trim().toLowerCase();
                      if (!t) return;
                      const matches = adminClients.filter(
                        (c) => c.name.trim().toLowerCase() === t
                      );
                      if (matches.length === 1) {
                        setLinkedClientId(matches[0].id);
                        setForm((f) => ({
                          ...f,
                          name: matches[0].name,
                          phone: adminClientPrimaryPhone(matches[0]) || f.phone,
                        }));
                        setNewClientEmail('');
                      }
                    }}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                    placeholder="Nombre completo"
                    autoComplete="name"
                  />
                  {isAdmin && !editingAppointment && adminClientsLoading && (
                    <p className="mt-1 text-xs text-zinc-400">Cargando clientes…</p>
                  )}
                  {isAdmin &&
                    !editingAppointment &&
                    nameSuggestionsOpen &&
                    linkedClientId == null &&
                    clientNameSuggestions.length > 0 && (
                    <ul
                      ref={nameSuggestionsRef}
                      className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
                      role="listbox"
                    >
                      <li className="flex items-center justify-between px-3 py-1.5 text-[11px] uppercase tracking-wider text-zinc-400 border-b border-zinc-100">
                        <span>Clientes existentes</span>
                        <button
                          type="button"
                          className="text-zinc-400 hover:text-zinc-700 font-bold"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setNameSuggestionsOpen(false)}
                          aria-label="Cerrar sugerencias"
                        >
                          ×
                        </button>
                      </li>
                      {clientNameSuggestions.map((c) => (
                        <li key={c.id} role="option">
                          <button
                            type="button"
                            className="w-full px-4 py-2.5 text-left text-sm text-zinc-900 hover:bg-zinc-50"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setForm((f) => ({
                                ...f,
                                name: c.name,
                                phone: adminClientPrimaryPhone(c) || f.phone,
                              }));
                              setLinkedClientId(c.id);
                              setNewClientEmail('');
                              setNameSuggestionsOpen(false);
                            }}
                          >
                            <span className="font-medium">{c.name}</span>
                            <span className="block text-xs text-zinc-500 truncate">{displayClientEmail(c.email)}</span>
                            <span className="block text-[11px] text-zinc-400 truncate">
                              {(() => {
                                const firstPhone = (c.phones?.[0] ?? c.phone ?? '').trim();
                                return `${firstPhone || 'Sin teléfono'} · ID ${c.id}`;
                              })()}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {isAdmin && !editingAppointment && linkedClientId != null && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Vinculado a ficha:{' '}
                    <span className="font-medium text-zinc-700">
                      {displayClientEmail(adminClients.find((x) => x.id === linkedClientId)?.email ?? '')}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Teléfono{' '}
                  <span className="font-normal text-zinc-400">
                    {isAdmin ? '(opcional)' : '(contacto del turno)'}
                  </span>
                </label>
                <input
                  type="tel"
                  required={!isAdmin}
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                  placeholder="Ej. 11 2345 6789"
                />
              </div>
              {isAdmin && !editingAppointment && (
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Email del cliente <span className="font-normal normal-case text-zinc-400">(opcional)</span>
                  </label>
                  <input
                    type="email"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                    placeholder="Solo para dar de alta un cliente nuevo en el sistema"
                    autoComplete="email"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Si no hay coincidencia por nombre o teléfono, se crea la ficha automáticamente y el turno queda
                    vinculado. El email sirve para que después pueda iniciar sesión con Google usando la misma cuenta;
                    si no lo cargás, la ficha se guarda igual.
                  </p>
                </div>
              )}
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
                  disabled={isStaffBarber}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-600"
                >
                  {barbers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
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
                  {!editingAppointment && availableFormSlotsLoading ? (
                    <option value="" disabled>
                      Cargando horarios…
                    </option>
                  ) : null}
                  {!editingAppointment && !availableFormSlotsLoading
                    ? availableFormSlots.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))
                    : null}
                  {editingAppointment
                    ? agendaTimeSlots.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))
                    : null}
                  {!editingAppointment && !availableFormSlotsLoading && availableFormSlots.length === 0 ? (
                    <option value="" disabled>
                      Sin horarios disponibles
                    </option>
                  ) : null}
                  </select>
                {!editingAppointment && !availableFormSlotsLoading && availableFormSlots.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-700">No hay huecos disponibles para esa fecha/barbero/servicio.</p>
                ) : null}
                </div>
              </div>
              {editingAppointment &&
                editingAppointment.status !== 'cancelled' &&
                editingAppointment.status !== 'pending_payment' && (
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                      Cobros del servicio en local
                    </label>
                    <ServicePaymentSplitsEditor
                      splits={form.servicePaymentSplits}
                      onChange={(servicePaymentSplits) =>
                        setForm((f) => ({ ...f, servicePaymentSplits }))
                      }
                      expectedLocalAmount={appointmentLocalPendingArs(
                        editingAppointment,
                        services,
                        shopDepositPercent
                      )}
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Combiná métodos y montos hasta cubrir el saldo en local. La seña por Mercado Pago no se incluye
                      acá.
                    </p>
                  </div>
                )}
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
                  disabled={saving || (!editingAppointment && (availableFormSlotsLoading || availableFormSlots.length === 0))}
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
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Icono</label>
                <input
                  type="text"
                  value={serviceForm.emoji}
                  onChange={(e) => setServiceForm((f) => ({ ...f, emoji: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-900"
                  placeholder="✂️ o https://tu-cdn/icono.svg"
                />
                <p className="text-xs text-zinc-400 mt-1">Acepta emoji, URL terminada en .svg o data:image/svg+xml</p>
                <div className="mt-3 flex items-center gap-3">
                  <label className="inline-flex items-center px-3 py-2 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-xs font-bold text-zinc-700 cursor-pointer">
                    Subir SVG
                    <input
                      type="file"
                      accept=".svg,image/svg+xml"
                      className="hidden"
                      onChange={(e) => handleIconFileUpload(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {serviceForm.emoji && (
                    <button
                      type="button"
                      onClick={() => setServiceForm((f) => ({ ...f, emoji: '' }))}
                      className="text-xs font-bold text-zinc-500 hover:text-zinc-800"
                    >
                      Limpiar icono
                    </button>
                  )}
                </div>
                {serviceForm.emoji && (
                  <div className="mt-3 p-3 rounded-lg border border-zinc-200 bg-zinc-50 flex items-center gap-3">
                    <span className="text-xs text-zinc-500 font-bold uppercase">Preview</span>
                    {(() => {
                      const icon = getServiceIconSource(serviceForm.emoji);
                      if (icon.kind === 'svg') {
                        return <img src={icon.value} alt="Preview icono" className="w-8 h-8 object-contain" />;
                      }
                      if (icon.kind === 'emoji') return <span className="text-2xl">{icon.value}</span>;
                      return null;
                    })()}
                  </div>
                )}
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
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Puntos de fidelidad (opcional)
                </label>
                <input
                  type="number"
                  min={0}
                  max={999999}
                  value={serviceForm.pointsReward}
                  onChange={(e) => setServiceForm((f) => ({ ...f, pointsReward: e.target.value }))}
                  className="w-full max-w-xs border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                  placeholder="0"
                />
                <p className="mt-1 text-[11px] text-zinc-400">Cuántos puntos suma el cliente al pagar este servicio.</p>
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
