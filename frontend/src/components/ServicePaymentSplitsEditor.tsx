import { Plus, Trash2 } from 'lucide-react';
import type { ServicePaymentMethod, ServicePaymentSplit } from '../api';
import {
  SERVICE_PAYMENT_METHODS,
  SERVICE_PAYMENT_METHOD_LABELS,
  sumServicePaymentSplits,
} from '../utils/servicePaymentMethod';
import { formatArs } from '../utils/money';

type Props = {
  splits: ServicePaymentSplit[];
  onChange: (splits: ServicePaymentSplit[]) => void;
  /** Saldo esperado en local (servicio − seña). */
  expectedLocalAmount?: number;
  disabled?: boolean;
  compact?: boolean;
};

function nextUnusedMethod(
  splits: ServicePaymentSplit[]
): ServicePaymentMethod | null {
  return SERVICE_PAYMENT_METHODS.find((m) => !splits.some((s) => s.method === m)) ?? null;
}

export default function ServicePaymentSplitsEditor({
  splits,
  onChange,
  expectedLocalAmount,
  disabled,
  compact,
}: Props) {
  const total = sumServicePaymentSplits(splits);
  const expected = expectedLocalAmount ?? 0;
  const diff = expected > 0 ? total - expected : 0;
  const canAdd = !disabled && splits.length < SERVICE_PAYMENT_METHODS.length && nextUnusedMethod(splits);

  const addRow = () => {
    const method = nextUnusedMethod(splits);
    if (!method) return;
    onChange([...splits, { method, amount: 0 }]);
  };

  const updateRow = (index: number, patch: Partial<ServicePaymentSplit>) => {
    onChange(splits.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    onChange(splits.filter((_, i) => i !== index));
  };

  const rowClass = compact
    ? 'flex flex-wrap items-center gap-1.5'
    : 'flex flex-wrap items-center gap-2';

  return (
    <div className="space-y-2">
      {splits.length === 0 ? (
        <p className={compact ? 'text-[10px] text-zinc-500' : 'text-xs text-zinc-500'}>
          Sin cobros registrados. Agregá una o más formas de pago.
        </p>
      ) : (
        splits.map((row, index) => (
          <div key={`${row.method}-${index}`} className={rowClass}>
            <select
              value={row.method}
              disabled={disabled}
              onChange={(e) =>
                updateRow(index, { method: e.target.value as ServicePaymentMethod })
              }
              className={
                compact
                  ? 'min-w-[6.5rem] flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold'
                  : 'min-w-[8rem] flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm'
              }
            >
              {SERVICE_PAYMENT_METHODS.map((m) => (
                <option
                  key={m}
                  value={m}
                  disabled={splits.some((s, j) => j !== index && s.method === m)}
                >
                  {SERVICE_PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-400">$</span>
              <input
                type="number"
                min={0}
                step={100}
                disabled={disabled}
                value={row.amount > 0 ? row.amount : ''}
                onChange={(e) => {
                  const n = Math.max(0, Math.round(Number(e.target.value) || 0));
                  updateRow(index, { amount: n });
                }}
                placeholder="0"
                className={
                  compact
                    ? 'w-20 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] tabular-nums'
                    : 'w-28 rounded-xl border border-zinc-200 px-3 py-2 text-sm tabular-nums'
                }
              />
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeRow(index)}
              className="p-1.5 text-zinc-400 hover:text-red-600 rounded-lg hover:bg-red-50"
              title="Quitar"
            >
              <Trash2 size={compact ? 14 : 16} />
            </button>
          </div>
        ))
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={!canAdd}
          onClick={addRow}
          className={`inline-flex items-center gap-1 font-bold text-[#b39055] hover:text-[#9a7a45] disabled:opacity-40 ${
            compact ? 'text-[10px]' : 'text-xs'
          }`}
        >
          <Plus size={compact ? 14 : 16} />
          Agregar método
        </button>
        {expected > 0 && (
          <p
            className={`tabular-nums ${compact ? 'text-[10px]' : 'text-xs'} ${
              diff === 0 ? 'text-emerald-700 font-semibold' : diff > 0 ? 'text-amber-800' : 'text-zinc-500'
            }`}
          >
            Total: ${formatArs(total)}
            {expected > 0 && ` / $${formatArs(expected)}`}
          </p>
        )}
      </div>
    </div>
  );
}
