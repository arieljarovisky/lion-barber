import { AlertTriangle, TrendingUp } from 'lucide-react';
import type { BarberInvoicingUsage } from '../api';
import { formatArs } from '../utils/money';

type Props = {
  usage: BarberInvoicingUsage[];
  year: number;
  loading?: boolean;
  compact?: boolean;
  /** Si se pasa, resalta un barbero (modal de factura / fila). */
  highlightBarberId?: string | null;
  /** Monto adicional a sumar para vista previa (ej. comprobante en curso). */
  previewAdditionalAmount?: number;
};

function statusStyles(status: BarberInvoicingUsage['status']) {
  switch (status) {
    case 'exceeded':
      return { bar: 'bg-red-500', text: 'text-red-800', bg: 'bg-red-50 border-red-200' };
    case 'warning':
      return { bar: 'bg-amber-500', text: 'text-amber-900', bg: 'bg-amber-50 border-amber-200' };
    case 'ok':
      return { bar: 'bg-emerald-500', text: 'text-emerald-900', bg: 'bg-emerald-50/80 border-emerald-200' };
    default:
      return { bar: 'bg-zinc-300', text: 'text-zinc-700', bg: 'bg-zinc-50 border-zinc-200' };
  }
}

export default function BarberMonotributoLimitsPanel({
  usage,
  year,
  loading,
  compact,
  highlightBarberId,
  previewAdditionalAmount = 0,
}: Props) {
  if (loading) {
    return <p className="text-sm text-zinc-500">Cargando límites de monotributo…</p>;
  }

  if (usage.length === 0) {
    return null;
  }

  const withLimit = usage.filter((u) => u.annualLimit != null && u.annualLimit > 0);
  const atRisk = withLimit.filter((u) => u.status === 'warning' || u.status === 'exceeded');

  return (
    <div className={`rounded-2xl border border-zinc-200 bg-white shadow-sm ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className={`font-black text-zinc-900 flex items-center gap-2 ${compact ? 'text-sm' : 'text-base'}`}>
            <TrendingUp className="text-[#b39055]" size={compact ? 18 : 20} />
            Monotributo — facturación {year}
          </h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            Total facturado por AFIP en el año (por barbero del turno). Configurá el tope anual en Configuración →
            Barberos y monotributo.
          </p>
        </div>
        {atRisk.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900">
            <AlertTriangle size={14} />
            {atRisk.length} cerca o sobre el límite
          </span>
        )}
      </div>

      <div className={`grid gap-3 ${compact ? 'sm:grid-cols-2' : 'lg:grid-cols-2'}`}>
        {usage.map((u) => {
          const isHighlight = highlightBarberId === u.barberId;
          const extra = isHighlight ? previewAdditionalAmount : 0;
          const projected = u.invoicedTotal + extra;
          const limit = u.annualLimit;
          const pct =
            limit != null && limit > 0
              ? Math.min(100, Math.round((projected / limit) * 1000) / 10)
              : null;
          const styles = statusStyles(
            limit != null && limit > 0 && projected >= limit
              ? 'exceeded'
              : limit != null && limit > 0 && projected >= limit * 0.9
                ? 'warning'
                : u.status
          );

          return (
            <div
              key={u.barberId}
              className={`rounded-xl border p-3 ${styles.bg} ${isHighlight ? 'ring-2 ring-[#e5c185]' : ''}`}
            >
              <div className="flex justify-between gap-2 mb-2">
                <div>
                  <p className="font-bold text-sm text-zinc-900">{u.barberName}</p>
                  {u.monotributoCategory && (
                    <p className="text-[11px] text-zinc-500">{u.monotributoCategory}</p>
                  )}
                </div>
                {limit != null && limit > 0 ? (
                  <p className={`text-xs font-bold tabular-nums ${styles.text}`}>
                    {pct}%
                  </p>
                ) : (
                  <p className="text-[10px] font-bold uppercase text-zinc-400">Sin tope</p>
                )}
              </div>

              <p className="text-xs text-zinc-600 tabular-nums">
                Facturado: <span className="font-semibold">${formatArs(u.invoicedTotal)}</span>
                {extra > 0 && (
                  <span className="text-amber-800">
                    {' '}
                    + ${formatArs(extra)} (este comprobante)
                  </span>
                )}
              </p>

              {limit != null && limit > 0 ? (
                <>
                  <div className="mt-2 h-2 rounded-full bg-white/80 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${styles.bar}`}
                      style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-zinc-500 tabular-nums">
                    Tope anual ${formatArs(limit)}
                    {u.remaining != null && projected < limit && (
                      <> · Disponible ${formatArs(Math.max(0, limit - projected))}</>
                    )}
                    {projected >= limit && (
                      <span className="font-bold text-red-700"> · Límite superado</span>
                    )}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[11px] text-zinc-400">
                  Sin límite configurado — no se bloquea la facturación.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
