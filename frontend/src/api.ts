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

export const ANY_BARBER_ID = '__any__';

export type AppointmentStatus = 'scheduled' | 'pending_payment' | 'cancelled';

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
  afipFacturadoAt?: string;
  /** Desglose guardado al emitir AFIP */
  afipInvoiceDetail?: AfipInvoiceDetail;
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

export interface Barber {
  id: string;
  name: string;
  role: string;
  photo: string;
  desc: string;
  commissionPercent?: number;
}

export interface ShopSettings {
  cutoffHours: number;
  openWeekdays: number[];
  depositPercent: number;
  closeTime: string;
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

/** Respuesta de GET /api/users/clients (solo admin). */
export interface AdminClientWithHistory {
  id: number;
  email: string;
  name: string;
  /** Tel?fono en la ficha del cliente (tambi?n se guarda en cada turno). */
  phone?: string | null;
  points: number;
  /** Foto de perfil de Google si el cliente inici? sesi?n al menos una vez. */
  avatarUrl?: string | null;
  createdAt: string;
  appointments: Appointment[];
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string>) };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { error?: string }).error ?? res.statusText;
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
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

  /** Crea preferencia de se?a; el front usa `preferenceId` con Wallet Brick (y opcionalmente `url` para redirecci?n). */
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
    fetchApi<{ preferenceId: string; url?: string; appointmentId: string; paymentDueAt: string }>(
      '/api/checkout/sena',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  /** Nueva preferencia MP para un turno pending_payment (p. ej. desde el perfil). Requiere sesi?n. */
  createCheckoutSenaForAppointment: (appointmentId: string) =>
    fetchApi<{ preferenceId: string; url?: string; appointmentId: string; paymentDueAt: string }>(
      `/api/checkout/sena/${encodeURIComponent(appointmentId)}`,
      { method: 'POST' }
    ),

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
  getAfipStatus: () => fetchApi<{ configured: boolean; production: boolean }>('/api/afip/status'),

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

  updateShopSettings: (data: Partial<Pick<ShopSettings, 'cutoffHours' | 'openWeekdays' | 'depositPercent' | 'closeTime'>>) =>
    fetchApi<ShopSettings>('/api/shop-settings', { method: 'PATCH', body: JSON.stringify(data) }),

  updateBarber: (barberId: string, data: { name?: string; commissionPercent?: number }) =>
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

  /** Solo admin: clientes registrados con historial de turnos vinculado a su cuenta. */
  getAdminClientsWithHistory: () =>
    fetchApi<{ clients: AdminClientWithHistory[] }>('/api/users/clients'),

  /** Solo admin: un cliente por id (rol client) con su historial. */
  getAdminClient: (clientId: number) =>
    fetchApi<{ client: AdminClientWithHistory }>(`/api/users/clients/${clientId}`),

  /** Solo admin: alta manual (el cliente podr? vincular Google al iniciar sesi?n con el mismo email). */
  createAdminClient: (data: { name: string; email?: string; phone?: string; points?: number }) =>
    fetchApi<{ client: AdminClientWithHistory }>('/api/users/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  auth: {
    postGoogle: (idToken: string) =>
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
        };
      }>('/api/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) }),
    getMe: () =>
      fetchApi<{
        id: number;
        email: string;
        name: string;
        role: string;
        points: number;
        barberId?: string | null;
        avatarUrl?: string | null;
      }>('/api/auth/me'),
  },
};
