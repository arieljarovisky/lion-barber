// En producción definir VITE_API_URL en Vercel (ej: https://tu-backend.railway.app)
const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : '');

let authToken: string | null = null;

/** Errores HTTP de la API (para no cerrar sesión en fallos de red). */
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
  canRescheduleOrCancel?: boolean;
}

export interface Service {
  id: string;
  name: string;
  price: string;
  duration: number;
  desc: string;
  emoji?: string;
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
  createdAt: string;
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

  /** Abre Mercado Pago (Checkout Pro) para abonar la seña; el turno se crea al aprobar el pago (webhook). */
  createCheckoutSena: (data: {
    name: string;
    phone: string;
    service: string;
    serviceId?: string;
    barberId: string;
    date: string;
    time: string;
    userId?: number;
  }) => fetchApi<{ url: string }>('/api/checkout/sena', { method: 'POST', body: JSON.stringify(data) }),

  updateAppointment: (id: string, data: Partial<Appointment>) =>
    fetchApi<Appointment>(`/api/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteAppointment: (id: string) =>
    fetchApi<void>(`/api/appointments/${id}`, { method: 'DELETE' }),

  cancelMyAppointment: (id: string) =>
    fetchApi<Appointment>(`/api/appointments/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),

  rescheduleMyAppointment: (id: string, data: { date: string; time: string }) =>
    fetchApi<Appointment>(`/api/appointments/${encodeURIComponent(id)}/reschedule`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getShopSettings: () => fetchApi<ShopSettings>('/api/shop-settings'),

  updateShopSettings: (data: Partial<Pick<ShopSettings, 'cutoffHours' | 'openWeekdays' | 'depositPercent'>>) =>
    fetchApi<ShopSettings>('/api/shop-settings', { method: 'PATCH', body: JSON.stringify(data) }),

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
  deleteService: (id: string) =>
    fetchApi<void>(`/api/services/${id}`, { method: 'DELETE' }),
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

  createStaffInvite: (data: { email: string; name?: string }) =>
    fetchApi<StaffInviteRow>('/api/staff-invites', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteStaffInvite: (id: number) =>
    fetchApi<void>(`/api/staff-invites/${id}`, { method: 'DELETE' }),

  auth: {
    postGoogle: (idToken: string) =>
      fetchApi<{ token: string; user: { id: number; email: string; name: string; role: string; points: number } }>(
        '/api/auth/google',
        { method: 'POST', body: JSON.stringify({ idToken }) }
      ),
    getMe: () =>
      fetchApi<{ id: number; email: string; name: string; role: string; points: number }>('/api/auth/me'),
  },
};
