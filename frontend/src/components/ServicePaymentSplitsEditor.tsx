import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ServicePaymentMethod, ServicePaymentSplit } from '../api';
import {
  SERVICE_PAYMENT_METHODS,
  SERVICE_PAYMENT_METHOD_LABELS,
  sumServicePaymentSplits,
} from '../utils/servicePaymentMethod';
import { formatArs, parseSignedArsInput } from '../utils/money';

type Props = {
  splits: ServicePaymentSplit[];
  onChange: (splits: ServicePaymentSplit[]) => void;
  /** Saldo esperado en local (servicio − seña + productos). */
  expectedLocalAmount?: number;
  /** Métodos no elegibles en este formulario (p. ej. restricciones puntuales). */
  excludedMethods?: ServicePaymentMethod[];
  disabled?: boolean;
  compact?: boolean;
};

function nextUnusedMethod(
  splits: ServicePaymentSplit[],
  excludedMethods: ServicePaymentMethod[]
): ServicePaymentMethod | null {
  const excluded = new Set(excludedMethods);
  return (
    SERVICE_PAYMENT_METHODS.find(
      (m) => !excluded.has(m) && !splits.some((s) => s.method === m)
    ) ?? null
  );
}

export default function ServicePaymentSplitsEditor({
  splits,
  onChange,
  expectedLocalAmount,
  excludedMethods = [],
  disabled,
  compact,
}: Props) {
  /** Texto en curso por método (permite escribir "-" antes del número en cuenta corriente). */
  const [amountDrafts, setAmountDrafts] = useState<Partial<Record<ServicePaymentMethod, string>>>({});

  const total = sumServicePaymentSplits(splits);
  const expected = expectedLocalAmount ?? 0;
  const diff = expected > 0 ? total - expected : 0;
  const availableMethods = SERVICE_PAYMENT_METHODS.filter((m) => !excludedMethods.includes(m));
  const canAdd =
    !disabled &&
    splits.length < availableMethods.length &&
    nextUnusedMethod(splits, excludedMethods);

  const addRow = () => {
    const method = nextUnusedMethod(splits, excludedMethods);
    if (!method) return;
    onChange([...splits, { method, amount: 0 }]);
  };

  const updateRow = (index: number, patch: Partial<ServicePaymentSplit>) => {
    onChange(splits.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    const method = splits[index]?.method;
    if (method) {
      setAmountDrafts((d) => {
        const next = { ...d };
        delete next[method];
        return next;
      });
    }
    onChange(splits.filter((_, i) => i !== index));
  };

  const amountDisplay = (row: ServicePaymentSplit) => {
    const draft = amountDrafts[row.method];
    if (draft !== undefined) return draft;
    return row.amount !== 0 ? String(row.amount) : '';
  };

  const clearAmountDraft = (method: ServicePaymentMethod) => {
    setAmountDrafts((d) => {
      if (!(method in d)) return d;
      const next = { ...d };
      delete next[method];
      return next;
    });
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
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <select
              value={row.method}
              disabled={disabled}
              onChange={(e) => {
                const method = e.target.value as ServicePaymentMethod;
                const amount =
                  method !== 'account' && row.amount < 0 ? 0 : row.amount;
                clearAmountDraft(row.method);
                clearAmountDraft(method);
                updateRow(index, { method, amount });
              }}
              className={
                compact
                  ? 'min-w-[6.5rem] flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold'
                  : 'min-w-[8rem] flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm'
              }
            >
              {availableMethods.map((m) => (
                <option
                  key={m}
                  value={m}
                  disabled={splits.some((s, j) => j !== index && s.method === m)}
                >
                  {SERVICE_PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-400">$</span>
              <input
                type="text"
                inputMode="decimal"
                disabled={disabled}
                value={amountDisplay(row)}
                onChange={(e) => {
                  let input = e.target.value;
                  if (row.method !== 'account') {
                    input = input.replace(/-/g, '');
                  }
                  setAmountDrafts((d) => ({ ...d, [row.method]: input }));
                  const raw = input.trim();
                  if (!raw || raw === '-') {
                    updateRow(index, { amount: 0 });
                    return;
                  }
                  if (row.method === 'account') {
                    const parsed = parseSignedArsInput(raw);
                    if (parsed === 'invalid') return;
                    updateRow(index, { amount: Math.round(parsed) });
                    return;
                  }
                  const n = Math.max(0, Math.round(Number(raw.replace(',', '.')) || 0));
                  updateRow(index, { amount: n });
                }}
                onBlur={() => clearAmountDraft(row.method)}
                onWheel={(e) => e.currentTarget.blur()}
                placeholder={row.method === 'account' ? '0 o -5000' : '0'}
                className={
                  compact
                    ? `no-number-spin w-24 rounded-lg border px-2 py-1 text-[11px] tabular-nums ${
                        row.method === 'account' && row.amount < 0
                          ? 'border-amber-300 bg-amber-50 text-amber-950'
                          : 'border-zinc-200'
                      }`
                    : `no-number-spin w-28 rounded-xl border px-3 py-2 text-sm tabular-nums ${
                        row.method === 'account' && row.amount < 0
                          ? 'border-amber-300 bg-amber-50 text-amber-950'
                          : 'border-zinc-200'
                      }`
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
      {splits.some((s) => s.method === 'account' && s.amount < 0) && (
        <p className={`text-amber-800/90 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          Monto negativo en cuenta corriente = el cliente debe esa plata (no ingresa en caja).
        </p>
      )}
    </div>
  );
}
