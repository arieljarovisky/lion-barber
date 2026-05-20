export type AppointmentStatus = 'scheduled' | 'pending_payment' | 'cancelled';

export type ServicePaymentMethod = 'cash' | 'card' | 'transfer' | 'mercadopago';

export interface ServicePaymentSplit {
  method: ServicePaymentMethod;
  amount: number;
}

export interface Appointment {
  id: string;
  userId?: number;
  name: string;
  phone: string;
  service: string;
  serviceId?: string;
  barber?: string;
  barberId?: string;
  /** El cliente eligió "cualquier barbero" al reservar (barberId ya está asignado). */
  clientChoseAnyBarber?: boolean;
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
  /** Detalle guardado al emitir (servicio + productos). */
  afipInvoiceDetail?: AfipInvoiceDetail;
  /** @deprecated Usar servicePaymentSplits. Un solo método (datos viejos). */
  servicePaymentMethod?: ServicePaymentMethod | null;
  /** Cobro del saldo en local repartido entre métodos (suma de montos). */
  servicePaymentSplits?: ServicePaymentSplit[] | null;
}

/** Desglose persistido al facturar con AFIP. */
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
  /** CUIT emisor al momento de facturar (barbero del turno). */
  emitterCuit?: string;
  emitterBarberId?: string;
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

/** Qué puede obtener el cliente al canjear puntos (configurable en el panel). */
export interface PointsRedemptionOption {
  id: string;
  /** Texto corto: ej. "10% de descuento en el próximo corte". */
  label: string;
  /** Puntos necesarios para este canje. */
  pointsCost: number;
  sortOrder: number;
}

/** Productos de la barbería (ej. pomada, shampoo): puntos al comprar. */
export interface ShopProduct {
  id: string;
  name: string;
  pointsReward: number;
  /** Precio unitario en ARS (texto como en servicios) para sumar a la factura AFIP. */
  unitPrice?: string | null;
  sortOrder?: number;
}

export interface Barber {
  id: string;
  name: string;
  role: string;
  photo: string;
  desc: string;
  /** Número WhatsApp del barbero en formato E.164 (ej: +54911...). */
  whatsappPhone?: string | null;
  /** Comisión % para el dueño (gestión interna). */
  commissionPercent?: number;
  /** Etiqueta de categoría monotributo (ej. «Categoría D»). */
  monotributoCategory?: string | null;
  /** Tope anual de facturación AFIP en ARS (null = sin límite configurado). */
  monotributoAnnualLimit?: number | null;
  /** CUIT del barbero como emisor AFIP (11 dígitos). */
  afipCuit?: string | null;
  afipPtoVta?: number;
  /** Tipo de comprobante WSFE (11 = Factura C monotributo). */
  afipCbteTipo?: number;
  /** Token Afip SDK cargado (no se expone al frontend). */
  afipAccessTokenConfigured?: boolean;
  /** CUIT + token + certificado y clave ARCA listos para emitir. */
  afipCredentialsConfigured?: boolean;
}
