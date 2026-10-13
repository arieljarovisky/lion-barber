import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../api';
import type { AppointmentProductLine, CounterSale, CounterSalePaymentMethod, ShopProduct } from '../api';
import { buildProductLine, MAX_APPOINTMENT_PRODUCT_LINES, pricedShopProducts } from '../utils/appointmentProducts';
import { formatArs, parseArsAmount } from '../utils/money';

const PAYMENT_OPTIONS: { id: CounterSalePaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Efectivo' },
  { id: 'card', label: 'Tarjeta' },
  { id: 'mercadopago', label: 'Mercado Pago' },
];

type Props = {
  saleDate: string;
  onClose: () => void;
  onSaved: (sale: CounterSale) => void;
};

export default function CounterSaleModal({ saleDate, onClose, onSaved }: Props) {
  const [catalog, setCatalog] = useState<ShopProduct[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<CounterSalePaymentMethod>('cash');
  const [lines, setLines] = useState<AppointmentProductLine[]>([]);
  const [pickProductId, setPickProductId] = useState('');
  const [pickQty, setPickQty] = useState('1');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const dateLabel = useMemo(() => {
    try {
      return format(parseISO(`${saleDate}T12:00:00`), "EEEE d 'de' MMMM", { locale: es });
    } catch {
      return saleDate;
    }
  }, [saleDate]);

  const pickable = useMemo(
    () => pricedShopProducts(catalog).filter((p) => p.stock == null || p.stock > 0),
    [catalog]
  );

  const total = useMemo(() => lines.reduce((sum, line) => sum + line.subtotal, 0), [lines]);

  useEffect(() => {
    let cancelled = false;
    setLoadingCatalog(true);
    setCatalogError('');
    api
      .getShopProducts()
      .then((products) => {
        if (!cancelled) setCatalog(products);
      })
      .catch((e) => {
        if (!cancelled) {
          setCatalogError(e instanceof ApiError ? e.message : 'No se pudo cargar el catálogo.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const addLine = () => {
    setFormError('');
    const product = pickable.find((p) => p.id === pickProductId);
    if (!product) return;
    const qty = Math.floor(Number(pickQty));
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError('La cantidad tiene que ser mayor a 0.');
      return;
    }
    const existing = lines.find((line) => line.productId === product.id);
    const nextQty = (existing?.quantity ?? 0) + qty;
    if (product.stock != null && nextQty > product.stock) {
      setFormError(
        product.stock <= 0
          ? `«${product.name}» no tiene stock.`
          : `«${product.name}» tiene ${product.stock} unidad${product.stock === 1 ? '' : 'es'}.`
      );
      return;
    }
    const line = buildProductLine(product, nextQty);
    if (!line) {
      setFormError(`«${product.name}» no tiene precio de venta.`);
      return;
    }
    if (!existing && lines.length >= MAX_APPOINTMENT_PRODUCT_LINES) {
      setFormError(`Podés cargar hasta ${MAX_APPOINTMENT_PRODUCT_LINES} productos.`);
      return;
    }
    setLines((prev) => {
      const rest = prev.filter((item) => item.productId !== product.id);
      return [...rest, line];
    });
    setPickQty('1');
  };

  const updateQty = (productId: string, quantity: number) => {
    const product = catalog.find((p) => p.id === productId);
    const qty = Math.floor(quantity);
    if (!product || !Number.isFinite(qty) || qty <= 0) return;
    if (product.stock != null && qty > product.stock) {
      setFormError(
        `«${product.name}» tiene ${product.stock} unidad${product.stock === 1 ? '' : 'es'}.`
      );
      return;
    }
    const line = buildProductLine(product, qty);
    if (!line) return;
    setFormError('');
    setLines((prev) => prev.map((item) => (item.productId === productId ? line : item)));
  };

  const handleSave = async () => {
    if (lines.length === 0) {
      setFormError('Agregá al menos un producto.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const { item } = await api.createCounterSale({
        saleDate,
        buyerName: buyerName.trim() || undefined,
        paymentMethod,
        products: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      });
      onSaved(item);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'No se pudo guardar la venta.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-4"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="counter-sale-title"
        className="my-auto w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="counter-sale-title" className="flex items-center gap-2 text-lg font-black text-zinc-900">
              <ShoppingBag size={18} className="text-[#b39055]" aria-hidden />
              Nueva venta
            </h2>
            <p className="mt-1 text-sm capitalize text-zinc-500">{dateLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm text-zinc-600">
          Venta de productos en el local. El comprador puede no tener ficha. El importe entra completo en la caja.
        </p>

        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500" htmlFor="counter-sale-buyer">
          Comprador
        </label>
        <input
          id="counter-sale-buyer"
          type="text"
          value={buyerName}
          maxLength={120}
          disabled={saving}
          onChange={(e) => setBuyerName(e.target.value)}
          placeholder="Opcional"
          className="mb-4 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-[#b39055]"
        />

        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Cobro</p>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {PAYMENT_OPTIONS.map((option) => {
            const selected = paymentMethod === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                disabled={saving}
                onClick={() => setPaymentMethod(option.id)}
                className={`min-h-11 rounded-xl border px-2 py-2.5 text-sm font-bold transition-colors ${
                  selected
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-600">Productos</p>
            {total > 0 && (
              <span className="text-sm font-black tabular-nums text-zinc-900">${formatArs(total)}</span>
            )}
          </div>
          {loadingCatalog ? (
            <p className="text-sm text-zinc-500">Cargando catálogo…</p>
          ) : catalogError ? (
            <p className="text-sm text-red-700">{catalogError}</p>
          ) : pickable.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No hay productos con precio y stock. Cargalos en Productos.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 basis-40">
                <label className="block text-[10px] font-bold uppercase text-zinc-500" htmlFor="counter-sale-product">
                  Producto
                </label>
                <select
                  id="counter-sale-product"
                  value={pickProductId}
                  disabled={saving}
                  onChange={(e) => setPickProductId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm"
                >
                  <option value="">Elegir…</option>
                  {pickable.map((product) => {
                    const price = parseArsAmount(String(product.unitPrice)) ?? 0;
                    const stock =
                      product.stock == null ? '' : ` · ${product.stock} u.`;
                    return (
                      <option key={product.id} value={product.id}>
                        {product.name} (${formatArs(price)}
                        {stock})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="w-20">
                <label className="block text-[10px] font-bold uppercase text-zinc-500" htmlFor="counter-sale-qty">
                  Cant.
                </label>
                <input
                  id="counter-sale-qty"
                  type="number"
                  min={1}
                  value={pickQty}
                  disabled={saving}
                  onChange={(e) => setPickQty(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="no-number-spin mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm tabular-nums"
                />
              </div>
              <button
                type="button"
                onClick={addLine}
                disabled={!pickProductId || saving}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                <Plus size={14} aria-hidden />
                Agregar
              </button>
            </div>
          )}

          {lines.length > 0 && (
            <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
              {lines.map((line) => (
                <li key={line.productId} className="flex items-center gap-2 px-2.5 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{line.name}</span>
                  <input
                    type="number"
                    min={1}
                    aria-label={`Cantidad de ${line.name}`}
                    value={line.quantity}
                    disabled={saving}
                    onChange={(e) => updateQty(line.productId, Number(e.target.value))}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="no-number-spin w-14 rounded border border-zinc-200 px-1.5 py-1 text-right text-sm tabular-nums"
                  />
                  <span className="w-24 text-right font-semibold tabular-nums text-zinc-800">
                    ${formatArs(line.subtotal)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((item) => item.productId !== line.productId))}
                    className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Quitar ${line.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {formError && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {formError}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-11 flex-1 rounded-xl border border-zinc-200 py-2.5 font-bold text-zinc-700 hover:bg-zinc-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || lines.length === 0}
            className="min-h-11 flex-1 rounded-xl bg-[#e5c185] py-2.5 font-bold text-zinc-950 hover:bg-[#d4b074] disabled:opacity-50"
          >
            {saving ? 'Guardando…' : `Cobrar $${formatArs(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
