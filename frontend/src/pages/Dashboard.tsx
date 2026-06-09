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
  DatabaseBackup,
  Download,
  ExternalLink,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ConfirmContext';
import DashboardPanelShell, { type DashboardPanelId } from '../components/DashboardPanelShell';
import BarberDayCalendarsGrid from '../components/BarberDayCalendarsGrid';
import PointsProgramPanel from '../components/PointsProgramPanel';
import PointsRedemptionPanel from '../components/PointsRedemptionPanel';
import ShopProductsPanel from '../components/ShopProductsPanel';
import SubscriptionPlansPanel from '../components/SubscriptionPlansPanel';
import PromotionsPanel from '../components/PromotionsPanel';
import ProductPointsPanel from '../components/ProductPointsPanel';
import BillingPanel from '../components/BillingPanel';
import AfipInvoiceModal from '../components/AfipInvoiceModal';
import AppointmentPaymentSplitsModal from '../components/AppointmentPaymentSplitsModal';
import AppointmentPaymentBadge from '../components/AppointmentPaymentBadge';
import ClientProfileLink from '../components/ClientProfileLink';
import ServicePaymentSplitsEditor from '../components/ServicePaymentSplitsEditor';
import { api, ApiError, downloadDatabaseBackup } from '../api';
import { BARBER_COMMISSION_PERCENT, BARBER_PRODUCT_COMMISSION_PERCENT } from '../constants/barberBusiness';
import { DEPOSIT_PERCENT } from '../constants/deposit';
import { canInvoiceAppointmentAfip, getInvoiceBarberScope } from '../utils/barberAfip';
import { formatArs, resolveAppointmentServiceAmountArs, clientAccountBalanceOwedArs } from '../utils/money';
import { displayClientEmail } from '../utils/manualClientEmail';
import { formatMonthYearEs } from '../utils/monotributoPeriod';
import {
  applyWhatsappMessageTemplate,
  WHATSAPP_TEMPLATE_HELP,
  WHATSAPP_TEMPLATE_PLACEHOLDER,
} from '../utils/whatsappAppointmentMessage';
import type {
  Appointment,
  Barber,
  Service,
  BarberFrancoRow,
  BarberTimeBlockRow,
  StaffInviteRow,
  ShopProduct,
  SubscriptionPlan,
  SitePromotion,
  AdminClientWithHistory,
  type PointsRedemptionOption,
  type ServicePaymentSplit,
  type BarberInvoicingUsage,
} from '../api';
import {
  appointmentSplitsTargetArs,
  cleanServicePaymentSplits,
  formatAppointmentPaymentDisplay,
  initialSplitsFromAppointment,
} from '../utils/servicePaymentMethod';
import { formatAppointmentProductsSummary, sumAppointmentProducts } from '../utils/appointmentProducts';
import { appointmentModifyBlockedReason, canUpdateAppointmentPayments } from '../utils/appointmentModifyPermission';
import {
  adminClientMatchesPhoneDigits,
  adminClientPrimaryPhone,
  normalizePhoneDigits,
  resolveClientForNewAppointment,
} from '../utils/adminClientLookup';
import {
  addMinutesToClock,
  appointmentSlotSpan,
  buildDayTimelineRows,
  buildTimeSlotsInRange,
  normalizeAppointmentTime,
  TIMELINE_ROW_UNIT_REM,
  timeToMinutes,
} from '../utils/agendaTimeline';
import {
  appointmentNeedsManualContact,
  buildAppointmentWhatsappUrl,
} from '../utils/appointmentWhatsapp';

function getServiceIconSource(icon?: string): { kind: 'svg' | 'emoji' | 'none'; value: string } {
  const raw = (icon ?? '').trim();
  if (!raw) return { kind: 'none', value: '' };
  const lower = raw.toLowerCase();
  if (lower.endsWith('.svg') || lower.startsWith('data:image/svg+xml')) {
    return { kind: 'svg', value: raw };
  }
  return { kind: 'emoji', value: raw };
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

/** Ingreso estimado del barbero = comisión sobre el servicio. */
const BARBER_ESTIMATED_SHARE = BARBER_COMMISSION_PERCENT / 100;

const WEEKDAY_SHORT: { value: number; label: string }[] = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
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

export default function Dashboard({ agendasOnly = false }: { agendasOnly?: boolean } = {}) {
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
    tipAmount: '',
  });
  const [paymentSplitsModalApp, setPaymentSplitsModalApp] = useState<Appointment | null>(null);
  const [closedDateSet, setClosedDateSet] = useState<Set<string>>(() => new Set());
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
  const [view, setView] = useState<
    | 'agenda'
    | 'servicios'
    | 'horarios'
    | 'equipo'
    | 'puntos'
    | 'productos'
    | 'abonos'
    | 'promociones'
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
    internal: false,
  });
  const [savingService, setSavingService] = useState(false);
  const [sortingServices, setSortingServices] = useState(false);
  const [dragServiceId, setDragServiceId] = useState<string | null>(null);
  const [dragOverServiceId, setDragOverServiceId] = useState<string | null>(null);
  const [serviceError, setServiceError] = useState('');
  const [scheduleBarberId, setScheduleBarberId] = useState('');
  /** Pestaña activa de agenda del día en móvil (varios barberos). */
  const [dayAgendaMobileBarberId, setDayAgendaMobileBarberId] = useState('');
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
  const [shopCloseTime, setShopCloseTime] = useState('20:00');
  const [shopWeekdayHours, setShopWeekdayHours] = useState<Record<number, DayHours>>(DEFAULT_WEEKDAY_HOURS);
  const [shopClosedDates, setShopClosedDates] = useState<string[]>([]);
  const [closedDateInput, setClosedDateInput] = useState('');
  const [shopWhatsappMessageTemplate, setShopWhatsappMessageTemplate] = useState('');
  const [shopLoading, setShopLoading] = useState(false);
  const [shopSaving, setShopSaving] = useState(false);
  const [backupDownloading, setBackupDownloading] = useState(false);
  const [shopError, setShopError] = useState('');
  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'err' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shopProducts, setShopProducts] = useState<ShopProduct[]>([]);
  const [pointsPanelLoading, setPointsPanelLoading] = useState(false);
  const [shopProductsPanelLoading, setShopProductsPanelLoading] = useState(false);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptionPlansLoading, setSubscriptionPlansLoading] = useState(false);
  const [promotions, setPromotions] = useState<SitePromotion[]>([]);
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [redemptionOptions, setRedemptionOptions] = useState<PointsRedemptionOption[]>([]);
  const [redemptionOptionsLoading, setRedemptionOptionsLoading] = useState(false);
  const [afipConfigured, setAfipConfigured] = useState(false);
  const [afipReadyCount, setAfipReadyCount] = useState(0);
  const [afipInvoiceApp, setAfipInvoiceApp] = useState<Appointment | null>(null);
  const [afipInvoiceBusy, setAfipInvoiceBusy] = useState(false);
  const [billingAppointments, setBillingAppointments] = useState<Appointment[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [barberInvoicing, setBarberInvoicing] = useState<BarberInvoicingUsage[]>([]);
  const [barberInvoicingYear, setBarberInvoicingYear] = useState(() => new Date().getFullYear());
  const [barberInvoicingMonth, setBarberInvoicingMonth] = useState(() => new Date().getMonth() + 1);
  const [barberInvoicingLoading, setBarberInvoicingLoading] = useState(false);
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

  const { profile, isAdmin, isSuperAdmin, canAccessDashboard } = useAuth();
  const confirm = useConfirm();
  const staffBarberId = profile?.role === 'staff' ? profile.barberId ?? null : null;
  const isStaffBarber = Boolean(staffBarberId);

  const canStaffManageBarber = useCallback(
    (barberId: string) => !staffBarberId || staffBarberId === barberId,
    [staffBarberId]
  );

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

  const loadAdminClients = useCallback(async () => {
    if (!canAccessDashboard) return;
    setAdminClientsLoading(true);
    try {
      const r = await api.getAdminClientsWithHistory();
      setAdminClients(r.clients);
    } catch {
      setAdminClients([]);
    } finally {
      setAdminClientsLoading(false);
    }
  }, [canAccessDashboard]);

  useEffect(() => {
    void loadAdminClients();
  }, [loadAdminClients]);

  useEffect(() => {
    if (!modalOpen || !canAccessDashboard || editingAppointment) return;
    void loadAdminClients();
  }, [modalOpen, canAccessDashboard, editingAppointment, loadAdminClients]);

  const clientNameSuggestions = useMemo(() => {
    if (!canAccessDashboard || editingAppointment || !modalOpen) return [];
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
  }, [canAccessDashboard, editingAppointment, modalOpen, form.name, form.phone, adminClients]);

  const formMatchedClient = useMemo(() => {
    if (!canAccessDashboard || editingAppointment || !modalOpen) return null;
    return resolveClientForNewAppointment(adminClients, linkedClientId, form.name, form.phone);
  }, [
    canAccessDashboard,
    editingAppointment,
    modalOpen,
    adminClients,
    linkedClientId,
    form.name,
    form.phone,
  ]);

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

  const loadShopProductsPanel = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setShopProductsPanelLoading(true);
    try {
      const p = await api.getShopProducts();
      setShopProducts(p);
    } catch {
      if (!opts?.silent) showToast('No se pudo cargar los productos', 'err');
    } finally {
      if (!opts?.silent) setShopProductsPanelLoading(false);
    }
  }, [showToast]);

  const loadSubscriptionPlansPanel = useCallback(async () => {
    setSubscriptionPlansLoading(true);
    try {
      const r = await api.getSubscriptionPlans();
      setSubscriptionPlans(r.plans);
    } catch {
      showToast('No se pudo cargar los planes de abono', 'err');
    } finally {
      setSubscriptionPlansLoading(false);
    }
  }, [showToast]);

  const loadPromotionsPanel = useCallback(async () => {
    setPromotionsLoading(true);
    try {
      const r = await api.getPromotions();
      setPromotions(r.promotions);
    } catch {
      showToast('No se pudo cargar las promociones', 'err');
    } finally {
      setPromotionsLoading(false);
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
    if (view !== 'abonos') return;
    void loadSubscriptionPlansPanel();
  }, [view, loadSubscriptionPlansPanel]);

  useEffect(() => {
    if (view !== 'promociones') return;
    void loadPromotionsPanel();
  }, [view, loadPromotionsPanel]);

  const loadBarberInvoicing = useCallback(() => {
    setBarberInvoicingLoading(true);
    return api
      .getBarberInvoicingUsage()
      .then((r) => {
        setBarberInvoicing(r.barbers);
        setBarberInvoicingYear(r.year);
        setBarberInvoicingMonth(r.month);
      })
      .catch(() => {
        setBarberInvoicing([]);
      })
      .finally(() => setBarberInvoicingLoading(false));
  }, []);

  useEffect(() => {
    if (view !== 'configuracion' || !isSuperAdmin) return;
    void loadBarberInvoicing();
  }, [view, isSuperAdmin, loadBarberInvoicing]);

  useEffect(() => {
    if (view !== 'facturacion' || !isSuperAdmin) return;
    let cancelled = false;
    setBillingLoading(true);
    void loadBarberInvoicing();
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
  }, [view, isSuperAdmin, showToast, loadBarberInvoicing]);

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
  const weekFromYmd = format(weekStart, 'yyyy-MM-dd');
  const weekToYmd = format(weekEnd, 'yyyy-MM-dd');
  const selectedDayHours = shopWeekdayHours[getIsoWeekday(selectedDate)] ?? { openTime: '10:00', closeTime: shopCloseTime };
  const agendaTimeSlots = useMemo(
    () => buildTimeSlotsInRange(selectedDayHours.openTime, selectedDayHours.closeTime),
    [selectedDayHours.openTime, selectedDayHours.closeTime]
  );
  const formDayHours = useMemo(() => {
    if (!form.date) {
      return selectedDayHours;
    }
    return shopWeekdayHours[getIsoWeekdayFromYmd(form.date)] ?? { openTime: '10:00', closeTime: shopCloseTime };
  }, [form.date, shopWeekdayHours, shopCloseTime, selectedDayHours]);
  const formTimeSlots = useMemo(
    () => buildTimeSlotsInRange(formDayHours.openTime, formDayHours.closeTime),
    [formDayHours.openTime, formDayHours.closeTime]
  );
  const modalTimeSlots = useMemo(() => {
    if (form.time && !formTimeSlots.includes(form.time)) {
      return [...formTimeSlots, form.time].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
    }
    return formTimeSlots;
  }, [formTimeSlots, form.time]);
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
    } catch (e) {
      setAppointments([]);
      setBarbers([]);
      setServices([]);
      if (!opts?.silent) {
        const msg =
          e instanceof ApiError ? e.message : 'No se pudo cargar la agenda.';
        setError(msg);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [dateStr, selectedBarberId, isWeekView, profile?.role, profile?.barberId, notifyBarberForPaidAppointments]);

  useEffect(() => {
    const from = isWeekView ? weekFromYmd : dateStr;
    const to = isWeekView ? weekToYmd : dateStr;
    let cancelled = false;
    api
      .getDailyCashCloses(from, to)
      .then((r) => {
        if (!cancelled) setClosedDateSet(new Set(r.closes.map((c) => c.date)));
      })
      .catch(() => {
        if (!cancelled) setClosedDateSet(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [dateStr, isWeekView, weekFromYmd, weekToYmd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (barbers.length === 0) return;
    setDayAgendaMobileBarberId((prev) =>
      prev && barbers.some((b) => b.id === prev) ? prev : barbers[0].id
    );
  }, [barbers]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void loadData({ silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [profile?.role, view, loadData]);

  useEffect(() => {
    if (!isSuperAdmin) {
      setAfipConfigured(false);
      setAfipReadyCount(0);
      return;
    }
    api
      .getAfipStatus()
      .then((s) => {
        setAfipConfigured(s.configured);
        setAfipReadyCount(s.readyCount ?? 0);
      })
      .catch(() => {
        setAfipConfigured(false);
        setAfipReadyCount(0);
      });
  }, [isSuperAdmin]);

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
    if (!isAdmin && (view === 'servicios' || view === 'equipo' || view === 'configuracion' || view === 'abonos' || view === 'promociones')) {
      setView('agenda');
    }
    if (!isSuperAdmin && view === 'facturacion') {
      setView('agenda');
    }
  }, [isAdmin, isSuperAdmin, view]);

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

  /** Si el turno tiene barberId asignado, manda ese (la columna del nombre puede estar desincronizada). */
  const matchesBarber = (a: Appointment, b: Barber): boolean => {
    if (a.barberId) return a.barberId === b.id;
    return a.barber === b.name;
  };

  const appointmentsByBarber = barbers.map((barber) => ({
    barber,
    appointments: dayAppointments.filter((a) => matchesBarber(a, barber)),
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
    if (!modalOpen || editingAppointment || formTimeSlots.length === 0) return;
    setForm((prev) => ({
      ...prev,
      time: formTimeSlots.includes(prev.time) ? prev.time : (formTimeSlots[0] ?? prev.time),
    }));
  }, [modalOpen, editingAppointment, form.date, formTimeSlots]);

  const weekColumnCellsByDay = weekAppointmentsByDay.map(({ dateStr: dayDate, appointments: dayApps }) =>
    buildWeekColumnCells(dayApps, agendaTimeSlots, getBlockedSlotsForBarberDate(selectedBarberId, dayDate))
  );

  const openCreateModal = () => {
    if (!isSuperAdmin && closedDateSet.has(dateStr)) {
      showToast('Día cerrado: solo super admin puede cargar turnos.', 'error');
      return;
    }
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
      tipAmount: '',
    });
    setError('');
    setModalOpen(true);
  };

  /** Nuevo turno en fecha/hora concretas (clic en hueco libre del calendario). */
  const openCreateModalForSlot = (slotDateStr: string, slotTime: string, explicitBarberId?: string) => {
    if (explicitBarberId && !canStaffManageBarber(explicitBarberId)) {
      showToast('Solo podés cargar turnos en tu propia agenda.', 'err');
      return;
    }
    if (!isSuperAdmin && closedDateSet.has(slotDateStr)) {
      showToast('Día cerrado: solo super admin puede cargar turnos.', 'error');
      return;
    }
    setEditingAppointment(null);
    setLinkedClientId(null);
    setNewClientEmail('');
    const defaultBarber =
      staffBarberId ??
      (explicitBarberId && canStaffManageBarber(explicitBarberId) ? explicitBarberId : undefined) ??
      (selectedBarberId !== 'all' ? selectedBarberId : undefined) ??
      barbers[0]?.id ??
      '';
    setForm({
      name: '',
      phone: '',
      service: services[0]?.id ?? '',
      barberId: defaultBarber,
      date: slotDateStr,
      time: slotTime,
      servicePaymentSplits: [],
      tipAmount: '',
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
      servicePaymentSplits: initialSplitsFromAppointment(
        app,
        services,
        DEPOSIT_PERCENT,
        sumAppointmentProducts(app.products)
      ),
      tipAmount:
        app.tipAmount != null && app.tipAmount > 0
          ? String(app.tipAmount).replace('.', ',')
          : '',
    });
    setError('');
    setModalOpen(true);
  };

  const getAppointmentModifyBlockedReason = useCallback(
    (app: Appointment) =>
      appointmentModifyBlockedReason(app, profile?.id, isSuperAdmin, closedDateSet),
    [profile?.id, isSuperAdmin, closedDateSet]
  );

  const tryOpenEditModal = (app: Appointment) => {
    const reason = getAppointmentModifyBlockedReason(app);
    if (reason) {
      showToast(reason, 'error');
      return;
    }
    openEditModal(app);
  };

  const tryOpenPaymentSplits = (app: Appointment) => {
    if (!canUpdateAppointmentPayments(app)) {
      showToast('Solo se pueden cargar cobros en turnos confirmados.', 'error');
      return;
    }
    setPaymentSplitsModalApp(app);
  };

  const tryDeleteAppointment = async (id: string) => {
    const app = appointments.find((a) => a.id === id);
    if (app) {
      const reason = getAppointmentModifyBlockedReason(app);
      if (reason) {
        showToast(reason, 'error');
        return;
      }
    }
    await handleDelete(id);
  };

  const patchAppointmentInState = useCallback((updated: Appointment) => {
    setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

  const renderPaymentSplitsTrigger = (app: Appointment, compact?: boolean) => {
    if (app.status !== 'scheduled') return null;
    const label = formatAppointmentPaymentDisplay(
      app,
      services,
      DEPOSIT_PERCENT,
      sumAppointmentProducts(app.products)
    );
    const parts =
      label === 'Sin registrar' ? [label] : label.split(' + ').map((p) => p.trim()).filter(Boolean);
    const isUnset = label === 'Sin registrar';
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          tryOpenPaymentSplits(app);
        }}
        disabled={!canUpdateAppointmentPayments(app)}
        className={
          compact
            ? `w-full rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-left hover:border-[#e5c185] hover:bg-amber-50/80 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99] transition-transform`
            : `w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-left hover:border-[#e5c185] hover:bg-amber-50/80 disabled:cursor-not-allowed disabled:opacity-50`
        }
        title={label}
      >
        <span className="flex items-start gap-1.5 min-w-0">
          <Banknote
            size={compact ? 12 : 14}
            className="shrink-0 text-[#b39055] mt-0.5"
            aria-hidden
          />
          <span
            className={`flex flex-wrap gap-1 min-w-0 flex-1 ${
              compact ? 'text-[10px]' : 'text-[11px]'
            } font-semibold leading-snug`}
          >
            {parts.map((part, i) => (
              <span
                key={`${part}-${i}`}
                className={
                  isUnset
                    ? 'text-zinc-500 italic font-medium'
                    : 'inline-block rounded-md bg-zinc-50 border border-zinc-100 px-1.5 py-0.5 text-zinc-800'
                }
              >
                {part}
              </span>
            ))}
          </span>
        </span>
      </button>
    );
  };

  const renderBarberDayAgendaRows = (barber: Barber, barberAppointments: Appointment[]) =>
    buildDayTimelineRows(
      barberAppointments,
      agendaTimeSlots,
      getBlockedSlotsForBarberDate(barber.id, dateStr)
    ).map((row) => {
      const canManage = canStaffManageBarber(barber.id);
      if (row.kind === 'free') {
        if (!canManage) {
          return (
            <div
              key={row.slot}
              className="flex w-full items-center gap-2 rounded-lg py-2.5 text-left text-sm min-h-[2.75rem] opacity-60"
            >
              <span className="w-14 font-mono text-zinc-400 flex-shrink-0 text-xs font-semibold tabular-nums">
                {row.slot}
              </span>
              <span className="flex flex-1 items-center gap-1.5 border border-dashed border-zinc-200/60 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400">
                Libre
              </span>
            </div>
          );
        }
        return (
          <button
            key={row.slot}
            type="button"
            onClick={() => openCreateModalForSlot(dateStr, row.slot, barber.id)}
            className="flex w-full items-center gap-2 rounded-lg py-2.5 text-left text-sm min-h-[2.75rem] transition-colors hover:bg-emerald-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c185]/40"
            title={`Nuevo turno con ${barber.name} · ${row.slot}`}
          >
            <span className="w-14 font-mono text-zinc-500 flex-shrink-0 text-xs font-semibold tabular-nums">
              {row.slot}
            </span>
            <span className="flex flex-1 items-center gap-1.5 border border-dashed border-zinc-200/80 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:border-[#e5c185] hover:text-[#b39055]">
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
            className="flex items-center gap-2 rounded-lg py-2.5 text-left text-sm min-h-[2.75rem] bg-red-50/70"
            title={`Bloqueado · ${barber.name} · ${row.slot}`}
          >
            <span className="w-14 font-mono text-red-700 flex-shrink-0 text-xs font-semibold tabular-nums">
              {row.slot}
            </span>
            <span className="flex flex-1 items-center gap-1.5 border border-red-200 rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-red-600">
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
          className="flex items-stretch gap-2 py-2.5 text-sm"
          style={{ minHeight: `${span * 2.5}rem` }}
        >
          <span className="w-14 font-mono text-zinc-500 flex-shrink-0 text-xs font-semibold pt-0.5 tabular-nums">
            {slot}
            {span > 1 ? (
              <span className="block text-[10px] text-zinc-400 mt-0.5">{endClock}</span>
            ) : null}
          </span>
          <div className="flex-1 min-w-0 flex flex-col gap-2 border border-amber-200/80 bg-amber-50/50 rounded-xl px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <ClientProfileLink
                userId={app.userId}
                name={app.name}
                phone={app.phone}
                adminClients={adminClients}
                className="font-semibold text-zinc-800 truncate block hover:text-[#b39055]"
                stopPropagation
              />
              <span className="text-[10px] text-zinc-500 tabular-nums">{dm} min</span>
              <AppointmentPaymentBadge app={app} className="mt-1" />
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 self-end sm:self-auto">
              {appointmentNeedsManualContact(app) && (() => {
                const waUrl = buildAppointmentWhatsappUrl(app, shopWhatsappMessageTemplate);
                if (!waUrl) return null;
                return (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center h-10 w-10 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                    title="Enviar WhatsApp"
                  >
                    <MessageCircle size={16} />
                  </a>
                );
              })()}
              {canManage ? (
                <>
                  <button
                    type="button"
                    onClick={() => tryOpenEditModal(app)}
                    className="inline-flex items-center justify-center h-10 w-10 text-amber-800 hover:bg-amber-50 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void tryDeleteAppointment(app.id)}
                    className="inline-flex items-center justify-center h-10 w-10 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      );
    });

  const mobileDayAgendaBarber =
    appointmentsByBarber.find(({ barber }) => barber.id === dayAgendaMobileBarberId) ?? appointmentsByBarber[0];

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
        const blocked = getAppointmentModifyBlockedReason(editingAppointment);
        if (blocked) {
          setError(blocked);
          setSaving(false);
          return;
        }
        const tipRaw = form.tipAmount.trim().replace(',', '.');
        let tipAmount = 0;
        if (tipRaw !== '') {
          tipAmount = parseFloat(tipRaw);
          if (!Number.isFinite(tipAmount) || tipAmount < 0) {
            setError('La propina debe ser un número ≥ 0.');
            setSaving(false);
            return;
          }
          tipAmount = Math.round(tipAmount * 100) / 100;
        }
        const updated = await api.updateAppointment(editingAppointment.id, {
          name: form.name,
          phone: form.phone,
          service: serviceName,
          serviceId: form.service,
          barberId: effectiveBarberId,
          date: form.date,
          time: form.time,
          servicePaymentSplits: cleanServicePaymentSplits(form.servicePaymentSplits),
          tipAmount,
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
        if (!isSuperAdmin && closedDateSet.has(form.date)) {
          setError('Día cerrado: solo super admin puede cargar turnos.');
          setSaving(false);
          return;
        }
        if (!isAdmin && !phoneForApp) {
          setError('El teléfono es obligatorio.');
          setSaving(false);
          return;
        }

        if (canAccessDashboard && !editingAppointment) {
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

        const matchedClient = canAccessDashboard
          ? resolveClientForNewAppointment(adminClients, linkedClientId, nameForApp, phoneForApp)
          : null;
        const owedArs = clientAccountBalanceOwedArs(matchedClient?.accountBalanceArs);
        if (owedArs > 0 && matchedClient) {
          const proceed = await confirm({
            title: 'Cliente con deuda',
            message: `${matchedClient.name} debe $${formatArs(owedArs)} en cuenta corriente. ¿Agendar el turno igualmente?`,
            confirmLabel: 'Agendar turno',
          });
          if (!proceed) {
            setSaving(false);
            return;
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al eliminar');
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
      void loadBarberInvoicing();
    }
  }, [loadData, view, loadBarberInvoicing]);

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
        void loadBarberInvoicing();
      }
      if (ok > 0 && failed === 0) {
        showToast(`Facturación masiva completada: ${ok} turno(s) facturado(s).`, 'ok');
      } else if (ok > 0 && failed > 0) {
        showToast(`Facturación masiva parcial: ${ok} ok, ${failed} con error.`, 'err');
      } else {
        showToast('No se pudo facturar ninguno de los turnos seleccionados.', 'err');
      }
    },
    [loadData, showToast, view, loadBarberInvoicing]
  );

  const openCreateServiceModal = () => {
    setEditingService(null);
    setServiceForm({
      name: '',
      price: '',
      duration: 30,
      desc: '',
      emoji: '✂️',
      pointsReward: '0',
      internal: false,
    });
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
      internal: Boolean(s.internal),
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
          internal: serviceForm.internal,
        });
      } else {
        await api.createService({
          name: serviceForm.name,
          price: serviceForm.price,
          duration: Number(serviceForm.duration),
          desc: serviceForm.desc,
          emoji: serviceForm.emoji || undefined,
          pointsReward,
          internal: serviceForm.internal,
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
  const invoiceScopeBarberId = useMemo(
    () => getInvoiceBarberScope(profile, barbers),
    [profile, barbers]
  );
  const invoiceScopeBarberName = useMemo(() => {
    if (!invoiceScopeBarberId) return null;
    return barbers.find((b) => b.id === invoiceScopeBarberId)?.name ?? null;
  }, [invoiceScopeBarberId, barbers]);

  const barberStats = useMemo(() => {
    if (!isSuperAdmin) return [];
    return barbers
      .map((b) => {
        const apps = dayAppointments.filter((a) => matchesBarber(a, b));
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
  }, [isSuperAdmin, barbers, dayAppointments, services]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const open = (location.state as { openView?: typeof view } | null)?.openView;
    if (!open) return;
    setView(open);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (!agendasOnly) return;
    setView('agenda');
    if (profile?.role === 'staff' && profile.barberId) {
      setSelectedBarberId(profile.barberId);
    } else {
      setSelectedBarberId('all');
    }
    const fecha = new URLSearchParams(location.search).get('fecha');
    if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      setSelectedDate(parseISO(`${fecha}T12:00:00`));
    }
  }, [agendasOnly, location.search, profile?.role, profile?.barberId]);

  const openAgendasInNewTab = useCallback(() => {
    const url = `${window.location.origin}/dashboard/agendas?fecha=${dateStr}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [dateStr]);

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
        depositPercent: DEPOSIT_PERCENT,
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
              : view === 'abonos'
                ? {
                    title: 'Abonos',
                    subtitle: 'Planes de abono con cortes incluidos. Se muestran en la web y podés asignarlos manualmente.',
                  }
                : view === 'promociones'
                  ? {
                      title: 'Promociones',
                      subtitle: 'Banners promocionales visibles en el sitio web cuando están activos.',
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
    <div className={`${agendasOnly ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-zinc-50 text-zinc-900 font-sans flex`}>
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
      <DashboardPanelShell activePanel={view as DashboardPanelId} onNavigate={handlePanelNavigate} bare={agendasOnly}>
        {agendasOnly && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3 shrink-0">
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">Agendas del día</h2>
              <p className="text-sm text-zinc-500 capitalize mt-0.5">
                {format(selectedDate, "EEEE d 'de' MMMM yyyy", { locale: es })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-1.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevDay}
                  className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-600"
                  aria-label="Día anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <input
                  type="date"
                  value={format(selectedDate, 'yyyy-MM-dd')}
                  onChange={(e) => handleJumpToDate(e.target.value)}
                  className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm text-zinc-800 outline-none focus:border-[#b39055]"
                />
                <button
                  type="button"
                  onClick={handleNextDay}
                  className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-600"
                  aria-label="Día siguiente"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleThisWeek}
                  className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg text-xs font-bold transition-colors"
                >
                  Hoy
                </button>
              </div>
              <a
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                Panel completo
              </a>
            </div>
          </div>
        )}
        {profile?.role === 'staff' && !staffBarberId && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Tu cuenta de empleado no está vinculada a un barbero. Pedile al administrador que te envíe una invitación
            desde Equipo eligiendo tu nombre en la agenda.
          </div>
        )}
        <div className={agendasOnly ? 'hidden' : 'mb-6 flex flex-col gap-4 sm:mb-8 sm:gap-6 lg:flex-row lg:items-center lg:justify-between'}>
          <div className="min-w-0">
            {!agendasOnly && (
              <>
                <h2 className="truncate text-2xl font-black tracking-tight sm:text-3xl">{viewHeading.title}</h2>
                <p className="mt-1 text-sm text-zinc-500 sm:text-base">{viewHeading.subtitle}</p>
              </>
            )}
          </div>

          {view === 'agenda' && !agendasOnly && (
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

        {view === 'agenda' && !isWeekView && closedDateSet.has(dateStr) && (
          <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-bold">Caja cerrada para este día</p>
            <p className="mt-1 text-emerald-800/90">
              {isSuperAdmin
                ? 'Podés seguir modificando turnos. El resto del equipo no puede editar cobros ni turnos de esta fecha.'
                : 'No podés editar turnos ni cobros de este día. Contactá a un super administrador si hace falta un cambio.'}
            </p>
          </div>
        )}

        {view === 'agenda' && isWeekView && closedDateSet.size > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Hay {closedDateSet.size} día(s) cerrados en esta semana. Los cobros de la agenda se pueden seguir editando; el cierre de caja usa los montos del momento del cierre.
          </div>
        )}

        {view === 'agenda' && (
        <div className={agendasOnly ? 'flex flex-1 flex-col min-h-0 overflow-hidden' : undefined}>
        <>
        {!isSingleBarberDayView && !agendasOnly && (
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
        {isSuperAdmin && !isSingleBarberDayView && !agendasOnly && barberStats.length > 0 && (
          <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-black text-zinc-900">Estadísticas por barbero</h3>
              <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Ingreso estimado: {BARBER_COMMISSION_PERCENT}% del servicio
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

        {isSingleBarberDayView && !agendasOnly && barbers[0] && (
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
        {isWeekView && selectedBarber && !agendasOnly && (
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
              <div className="overflow-x-auto -mx-2 sm:mx-0">
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
                                  <ClientProfileLink
                                    userId={app.userId}
                                    name={app.name}
                                    phone={app.phone}
                                    adminClients={adminClients}
                                    className="font-bold text-zinc-900 truncate hover:text-[#b39055]"
                                  />
                                  <AppointmentPaymentBadge app={app} className="mt-1" />
                                  {renderPaymentSplitsTrigger(app, true)}
                                  {(app.tipAmount ?? 0) > 0 && (
                                    <p className="text-[10px] font-semibold text-violet-700 mt-0.5">
                                      Propina ${formatArs(app.tipAmount!)}
                                    </p>
                                  )}
                                  <p className="text-zinc-500 text-[10px] mt-0.5 tabular-nums">
                                    {normalizeAppointmentTime(app.time)} – {endClock} · {dm} min
                                  </p>
                                  <p className="text-zinc-600 text-xs truncate mt-0.5">{app.service}</p>
                                  {(() => {
                                    const summary = formatAppointmentProductsSummary(app.products);
                                    if (!summary) return null;
                                    return (
                                      <p
                                        className="text-amber-800 text-[10px] truncate mt-0.5"
                                        title={(app.products ?? [])
                                          .map((l) => `${l.quantity}× ${l.name}`)
                                          .join(' · ')}
                                      >
                                        + {summary}
                                      </p>
                                    );
                                  })()}
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
                                      onClick={() => tryOpenEditModal(app)}
                                      className="p-1.5 text-zinc-500 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
                                      title="Editar"
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void tryDeleteAppointment(app.id)}
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
          <div className={agendasOnly ? 'flex-1 flex flex-col min-h-0 mb-0' : 'mb-8'}>
            {loading ? (
              <div className="py-16 text-center text-zinc-400 rounded-2xl border border-zinc-200 bg-white">
                Cargando agenda…
              </div>
            ) : isSingleBarberDayView && appointmentsByBarber[0] ? (
              <div
                className={
                  agendasOnly
                    ? 'flex flex-1 flex-col min-h-0 w-full mb-0'
                    : 'max-w-4xl mx-auto mb-8'
                }
              >
                <div className="flex items-center justify-between gap-4 mb-4 px-1">
                  <h3 className="font-bold text-lg text-zinc-900">Horarios del día</h3>
                  <span className="text-xs text-zinc-500">Deslizá si hay muchos turnos</span>
                </div>
                <div
                  className={`rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden ${
                    agendasOnly ? 'flex flex-1 flex-col min-h-0' : ''
                  }`}
                >
                  <ul
                    className={`divide-y divide-zinc-100 ${
                      agendasOnly ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain' : ''
                    }`}
                  >
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
                                    <ClientProfileLink
                                      userId={app.userId}
                                      name={app.name}
                                      phone={app.phone}
                                      adminClients={adminClients}
                                      className="font-bold text-zinc-900 text-base leading-tight hover:text-[#b39055]"
                                    />
                                    <p className="text-sm text-zinc-600 mt-1">{app.service}</p>
                                    {(() => {
                                      const summary = formatAppointmentProductsSummary(app.products);
                                      if (!summary) return null;
                                      return (
                                        <p
                                          className="text-[11px] font-semibold text-amber-800 mt-0.5"
                                          title={(app.products ?? [])
                                            .map((l) => `${l.quantity}× ${l.name} · $${formatArs(l.subtotal)}`)
                                            .join('\n')}
                                        >
                                          + {summary}
                                        </p>
                                      );
                                    })()}
                                    <p className="text-[11px] text-zinc-500 mt-1">
                                      {slot} – {endClock} · {dm} min
                                    </p>
                                    <AppointmentPaymentBadge app={app} className="mt-2" />
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
                                      onClick={() => tryOpenEditModal(app)}
                                      className="p-2 text-zinc-500 hover:text-amber-800 hover:bg-amber-100 rounded-lg transition-colors"
                                      title="Editar"
                                    >
                                      <Pencil size={16} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void tryDeleteAppointment(app.id)}
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
            ) : agendasOnly ? (
              <div className="bg-white border border-zinc-200 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden flex flex-col min-h-0 flex-1">
                <div className="p-3 sm:p-4 min-h-0 flex-1 flex flex-col overflow-hidden">
                  <BarberDayCalendarsGrid
                    columns={appointmentsByBarber}
                    timeSlots={agendaTimeSlots}
                    dateStr={dateStr}
                    getBlockedSlotsForBarber={(barberId) =>
                      getBlockedSlotsForBarberDate(barberId, dateStr)
                    }
                    adminClients={adminClients}
                    shopWhatsappMessageTemplate={shopWhatsappMessageTemplate}
                    onCreateSlot={openCreateModalForSlot}
                    onEdit={tryOpenEditModal}
                    onDelete={tryDeleteAppointment}
                    manageBarberId={staffBarberId}
                    fillAvailableHeight
                    compact={false}
                  />
                </div>
              </div>
            ) : (
              <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden mb-8">
                <div className="p-4 sm:p-6 border-b border-zinc-100 bg-gradient-to-r from-zinc-50 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="font-black text-lg text-zinc-900">Agendas del día</h3>
                    <p className="text-xs text-zinc-500 capitalize mt-0.5">
                      {format(selectedDate, "EEEE d 'de' MMMM yyyy", { locale: es })}
                    </p>
                  </div>
                  {barbers.length > 1 && (
                    <button
                      type="button"
                      onClick={openAgendasInNewTab}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 shrink-0"
                      title="Abrir agendas en pantalla completa"
                    >
                      <ExternalLink size={14} />
                      Ver en otra pestaña
                    </button>
                  )}
                </div>

                {/* Móvil: un barbero a la vez con pestañas */}
                <div className="lg:hidden p-4 space-y-4">
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
                    {appointmentsByBarber.map(({ barber, appointments: barberAppointments }) => {
                      const active = barber.id === (mobileDayAgendaBarber?.barber.id ?? dayAgendaMobileBarberId);
                      const count = barberAppointments.length;
                      return (
                        <button
                          key={barber.id}
                          type="button"
                          onClick={() => setDayAgendaMobileBarberId(barber.id)}
                          className={`flex shrink-0 snap-start items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                            active
                              ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                              : 'border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300'
                          }`}
                        >
                          <img
                            src={barber.photo}
                            alt=""
                            className="w-8 h-8 rounded-lg object-cover ring-1 ring-white/20"
                            referrerPolicy="no-referrer"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-bold truncate max-w-[7rem]">{barber.name}</span>
                            <span className={`block text-[10px] font-semibold tabular-nums ${active ? 'text-zinc-300' : 'text-zinc-500'}`}>
                              {count} turno{count === 1 ? '' : 's'}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {mobileDayAgendaBarber ? (
                    <div className="rounded-2xl border border-zinc-200 overflow-hidden bg-white">
                      <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 text-white px-4 py-3 flex items-center gap-3">
                        <img
                          src={mobileDayAgendaBarber.barber.photo}
                          alt={mobileDayAgendaBarber.barber.name}
                          className="w-10 h-10 rounded-xl object-cover ring-2 ring-white/10"
                          referrerPolicy="no-referrer"
                        />
                        <p className="font-bold text-base leading-tight">{mobileDayAgendaBarber.barber.name}</p>
                      </div>
                      <div className="p-3 divide-y divide-zinc-100">
                        {renderBarberDayAgendaRows(mobileDayAgendaBarber.barber, mobileDayAgendaBarber.appointments)}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Desktop: columnas sin scroll interno (un solo scroll de página) */}
                <div className="hidden lg:grid p-4 sm:p-6 grid-cols-2 xl:grid-cols-3 gap-5">
                  {appointmentsByBarber.map(({ barber, appointments: barberAppointments }) => (
                    <div
                      key={barber.id}
                      className="border border-zinc-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white flex flex-col"
                    >
                      <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 text-white p-4 flex items-center gap-3 shrink-0">
                        <img
                          src={barber.photo}
                          alt={barber.name}
                          className="w-11 h-11 rounded-xl object-cover ring-2 ring-white/10"
                          referrerPolicy="no-referrer"
                        />
                        <p className="font-bold text-base leading-tight">{barber.name}</p>
                      </div>
                      <div className="p-3 divide-y divide-zinc-100">
                        {renderBarberDayAgendaRows(barber, barberAppointments)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!agendasOnly && (
        <div
          className={`bg-white border rounded-2xl shadow-sm overflow-hidden min-w-0 ${
            isSingleBarberDayView ? 'border-zinc-200/80 border-dashed' : 'border-zinc-200'
          }`}
        >
          <div className="px-4 py-3.5 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center gap-3 lg:px-4">
            <div className="min-w-0">
              <h3 className="font-bold text-base sm:text-base text-zinc-900 lg:font-semibold lg:text-zinc-800">
                {isSingleBarberDayView ? 'Mismo día · vista lista' : 'Listado de turnos'}
              </h3>
              {isSingleBarberDayView && (
                <p className="text-[11px] text-zinc-500 mt-0.5">Orden cronológico para revisar o anotar</p>
              )}
              {isSuperAdmin && !afipConfigured && (
                <p className="text-[10px] text-amber-800/90 mt-1 max-w-md">
                  AFIP: cargá en Configuración el <strong>token Afip SDK</strong>, CUIT y certificado de cada barbero.
                </p>
              )}
              {isSuperAdmin && afipConfigured && afipReadyCount === 0 && (
                <p className="text-[10px] text-amber-800/90 mt-1 max-w-md">
                  Ningún barbero tiene AFIP listo. Cargá CUIT y certificado ARCA en Configuración (cada uno factura con su CUIT a
                  consumidor final).
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
            <ul className="flex flex-col gap-3 p-3 min-w-0 lg:gap-0 lg:p-0 lg:divide-y lg:divide-zinc-100">
              {dayAppointments.map((app) => {
                const dm = app.durationMinutes ?? 30;
                const endClock = addMinutesToClock(app.time, dm);
                const barberInfo = resolveBarberForApp(app);
                const phoneDigits = normalizePhoneDigits(app.phone ?? '');
                const phoneHref = phoneDigits ? `https://wa.me/549${phoneDigits}` : null;
                const waUrl = appointmentNeedsManualContact(app) ? buildAppointmentWhatsappUrl(app, shopWhatsappMessageTemplate) : null;
                const showAfipBlock = isSuperAdmin && afipConfigured && app.status !== 'cancelled';
                const canAfipInvoice = canInvoiceAppointmentAfip(app, barbers, invoiceScopeBarberId);
                const initials = (app.name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
                return (
                  <li
                    key={app.id}
                    className="relative rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow lg:rounded-none lg:border-0 lg:border-b lg:border-zinc-100 lg:shadow-none lg:p-0 lg:px-4 lg:py-3.5 lg:hover:bg-zinc-50/60 lg:hover:shadow-none group"
                  >
                    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[4.5rem_minmax(8rem,1fr)_minmax(6.5rem,0.85fr)_minmax(5.5rem,0.7fr)_minmax(12rem,1.5fr)_auto] lg:items-center lg:gap-x-3 lg:gap-y-2">
                    {/* Hora + cliente (sin acciones en la misma fila en móvil) */}
                    <div className="flex items-start gap-3 min-w-0 lg:contents">
                    <div className="flex flex-col items-center justify-center gap-0.5 bg-zinc-950 text-white rounded-xl px-3 py-2.5 min-w-[4.25rem] flex-shrink-0 xl:row-span-1">
                      <span className="font-bold text-[17px] tabular-nums leading-none lg:text-[15px]">{app.time}</span>
                      <span className="text-[10px] text-zinc-400 tabular-nums leading-none lg:mt-1">
                        <span className="lg:hidden">{dm} min</span>
                        <span className="hidden lg:inline">hasta {endClock}</span>
                      </span>
                    </div>

                    <div className="flex items-start gap-3 min-w-0 flex-1 xl:min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#e5c185] to-[#b39055] text-zinc-900 flex items-center justify-center text-xs font-black tracking-tight flex-shrink-0 lg:w-9 lg:h-9">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <ClientProfileLink
                          userId={app.userId}
                          name={app.name}
                          phone={app.phone}
                          adminClients={adminClients}
                          className="font-bold text-[15px] text-zinc-900 leading-snug hover:text-[#b39055] line-clamp-2 lg:font-semibold lg:text-sm lg:truncate lg:leading-tight"
                        />
                        {phoneHref ? (
                          <a
                            href={phoneHref}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-emerald-700 transition-colors"
                          >
                            <Phone size={12} className="shrink-0" />
                            <span className="break-all">{app.phone}</span>
                          </a>
                        ) : (
                          <span className="mt-1 block text-xs text-zinc-400 italic">Sin teléfono</span>
                        )}
                      </div>
                    </div>
                    </div>

                    {/* Servicio + barbero */}
                    <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5 flex flex-col gap-2.5 sm:grid sm:grid-cols-2 sm:gap-3 min-w-0 lg:bg-transparent lg:border-0 lg:rounded-none lg:p-0 lg:contents lg:gap-0">
                    <div className="min-w-0">
                      <p className="hidden lg:block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">Servicio</p>
                      <p className="text-sm font-medium text-zinc-800 flex items-start gap-2 min-w-0">
                        <Scissors size={14} className="text-[#b39055] shrink-0 mt-0.5 lg:hidden" />
                        <span className="break-words leading-snug">{app.service}</span>
                      </p>
                      {(() => {
                        const summary = formatAppointmentProductsSummary(app.products);
                        if (!summary) return null;
                        return (
                          <p
                            className="text-[11px] font-semibold text-amber-800 mt-1 break-words lg:mt-0.5"
                            title={(app.products ?? [])
                              .map((l) => `${l.quantity}× ${l.name} · $${formatArs(l.subtotal)}`)
                              .join('\n')}
                          >
                            + {summary}
                          </p>
                        );
                      })()}
                      <p className="hidden lg:block text-[11px] text-zinc-500 tabular-nums mt-0.5">{dm} min</p>
                    </div>

                    <div className="min-w-0 sm:border-l sm:border-zinc-200/80 sm:pl-3 lg:border-0 lg:pl-0">
                      <p className="hidden lg:block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">Barbero</p>
                      <div className="flex items-center gap-2 min-w-0">
                        {barberInfo?.photo ? (
                          <img
                            src={barberInfo.photo}
                            alt={barberInfo.name}
                            className="w-7 h-7 rounded-full object-cover ring-1 ring-zinc-200 flex-shrink-0 lg:w-6 lg:h-6"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-600 flex-shrink-0 lg:w-6 lg:h-6">
                            {(app.barber ?? '?').slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm font-semibold text-zinc-700 break-words leading-snug lg:font-medium">{app.barber ?? '—'}</span>
                      </div>
                    </div>
                    </div>

                    {/* Cobros */}
                    <div className="min-w-0 w-full lg:min-w-[12rem]">
                      <p className="hidden lg:block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Cobros</p>
                      <div className="flex flex-wrap items-center gap-2 mb-2 lg:gap-1.5 lg:mb-1.5">
                        <AppointmentPaymentBadge app={app} className="whitespace-nowrap" />
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
                      <div className="lg:hidden">{renderPaymentSplitsTrigger(app, true)}</div>
                      <div className="hidden lg:block">{renderPaymentSplitsTrigger(app)}</div>
                      {(app.tipAmount ?? 0) > 0 && (
                        <p className="text-[11px] font-semibold text-violet-700 mt-1.5">
                          Propina ${formatArs(app.tipAmount!)}
                        </p>
                      )}
                    </div>

                    {/* Acciones móvil: barra inferior con targets amplios */}
                    <div className="flex items-stretch gap-2 pt-3 border-t border-zinc-100 lg:hidden">
                      {showAfipBlock && !app.afipCae ? (
                        <button
                          type="button"
                          onClick={() => openAfipInvoiceModal(app)}
                          disabled={(afipInvoiceBusy && afipInvoiceApp?.id === app.id) || !canAfipInvoice}
                          className="inline-flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
                          title="Facturar AFIP"
                        >
                          <Receipt size={18} />
                          <span className="text-[9px] font-bold uppercase tracking-wide">AFIP</span>
                        </button>
                      ) : null}
                      {waUrl ? (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                          title="WhatsApp"
                        >
                          <MessageCircle size={18} />
                          <span className="text-[9px] font-bold uppercase tracking-wide">WA</span>
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => tryOpenEditModal(app)}
                        className="inline-flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl text-amber-900 bg-amber-50 hover:bg-amber-100"
                        title="Editar"
                      >
                        <Pencil size={18} />
                        <span className="text-[9px] font-bold uppercase tracking-wide">Editar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void tryDeleteAppointment(app.id)}
                        className="inline-flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl text-red-700 bg-red-50 hover:bg-red-100"
                        title="Eliminar"
                      >
                        <Trash2 size={18} />
                        <span className="text-[9px] font-bold uppercase tracking-wide">Borrar</span>
                      </button>
                    </div>

                    {/* Acciones en desktop */}
                    <div className="hidden lg:flex items-center justify-end gap-1 flex-shrink-0 border-l border-zinc-100 pl-3 self-stretch">
                      {showAfipBlock && !app.afipCae ? (
                        <button
                          type="button"
                          onClick={() => openAfipInvoiceModal(app)}
                          disabled={(afipInvoiceBusy && afipInvoiceApp?.id === app.id) || !canAfipInvoice}
                          title={
                            afipInvoiceBusy && afipInvoiceApp?.id === app.id
                              ? 'Facturando…'
                              : !canAfipInvoice
                                ? invoiceScopeBarberId &&
                                    (app.barberId ?? barbers.find((b) => b.name === app.barber)?.id) !==
                                      invoiceScopeBarberId
                                  ? `Solo podés facturar turnos de ${invoiceScopeBarberName ?? 'tu agenda'}`
                                  : !app.barberId && !app.barber
                                    ? 'Asigná un barbero al turno'
                                    : `Configurá AFIP del barbero ${app.barber ?? ''}`
                                : 'Facturar AFIP (consumidor final)'
                          }
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
                        onClick={() => tryOpenEditModal(app)}
                        title="Editar turno"
                        className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-amber-800 hover:bg-amber-50 transition-colors"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void tryDeleteAppointment(app.id)}
                        title="Eliminar turno"
                        className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        )}
        </>
        </div>
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
                      <td className="py-4 px-4 font-medium text-zinc-900">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{s.name}</span>
                          {s.internal && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200"
                              title="Servicio interno: no se muestra al público"
                            >
                              Interno
                            </span>
                          )}
                        </div>
                      </td>
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

        {view === 'abonos' && isAdmin && (
          <SubscriptionPlansPanel
            plans={subscriptionPlans}
            loading={subscriptionPlansLoading}
            onRefresh={loadSubscriptionPlansPanel}
            showToast={showToast}
          />
        )}

        {view === 'promociones' && isAdmin && (
          <PromotionsPanel
            promotions={promotions}
            loading={promotionsLoading}
            onRefresh={loadPromotionsPanel}
            showToast={showToast}
          />
        )}

        {view === 'facturacion' && isSuperAdmin && (
          <BillingPanel
            appointments={billingAppointments}
            services={services}
            barbers={barbers}
            loading={billingLoading}
            afipConfigured={afipConfigured}
            afipReadyCount={afipReadyCount}
            invoiceScopeBarberId={invoiceScopeBarberId}
            invoiceScopeBarberName={invoiceScopeBarberName}
            invoicingId={afipInvoiceBusy && afipInvoiceApp ? afipInvoiceApp.id : null}
            bulkInvoicing={afipInvoiceBusy && !afipInvoiceApp}
            onInvoiceClick={openAfipInvoiceModal}
            onBulkInvoice={handleBulkAfipInvoice}
            adminClients={adminClients}
            barberInvoicing={barberInvoicing}
            barberInvoicingYear={barberInvoicingYear}
            barberInvoicingMonth={barberInvoicingMonth}
            barberInvoicingLoading={barberInvoicingLoading}
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
            {isSuperAdmin && (
              <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
                    <DatabaseBackup size={20} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black text-lg text-zinc-900">Copia de seguridad</h3>
                    <p className="text-sm text-zinc-500 mt-1">
                      Descargá un archivo <strong className="font-semibold text-zinc-700">.sql</strong> con la estructura y
                      todos los datos de la base (turnos, clientes, barberos, configuración). Guardalo en un lugar seguro.
                    </p>
                    <button
                      type="button"
                      disabled={backupDownloading}
                      onClick={() => {
                        setBackupDownloading(true);
                        void downloadDatabaseBackup()
                          .then((r) => {
                            showToast(
                              `Copia descargada (${r.tableCount} tablas, ${r.rowCount.toLocaleString('es-AR')} filas)`,
                              'ok'
                            );
                          })
                          .catch((err) => {
                            showToast(
                              err instanceof Error ? err.message : 'No se pudo generar la copia',
                              'err'
                            );
                          })
                          .finally(() => setBackupDownloading(false));
                      }}
                      className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                    >
                      {backupDownloading ? (
                        <>Generando copia…</>
                      ) : (
                        <>
                          <Download size={18} aria-hidden />
                          Descargar copia de seguridad
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
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
                  Siempre el <strong className="text-zinc-700">50% del precio del servicio</strong> al pagar con Mercado Pago
                  (la mitad online, el resto en el local).
                </p>
                <p className="mt-3 inline-flex items-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-bold text-zinc-800">
                  Seña: {DEPOSIT_PERCENT}% del servicio
                </p>
              </div>
              <div>
                <h3 className="font-black text-lg text-zinc-900">Mensaje de WhatsApp</h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Texto al abrir WhatsApp desde la agenda (turnos sin seña). Dejalo vacío para el mensaje automático con negritas,
                  tolerancia y pie de página. Usá *asteriscos* para negrita y _guiones bajos_ para cursiva.
                </p>
                <p className="text-xs text-zinc-500 mt-2">{WHATSAPP_TEMPLATE_HELP}</p>
                <textarea
                  value={shopWhatsappMessageTemplate}
                  onChange={(e) => setShopWhatsappMessageTemplate(e.target.value)}
                  rows={10}
                  maxLength={8000}
                  spellCheck={false}
                  className="mt-3 w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-900 font-mono leading-relaxed"
                  placeholder={WHATSAPP_TEMPLATE_PLACEHOLDER}
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
              <h3 className="font-black text-lg text-zinc-900">
                {isSuperAdmin ? 'Barberos, comisiones y monotributo' : 'Barberos y comisiones'}
              </h3>
              <p className="text-sm text-zinc-500 mt-1">
                {isSuperAdmin
                  ? `Nombre, comisión (${BARBER_COMMISSION_PERCENT}% servicio, ${BARBER_PRODUCT_COMMISSION_PERCENT}% productos al facturar) y tope mensual AFIP. La factura AFIP es por el importe completo.`
                  : `Nombre público y comisión de referencia (${BARBER_COMMISSION_PERCENT}% servicio, ${BARBER_PRODUCT_COMMISSION_PERCENT}% productos).`}
              </p>
              {shopLoading ? (
                <p className="text-zinc-400 mt-4">Cargando...</p>
              ) : (
                <ul className="mt-4 divide-y divide-zinc-100">
                  {barbers.map((b) => {
                    const usage = barberInvoicing.find((u) => u.barberId === b.id);
                    return (
                    <li key={b.id} className="py-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-[200px]">
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
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase text-zinc-400">Comisión</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            defaultValue={b.commissionPercent ?? BARBER_COMMISSION_PERCENT}
                            key={`${b.id}-comm-${String(b.commissionPercent ?? 0)}`}
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
                            className="w-20 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900"
                          />
                          <span className="text-zinc-500 text-sm">%</span>
                        </div>
                      </div>
                      {isSuperAdmin && (
                      <div className="flex flex-wrap items-end gap-3 pl-0 sm:pl-2">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                            Categoría monotributo
                          </label>
                          <input
                            type="text"
                            defaultValue={b.monotributoCategory ?? ''}
                            key={`${b.id}-cat-${b.monotributoCategory ?? ''}`}
                            placeholder="Ej. Categoría D"
                            onBlur={(e) => {
                              const next = e.target.value.trim();
                              const prev = (b.monotributoCategory ?? '').trim();
                              if (next === prev) return;
                              void api
                                .updateBarber(b.id, { monotributoCategory: next || null })
                                .then(() => {
                                  loadData();
                                  if (view === 'facturacion' || view === 'configuracion') void loadBarberInvoicing();
                                  showToast(`Monotributo de ${b.name} actualizado`);
                                })
                                .catch((err) =>
                                  showToast(err instanceof Error ? err.message : 'No se pudo guardar', 'err')
                                );
                            }}
                            className="w-40 border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                            Tope mensual facturación (ARS)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            defaultValue={b.monotributoMonthlyLimit ?? ''}
                            key={`${b.id}-lim-${b.monotributoMonthlyLimit ?? ''}`}
                            placeholder="Sin límite"
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const next = raw === '' ? null : Number(raw);
                              const prev = b.monotributoMonthlyLimit ?? null;
                              if (next === prev || (next != null && !Number.isFinite(next))) return;
                              void api
                                .updateBarber(b.id, { monotributoMonthlyLimit: next })
                                .then(() => {
                                  loadData();
                                  if (view === 'facturacion' || view === 'configuracion') void loadBarberInvoicing();
                                  showToast(`Tope mensual de ${b.name} guardado`);
                                })
                                .catch((err) =>
                                  showToast(err instanceof Error ? err.message : 'No se pudo guardar', 'err')
                                );
                            }}
                            className="w-36 border border-zinc-200 rounded-lg px-3 py-2 text-sm tabular-nums"
                          />
                        </div>
                        {usage && usage.monthlyLimit != null && usage.monthlyLimit > 0 && (
                          <p className="text-xs text-zinc-500 pb-2">
                            Facturado {formatMonthYearEs(barberInvoicingYear, barberInvoicingMonth)}:{' '}
                            <span className="font-bold text-zinc-800">
                              ${usage.invoicedTotal.toLocaleString('es-AR')}
                            </span>
                            {' '}
                            de ${usage.monthlyLimit.toLocaleString('es-AR')} ({usage.percentUsed}%)
                          </p>
                        )}
                        <div className="w-full space-y-2 border-t border-zinc-100 pt-3 mt-2">
                          <p className="text-[10px] font-bold uppercase text-zinc-500">
                            AFIP — token propio + CUIT + certificado (consumidor final)
                          </p>
                          <div className="w-full max-w-md">
                            <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                              Access token (Afip SDK)
                            </label>
                            <input
                              type="password"
                              autoComplete="off"
                              key={`${b.id}-afip-token-${b.afipAccessTokenConfigured}`}
                              placeholder={b.afipAccessTokenConfigured ? '•••••••• (dejá vacío para no cambiar)' : 'Pegar token de app.afipsdk.com'}
                              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm font-mono"
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (!v) return;
                                void api
                                  .updateBarber(b.id, { afipAccessToken: v })
                                  .then(() => {
                                    e.target.value = '';
                                    loadData();
                                    showToast(`Token Afip SDK de ${b.name} guardado`);
                                  })
                                  .catch((err) =>
                                    showToast(err instanceof Error ? err.message : 'Token inválido', 'err')
                                  );
                              }}
                            />
                          </div>
                          <div className="flex flex-wrap items-end gap-3">
                            <div>
                              <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">CUIT</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                defaultValue={b.afipCuit ?? ''}
                                key={`${b.id}-cuit-${b.afipCuit ?? ''}`}
                                placeholder="11 dígitos"
                                onBlur={(e) => {
                                  const next = e.target.value.replace(/\D/g, '');
                                  const prev = (b.afipCuit ?? '').replace(/\D/g, '');
                                  if (next === prev) return;
                                  void api
                                    .updateBarber(b.id, { afipCuit: next || null })
                                    .then(() => {
                                      loadData();
                                      showToast(`CUIT AFIP de ${b.name} guardado`);
                                    })
                                    .catch((err) =>
                                      showToast(err instanceof Error ? err.message : 'CUIT inválido', 'err')
                                    );
                                }}
                                className="w-36 border border-zinc-200 rounded-lg px-3 py-2 text-sm font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Pto. venta</label>
                              <input
                                type="number"
                                min={1}
                                max={9999}
                                defaultValue={b.afipPtoVta ?? 1}
                                key={`${b.id}-pv-${b.afipPtoVta ?? 1}`}
                                onBlur={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  if (!Number.isFinite(v) || v === (b.afipPtoVta ?? 1)) return;
                                  void api
                                    .updateBarber(b.id, { afipPtoVta: v })
                                    .then(() => {
                                      loadData();
                                      showToast(`Punto de venta de ${b.name} guardado`);
                                    })
                                    .catch(() => showToast('Punto de venta inválido', 'err'));
                                }}
                                className="w-20 border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                              />
                            </div>
                            <p className="text-xs pb-2">
                              {b.afipCredentialsConfigured ? (
                                <span className="text-emerald-700 font-semibold">AFIP listo para facturar</span>
                              ) : (
                                <span className="text-amber-800">
                                  {!b.afipAccessTokenConfigured
                                    ? 'Falta access token'
                                    : !b.afipCuit
                                      ? 'Falta CUIT'
                                      : 'Falta certificado y clave (.crt / .key en PEM)'}
                                </span>
                              )}
                            </p>
                          </div>
                          <textarea
                            key={`${b.id}-afip-cert-${b.afipCredentialsConfigured}`}
                            rows={3}
                            placeholder="Pegar certificado .crt (PEM completo). Dejá vacío si no cambia."
                            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs font-mono text-zinc-800"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (!v) return;
                              void api
                                .updateBarber(b.id, { afipCert: v })
                                .then(() => {
                                  e.target.value = '';
                                  loadData();
                                  showToast(`Certificado AFIP de ${b.name} guardado`);
                                })
                                .catch((err) =>
                                  showToast(err instanceof Error ? err.message : 'Certificado inválido', 'err')
                                );
                            }}
                          />
                          <textarea
                            key={`${b.id}-afip-key-${b.afipCredentialsConfigured}`}
                            rows={3}
                            placeholder="Pegar clave privada .key (PEM completo). Dejá vacío si no cambia."
                            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs font-mono text-zinc-800"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (!v) return;
                              void api
                                .updateBarber(b.id, { afipKey: v })
                                .then(() => {
                                  e.target.value = '';
                                  loadData();
                                  showToast(`Clave AFIP de ${b.name} guardada`);
                                })
                                .catch((err) =>
                                  showToast(err instanceof Error ? err.message : 'Clave inválida', 'err')
                                );
                            }}
                          />
                        </div>
                      </div>
                      )}
                    </li>
                  );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </DashboardPanelShell>

      {afipInvoiceApp && isSuperAdmin && (
        <AfipInvoiceModal
          appointment={afipInvoiceApp}
          services={services}
          shopProducts={shopProducts}
          barbers={barbers}
          adminClients={adminClients}
          invoiceScopeBarberId={invoiceScopeBarberId}
          invoiceScopeBarberName={invoiceScopeBarberName}
          showToast={showToast}
          onBusyChange={setAfipInvoiceBusy}
          onClose={() => setAfipInvoiceApp(null)}
          onSuccess={handleAfipInvoiceSuccess}
        />
      )}

      <AppointmentPaymentSplitsModal
        app={paymentSplitsModalApp}
        services={services}
        depositPercent={DEPOSIT_PERCENT}
        adminClients={adminClients}
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
          <div
            className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg max-h-[min(90dvh,calc(100vh-2rem))] flex flex-col overflow-hidden my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-200 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-black text-zinc-900">
                {editingAppointment ? 'Editar cita' : 'Nueva cita'}
              </h3>
              <button type="button" onClick={closeModal} className="p-2 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSaveAppointment} className="flex flex-col min-h-0 flex-1">
              <div className="p-6 space-y-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                      if (canAccessDashboard && !editingAppointment) {
                        setNameSuggestionsOpen(true);
                      }
                    }}
                    onFocus={() => {
                      if (canAccessDashboard && !editingAppointment) {
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
                      if (!canAccessDashboard || editingAppointment) return;
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
                  {canAccessDashboard && !editingAppointment && adminClientsLoading && (
                    <p className="mt-1 text-xs text-zinc-400">Cargando clientes…</p>
                  )}
                  {canAccessDashboard &&
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
                            {clientAccountBalanceOwedArs(c.accountBalanceArs) > 0 && (
                              <span className="ml-2 text-xs font-bold text-amber-700 tabular-nums">
                                Debe ${formatArs(clientAccountBalanceOwedArs(c.accountBalanceArs))}
                              </span>
                            )}
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
                {canAccessDashboard && !editingAppointment && formMatchedClient && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Vinculado a ficha:{' '}
                    <ClientProfileLink
                      userId={formMatchedClient.id}
                      name={formMatchedClient.name}
                      className="font-medium text-[#b39055] hover:underline"
                    />
                  </p>
                )}
                {canAccessDashboard && !editingAppointment && formMatchedClient && (() => {
                  const owed = clientAccountBalanceOwedArs(formMatchedClient.accountBalanceArs);
                  if (owed <= 0) return null;
                  return (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <strong>{formMatchedClient.name}</strong> debe{' '}
                      <strong className="tabular-nums">${formatArs(owed)}</strong> en cuenta corriente.
                    </div>
                  );
                })()}
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
              {canAccessDashboard && !editingAppointment && (
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
                  {modalTimeSlots.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  </select>
                {!editingAppointment ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Podés elegir cualquier horario del día (pasado o futuro). Si ya hay otro turno en ese horario, el
                    sistema avisará al guardar.
                  </p>
                ) : null}
                </div>
              </div>
              {editingAppointment &&
                editingAppointment.status !== 'cancelled' &&
                editingAppointment.status !== 'pending_payment' && (
                  <>
                    <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                      Cobros del servicio en local
                    </label>
                    <ServicePaymentSplitsEditor
                      splits={form.servicePaymentSplits}
                      onChange={(servicePaymentSplits) =>
                        setForm((f) => ({ ...f, servicePaymentSplits }))
                      }
                      expectedLocalAmount={appointmentSplitsTargetArs(
                        editingAppointment,
                        services,
                        DEPOSIT_PERCENT,
                        sumAppointmentProducts(editingAppointment.products)
                      )}
                      disabled={saving}
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Combiná métodos y montos hasta cubrir el saldo del turno. La seña por Mercado Pago no se incluye
                      acá. En cuenta corriente podés cargar un monto negativo si el cliente debe.
                    </p>
                  </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                        Propina (opcional)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.tipAmount}
                        onChange={(e) => setForm((f) => ({ ...f, tipAmount: e.target.value }))}
                        placeholder="0"
                        className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                      />
                      <p className="mt-1 text-xs text-zinc-500">
                        No se factura con AFIP. Se muestra en el cierre de caja.
                      </p>
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-3 p-6 pt-4 border-t border-zinc-200 shrink-0 bg-white">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-3 rounded-xl border border-zinc-200 text-zinc-700 font-bold hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || (!editingAppointment && !form.time)}
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
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={serviceForm.internal}
                    onChange={(e) => setServiceForm((f) => ({ ...f, internal: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-amber-700 focus:ring-amber-500"
                  />
                  <span>
                    <span className="block text-sm font-bold text-zinc-800">Servicio interno</span>
                    <span className="block text-[11px] text-zinc-500">
                      No se muestra al público en la web. Solo aparece en el panel para que lo agendes vos.
                    </span>
                  </span>
                </label>
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
