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
  /** Factura electrónica AFIP (wsfe) */
  afipCae?: string;
  afipCaeVto?: string;
  afipCbteNro?: number;
  afipPtoVta?: number;
  afipFacturadoAt?: string;
}

export interface Service {
  id: string;
  name: string;
  price: string;
  duration: number;
  desc: string;
  emoji?: string;
  /** Orden manual en el listado (menor valor = más arriba). */
  sortOrder?: number;
  /** Puntos de fidelidad que suma el cliente al concretar este servicio (configurable en el panel). */
  pointsReward?: number;
}

/** Productos de la barbería (ej. pomada, shampoo): puntos al comprar. */
export interface ShopProduct {
  id: string;
  name: string;
  pointsReward: number;
  sortOrder?: number;
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
