import { useEffect, useRef, useState } from 'react';
import { Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../api';
import type { Appointment, AppointmentProductLine, ClientSubscriptionInfo, Service, ServicePaymentSplit, ShopProduct, AdminClientWithHistory } from '../api';
import ServicePaymentSplitsEditor from './ServicePaymentSplitsEditor';
import ClientProfileLink from './ClientProfileLink';
import {
  appointmentDepositAmountArs,
  appointmentLocalPendingArs,
  appointmentSplitsTargetArs,
  buildSubscriptionPrefillSplits,
  cleanServicePaymentSplits,
  formatAppointmentPaymentDisplay,
  initialSplitsFromAppointment,
  normalizeAppointmentPaymentSplits,
} from '../utils/servicePaymentMethod';
import {
  MAX_APPOINTMENT_PRODUCT_LINES,
  buildProductLine,
  pricedShopProducts,
  sumAppointmentProducts,
} from '../utils/appointmentProducts';
import { formatArs, parseArsAmount, resolveAppointmentServiceAmountArs } from '../utils/money';

type Props = {
  app: Appointment | null;
  services: Service[];
  depositPercent: number;
  adminClients?: AdminClientWithHistory[];
  onClose: () => void;
  onSaved: (updated: Appointment) => void;
  onError: (message: string) => void;
};

function tipAmountFromApp(app: Appointment): string {
  const t = app.tipAmount ?? 0;
  return t > 0 ? String(t).replace('.', ',') : '';
}

function parseTipInput(raw: string): number | 'invalid' {
  const tipRaw = raw.trim().replace(',', '.');
  if (tipRaw === '') return 0;
  const n = parseFloat(tipRaw);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return Math.round(n * 100) / 100;
}

export default function AppointmentPaymentSplitsModal({
  app,
  services,
  depositPercent,
  adminClients = [],
  onClose,
  onSaved,
  onError,
}: Props) {
  const [splits, setSplits] = useState<ServicePaymentSplit[]>([]);
  const [tipAmount, setTipAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [shopProducts, setShopProducts] = useState<ShopProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productLines, setProductLines] = useState<AppointmentProductLine[]>([]);
  const [pickProductId, setPickProductId] = useState('');
  const [pickQty, setPickQty] = useState('1');
  const [productsError, setProductsError] = useState('');
  const [clientSubscription, setClientSubscription] = useState<ClientSubscriptionInfo | null>(null);
  /** Subtotal vigente de productos: lo usamos para repartir el delta (agregar/quitar) entre los cobros. */
  const productsSubtotalRef = useRef(0);

  useEffect(() => {
    if (!app?.userId) {
      setClientSubscription(null);
      return;
    }
    let cancelled = false;
    api
      .getAdminClient(app.userId)
      .then((r) => {
        if (!cancelled) setClientSubscription(r.client.subscription ?? null);
      })
      .catch(() => {
        if (!cancelled) setClientSubscription(null);
      });
    return () => {
      cancelled = true;
    };
  }, [app?.userId]);

  useEffect(() => {
    if (!app) return;
    setTipAmount(tipAmountFromApp(app));
    const initialProducts = (app.products ?? []).map((p) => ({ ...p }));
    const productsTotal = sumAppointmentProducts(initialProducts);
    setProductLines(initialProducts);
    productsSubtotalRef.current = productsTotal;
    setSplits(
      initialSplitsFromAppointment(
        app,
        services,
        depositPercent,
        productsTotal,
        clientSubscription
      )
    );
    setPickProductId('');
    setPickQty('1');
    setProductsError('');
  }, [app, services, depositPercent, clientSubscription]);

  /**
   * Al cambiar productos, ajustamos el primer cobro para que el total cobrado refleje
   * la venta del producto. Si no hay cobros cargados todavía, no creamos uno (que el usuario
   * elija el método); cuando lo agregue arrancará desde el saldo nuevo.
   */
  useEffect(() => {
    if (!app) return;
    const newSubtotal = sumAppointmentProducts(productLines);
    const delta = newSubtotal - productsSubtotalRef.current;
    if (delta === 0) return;
    productsSubtotalRef.current = newSubtotal;
    setSplits((prev) => {
      const target = appointmentSplitsTargetArs(app, services, depositPercent, newSubtotal);
      if (prev.length === 0) {
        if (target <= 0) return prev;
        if (clientSubscription && clientSubscription.cutsRemaining > 0 && app.userId != null) {
          return buildSubscriptionPrefillSplits(app, services, depositPercent, newSubtotal);
        }
        const method =
          app.servicePaymentMethod && app.servicePaymentMethod !== 'mercadopago'
            ? app.servicePaymentMethod
            : 'cash';
        return [{ method, amount: target }];
      }
      const hasSubscription = prev.some((s) => s.method === 'subscription');
      if (hasSubscription) {
        const productMethod = prev.find((s) => s.method !== 'subscription')?.method ?? 'cash';
        const servicePart = appointmentLocalPendingArs(app, services, depositPercent);
        const next: ServicePaymentSplit[] = [];
        if (servicePart > 0) next.push({ method: 'subscription', amount: servicePart });
        if (newSubtotal > 0) next.push({ method: productMethod, amount: newSubtotal });
        return normalizeAppointmentPaymentSplits(
          next,
          app,
          services,
          depositPercent,
          newSubtotal
        );
      }
      const next = prev.map((s, i) => {
        if (i !== 0) return s;
        if (s.method === 'account' && s.amount < 0) {
          return { ...s, amount: Math.round(s.amount - delta) };
        }
        return { ...s, amount: Math.max(0, Math.round(s.amount + delta)) };
      });
      return normalizeAppointmentPaymentSplits(
        next,
        app,
        services,
        depositPercent,
        newSubtotal
      );
    });
  }, [productLines, app, services, depositPercent, clientSubscription]);

  useEffect(() => {
    if (!app) return;
    let cancelled = false;
    setProductsLoading(true);
    api
      .getShopProducts()
      .then((p) => {
        if (!cancelled) setShopProducts(p);
      })
      .catch(() => {
        if (!cancelled) setShopProducts([]);
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [app]);

  if (!app) return null;

  const depositAmount = appointmentDepositAmountArs(app, services, depositPercent);
  const productsSubtotal = sumAppointmentProducts(productLines);
  const expectedLocal = appointmentSplitsTargetArs(app, services, depositPercent, productsSubtotal);
  const serviceAmount =
    (resolveAppointmentServiceAmountArs(app, services) ?? 0) + productsSubtotal;
  const pickable = pricedShopProducts(shopProducts);

  const addProductLine = () => {
    setProductsError('');
    const product = pickable.find((p) => p.id === pickProductId);
    if (!product) {
      setProductsError('Elegí un producto del catálogo.');
      return;
    }
    const qty = Math.floor(Number(pickQty));
    if (!Number.isFinite(qty) || qty <= 0) {
      setProductsError('La cantidad debe ser un entero ≥ 1.');
      return;
    }
    setProductLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === product.id);
      if (idx >= 0) {
        const next = [...prev];
        const merged = next[idx].quantity + qty;
        const line = buildProductLine(product, merged);
        if (line) next[idx] = line;
        return next;
      }
      if (prev.length >= MAX_APPOINTMENT_PRODUCT_LINES) {
        setProductsError(`Solo podés cargar hasta ${MAX_APPOINTMENT_PRODUCT_LINES} productos.`);
        return prev;
      }
      const line = buildProductLine(product, qty);
      return line ? [...prev, line] : prev;
    });
    setPickQty('1');
    setPickProductId('');
  };

  const updateProductQty = (productId: string, qtyRaw: number) => {
    const q = Math.floor(qtyRaw);
    setProductLines((prev) => {
      if (!Number.isFinite(q) || q <= 0) {
        return prev.filter((l) => l.productId !== productId);
      }
      return prev.map((l) => {
        if (l.productId !== productId) return l;
        return { ...l, quantity: q, subtotal: l.unitPrice * q };
      });
    });
  };

  const removeProductLine = (productId: string) => {
    setProductLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const handleSave = async () => {
    const parsedTip = parseTipInput(tipAmount);
    if (parsedTip === 'invalid') {
      onError('La propina debe ser un número ≥ 0.');
      return;
    }
    setSaving(true);
    try {
      const normalized = normalizeAppointmentPaymentSplits(
        splits,
        app,
        services,
        depositPercent,
        productsSubtotal
      );
      const cleaned = cleanServicePaymentSplits(normalized);
      const updated = await api.updateAppointment(app.id, {
        servicePaymentSplits: cleaned,
        tipAmount: parsedTip,
        products: productLines.length > 0 ? productLines : null,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'No se pudieron guardar los cobros');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-zinc-100 flex justify-between items-start gap-3">
          <div>
            <h3 className="text-lg font-black text-zinc-900">Cobros y productos</h3>
            <ClientProfileLink
              userId={app.userId}
              name={app.name}
              phone={app.phone}
              adminClients={adminClients}
              className="text-sm text-zinc-600 hover:text-[#b39055]"
            />
            <p className="text-xs text-zinc-500 mt-1">
              Total del turno: <span className="font-bold text-zinc-800">${formatArs(serviceAmount)}</span>
              {depositAmount > 0 && (
                <span className="text-zinc-400">
                  {' '}
                  · seña MP ${formatArs(depositAmount)} + saldo ${formatArs(expectedLocal)}
                </span>
              )}
            </p>
            {(app.servicePaymentSplits?.length || app.servicePaymentMethod || depositAmount > 0) && (
              <p className="text-[11px] text-zinc-400 mt-1">
                Actual:{' '}
                {formatAppointmentPaymentDisplay(app, services, depositPercent, productsSubtotal)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                {depositAmount > 0 ? 'Saldo restante' : 'Cobro en local'}
              </p>
            </div>
            {depositAmount > 0 && (
              <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-sky-800">
                  Seña abonada (reserva web)
                </p>
                <p className="mt-0.5 text-sm font-semibold text-sky-950 tabular-nums">
                  Mercado Pago · ${formatArs(depositAmount)}
                </p>
                <p className="mt-1 text-[11px] text-sky-800/90">
                  Ya está registrada. Abajo cargá el saldo restante (${formatArs(expectedLocal)}), con el
                  método que corresponda.
                </p>
              </div>
            )}
            {clientSubscription && (
              <div
                className={`mb-3 rounded-xl border px-3 py-2.5 ${
                  clientSubscription.cutsRemaining > 0
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-red-200 bg-red-50'
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-700">
                  Abono · {clientSubscription.planName}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-900">
                  {clientSubscription.cutsRemaining > 0
                    ? `${clientSubscription.cutsRemaining} corte${clientSubscription.cutsRemaining === 1 ? '' : 's'} disponible${clientSubscription.cutsRemaining === 1 ? '' : 's'} este mes`
                    : 'Sin cortes disponibles este mes'}
                  <span className="ml-1 text-xs font-normal text-zinc-500">
                    ({clientSubscription.cutsUsed}/{clientSubscription.cutsPerMonth} usados)
                  </span>
                </p>
                {clientSubscription.cutsRemaining > 0 && (
                  <p className="mt-1 text-[11px] text-zinc-600">
                    Al guardar con forma de pago «Abono» se descuenta un corte del cupo mensual.
                  </p>
                )}
              </div>
            )}
            {!app.userId && (
              <p className="mb-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Vinculá este turno a un cliente registrado para poder cobrar con abono.
              </p>
            )}
            <ServicePaymentSplitsEditor
              splits={splits}
              onChange={setSplits}
              expectedLocalAmount={expectedLocal}
              disabled={saving}
            />
            <p className="text-xs text-zinc-500 mt-1">
              {depositAmount > 0
                ? 'La seña no se vuelve a cargar acá. El saldo puede ser efectivo, tarjeta, Mercado Pago, abono u otro método. En cuenta corriente podés usar un monto negativo si debe.'
                : 'Podés combinar métodos (incluido Abono si el cliente tiene cupo). En cuenta corriente, un monto negativo registra deuda del cliente.'}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <ShoppingBag size={14} className="text-[#b39055]" />
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-600">
                  Productos vendidos
                </p>
              </div>
              {productsSubtotal > 0 && (
                <span className="text-[11px] font-bold text-zinc-700 tabular-nums">
                  Subtotal: ${formatArs(productsSubtotal)}
                </span>
              )}
            </div>
            {productsError && (
              <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
                {productsError}
              </div>
            )}
            {productsLoading ? (
              <p className="text-[11px] text-zinc-400">Cargando catálogo…</p>
            ) : pickable.length === 0 ? (
              <p className="text-[11px] text-zinc-500">
                No hay productos con precio cargado. Definí «Precio venta» en la sección Productos.
              </p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1 basis-32">
                  <label className="block text-[10px] font-bold uppercase text-zinc-500">Producto</label>
                  <select
                    value={pickProductId}
                    onChange={(e) => setPickProductId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium"
                  >
                    <option value="">Elegir…</option>
                    {pickable.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ($ {formatArs(parseArsAmount(String(p.unitPrice)) ?? 0)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-16 sm:w-20">
                  <label className="block text-[10px] font-bold uppercase text-zinc-500">Cant.</label>
                  <input
                    type="number"
                    min={1}
                    value={pickQty}
                    disabled={saving || productsLoading}
                    onChange={(e) => setPickQty(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="no-number-spin mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs tabular-nums disabled:opacity-50"
                  />
                </div>
                <button
                  type="button"
                  onClick={addProductLine}
                  className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                  disabled={!pickProductId}
                >
                  <Plus size={12} />
                  Agregar
                </button>
              </div>
            )}
            {productLines.length > 0 && (
              <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
                {productLines.map((l) => (
                  <li key={l.productId} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{l.name}</span>
                    <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                      <span className="tabular-nums">${formatArs(l.unitPrice)}</span>
                      <span className="text-zinc-300">×</span>
                      <input
                        type="number"
                        min={1}
                        value={l.quantity}
                        disabled={saving}
                        onChange={(e) => updateProductQty(l.productId, Number(e.target.value))}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="no-number-spin w-12 rounded border border-zinc-200 px-1.5 py-0.5 text-right text-[11px] tabular-nums disabled:opacity-50"
                      />
                    </div>
                    <span className="w-20 text-right font-mono text-[11px] text-zinc-700 tabular-nums">
                      ${formatArs(l.subtotal)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeProductLine(l.productId)}
                      className="p-1 text-zinc-400 hover:text-red-600"
                      title="Quitar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
              Propina (opcional)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={tipAmount}
              onChange={(e) => setTipAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-zinc-500">No se incluye en la factura AFIP.</p>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-zinc-700 font-bold hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="flex-1 py-2.5 rounded-xl bg-[#e5c185] hover:bg-[#d4b074] text-zinc-950 font-bold disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
