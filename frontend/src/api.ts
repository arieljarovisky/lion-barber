// En producción definir VITE_API_URL en Vercel (ej: https://tu-backend.railway.app)
const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : '');

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken(): string | null {
  return authToken;
}

export interface Appointment {
  id: string;
  name: string;
  phone: string;
  service: string;
  barber?: string;
  barberId?: string;
  date: string;
  time: string;
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
    throw new Error((err as { error?: string }).error ?? res.statusText);
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

  updateAppointment: (id: string, data: Partial<Appointment>) =>
    fetchApi<Appointment>(`/api/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteAppointment: (id: string) =>
    fetchApi<void>(`/api/appointments/${id}`, { method: 'DELETE' }),

  getAvailability: (date: string, barberId: string) =>
    fetchApi<{ slots: string[] }>(`/api/appointments/availability?date=${encodeURIComponent(date)}&barberId=${encodeURIComponent(barberId)}`),

  getServices: () => fetchApi<Service[]>('/api/services'),
  getService: (id: string) => fetchApi<Service>(`/api/services/${id}`),
  createService: (data: Omit<Service, 'id'>) =>
    fetchApi<Service>('/api/services', { method: 'POST', body: JSON.stringify(data) }),
  updateService: (id: string, data: Partial<Service>) =>
    fetchApi<Service>(`/api/services/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteService: (id: string) =>
    fetchApi<void>(`/api/services/${id}`, { method: 'DELETE' }),
  getBarbers: () => fetchApi<Barber[]>('/api/barbers'),

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
