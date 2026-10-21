import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../api';
import type {
  AdminClientWithHistory,
  AppointmentProductLine,
  CounterSale,
  CounterSalePaymentMethod,
  ShopProduct,
  SubscriptionPlan,
} from '../api';
import { adminClientPrimaryPhone, foldSearchText } from '../utils/adminClientLookup';
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
  const [clients, setClients] = useState<AdminClientWithHistory[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientQuery, setClientQuery] = useState('');
  const [clientSuggestionsOpen, setClientSuggestionsOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<AdminClientWithHistory | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [planId, setPlanId] = useState('');
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

  const activePlans = useMemo(() => plans.filter((plan) => plan.active), [plans]);
  const selectedPlan = activePlans.find((plan) => plan.id === planId) ?? null;
  const planPrice = selectedPlan ? (parseArsAmount(String(selectedPlan.monthlyPrice)) ?? 0) : 0;
  const productsTotal = useMemo(() => lines.reduce((sum, line) => sum + line.subtotal, 0), [lines]);
  const total = productsTotal + (planPrice > 0 ? Math.round(planPrice) : 0);

  const clientSuggestions = useMemo(() => {
    const q = foldSearchText(clientQuery.trim());
    if (q.length < 2 || selectedClient) return [];
    const digits = clientQuery.replace(/\D/g, '');
    return clients
      .filter((client) => {
        if (foldSearchText(client.name).includes(q)) return true;
        if (digits.length >= 4 && adminClientPrimaryPhone(client).replace(/\D/g, '').includes(digits)) return true;
        return false;
      })
      .slice(0, 8);
  }, [clientQuery, clients, selectedClient]);

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
    api
      .getSubscriptionPlans()
      .then(({ plans: loaded }) => {
        if (!cancelled) setPlans(loaded);
      })
      .catch(() => {
        if (!cancelled) setPlans([]);
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false);
      });
    api
      .getAdminClientsWithHistory()
      .then(({ clients: loaded }) => {
        if (!cancelled) setClients(loaded);
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      })
      .finally(() => {
        if (!cancelled) setClientsLoading(false);
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

  const typedClientName = (selectedClient?.name || clientQuery).trim();
  const creatingNewClient =
    Boolean(selectedPlan) &&
    !selectedClient &&
    !clientsLoading &&
    typedClientName.length >= 2 &&
    clientSuggestions.length === 0;
  const clientRequiredMissing = Boolean(selectedPlan) && !selectedClient && !creatingNewClient;

  const chooseClient = (client: AdminClientWithHistory) => {
    setSelectedClient(client);
    setClientQuery(client.name);
    setBuyerName(client.name);
    setClientSuggestionsOpen(false);
    setFormError('');
  };

  const clearClient = () => {
    setSelectedClient(null);
    setClientQuery('');
    setBuyerName('');
  };

  const handleSave = async () => {
    if (lines.length === 0 && !selectedPlan) {
      setFormError('Agregá un producto o un abono.');
      return;
    }
    if (selectedPlan && planPrice <= 0) {
      setFormError(`«${selectedPlan.name}» no tiene un precio válido.`);
      return;
    }

    let client = selectedClient;
    if (selectedPlan && !client) {
      const name = clientQuery.trim();
      if (name.length < 2) {
        setFormError('Escribí el cliente. El abono se asigna sí o sí.');
        return;
      }
      if (clientsLoading) {
        setFormError('Esperá a que carguen los clientes para asignar el abono.');
        return;
      }
      const exact = clients.filter((item) => foldSearchText(item.name) === foldSearchText(name));
      if (exact.length === 1) {
        client = exact[0];
      } else if (clientSuggestions.length > 0 || exact.length > 1) {
        setFormError('Elegí el cliente de la lista. El abono se asigna a esa ficha.');
        return;
      }
    }

    setSaving(true);
    setFormError('');
    let createdClientName = '';
    try {
      if (selectedPlan && !client) {
        const name = clientQuery.trim();
        const { client: created } = await api.createAdminClient({ name, points: 0 });
        client = created;
        createdClientName = created.name;
        setSelectedClient(created);
        setClientQuery(created.name);
        setBuyerName(created.name);
        setClients((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      }
      const { item } = await api.createCounterSale({
        saleDate,
        buyerName: (client?.name || buyerName).trim() || undefined,
        clientUserId: client?.id,
        paymentMethod,
        products: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        subscriptionPlanId: selectedPlan?.id,
      });
      onSaved(item);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'No se pudo guardar la venta.';
      setFormError(
        createdClientName
          ? `${msg} El cliente «${createdClientName}» ya quedó cargado en la ficha.`
          : msg
      );
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
        className="my-auto max-h-[min(92dvh,900px)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6"
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
          Productos y abonos en el local. Si la venta incluye un abono, se asigna sí o sí a un cliente. El importe
          entra completo en la caja y no comisiona a ningún barbero.
        </p>

        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500" htmlFor="counter-sale-buyer">
          {selectedPlan ? 'Cliente' : 'Comprador'}
          {selectedPlan && <span className="text-red-600"> · obligatorio</span>}
        </label>
        <div className="relative mb-4">
          <input
            id="counter-sale-buyer"
            type="text"
            value={selectedClient ? selectedClient.name : clientQuery || buyerName}
            maxLength={120}
            disabled={saving}
            aria-required={Boolean(selectedPlan)}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedClient(null);
              setClientQuery(value);
              setBuyerName(value);
              setClientSuggestionsOpen(true);
            }}
            onFocus={() => setClientSuggestionsOpen(true)}
            placeholder={
              selectedPlan ? 'Buscar o escribir el cliente del abono' : 'Opcional'
            }
            className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[#b39055] ${
              selectedPlan && !selectedClient ? 'border-amber-400' : 'border-zinc-200'
            } ${selectedClient ? 'pr-16' : ''}`}
            autoComplete="off"
          />
          {selectedClient && (
            <button
              type="button"
              onClick={clearClient}
              disabled={saving}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold text-zinc-500 hover:bg-zinc-100"
            >
              Quitar
            </button>
          )}
          {clientSuggestionsOpen && !selectedClient && clientSuggestions.length > 0 && (
            <ul className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
              {clientSuggestions.map((client) => {
                const phone = adminClientPrimaryPhone(client);
                return (
                  <li key={client.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseClient(client)}
                    >
                      <span className="font-semibold text-zinc-900">{client.name}</span>
                      {phone && <span className="mt-0.5 block text-xs text-zinc-500">{phone}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {clientsLoading && <p className="-mt-3 mb-4 text-xs text-zinc-400">Cargando clientes…</p>}
        {selectedPlan && selectedClient && (
          <p className="-mt-3 mb-4 text-xs text-zinc-600">El abono queda activo para {selectedClient.name}.</p>
        )}
        {selectedPlan && !selectedClient && !clientsLoading && typedClientName.length < 2 && (
          <p className="-mt-3 mb-4 text-xs text-amber-800">Elegí o escribí el cliente. El abono se le asigna sí o sí.</p>
        )}
        {selectedPlan && !selectedClient && !clientsLoading && clientSuggestions.length > 0 && (
          <p className="-mt-3 mb-4 text-xs text-amber-800">Elegí un cliente de la lista para asignarle el abono.</p>
        )}
        {creatingNewClient && (
          <p className="-mt-3 mb-4 text-xs text-amber-800">
            «{typedClientName}» no está en la ficha. Al cobrar se crea el cliente y se le asigna el abono.
          </p>
        )}

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

        <div className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-600" htmlFor="counter-sale-plan">
            Abono
          </label>
          {plansLoading ? (
            <p className="text-sm text-zinc-500">Cargando abonos…</p>
          ) : activePlans.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay abonos activos. Cargalos en Abonos.</p>
          ) : (
            <select
              id="counter-sale-plan"
              value={planId}
              disabled={saving}
              onChange={(e) => {
                setPlanId(e.target.value);
                setFormError('');
              }}
              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm"
            >
              <option value="">Sin abono</option>
              {activePlans.map((plan) => {
                const price = parseArsAmount(String(plan.monthlyPrice)) ?? 0;
                return (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {plan.cutsPerMonth} corte{plan.cutsPerMonth === 1 ? '' : 's'} · $
                    {formatArs(price)}
                  </option>
                );
              })}
            </select>
          )}
          {selectedPlan && selectedClient?.subscription && selectedClient.subscription.cutsRemaining > 0 && (
            <p className="mt-2 text-xs text-amber-800">
              {selectedClient.name} ya tiene «{selectedClient.subscription.planName}» con{' '}
              {selectedClient.subscription.cutsRemaining} corte
              {selectedClient.subscription.cutsRemaining === 1 ? '' : 's'}. Esta venta suma{' '}
              {selectedPlan.cutsPerMonth} corte{selectedPlan.cutsPerMonth === 1 ? '' : 's'} al cupo (quedaría
              con {selectedClient.subscription.cutsRemaining + selectedPlan.cutsPerMonth}).
            </p>
          )}
          {selectedPlan && !selectedClient && (clientsLoading || typedClientName.length < 2) && (
            <p className="mt-2 text-xs text-amber-800">
              Sin cliente no se puede vender el abono. Elegilo de la ficha o escribí el nombre para crearlo.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-600">Productos</p>
            {productsTotal > 0 && (
              <span className="text-sm font-black tabular-nums text-zinc-900">${formatArs(productsTotal)}</span>
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
            disabled={saving || (lines.length === 0 && !selectedPlan) || clientRequiredMissing}
            className="min-h-11 flex-1 rounded-xl bg-[#e5c185] py-2.5 font-bold text-zinc-950 hover:bg-[#d4b074] disabled:opacity-50"
          >
            {saving
              ? 'Guardando…'
              : creatingNewClient
                ? `Crear cliente y cobrar $${formatArs(total)}`
                : `Cobrar $${formatArs(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
