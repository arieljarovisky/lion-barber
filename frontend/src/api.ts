// En producci?n definir VITE_API_URL en Vercel (ej: https://tu-backend.railway.app)
const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : '');

let authToken: string | null = null;

/** Errores HTTP de la API (para no cerrar sesi?n en fallos de red). */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

if (typeof window !== 'undefined') {
  try {
    const t = localStorage.getItem('lion_barber_token');
    if (t) authToken = t;
  } catch {
    /* ignore */
  }
}

export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken(): string | null {
  return authToken;
}

/**
 * Lee el `exp` (segundos epoch) de un JWT sin validar firma.
 * Devuelve `null` si el token no se puede decodificar.
 */
export function getJwtExpSeconds(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
    const json = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf-8');
    const decoded = JSON.parse(json) as { exp?: number };
    return typeof decoded.exp === 'number' ? decoded.exp : null;
  } catch {
    return null;
  }
}

/** True si el token tiene `exp` y ya pasó (con margen de 5s para clock skew). */
export function isJwtExpired(token: string): boolean {
  const exp = getJwtExpSeconds(token);
  if (exp == null) return false;
  return Date.now() / 1000 > exp - 5;
}

/** Listener global para 401/expiración: el AuthContext lo usa para cerrar sesión. */
type UnauthorizedHandler = (reason: 'expired' | 'invalid') => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(cb: UnauthorizedHandler | null) {
  unauthorizedHandler = cb;
}
function notifyUnauthorized(reason: 'expired' | 'invalid') {
  try {
    unauthorizedHandler?.(reason);
  } catch {
    /* ignore */
  }
}

export const ANY_BARBER_ID = '__any__';

export type AppointmentStatus = 'scheduled' | 'pending_payment' | 'cancelled';

export type ServicePaymentMethod = 'account' | 'mercadopago' | 'cash' | 'card' | 'subscription' | 'canje';

export interface ServicePaymentSplit {
  method: ServicePaymentMethod;
  amount: number;
}

/** Producto cargado en un turno (venta accesoria). Aparece en el historial. */
export interface AppointmentProductLine {
  productId: string;
  /** Snapshot del nombre al cargarlo. */
  name: string;
  quantity: number;
  /** Precio unitario en ARS (snapshot). */
  unitPrice: number;
  /** Subtotal en ARS (quantity * unitPrice). */
  subtotal: number;
}

export interface Appointment {
  id: string;
  /** Usuario cliente vinculado (si reserv? con cuenta o turno manual enlazado). */
  userId?: number;
  name: string;
  phone: string;
  service: string;
  serviceId?: string;
  barber?: string;
  barberId?: string;
  date: string;
  time: string;
  durationMinutes?: number;
  depositPaid?: boolean;
  /** Importe real cobrado como seña (ARS), según Mercado Pago. */
  depositAmountArs?: number;
  paymentDueAt?: string;
  status?: AppointmentStatus;
  /** Solo en GET /api/appointments/mine */
  canCancel?: boolean;
  canReschedule?: boolean;
  /** Factura electr?nica (admin / panel) */
  afipCae?: string;
  afipCaeVto?: string;
  afipCbteNro?: number;
  afipPtoVta?: number;
  /** Instante de emisión AFIP (ISO 8601 con Z desde el backend). */
  afipFacturadoAt?: string;
  /** Desglose guardado al emitir AFIP */
  afipInvoiceDetail?: AfipInvoiceDetail;
  /** @deprecated Usar servicePaymentSplits */
  servicePaymentMethod?: ServicePaymentMethod | null;
  /** Cobro del saldo en local combinando métodos (cada línea: método + monto ARS). */
  servicePaymentSplits?: ServicePaymentSplit[] | null;
  /** Productos vendidos junto con el turno (cera, pomada, etc.); aparecen en historial. */
  products?: AppointmentProductLine[] | null;
  /** Propina en ARS; no se factura con AFIP. */
  tipAmount?: number;
  /** Usuario del panel que cargó el turno. */
  createdByUserId?: number;
  /** Último usuario del panel que modificó el turno. */
  updatedByUserId?: number;
  /** Si se descontó un corte del abono al cobrar con método Abono. */
  subscriptionCutApplied?: boolean;
}

export interface DailyCashClose {
  date: string;
  closedAt: string;
  closedByUserId: number;
  closedByName?: string;
}

/** Cobros congelados al cerrar caja (no cambian si después editan el turno). */
export interface AppointmentCashClosePaymentSnapshot {
  appointmentId: string;
  closeDate: string;
  servicePaymentSplits?: ServicePaymentSplit[] | null;
  servicePaymentMethod?: ServicePaymentMethod | null;
  tipAmount?: number;
  depositPaid?: boolean;
  depositAmountArs?: number;
  subscriptionCutApplied?: boolean;
  products?: AppointmentProductLine[] | null;
}

export interface AfipInvoiceDetail {
  serviceAmount: number;
  serviceLabel: string;
  productLines: {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
  total: number;
  productsTotal?: number;
  productsCommissionPercent?: number;
  productsCommissionAmount?: number;
  emitterCuit?: string;
  emitterBarberId?: string;
}

export type CancelAppointmentNotice = 'refund_processed' | 'deposit_retained_short_notice' | 'no_deposit';

export interface Service {
  id: string;
  name: string;
  price: string;
  duration: number;
  desc: string;
  emoji?: string;
  sortOrder?: number;
  /** Puntos que suma el cliente al concretar el servicio (programa de fidelidad). */
  pointsReward?: number;
  /** Servicio interno: solo visible para admin/staff, no se muestra al público. */
  internal?: boolean;
}

/** Productos de venta en local: puntos al comprar. */
export interface ShopProduct {
  id: string;
  name: string;
  pointsReward: number;
  /** Precio unitario (texto) para sumar a la factura AFIP. */
  unitPrice?: string | null;
  sortOrder?: number;
}

/** Beneficios canjeables con puntos (visible para clientes en el futuro; se configura en Puntos). */
export interface PointsRedemptionOption {
  id: string;
  label: string;
  pointsCost: number;
  sortOrder: number;
}

export type BarberInvoicingStatus = 'no_limit' | 'ok' | 'warning' | 'exceeded';

export interface BarberInvoicingUsage {
  barberId: string;
  barberName: string;
  year: number;
  month: number;
  monotributoCategory: string | null;
  monthlyLimit: number | null;
  invoicedTotal: number;
  remaining: number | null;
  percentUsed: number | null;
  status: BarberInvoicingStatus;
}

export interface Barber {
  id: string;
  name: string;
  role: string;
  photo: string;
  desc: string;
  commissionPercent?: number;
  monotributoCategory?: string | null;
  monotributoMonthlyLimit?: number | null;
  afipCuit?: string | null;
  afipPtoVta?: number;
  afipCbteTipo?: number;
  afipAccessTokenConfigured?: boolean;
  afipCredentialsConfigured?: boolean;
}

export type AfipBarberStatusRow = {
  id: string;
  name: string;
  afipCuit: string | null;
  afipPtoVta: number;
  afipCbteTipo: number;
  afipAccessTokenConfigured: boolean;
  afipReady: boolean;
};

export interface ShopSettings {
  cutoffHours: number;
  openWeekdays: number[];
  depositPercent: number;
  closeTime: string;
  weekdayHours: Record<number, { openTime: string; closeTime: string }>;
  closedDates: string[];
  /** Plantilla del mensaje prellenado al abrir WhatsApp desde la agenda (null = mensaje por defecto). */
  whatsappMessageTemplate?: string | null;
}

export interface BarberFrancoRow {
  id: number;
  barberId: string;
  weekday: number;
}

export interface BarberTimeBlockRow {
  id: number;
  barberId: string;
  blockDate: string | null;
  weekday: number | null;
  timeStart: string;
  timeEnd: string;
}

export interface StaffInviteRow {
  id: number;
  email: string;
  name: string | null;
  barberId: string | null;
  createdAt: string;
}

export interface FixedMonthlyExpense {
  id: number;
  description: string;
  amount: number;
  active: boolean;
  sortOrder: number;
}

export interface CashExpense {
  id: number;
  expenseDate: string;
  description: string;
  amount: number;
  createdAt: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  monthlyPrice: string;
  cutsPerMonth: number;
  active: boolean;
  sortOrder?: number;
  description?: string;
  category?: string;
  compareAtPrice?: string;
  discountLabel?: string;
  bonusText?: string;
  features?: string[];
  highlighted?: boolean;
  badgeText?: string;
  /** Días de vigencia desde la activación; null = sin vencimiento por fecha. */
  validityDays?: number | null;
}

export interface SitePromotion {
  id: string;
  title: string;
  description: string;
  badgeText: string;
  ctaLabel: string;
  ctaHref: string;
  active: boolean;
  sortOrder?: number;
}

export interface ClientSubscriptionInfo {
  planId: string;
  planName: string;
  cutsPerMonth: number;
  cutsUsed: number;
  cutsRemaining: number;
  periodStart: string;
  periodEnd: string | null;
  validityDays?: number | null;
  monthlyPrice: string;
}

/** Respuesta de GET /api/users/clients (solo admin). */
export interface AdminClientWithHistory {
  id: number;
  email: string;
  name: string;
  /** Tel?fono en la ficha del cliente (tambi?n se guarda en cada turno). */
  phone?: string | null;
  /** Todos los teléfonos de la ficha (pueden repetirse entre clientes). */
  phones?: string[];
  points: number;
  /** Foto de perfil de Google si el cliente inici? sesi?n al menos una vez. */
  avatarUrl?: string | null;
  /** Cliente exento de pagar seña: sus reservas se confirman sin Mercado Pago. */
  depositExempt?: boolean;
  /** Abono activo (cortes incluidos, sin seña en la web). */
  subscription?: ClientSubscriptionInfo | null;
  /** Notas internas / recordatorios (solo panel admin). */
  adminNotes?: string | null;
  /** Saldo cuenta corriente (ARS). Negativo = el cliente debe plata. */
  accountBalanceArs?: number;
  /** Cuenta vinculada a Google (email no editable desde el panel). */
  hasGoogleAccount?: boolean;
  createdAt: string;
  appointments: Appointment[];
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  /**
   * Atajo: si tenemos un token cargado y ya está vencido, no malgastamos un round trip
   * y disparamos el cierre de sesión local. Igualmente excluimos el endpoint de login
   * para no romper el flujo cuando justamente venimos a renovar credenciales.
   */
  if (authToken && !path.startsWith('/api/auth/google') && isJwtExpired(authToken)) {
    notifyUnauthorized('expired');
    throw new ApiError('Tu sesión expiró', 401);
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string>) };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { error?: string }).error ?? res.statusText;
    if (res.status === 401 && authToken) {
      notifyUnauthorized(isJwtExpired(authToken) ? 'expired' : 'invalid');
    }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* ignore */
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain?.[1]?.trim() ?? null;
}

/** Descarga un archivo .sql con copia de seguridad de MySQL (solo super admin). */
export async function downloadDatabaseBackup(): Promise<{ filename: string; tableCount: number; rowCount: number }> {
  if (authToken && isJwtExpired(authToken)) {
    notifyUnauthorized('expired');
    throw new ApiError('Tu sesión expiró', 401);
  }
  const res = await fetch(`${API_URL}/api/admin/backup`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { error?: string }).error ?? res.statusText;
    if (res.status === 401 && authToken) {
      notifyUnauthorized(isJwtExpired(authToken) ? 'expired' : 'invalid');
    }
    throw new ApiError(msg, res.status);
  }
  const blob = await res.blob();
  const filename =
    parseContentDispositionFilename(res.headers.get('Content-Disposition')) ??
    'lion-barber-backup.sql';
  const tableCount = Number(res.headers.get('X-Backup-Tables') ?? 0);
  const rowCount = Number(res.headers.get('X-Backup-Rows') ?? 0);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { filename, tableCount, rowCount };
}

export const api = {
  getAppointments: (params?: { date?: string; barberId?: string }) => {
    const q = new URLSearchParams();
    if (params?.date) q.set('date', params.date);
    if (params?.barberId) q.set('barberId', params.barberId);
    const query = q.toString();
    return fetchApi<Appointment[]>(`/api/appointments${query ? `?${query}` : ''}`);
  },

  getAppointment: (id: string) => fetchApi<Appointment>(`/api/appointments/${id}`),

  getMyAppointments: () => fetchApi<Appointment[]>('/api/appointments/mine'),

  createAppointment: (data: Omit<Appointment, 'id'> & { userId?: number }) =>
    fetchApi<Appointment>('/api/appointments', { method: 'POST', body: JSON.stringify(data) }),

  /**
   * Crea preferencia de seña (Wallet Brick) o confirma directo si el cliente está exento de seña.
   * Si `exempt === true` no hay `preferenceId`: el turno ya quedó confirmado.
   */
  createCheckoutSena: (data: {
    name: string;
    phone: string;
    service: string;
    serviceId?: string;
    barberId: string;
    date: string;
    time: string;
    userId?: number;
  }) =>
    fetchApi<
      | { exempt: true; appointmentId: string }
      | { preferenceId: string; url?: string; appointmentId: string; paymentDueAt: string }
    >('/api/checkout/sena', { method: 'POST', body: JSON.stringify(data) }),

  /**
   * Reintento de seña para un turno pending_payment (desde el perfil). Requiere sesión.
   * Si el cliente quedó exento, devuelve `{ exempt: true }` y el turno se confirma sin MP.
   */
  createCheckoutSenaForAppointment: (appointmentId: string) =>
    fetchApi<
      | { exempt: true; appointmentId: string }
      | { preferenceId: string; url?: string; appointmentId: string; paymentDueAt: string }
    >(`/api/checkout/sena/${encodeURIComponent(appointmentId)}`, { method: 'POST' }),

  createCheckoutSubscription: (planId: string) =>
    fetchApi<{ preferenceId: string; url?: string; planId: string }>('/api/checkout/subscription', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    }),

  getPublicSubscriptionPlans: () =>
    fetchApi<{ plans: SubscriptionPlan[] }>('/api/subscription-plans/public'),

  getPublicPromotions: () => fetchApi<{ promotions: SitePromotion[] }>('/api/promotions/public'),

  getPromotions: () => fetchApi<{ promotions: SitePromotion[] }>('/api/promotions'),

  createPromotion: (data: {
    title: string;
    description?: string;
    badgeText?: string;
    ctaLabel?: string;
    ctaHref?: string;
    active?: boolean;
  }) =>
    fetchApi<SitePromotion>('/api/promotions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePromotion: (
    id: string,
    data: Partial<{
      title: string;
      description: string;
      badgeText: string;
      ctaLabel: string;
      ctaHref: string;
      active: boolean;
      sortOrder: number;
    }>
  ) =>
    fetchApi<SitePromotion>(`/api/promotions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deletePromotion: (id: string) =>
    fetchApi<void>(`/api/promotions/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  updateAppointment: (id: string, data: Partial<Appointment>) =>
    fetchApi<Appointment>(`/api/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteAppointment: (id: string) =>
    fetchApi<void>(`/api/appointments/${id}`, { method: 'DELETE' }),

  cancelMyAppointment: (id: string) =>
    fetchApi<Appointment & { cancelNotice?: CancelAppointmentNotice }>(
      `/api/appointments/${encodeURIComponent(id)}/cancel`,
      { method: 'POST' }
    ),

  rescheduleMyAppointment: (id: string, data: { date: string; time: string }) =>
    fetchApi<Appointment>(`/api/appointments/${encodeURIComponent(id)}/reschedule`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getShopSettings: () => fetchApi<ShopSettings>('/api/shop-settings'),

  /** Solo admin: estado de integraci?n AFIP (Afip SDK). */
  getAfipStatus: () =>
    fetchApi<{
      configured: boolean;
      production: boolean;
      mode: 'per_barber';
      barbers: AfipBarberStatusRow[];
      readyCount: number;
    }>('/api/afip/status'),

  getBarberInvoicingUsage: (year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year != null) params.set('year', String(year));
    if (month != null) params.set('month', String(month));
    const q = params.toString() ? `?${params}` : '';
    return fetchApi<{ year: number; month: number; barbers: BarberInvoicingUsage[] }>(
      `/api/afip/barber-invoicing${q}`
    );
  },

  /** Solo admin: emite comprobante electr?nico AFIP para un turno (opcional: productos de venta). */
  createAfipInvoice: (
    appointmentId: string,
    body?: { productLines?: { productId: string; quantity: number }[] }
  ) =>
    fetchApi<{ cae: string; caeVto: string; cbteNro: number; ptoVta: number }>(
      `/api/afip/invoice/${encodeURIComponent(appointmentId)}`,
      {
        method: 'POST',
        body: body && (body.productLines?.length ?? 0) > 0 ? JSON.stringify(body) : undefined,
      }
    ),

  updateShopSettings: (
    data: Partial<
      Pick<
        ShopSettings,
        | 'cutoffHours'
        | 'openWeekdays'
        | 'depositPercent'
        | 'closeTime'
        | 'weekdayHours'
        | 'closedDates'
        | 'whatsappMessageTemplate'
      >
    >
  ) =>
    fetchApi<ShopSettings>('/api/shop-settings', { method: 'PATCH', body: JSON.stringify(data) }),

  updateBarber: (
    barberId: string,
    data: {
      name?: string;
      commissionPercent?: number;
      monotributoCategory?: string | null;
      monotributoMonthlyLimit?: number | null;
      afipCuit?: string | null;
      afipPtoVta?: number | null;
      afipCbteTipo?: number | null;
      afipCert?: string | null;
      afipKey?: string | null;
      afipAccessToken?: string | null;
    }
  ) =>
    fetchApi<Barber>(`/api/barbers/${encodeURIComponent(barberId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updateBarberCommission: (barberId: string, commissionPercent: number) =>
    fetchApi<Barber>(`/api/barbers/${encodeURIComponent(barberId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ commissionPercent }),
    }),

  getAvailability: (date: string, barberId: string, durationMinutes?: number) => {
    const q = new URLSearchParams({ date, barberId });
    if (durationMinutes != null) q.set('durationMinutes', String(durationMinutes));
    return fetchApi<{ slots: string[] }>(`/api/appointments/availability?${q}`);
  },

  getAvailabilityAny: (date: string, durationMinutes?: number) => {
    const q = new URLSearchParams({ date });
    if (durationMinutes != null) q.set('durationMinutes', String(durationMinutes));
    return fetchApi<{ slots: string[]; earliest: { barberId: string; time: string } | null }>(
      `/api/appointments/availability/any?${q}`
    );
  },

  getServices: () => fetchApi<Service[]>('/api/services'),
  getService: (id: string) => fetchApi<Service>(`/api/services/${id}`),
  createService: (data: Omit<Service, 'id'>) =>
    fetchApi<Service>('/api/services', { method: 'POST', body: JSON.stringify(data) }),
  updateService: (id: string, data: Partial<Service>) =>
    fetchApi<Service>(`/api/services/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  reorderServices: (ids: string[]) =>
    fetchApi<Service[]>('/api/services/reorder/manual', {
      method: 'PATCH',
      body: JSON.stringify({ ids }),
    }),
  deleteService: (id: string) =>
    fetchApi<void>(`/api/services/${id}`, { method: 'DELETE' }),

  /** Admin o barbero: solo puntos del servicio. */
  updateServicePointsReward: (id: string, pointsReward: number) =>
    fetchApi<Service>(`/api/services/${encodeURIComponent(id)}/points-reward`, {
      method: 'PUT',
      body: JSON.stringify({ pointsReward }),
    }),

  getShopProducts: () => fetchApi<ShopProduct[]>('/api/shop-products'),
  createShopProduct: (data: { name: string; pointsReward: number; unitPrice?: string | null }) =>
    fetchApi<ShopProduct>('/api/shop-products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateShopProduct: (
    id: string,
    data: Partial<{ name: string; pointsReward: number; unitPrice: string | null }>
  ) =>
    fetchApi<ShopProduct>(`/api/shop-products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteShopProduct: (id: string) =>
    fetchApi<void>(`/api/shop-products/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getPointsRedemptionOptions: () =>
    fetchApi<{ options: PointsRedemptionOption[] }>('/api/points-redemption-options'),
  createPointsRedemptionOption: (data: { label: string; pointsCost: number }) =>
    fetchApi<PointsRedemptionOption>('/api/points-redemption-options', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updatePointsRedemptionOption: (id: string, data: Partial<{ label: string; pointsCost: number }>) =>
    fetchApi<PointsRedemptionOption>(`/api/points-redemption-options/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deletePointsRedemptionOption: (id: string) =>
    fetchApi<void>(`/api/points-redemption-options/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getBarbers: () => fetchApi<Barber[]>('/api/barbers'),

  getBarberSchedule: (barberId: string) =>
    fetchApi<{ francos: BarberFrancoRow[]; blocks: BarberTimeBlockRow[] }>(
      `/api/barber-schedule/${encodeURIComponent(barberId)}`
    ),

  addBarberFranco: (barberId: string, weekday: number) =>
    fetchApi<BarberFrancoRow>(`/api/barber-schedule/${encodeURIComponent(barberId)}/francos`, {
      method: 'POST',
      body: JSON.stringify({ weekday }),
    }),

  deleteBarberFranco: (barberId: string, francoId: number) =>
    fetchApi<void>(
      `/api/barber-schedule/${encodeURIComponent(barberId)}/francos/${francoId}`,
      { method: 'DELETE' }
    ),

  addBarberTimeBlock: (
    barberId: string,
    data: {
      blockDate: string | null;
      weekday: number | null;
      timeStart: string;
      timeEnd: string;
    }
  ) =>
    fetchApi<BarberTimeBlockRow>(`/api/barber-schedule/${encodeURIComponent(barberId)}/blocks`, {
      method: 'POST',
      body: JSON.stringify({
        blockDate: data.blockDate,
        weekday: data.weekday,
        timeStart: data.timeStart,
        timeEnd: data.timeEnd,
      }),
    }),

  deleteBarberTimeBlock: (barberId: string, blockId: number) =>
    fetchApi<void>(
      `/api/barber-schedule/${encodeURIComponent(barberId)}/blocks/${blockId}`,
      { method: 'DELETE' }
    ),

  getStaffInvites: () => fetchApi<StaffInviteRow[]>('/api/staff-invites'),

  createStaffInvite: (data: { email: string; name?: string; barberId: string }) =>
    fetchApi<StaffInviteRow>('/api/staff-invites', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteStaffInvite: (id: number) =>
    fetchApi<void>(`/api/staff-invites/${id}`, { method: 'DELETE' }),

  /** Admin y barberos (staff): clientes con historial de turnos. */
  getAdminClientsWithHistory: () =>
    fetchApi<{ clients: AdminClientWithHistory[] }>('/api/users/clients'),

  /** Solo admin: un cliente por id (rol client) con su historial. */
  getAdminClient: (clientId: number) =>
    fetchApi<{ client: AdminClientWithHistory }>(`/api/users/clients/${clientId}`),

  /** Solo admin: alta manual (el cliente podr? vincular Google al iniciar sesi?n con el mismo email). */
  createAdminClient: (data: { name: string; email?: string; phone?: string; phones?: string[]; points?: number }) =>
    fetchApi<{ client: AdminClientWithHistory }>('/api/users/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Solo admin: actualiza un cliente. Por ahora solo el flag de exención de seña. */
  updateAdminClient: (
    clientId: number,
    data: {
      name?: string;
      email?: string;
      phones?: string[];
      phone?: string;
      points?: number;
      depositExempt?: boolean;
      subscriptionPlanId?: string | null;
      adminNotes?: string | null;
      accountBalanceArs?: number;
    }
  ) =>
    fetchApi<{ client: AdminClientWithHistory }>(
      `/api/users/clients/${encodeURIComponent(String(clientId))}`,
      { method: 'PATCH', body: JSON.stringify(data) }
    ),

  /** Solo admin: elimina una ficha de cliente y desvincula sus turnos de la cuenta. */
  deleteAdminClient: (clientId: number) =>
    fetchApi<void>(`/api/users/clients/${encodeURIComponent(String(clientId))}`, {
      method: 'DELETE',
    }),

  getFixedMonthlyExpenses: () =>
    fetchApi<{ items: FixedMonthlyExpense[] }>('/api/expenses/fixed'),

  createFixedMonthlyExpense: (data: { description: string; amount: number; active?: boolean }) =>
    fetchApi<{ item: FixedMonthlyExpense }>('/api/expenses/fixed', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateFixedMonthlyExpense: (
    id: number,
    data: Partial<{ description: string; amount: number; active: boolean }>
  ) =>
    fetchApi<{ item: FixedMonthlyExpense }>(`/api/expenses/fixed/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteFixedMonthlyExpense: (id: number) =>
    fetchApi<void>(`/api/expenses/fixed/${id}`, { method: 'DELETE' }),

  getCashExpenses: (fromYmd: string, toYmd: string) =>
    fetchApi<{ items: CashExpense[] }>(
      `/api/expenses/cash?from=${encodeURIComponent(fromYmd)}&to=${encodeURIComponent(toYmd)}`
    ),

  createCashExpense: (data: { expenseDate: string; description: string; amount: number }) =>
    fetchApi<{ item: CashExpense }>('/api/expenses/cash', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCashExpense: (
    id: number,
    data: Partial<{ expenseDate: string; description: string; amount: number }>
  ) =>
    fetchApi<{ item: CashExpense }>(`/api/expenses/cash/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteCashExpense: (id: number) =>
    fetchApi<void>(`/api/expenses/cash/${id}`, { method: 'DELETE' }),

  getDailyCashCloses: (fromYmd: string, toYmd: string) =>
    fetchApi<{ closes: DailyCashClose[] }>(
      `/api/cash-close/daily?from=${encodeURIComponent(fromYmd)}&to=${encodeURIComponent(toYmd)}`
    ),

  getCashClosePaymentSnapshots: (fromYmd: string, toYmd: string) =>
    fetchApi<{ snapshots: AppointmentCashClosePaymentSnapshot[] }>(
      `/api/cash-close/payment-snapshots?from=${encodeURIComponent(fromYmd)}&to=${encodeURIComponent(toYmd)}`
    ),

  closeDailyCash: (date: string) =>
    fetchApi<{ close: DailyCashClose }>('/api/cash-close/daily', {
      method: 'POST',
      body: JSON.stringify({ date }),
    }),

  reopenDailyCash: (date: string) =>
    fetchApi<void>(`/api/cash-close/daily/${encodeURIComponent(date)}`, { method: 'DELETE' }),

  getSubscriptionPlans: () =>
    fetchApi<{ plans: SubscriptionPlan[] }>('/api/subscription-plans'),

  createSubscriptionPlan: (data: {
    name: string;
    monthlyPrice: string;
    cutsPerMonth: number;
    active?: boolean;
    description?: string;
    category?: string;
    compareAtPrice?: string;
    discountLabel?: string;
    bonusText?: string;
    features?: string[];
    highlighted?: boolean;
    badgeText?: string;
    validityDays?: number | null;
  }) =>
    fetchApi<SubscriptionPlan>('/api/subscription-plans', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSubscriptionPlan: (
    id: string,
    data: Partial<{
      name: string;
      monthlyPrice: string;
      cutsPerMonth: number;
      active: boolean;
      description: string;
      category: string;
      compareAtPrice: string;
      discountLabel: string;
      bonusText: string;
      features: string[];
      highlighted: boolean;
      badgeText: string;
      validityDays: number | null;
      sortOrder: number;
    }>
  ) =>
    fetchApi<SubscriptionPlan>(`/api/subscription-plans/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteSubscriptionPlan: (id: string) =>
    fetchApi<void>(`/api/subscription-plans/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  auth: {
    postGoogle: (idToken: string, linkPhone?: string) =>
      fetchApi<{
        token: string;
        user: {
          id: number;
          email: string;
          name: string;
          role: string;
          points: number;
          barberId?: string | null;
          avatarUrl?: string | null;
          depositExempt?: boolean;
          subscription?: ClientSubscriptionInfo | null;
          isSuperAdmin?: boolean;
        };
      }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({
          idToken,
          ...(linkPhone != null && String(linkPhone).trim() !== ''
            ? { linkPhone: String(linkPhone).trim() }
            : {}),
        }),
      }),
    getMe: () =>
      fetchApi<{
        id: number;
        email: string;
        name: string;
        role: string;
        points: number;
        barberId?: string | null;
        avatarUrl?: string | null;
        depositExempt?: boolean;
        subscription?: ClientSubscriptionInfo | null;
        isSuperAdmin?: boolean;
      }>('/api/auth/me'),
  },
};
