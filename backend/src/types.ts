export type AppointmentStatus = 'scheduled' | 'pending_payment' | 'cancelled';

export interface Appointment {
  id: string;
  userId?: number;
  name: string;
  phone: string;
  service: string;
  serviceId?: string;
  barber?: string;
  barberId?: string;
  date: string;
  time: string;
  /** Duración reservada en minutos (para evitar solapamientos). */
  durationMinutes?: number;
  /** Seña abonada (p. ej. vía Mercado Pago). */
  depositPaid?: boolean;
  /** Id. de pago de Mercado Pago (evita duplicar turnos en webhooks). */
  mercadopagoPaymentId?: string;
  paymentDueAt?: string;
  status?: AppointmentStatus;
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
  /** Comisión % para el dueño (gestión interna). */
  commissionPercent?: number;
}
