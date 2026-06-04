export type AppointmentStatus = 'scheduled' | 'pending_payment' | 'cancelled';

export type ServicePaymentMethod = 'account' | 'mercadopago' | 'cash' | 'card' | 'subscription' | 'canje';

export interface ServicePaymentSplit {
  method: ServicePaymentMethod;
  amount: number;
}

/**
 * Producto cargado en un turno (venta accesoria al servicio).
 * Guarda snapshot del nombre y precio unitario al momento de la carga,
 * para que el historial no cambie si después se edita o borra el producto del catálogo.
 */
export interface AppointmentProductLine {
  productId: string;
  /** Snapshot del nombre del producto al cargarse. */
  name: string;
  quantity: number;
  /** Precio unitario en ARS al momento de cargarlo. */
  unitPrice: number;
  /** Subtotal en ARS (quantity * unitPrice). */
  subtotal: number;
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
  /** Importe real cobrado como seña (ARS), según Mercado Pago. */
  depositAmountArs?: number;
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
  /** Productos vendidos junto con el turno (cera, pomada, etc.). Aparecen en historial. */
  products?: AppointmentProductLine[] | null;
  /** Si el turno consumió un corte del abono mensual del cliente. */
  subscriptionCutApplied?: boolean;
  /** Propina en ARS; no se incluye en factura AFIP. */
  tipAmount?: number;
  /** Usuario del panel que cargó el turno (staff/admin). */
  createdByUserId?: number;
  /** Último usuario del panel que modificó el turno. */
  updatedByUserId?: number;
}

export interface DailyCashClose {
  date: string;
  closedAt: string;
  closedByUserId: number;
  closedByName?: string;
}

/** Cobros congelados al cerrar caja diaria (no cambian si después editan el turno). */
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

export interface SubscriptionPlan {
  id: string;
  name: string;
  monthlyPrice: string;
  cutsPerMonth: number;
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
  periodEnd: string;
  monthlyPrice: string;
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
  /** Suma de subtotales de productLines (redundante, útil para liquidación). */
  productsTotal?: number;
  /** % comisión barbero sobre productos al emitir. */
  productsCommissionPercent?: number;
  /** Comisión barbero en ARS sobre productos. */
  productsCommissionAmount?: number;
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
  /** Servicio interno: solo aparece en el panel (no se muestra al público). */
  internal?: boolean;
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
  /** Tope mensual de facturación AFIP en ARS (null = sin límite configurado). */
  monotributoMonthlyLimit?: number | null;
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
