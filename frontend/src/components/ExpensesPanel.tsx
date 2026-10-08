import { useState, useEffect, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Trash2, Receipt, Wallet, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, ApiError } from '../api';
import type { CashExpense, FixedMonthlyExpense } from '../api';
import { formatArs } from '../utils/money';

export default function ExpensesPanel() {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [fixedItems, setFixedItems] = useState<FixedMonthlyExpense[]>([]);
  const [cashItems, setCashItems] = useState<CashExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const [fixedDesc, setFixedDesc] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [cashDesc, setCashDesc] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [cashDate, setCashDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const fromYmd = format(currentMonth, 'yyyy-MM-dd');
  const toYmd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fixedRes, cashRes] = await Promise.all([
        api.getFixedMonthlyExpenses(),
        api.getCashExpenses(fromYmd, toYmd),
      ]);
      setFixedItems(fixedRes.items);
      setCashItems(cashRes.items);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [fromYmd, toYmd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const run = async (fn: () => Promise<void>) => {
    setErr('');
    setSaving(true);
    try {
      await fn();
      loadData();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleAddFixed = () => {
    const amount = parseFloat(String(fixedAmount).replace(',', '.'));
    void run(async () => {
      await api.createFixedMonthlyExpense({
        description: fixedDesc.trim(),
        amount,
      });
      setFixedDesc('');
      setFixedAmount('');
    });
  };

  const handleAddCash = () => {
    const amount = parseFloat(String(cashAmount).replace(',', '.'));
    void run(async () => {
      await api.createCashExpense({
        expenseDate: cashDate,
        description: cashDesc.trim(),
        amount,
      });
      setCashDesc('');
      setCashAmount('');
      setCashDate(format(new Date(), 'yyyy-MM-dd'));
    });
  };

  const fixedTotal = fixedItems.filter((x) => x.active).reduce((sum, x) => sum + x.amount, 0);
  const cashTotal = cashItems.reduce((sum, x) => sum + x.amount, 0);
  const totalExpenses = Math.round((fixedTotal + cashTotal) * 100) / 100;

  const prevMonth = () => setCurrentMonth((m) => startOfMonth(subMonths(m, 1)));
  const nextMonth = () => setCurrentMonth((m) => startOfMonth(addMonths(m, 1)));

  return (
    <div className="space-y-6">
      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevMonth}
            className="p-2 rounded-lg hover:bg-zinc-100"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-lg font-bold capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="p-2 rounded-lg hover:bg-zinc-100"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/50 px-4 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-800">Total del mes</p>
          <p className="text-xl font-black tabular-nums text-red-900">${formatArs(totalExpenses)}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-zinc-500">Cargando...</div>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-zinc-100 px-5 py-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Receipt className="text-[#b39055]" size={20} />
                <h2 className="text-lg font-black text-zinc-900">Gastos fijos mensuales</h2>
              </div>
              <p className="text-xs text-zinc-500">
                Total activos: <span className="font-bold text-zinc-800">${formatArs(fixedTotal)}</span>
              </p>
            </div>

            <div className="p-5 border-b border-zinc-100 bg-zinc-50/80">
              <p className="text-xs text-zinc-600 mb-3">
                Alquiler, servicios, sueldos fijos, etc.
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="min-w-[10rem] flex-1">
                  <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Concepto</label>
                  <input
                    type="text"
                    value={fixedDesc}
                    onChange={(e) => setFixedDesc(e.target.value)}
                    placeholder="Ej. Alquiler local"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Monto / mes (ARS)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={fixedAmount}
                    onChange={(e) => setFixedAmount(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <button
                  type="button"
                  disabled={saving || !fixedDesc.trim()}
                  onClick={handleAddFixed}
                  className="inline-flex items-center gap-1 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  <Plus size={16} />
                  Agregar
                </button>
              </div>
            </div>

            {fixedItems.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500">No hay gastos fijos cargados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-zinc-50 text-[11px] font-bold uppercase text-zinc-500">
                    <tr>
                      <th className="px-4 py-2">Concepto</th>
                      <th className="px-4 py-2 text-right">Monto mensual</th>
                      <th className="px-4 py-2 text-center">Activo</th>
                      <th className="px-4 py-2 w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {fixedItems.map((item) => (
                      <tr key={item.id} className={!item.active ? 'opacity-50' : ''}>
                        <td className="px-4 py-2 font-medium">{item.description}</td>
                        <td className="px-4 py-2 text-right tabular-nums">${formatArs(item.amount)}</td>
                        <td className="px-4 py-2 text-center">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              void run(() =>
                                api.updateFixedMonthlyExpense(item.id, { active: !item.active }).then(() => {})
                              )
                            }
                            className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                              item.active
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-zinc-200 text-zinc-600'
                            }`}
                          >
                            {item.active ? 'Sí' : 'No'}
                          </button>
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => {
                              if (!window.confirm(`¿Eliminar «${item.description}»?`)) return;
                              void run(() => api.deleteFixedMonthlyExpense(item.id).then(() => {}));
                            }}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                            aria-label="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-zinc-100 px-5 py-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="text-[#b39055]" size={20} />
                <h2 className="text-lg font-black text-zinc-900">Gastos de caja</h2>
              </div>
              <p className="text-xs text-zinc-500">
                Total en el mes: <span className="font-bold text-red-800">${formatArs(cashTotal)}</span>
              </p>
            </div>

            <div className="p-5 border-b border-zinc-100 bg-zinc-50/80">
              <p className="text-xs text-zinc-600 mb-3">
                Gastos puntuales: insumos, delivery, compras menores, etc.
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="w-36">
                  <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={cashDate}
                    onChange={(e) => setCashDate(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="min-w-[10rem] flex-1">
                  <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Concepto</label>
                  <input
                    type="text"
                    value={cashDesc}
                    onChange={(e) => setCashDesc(e.target.value)}
                    placeholder="Ej. Productos de limpieza"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Monto (ARS)</label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <button
                  type="button"
                  disabled={saving || !cashDesc.trim()}
                  onClick={handleAddCash}
                  className="inline-flex items-center gap-1 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  <Plus size={16} />
                  Registrar
                </button>
              </div>
            </div>

            {cashItems.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500">Sin gastos de caja en este mes.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-zinc-50 text-[11px] font-bold uppercase text-zinc-500">
                    <tr>
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2">Concepto</th>
                      <th className="px-4 py-2">Cargó</th>
                      <th className="px-4 py-2 text-right">Monto</th>
                      <th className="px-4 py-2 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {cashItems.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-2 tabular-nums text-zinc-600">{item.expenseDate}</td>
                        <td className="px-4 py-2 font-medium">{item.description}</td>
                        <td className="px-4 py-2 text-zinc-700">{item.createdByName?.trim() || '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-red-800">
                          ${formatArs(item.amount)}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => {
                              if (!window.confirm(`¿Eliminar «${item.description}»?`)) return;
                              void run(() => api.deleteCashExpense(item.id).then(() => {}));
                            }}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                            aria-label="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
