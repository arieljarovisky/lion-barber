import { useState } from 'react';
import { Plus, Trash2, Receipt, Wallet } from 'lucide-react';
import { api, ApiError } from '../api';
import type { CashExpense, FixedMonthlyExpense } from '../api';
import type { CashClosePeriodMode } from '../utils/weeklyCashClose';
import type { ProratedFixedExpense } from '../utils/expenseProration';
import { formatExpenseMonthHint } from '../utils/expenseProration';
import { formatArs } from '../utils/money';

type Props = {
  periodMode: CashClosePeriodMode;
  fromYmd: string;
  toYmd: string;
  fixedItems: FixedMonthlyExpense[];
  proratedFixed: ProratedFixedExpense[];
  proratedFixedTotal: number;
  cashItems: CashExpense[];
  cashTotal: number;
  shopNetEstimate: number;
  onReload: () => void;
};

export default function CashCloseExpensesSection({
  periodMode,
  fromYmd,
  toYmd,
  fixedItems,
  proratedFixed,
  proratedFixedTotal,
  cashItems,
  cashTotal,
  shopNetEstimate,
  onReload,
}: Props) {
  const [fixedDesc, setFixedDesc] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [cashDesc, setCashDesc] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [cashDate, setCashDate] = useState(fromYmd);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const totalExpenses = Math.round((proratedFixedTotal + cashTotal) * 100) / 100;
  const netAfterExpenses = Math.round((shopNetEstimate - totalExpenses) * 100) / 100;

  const run = async (fn: () => Promise<void>) => {
    setErr('');
    setSaving(true);
    try {
      await fn();
      onReload();
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
      setCashDate(fromYmd);
    });
  };

  return (
    <div className="no-print space-y-6">
      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-800">Gastos del período</p>
          <p className="mt-1 text-xl font-black tabular-nums text-red-900">${formatArs(totalExpenses)}</p>
          <p className="mt-1 text-[11px] text-red-800/80">
            Fijos prorrateados ${formatArs(proratedFixedTotal)} + caja ${formatArs(cashTotal)}
          </p>
        </div>
        <div className="rounded-xl border border-[#e5c185]/50 bg-[#e5c185]/10 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">Neto local (est.)</p>
          <p className="mt-1 text-xl font-black tabular-nums text-zinc-900">${formatArs(shopNetEstimate)}</p>
          <p className="mt-1 text-[11px] text-zinc-500">Antes de gastos</p>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            netAfterExpenses >= 0
              ? 'border-emerald-200 bg-emerald-50/60'
              : 'border-amber-300 bg-amber-50/80'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-700">Resultado estimado</p>
          <p
            className={`mt-1 text-xl font-black tabular-nums ${
              netAfterExpenses >= 0 ? 'text-emerald-900' : 'text-amber-900'
            }`}
          >
            ${formatArs(netAfterExpenses)}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">Neto local − gastos</p>
        </div>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-zinc-100 px-5 py-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Receipt className="text-[#b39055]" size={20} />
            <h2 className="text-lg font-black text-zinc-900">Gastos fijos mensuales</h2>
          </div>
          <p className="text-xs text-zinc-500">
            {periodMode === 'month'
              ? 'Total del mes (cada gasto fijo al monto mensual completo):'
              : `Prorrateo del período (${formatExpenseMonthHint(fromYmd, toYmd)}):`}{' '}
            <span className="font-bold text-zinc-800">${formatArs(proratedFixedTotal)}</span>
          </p>
        </div>

        <div className="p-5 border-b border-zinc-100 bg-zinc-50/80">
          <p className="text-xs text-zinc-600 mb-3">
            Alquiler, servicios, sueldos fijos, etc. En cierre mensual se usa el monto completo; en día/semana se prorratea por
            día.
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
                  <th className="px-4 py-2 text-right">Mensual</th>
                  <th className="px-4 py-2 text-right">
                    {periodMode === 'month' ? 'En el mes' : 'En este período'}
                  </th>
                  <th className="px-4 py-2 text-center">Activo</th>
                  <th className="px-4 py-2 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {fixedItems.map((item) => {
                  const pr = proratedFixed.find((x) => x.id === item.id);
                  return (
                    <tr key={item.id} className={!item.active ? 'opacity-50' : ''}>
                      <td className="px-4 py-2 font-medium">{item.description}</td>
                      <td className="px-4 py-2 text-right tabular-nums">${formatArs(item.amount)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-red-800">
                        {item.active && pr ? `$${formatArs(pr.proratedAmount)}` : '—'}
                      </td>
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
                  );
                })}
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
            Total en período: <span className="font-bold text-red-800">${formatArs(cashTotal)}</span>
          </p>
        </div>

        <div className="p-5 border-b border-zinc-100 bg-zinc-50/80">
          <p className="text-xs text-zinc-600 mb-3">
            Gastos puntuales del día o la semana: insumos, delivery, compras menores, etc.
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="w-36">
              <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Fecha</label>
              <input
                type="date"
                value={cashDate}
                onChange={(e) => setCashDate(e.target.value)}
                min={fromYmd}
                max={toYmd}
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
          <p className="px-5 py-6 text-sm text-zinc-500">Sin gastos de caja en este período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-50 text-[11px] font-bold uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Concepto</th>
                  <th className="px-4 py-2 text-right">Monto</th>
                  <th className="px-4 py-2 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {cashItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2 tabular-nums text-zinc-600">{item.expenseDate}</td>
                    <td className="px-4 py-2 font-medium">{item.description}</td>
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
    </div>
  );
}
