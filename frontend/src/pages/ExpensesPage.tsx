import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, ChevronLeft, ChevronRight } from 'lucide-react';
import DashboardPanelShell, { dashboardPanelHref, type DashboardPanelId } from '../components/DashboardPanelShell';
import CashCloseExpensesSection from '../components/CashCloseExpensesSection';
import ProductPurchasesPanel from '../components/ProductPurchasesPanel';
import { api } from '../api';
import type {
  Appointment,
  AppointmentCashClosePaymentSnapshot,
  Barber,
  CashExpense,
  FixedMonthlyExpense,
  Service,
} from '../api';
import { DEPOSIT_PERCENT } from '../constants/deposit';
import { formatArs } from '../utils/money';
import {
  buildWeeklyCashClose,
  formatPeriodLabel,
  monthInputValueFromAnchor,
  periodBoundsFromAnchor,
  shiftPeriodAnchor,
  type CashClosePeriodMode,
} from '../utils/weeklyCashClose';
import { prorateFixedMonthlyExpenses, sumCashExpenses } from '../utils/expenseProration';
import { appointmentsWithCashCloseSnapshots } from '../utils/cashCloseSnapshot';

export default function ExpensesPage() {
  const navigate = useNavigate();
  const [periodMode, setPeriodMode] = useState<CashClosePeriodMode>('month');
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fixedExpenses, setFixedExpenses] = useState<FixedMonthlyExpense[]>([]);
  const [cashExpenses, setCashExpenses] = useState<CashExpense[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [paymentSnapshots, setPaymentSnapshots] = useState<AppointmentCashClosePaymentSnapshot[]>([]);
  const [productPurchasesTotal, setProductPurchasesTotal] = useState(0);

  const { start, end, fromYmd, toYmd } = useMemo(
    () => periodBoundsFromAnchor(periodAnchor, periodMode),
    [periodAnchor, periodMode]
  );
  const periodLabel = useMemo(() => formatPeriodLabel(start, end, periodMode), [start, end, periodMode]);

  const handlePanelNavigate = useCallback(
    (panel: DashboardPanelId) => {
      const href = dashboardPanelHref(panel);
      if (href) {
        navigate(href);
        return;
      }
      navigate('/dashboard', { state: { openView: panel } });
    },
    [navigate]
  );

  const loadExpenses = useCallback(() => {
    return Promise.all([api.getFixedMonthlyExpenses(), api.getCashExpenses(fromYmd, toYmd)]).then(
      ([fixedRes, cashRes]) => {
        setFixedExpenses(fixedRes.items);
        setCashExpenses(cashRes.items);
      }
    );
  }, [fromYmd, toYmd]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      api.getFixedMonthlyExpenses(),
      api.getCashExpenses(fromYmd, toYmd),
      api.getAppointments(),
      api.getBarbers(),
      api.getServices(),
      api.getCashClosePaymentSnapshots(fromYmd, toYmd),
    ])
      .then(([fixedRes, cashRes, apps, barberList, serviceList, snapshotsRes]) => {
        if (cancelled) return;
        setFixedExpenses(fixedRes.items);
        setCashExpenses(cashRes.items);
        setAppointments(apps);
        setBarbers(barberList);
        setServices(serviceList);
        setPaymentSnapshots(snapshotsRes.snapshots);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'No se pudieron cargar los gastos.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromYmd, toYmd]);

  const appointmentsForClose = useMemo(
    () => appointmentsWithCashCloseSnapshots(appointments, paymentSnapshots),
    [appointments, paymentSnapshots]
  );
  const { summary } = useMemo(
    () => buildWeeklyCashClose(appointmentsForClose, services, barbers, DEPOSIT_PERCENT, start, end),
    [appointmentsForClose, services, barbers, start, end]
  );
  const { lines: proratedFixed, total: proratedFixedTotal } = useMemo(
    () => prorateFixedMonthlyExpenses(fixedExpenses, fromYmd, toYmd),
    [fixedExpenses, fromYmd, toYmd]
  );
  const cashExpensesTotal = useMemo(() => sumCashExpenses(cashExpenses), [cashExpenses]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans flex">
      <DashboardPanelShell activePanel="gastos" onNavigate={handlePanelNavigate}>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
              <Banknote className="text-[#b39055]" size={28} />
              Gastos
            </h1>
            <p className="mt-1 max-w-xl text-sm text-zinc-500">
              Gastos fijos del mes, gastos de caja del período y compras de productos para reponer stock.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <div className="inline-flex self-start rounded-xl border border-zinc-200 bg-white p-1 sm:self-end">
              {(
                [
                  ['day', 'Por día'],
                  ['week', 'Por semana'],
                  ['month', 'Por mes'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPeriodMode(mode)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                    periodMode === mode ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPeriodAnchor((d) => shiftPeriodAnchor(d, periodMode, -1))}
                className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
                aria-label="Período anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="min-w-[12rem] rounded-xl border border-zinc-200 bg-white px-4 py-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  {periodMode === 'day' ? 'Día' : periodMode === 'month' ? 'Mes' : 'Semana'}
                </p>
                <p className="text-sm font-bold capitalize text-zinc-900">{periodLabel}</p>
                <p className="text-[11px] tabular-nums text-zinc-500">
                  {periodMode === 'day' ? fromYmd : `${fromYmd} → ${toYmd}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPeriodAnchor((d) => shiftPeriodAnchor(d, periodMode, 1))}
                className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
                aria-label="Período siguiente"
              >
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                onClick={() => setPeriodAnchor(new Date())}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100"
              >
                {periodMode === 'day' ? 'Hoy' : periodMode === 'month' ? 'Este mes' : 'Esta semana'}
              </button>
              {periodMode === 'day' ? (
                <input
                  type="date"
                  value={fromYmd}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    setPeriodAnchor(new Date(`${v}T12:00:00`));
                  }}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium tabular-nums text-zinc-800"
                  aria-label="Elegir fecha"
                />
              ) : null}
              {periodMode === 'month' ? (
                <input
                  type="month"
                  value={monthInputValueFromAnchor(periodAnchor)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!/^\d{4}-\d{2}$/.test(v)) return;
                    setPeriodAnchor(new Date(`${v}-01T12:00:00`));
                  }}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium tabular-nums text-zinc-800"
                  aria-label="Elegir mes"
                />
              ) : null}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <p className="text-zinc-500">Cargando gastos…</p>
        ) : (
          <>
            <CashCloseExpensesSection
              periodMode={periodMode}
              fromYmd={fromYmd}
              toYmd={toYmd}
              fixedItems={fixedExpenses}
              proratedFixed={proratedFixed}
              proratedFixedTotal={proratedFixedTotal}
              cashItems={cashExpenses}
              cashTotal={cashExpensesTotal}
              shopNetEstimate={summary.shopNetEstimate}
              onReload={() => void loadExpenses()}
            />

            <div className="mt-6">
              <ProductPurchasesPanel fromYmd={fromYmd} toYmd={toYmd} onTotalChange={setProductPurchasesTotal} />
              {productPurchasesTotal > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <p className="text-xs text-amber-800">
                    Las compras de productos (${formatArs(productPurchasesTotal)}) son gastos de reposición de
                    inventario.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </DashboardPanelShell>
    </div>
  );
}
