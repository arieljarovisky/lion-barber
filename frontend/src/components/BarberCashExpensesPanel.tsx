import { useCallback, useEffect, useState } from 'react';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Wallet } from 'lucide-react';
import { api, ApiError } from '../api';
import type { CashExpense } from '../api';
import { formatArs } from '../utils/money';

/** Carga de gastos de caja para el barbero. El nombre queda en el cierre de caja. */
export default function BarberCashExpensesPanel() {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [cashItems, setCashItems] = useState<CashExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashDesc, setCashDesc] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [cashDate, setCashDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const fromYmd = format(currentMonth, 'yyyy-MM-dd');
  const toYmd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const cashRes = await api.getCashExpenses(fromYmd, toYmd);
      setCashItems(cashRes.items);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Error al cargar gastos');
    } finally {
      setLoading(false);
    }
  }, [fromYmd, toYmd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAddCash = () => {
    const amount = parseFloat(String(cashAmount).replace(',', '.'));
    setErr('');
    setSaving(true);
    void (async () => {
      try {
        await api.createCashExpense({
          expenseDate: cashDate,
          description: cashDesc.trim(),
          amount,
        });
        setCashDesc('');
        setCashAmount('');
        setCashDate(format(new Date(), 'yyyy-MM-dd'));
        await loadData();
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : 'No se pudo guardar');
      } finally {
        setSaving(false);
      }
    })();
  };

  const cashTotal = cashItems.reduce((sum, x) => sum + x.amount, 0);

  return (
    <div className="space-y-6">
      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => startOfMonth(subMonths(m, 1)))}
            className="rounded-lg p-2 hover:bg-zinc-100"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-lg font-bold capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </span>
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => startOfMonth(addMonths(m, 1)))}
            className="rounded-lg p-2 hover:bg-zinc-100"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/50 px-4 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-800">Total del mes</p>
          <p className="text-xl font-black tabular-nums text-red-900">${formatArs(cashTotal)}</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Wallet className="text-[#b39055]" size={20} />
            <h2 className="text-lg font-black text-zinc-900">Gastos de caja</h2>
          </div>
          <p className="text-xs text-zinc-500">Queda registrado a tu nombre en el cierre de caja.</p>
        </div>

        <div className="border-b border-zinc-100 bg-zinc-50/80 p-5">
          <p className="mb-3 text-xs text-zinc-600">
            Insumos, delivery, compras menores y otros gastos del día.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-36">
              <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">Fecha</label>
              <input
                type="date"
                value={cashDate}
                onChange={(e) => setCashDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="min-w-[10rem] flex-1">
              <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">Concepto</label>
              <input
                type="text"
                value={cashDesc}
                onChange={(e) => setCashDesc(e.target.value)}
                placeholder="Ej. Productos de limpieza"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="w-32">
              <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">Monto (ARS)</label>
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

        {loading ? (
          <p className="px-5 py-6 text-sm text-zinc-500">Cargando…</p>
        ) : cashItems.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-500">Sin gastos de caja en este mes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-[11px] font-bold uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Concepto</th>
                  <th className="px-4 py-2">Cargó</th>
                  <th className="px-4 py-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {cashItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2 tabular-nums text-zinc-600">{item.expenseDate}</td>
                    <td className="px-4 py-2 font-medium">{item.description}</td>
                    <td className="px-4 py-2 text-zinc-700">{item.createdByName?.trim() || '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-red-800">
                      ${formatArs(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
