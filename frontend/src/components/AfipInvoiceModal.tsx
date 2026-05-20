import React, { useEffect, useMemo, useState } from 'react';
import { Receipt, X } from 'lucide-react';
import type { Appointment, Barber, BarberInvoicingUsage, Service, ShopProduct } from '../api';
import { api, ApiError } from '../api';
import BarberMonotributoLimitsPanel from './BarberMonotributoLimitsPanel';
import { BARBER_COMMISSION_PERCENT, BARBER_PRODUCT_COMMISSION_PERCENT } from '../constants/barberBusiness';
import {
  appointmentMatchesInvoiceScope,
  isBarberAfipReady,
  resolveBarberForAppointment,
} from '../utils/barberAfip';
import { formatArs, parseArsAmount, resolveAppointmentServiceAmountArs } from '../utils/money';

type LineDraft = { productId: string; quantity: number };

type AfipInvoiceModalProps = {
  appointment: Appointment;
  services: Service[];
  shopProducts: ShopProduct[];
  barbers: Barber[];
  invoiceScopeBarberId?: string | null;
  invoiceScopeBarberName?: string | null;
  onClose: () => void;
  onSuccess: () => void;
  /** Para deshabilitar botones «Facturar» en la agenda mientras se emite. */
  onBusyChange?: (busy: boolean) => void;
  showToast: (message: string, kind?: 'ok' | 'err') => void;
};

export default function AfipInvoiceModal({
  appointment,
  services,
  shopProducts,
  barbers,
  invoiceScopeBarberId = null,
  invoiceScopeBarberName = null,
  onClose,
  onSuccess,
  onBusyChange,
  showToast,
}: AfipInvoiceModalProps) {
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [pickProductId, setPickProductId] = useState('');
  const [pickQty, setPickQty] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [barberUsage, setBarberUsage] = useState<BarberInvoicingUsage | null>(null);
  const [usageYear, setUsageYear] = useState(new Date().getFullYear());
  const [usageLoading, setUsageLoading] = useState(true);

  const billingBarber = useMemo(
    () => resolveBarberForAppointment(appointment, barbers),
    [appointment, barbers]
  );
  const barberId = billingBarber?.id ?? appointment.barberId ?? null;
  const barberAfipReady = isBarberAfipReady(billingBarber);
  const blockedByScope =
    Boolean(invoiceScopeBarberId) &&
    !appointmentMatchesInvoiceScope(appointment, barbers, invoiceScopeBarberId);

  useEffect(() => {
    onBusyChange?.(submitting);
    return () => {
      onBusyChange?.(false);
    };
  }, [submitting, onBusyChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, submitting]);

  useEffect(() => {
    let cancelled = false;
    setUsageLoading(true);
    api
      .getBarberInvoicingUsage()
      .then((r) => {
        if (cancelled) return;
        setUsageYear(r.year);
        const u = barberId ? r.barbers.find((b) => b.barberId === barberId) ?? null : null;
        setBarberUsage(u);
      })
      .catch(() => {
        if (!cancelled) setBarberUsage(null);
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [barberId]);

  const serviceAmount = useMemo(
    () => resolveAppointmentServiceAmountArs(appointment, services),
    [appointment, services]
  );

  const pricedProducts = useMemo(
    () => shopProducts.filter((p) => p.unitPrice && String(p.unitPrice).trim()),
    [shopProducts]
  );

  const productsSubtotal = useMemo(() => {
    let sum = 0;
    for (const line of lines) {
      const p = shopProducts.find((x) => x.id === line.productId);
      if (!p?.unitPrice) continue;
      const unit = parseArsAmount(String(p.unitPrice));
      if (unit == null) continue;
      sum += unit * line.quantity;
    }
    return Math.round(sum * 100) / 100;
  }, [lines, shopProducts]);

  const total = useMemo(() => {
    const s = serviceAmount ?? 0;
    return Math.round((s + productsSubtotal) * 100) / 100;
  }, [serviceAmount, productsSubtotal]);

  const serviceCommission = useMemo(() => {
    const s = serviceAmount ?? 0;
    return s > 0 ? Math.round((s * BARBER_COMMISSION_PERCENT) / 100) : 0;
  }, [serviceAmount]);

  const productCommission = useMemo(() => {
    if (productsSubtotal <= 0) return 0;
    return Math.round((productsSubtotal * BARBER_PRODUCT_COMMISSION_PERCENT) / 100);
  }, [productsSubtotal]);

  const wouldExceedLimit = useMemo(() => {
    if (!barberUsage?.annualLimit || barberUsage.annualLimit <= 0) return false;
    return barberUsage.invoicedTotal + total > barberUsage.annualLimit;
  }, [barberUsage, total]);

  const addLine = () => {
    setError('');
    if (!pickProductId) {
      setError('Elegí un producto.');
      return;
    }
    const q = Math.floor(Number(pickQty));
    if (!Number.isFinite(q) || q < 1) {
      setError('La cantidad debe ser un entero ≥ 1.');
      return;
    }
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === pickProductId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + q };
        return next;
      }
      return [...prev, { productId: pickProductId, quantity: q }];
    });
    setPickQty('1');
  };

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const updateLineQty = (productId: string, qty: number) => {
    const q = Math.floor(qty);
    if (!Number.isFinite(q) || q < 1) {
      removeLine(productId);
      return;
    }
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity: q } : l)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (serviceAmount == null) {
      setError('No se pudo calcular el importe del servicio. Revisá el catálogo o el texto del turno.');
      return;
    }
    if (blockedByScope) {
      setError(
        `Solo podés facturar turnos de ${invoiceScopeBarberName ?? 'tu agenda'}. Este turno es de otro barbero.`
      );
      return;
    }
    setSubmitting(true);
    try {
      const productLines = lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));
      const r = await api.createAfipInvoice(
        appointment.id,
        productLines.length > 0 ? { productLines } : undefined
      );
      showToast(`Factura AFIP autorizada · Pto. ${r.ptoVta} Nº ${r.cbteNro} · CAE ${r.cae}`, 'ok');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Error al facturar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[220] overflow-y-auto bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="afip-invoice-title"
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div
          className="my-auto flex w-full max-w-lg max-h-[min(90dvh,calc(100vh-2rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-100 bg-white px-5 py-4">
            <div className="flex min-w-0 items-center gap-2">
              <Receipt className="h-6 w-6 shrink-0 text-[#b39055]" aria-hidden />
              <div className="min-w-0">
                <h2 id="afip-invoice-title" className="text-lg font-black text-zinc-900">
                  Facturar AFIP
                </h2>
                <p className="truncate text-xs text-zinc-500">
                  {appointment.name} · {appointment.date} {appointment.time}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="shrink-0 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
              aria-label="Cerrar"
            >
              <X size={22} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {blockedByScope && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              Solo podés facturar turnos de <strong>{invoiceScopeBarberName ?? 'tu agenda'}</strong>. Este turno pertenece
              a otro barbero.
            </div>
          )}

          {!barberId && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Este turno no tiene barbero asignado. Asignalo en la agenda antes de facturar.
            </div>
          )}

          {billingBarber && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
              <p className="font-semibold text-zinc-900">Emisor: {billingBarber.name}</p>
              <p className="mt-0.5 text-xs text-zinc-600">
                Token Afip SDK {billingBarber.afipAccessTokenConfigured ? 'cargado' : 'sin cargar'} · CUIT{' '}
                {billingBarber.afipCuit ?? 'sin cargar'} · Pto. venta {billingBarber.afipPtoVta ?? 1} · Factura C a{' '}
                <strong>consumidor final</strong> (importe total del turno)
              </p>
            </div>
          )}

          {barberId && !barberAfipReady && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              Este barbero no tiene AFIP listo. En Configuración cargá su CUIT y el certificado/clave ARCA (PEM).
            </div>
          )}

          {barberId && (
            <BarberMonotributoLimitsPanel
              usage={barberUsage ? [barberUsage] : []}
              year={usageYear}
              loading={usageLoading}
              compact
              highlightBarberId={barberId}
              previewAdditionalAmount={total}
            />
          )}

          {wouldExceedLimit && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              Este comprobante supera el tope anual de monotributo del barbero. Ajustá el importe o actualizá el límite en
              Configuración.
            </div>
          )}

          <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-4 py-3 text-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Servicio (turno completo)</p>
            <p className="font-semibold text-zinc-900">{appointment.service}</p>
            <p className="mt-1 text-zinc-700">
              Subtotal a facturar:{' '}
              {serviceAmount != null ? (
                <span className="font-mono font-bold">$ {formatArs(serviceAmount)}</span>
              ) : (
                <span className="text-amber-800">No disponible — revisá precio en Servicios</span>
              )}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              AFIP factura el importe completo. Liquidación del barbero: {BARBER_COMMISSION_PERCENT}% del servicio
              {productsSubtotal > 0 ? ` y ${BARBER_PRODUCT_COMMISSION_PERCENT}% de los productos` : ''} (no reduce la factura).
            </p>
            {(appointment.tipAmount ?? 0) > 0 && (
              <p className="mt-2 text-xs font-medium text-violet-700">
                Propina del turno ($ {formatArs(appointment.tipAmount!)}): no se incluye en este comprobante AFIP.
              </p>
            )}
          </div>

          {(serviceCommission > 0 || productCommission > 0) && (
            <div className="rounded-xl border border-[#e5c185]/40 bg-[#e5c185]/10 px-4 py-3 text-sm text-zinc-800">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8a6d3b]">Comisión barbero (liquidación)</p>
              <ul className="mt-2 space-y-1 text-xs">
                {serviceCommission > 0 && (
                  <li>
                    Servicio: $ {formatArs(serviceCommission)}{' '}
                    <span className="text-zinc-500">({BARBER_COMMISSION_PERCENT}%)</span>
                  </li>
                )}
                {productCommission > 0 && (
                  <li>
                    Productos: $ {formatArs(productCommission)}{' '}
                    <span className="text-zinc-500">
                      ({BARBER_PRODUCT_COMMISSION_PERCENT}% de $ {formatArs(productsSubtotal)})
                    </span>
                  </li>
                )}
                <li className="font-bold text-zinc-900 pt-1 border-t border-[#e5c185]/30">
                  Total comisión: $ {formatArs(serviceCommission + productCommission)}
                </li>
              </ul>
            </div>
          )}

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-2">Productos de venta (opcional)</p>
            <p className="text-[11px] text-zinc-500 mb-2">
              Si agregás productos, el barbero cobra {BARBER_PRODUCT_COMMISSION_PERCENT}% de comisión sobre esa venta en el
              cierre de caja.
            </p>
            {pricedProducts.length === 0 ? (
              <p className="text-xs text-zinc-500">
                No hay productos con precio de venta cargado. Definí «Precio venta» en la sección Productos.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label className="block text-[10px] font-bold uppercase text-zinc-500">Producto</label>
                    <select
                      value={pickProductId}
                      onChange={(e) => setPickProductId(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    >
                      <option value="">Elegir…</option>
                      {pricedProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ($ {formatArs(parseArsAmount(String(p.unitPrice)) ?? 0)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full sm:w-24">
                    <label className="block text-[10px] font-bold uppercase text-zinc-500">Cant.</label>
                    <input
                      type="number"
                      min={1}
                      value={pickQty}
                      onChange={(e) => setPickQty(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addLine}
                    className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-900 hover:bg-zinc-200"
                  >
                    Agregar
                  </button>
                </div>

                {lines.length > 0 && (
                  <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-100">
                    {lines.map((l) => {
                      const p = shopProducts.find((x) => x.id === l.productId);
                      const unit = p?.unitPrice ? parseArsAmount(String(p.unitPrice)) : null;
                      const sub = unit != null ? Math.round(unit * l.quantity * 100) / 100 : 0;
                      return (
                        <li key={l.productId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                          <span className="flex-1 font-medium text-zinc-900">{p?.name ?? l.productId}</span>
                          <input
                            type="number"
                            min={1}
                            className="w-16 rounded border border-zinc-200 px-2 py-1 text-right text-xs"
                            value={l.quantity}
                            onChange={(e) => updateLineQty(l.productId, Number(e.target.value))}
                          />
                          <span className="w-24 text-right font-mono text-zinc-700">$ {formatArs(sub)}</span>
                          <button
                            type="button"
                            onClick={() => removeLine(l.productId)}
                            className="text-xs font-bold text-red-600 hover:underline"
                          >
                            Quitar
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>

              <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-sm">
                <span className="font-bold text-zinc-700">Total factura (IVA incl.)</span>
                <span className="font-mono text-lg font-black text-zinc-900">$ {formatArs(total)}</span>
              </div>
            </div>

            <div className="flex shrink-0 gap-3 border-t border-zinc-100 bg-white px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 rounded-xl border border-zinc-200 py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  submitting ||
                  blockedByScope ||
                  serviceAmount == null ||
                  wouldExceedLimit ||
                  !barberId ||
                  !barberAfipReady
                }
                className="flex-1 rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {submitting ? 'Emitiendo…' : 'Emitir factura'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
