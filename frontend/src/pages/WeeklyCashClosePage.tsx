import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Lock, Printer, Unlock, Wallet } from 'lucide-react';
import DashboardPanelShell, { type DashboardPanelId } from '../components/DashboardPanelShell';
import { api, ApiError } from '../api';
import type { Appointment, Barber, DailyCashClose, Service, AdminClientWithHistory } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { BARBER_COMMISSION_PERCENT, BARBER_PRODUCT_COMMISSION_PERCENT } from '../constants/barberBusiness';
import { DEPOSIT_PERCENT } from '../constants/deposit';
import { formatArs } from '../utils/money';
import {
  buildWeeklyCashClose,
  periodBoundsFromAnchor,
  formatPeriodLabel,
  shiftPeriodAnchor,
  monthInputValueFromAnchor,
  type CashClosePeriodMode,
} from '../utils/weeklyCashClose';
import {
  SERVICE_PAYMENT_METHODS,
  formatServicePaymentSplits,
} from '../utils/servicePaymentMethod';
import ServicePaymentMethodLabel from '../components/ServicePaymentMethodLabel';
import ClientProfileLink from '../components/ClientProfileLink';
import {
  exportWeeklyCashCloseExcel,
  exportWeeklyCashClosePdf,
  type WeeklyCashCloseExportData,
} from '../utils/weeklyCashCloseExport';
import CashCloseExpensesSection from '../components/CashCloseExpensesSection';
import { prorateFixedMonthlyExpenses, sumCashExpenses } from '../utils/expenseProration';
import { appointmentsWithCashCloseSnapshots } from '../utils/cashCloseSnapshot';
import type { CashExpense, FixedMonthlyExpense, AppointmentCashClosePaymentSnapshot } from '../api';

export default function WeeklyCashClosePage() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const [periodMode, setPeriodMode] = useState<CashClosePeriodMode>('day');
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [fixedExpenses, setFixedExpenses] = useState<FixedMonthlyExpense[]>([]);
  const [cashExpenses, setCashExpenses] = useState<CashExpense[]>([]);
  const [dailyClose, setDailyClose] = useState<DailyCashClose | null>(null);
  const [closingDay, setClosingDay] = useState(false);
  const [closeActionError, setCloseActionError] = useState('');
  const [adminClients, setAdminClients] = useState<AdminClientWithHistory[]>([]);
  const [paymentSnapshots, setPaymentSnapshots] = useState<AppointmentCashClosePaymentSnapshot[]>([]);

  const { start, end, fromYmd, toYmd } = useMemo(
    () => periodBoundsFromAnchor(periodAnchor, periodMode),
    [periodAnchor, periodMode]
  );
  const periodLabel = useMemo(() => formatPeriodLabel(start, end, periodMode), [start, end, periodMode]);

  const handlePanelNavigate = useCallback(
    (panel: DashboardPanelId) => {
      if (panel === 'clientes') {
        navigate('/dashboard/clientes');
        return;
      }
      if (panel === 'estadisticas') {
        navigate('/dashboard/estadisticas');
        return;
      }
      if (panel === 'cierreCaja') {
        navigate('/dashboard/cierre-caja');
        return;
      }
      navigate('/dashboard', { state: { openView: panel } });
    },
    [navigate]
  );

  const loadExpenses = useCallback(() => {
    return Promise.all([
      api.getFixedMonthlyExpenses(),
      api.getCashExpenses(fromYmd, toYmd),
    ]).then(([fixedRes, cashRes]) => {
      setFixedExpenses(fixedRes.items);
      setCashExpenses(cashRes.items);
    });
  }, [fromYmd, toYmd]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      api.getAppointments(),
      api.getBarbers(),
      api.getServices(),
      api.getFixedMonthlyExpenses(),
      api.getCashExpenses(fromYmd, toYmd),
      api.getAdminClientsWithHistory(),
      api.getCashClosePaymentSnapshots(fromYmd, toYmd),
    ])
      .then(([apps, barberList, serviceList, fixedRes, cashRes, clientsRes, snapshotsRes]) => {
        if (cancelled) return;
        setAppointments(apps);
        setBarbers(barberList);
        setServices(serviceList);
        setFixedExpenses(fixedRes.items);
        setCashExpenses(cashRes.items);
        setAdminClients(clientsRes.clients);
        setPaymentSnapshots(snapshotsRes.snapshots);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'No se pudo cargar los datos del cierre.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromYmd, toYmd]);

  useEffect(() => {
    if (periodMode !== 'day') {
      setDailyClose(null);
      return;
    }
    let cancelled = false;
    api
      .getDailyCashCloses(fromYmd, fromYmd)
      .then((r) => {
        if (!cancelled) setDailyClose(r.closes[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setDailyClose(null);
      });
    return () => {
      cancelled = true;
    };
  }, [periodMode, fromYmd]);

  const handleCloseDay = async () => {
    if (
      !window.confirm(
        `¿Cerrar la caja del ${periodLabel}?\n\nSe congelan los cobros de ese día para el cierre. Después podés seguir editando pagos en la agenda sin que cambien estos números.`
      )
    ) {
      return;
    }
    setCloseActionError('');
    setClosingDay(true);
    try {
      const { close } = await api.closeDailyCash(fromYmd);
      setDailyClose(close);
      const snapshotsRes = await api.getCashClosePaymentSnapshots(fromYmd, toYmd);
      setPaymentSnapshots(snapshotsRes.snapshots);
    } catch (e) {
      setCloseActionError(e instanceof ApiError ? e.message : 'No se pudo cerrar el día');
    } finally {
      setClosingDay(false);
    }
  };

  const handleReopenDay = async () => {
    if (!window.confirm(`¿Reabrir la caja del ${periodLabel}?`)) return;
    setCloseActionError('');
    setClosingDay(true);
    try {
      await api.reopenDailyCash(fromYmd);
      setDailyClose(null);
      const snapshotsRes = await api.getCashClosePaymentSnapshots(fromYmd, toYmd);
      setPaymentSnapshots(snapshotsRes.snapshots);
    } catch (e) {
      setCloseActionError(e instanceof ApiError ? e.message : 'No se pudo reabrir el día');
    } finally {
      setClosingDay(false);
    }
  };

  const appointmentsForClose = useMemo(
    () => appointmentsWithCashCloseSnapshots(appointments, paymentSnapshots),
    [appointments, paymentSnapshots]
  );

  const { rows, byBarber, summary } = useMemo(
    () => buildWeeklyCashClose(appointmentsForClose, services, barbers, DEPOSIT_PERCENT, start, end),
    [appointmentsForClose, services, barbers, start, end]
  );

  const { lines: proratedFixed, total: proratedFixedTotal } = useMemo(
    () => prorateFixedMonthlyExpenses(fixedExpenses, fromYmd, toYmd),
    [fixedExpenses, fromYmd, toYmd]
  );
  const cashExpensesTotal = useMemo(() => sumCashExpenses(cashExpenses), [cashExpenses]);

  const exportData = useMemo<WeeklyCashCloseExportData>(
    () => ({
      periodMode,
      periodLabel,
      fromYmd,
      toYmd,
      depositPercent: DEPOSIT_PERCENT,
      summary,
      byBarber,
      rows,
    }),
    [periodMode, periodLabel, fromYmd, toYmd, summary, byBarber, rows]
  );

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    setExporting('excel');
    try {
      exportWeeklyCashCloseExcel(exportData);
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = () => {
    setExporting('pdf');
    try {
      exportWeeklyCashClosePdf(exportData);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans flex print:bg-white">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          aside { display: none !important; }
          main.lg\\:ml-64 { margin-left: 0 !important; }
          main { padding: 1rem !important; max-width: 100% !important; }
          .cash-close-table-wrap {
            overflow: visible !important;
            max-height: none !important;
          }
          .cash-close-table-wrap table {
            min-width: 0 !important;
            width: 100% !important;
            font-size: 9px !important;
          }
          section { break-inside: avoid; page-break-inside: avoid; }
          .cash-close-detail-section { break-inside: auto; page-break-inside: auto; }
        }
        .print-only { display: none; }
      `}</style>
      <DashboardPanelShell activePanel="cierreCaja" onNavigate={handlePanelNavigate}>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl flex items-center gap-2">
                <Wallet className="text-[#b39055]" size={28} />
                Cierre de caja
              </h1>
              <p className="mt-1 text-sm text-zinc-500 max-w-xl">
                Resumen de turnos confirmados por día, semana (lunes a domingo) o mes calendario: señas por Mercado Pago, saldo en local,
                comisión del barbero ({BARBER_COMMISSION_PERCENT}% del servicio y {BARBER_PRODUCT_COMMISSION_PERCENT}% de
                productos facturados en el turno), facturación AFIP y gastos fijos / de caja. No incluye turnos con seña
                pendiente.
              </p>
            </div>
            <div className="no-print flex flex-col items-stretch gap-3 sm:items-end">
              <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 self-start sm:self-end">
                <button
                  type="button"
                  onClick={() => setPeriodMode('day')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                    periodMode === 'day'
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Por día
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodMode('week')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                    periodMode === 'week'
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Por semana
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodMode('month')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                    periodMode === 'month'
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Por mes
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPeriodAnchor((d) => shiftPeriodAnchor(d, periodMode, -1))}
                className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
                aria-label={
                  periodMode === 'day'
                    ? 'Día anterior'
                    : periodMode === 'month'
                      ? 'Mes anterior'
                      : 'Semana anterior'
                }
              >
                <ChevronLeft size={18} />
              </button>
              <div className="min-w-[12rem] rounded-xl border border-zinc-200 bg-white px-4 py-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  {periodMode === 'day' ? 'Día' : periodMode === 'month' ? 'Mes' : 'Semana'}
                </p>
                <p className="text-sm font-bold text-zinc-900 capitalize">{periodLabel}</p>
                <p className="text-[11px] text-zinc-500 tabular-nums">
                  {periodMode === 'day' ? fromYmd : `${fromYmd} → ${toYmd}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPeriodAnchor((d) => shiftPeriodAnchor(d, periodMode, 1))}
                className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
                aria-label={
                  periodMode === 'day'
                    ? 'Día siguiente'
                    : periodMode === 'month'
                      ? 'Mes siguiente'
                      : 'Semana siguiente'
                }
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
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 tabular-nums"
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
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 tabular-nums"
                  aria-label="Elegir mes"
                />
              ) : null}
              {periodMode === 'day' && isSuperAdmin ? (
                dailyClose ? (
                  <button
                    type="button"
                    disabled={closingDay}
                    onClick={() => void handleReopenDay()}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    <Unlock size={16} />
                    {closingDay ? 'Procesando…' : 'Reabrir día'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={closingDay || loading}
                    onClick={() => void handleCloseDay()}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-400 bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Lock size={16} />
                    {closingDay ? 'Cerrando…' : 'Cerrar caja del día'}
                  </button>
                )
              ) : null}
              <button
                type="button"
                disabled={loading || exporting !== null}
                onClick={handleExportExcel}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
              >
                <FileSpreadsheet size={16} />
                {exporting === 'excel' ? 'Generando…' : 'Excel'}
              </button>
              <button
                type="button"
                disabled={loading || exporting !== null}
                onClick={handleExportPdf}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-900 hover:bg-red-100 disabled:opacity-50"
              >
                <FileText size={16} />
                {exporting === 'pdf' ? 'Generando…' : 'PDF'}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                <Printer size={16} />
                Imprimir
              </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {closeActionError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {closeActionError}
            </div>
          )}
          {periodMode === 'day' && dailyClose && (
            <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-bold flex items-center gap-2">
                <Lock size={16} />
                Caja cerrada para este día
              </p>
              <p className="mt-1 text-emerald-800/90">
                Cerrado por {dailyClose.closedByName ?? `usuario #${dailyClose.closedByUserId}`}. Los cobros
                congelados de este cierre no cambian aunque edites pagos en la agenda. Solo super admin puede
                reabrir el día o modificar turnos.
              </p>
            </div>
          )}
          {periodMode === 'day' && !dailyClose && isSuperAdmin && (
            <div className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              Día abierto: podés revisar los cobros y usar <strong>Cerrar caja del día</strong> cuando termines. Al cerrar, los montos quedan fijos aunque después cambien los cobros en la agenda.
              Después del cierre, el resto del equipo no podrá editar turnos de esta fecha.
            </div>
          )}

          <div className="print-only mb-4 text-center">
            <p className="font-black text-lg">Lion Barber — Cierre de caja</p>
            <p className="text-sm text-zinc-600 capitalize">{periodLabel}</p>
          </div>

          {loading ? (
            <p className="text-zinc-500">Cargando cierre…</p>
          ) : (
            <>
              <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="Turnos confirmados" value={String(summary.appointments)} />
                <SummaryCard
                  label="Ingreso en caja (servicios)"
                  value={`$${formatArs(summary.serviceGross)}`}
                  hint="Seña MP + cobrado en local (sin abono)"
                />
                <SummaryCard
                  label="Señas (Mercado Pago)"
                  value={`$${formatArs(summary.depositsMp)}`}
                  hint={`${DEPOSIT_PERCENT}% del servicio`}
                  accent="emerald"
                />
                <SummaryCard
                  label="Cobrado en local"
                  value={`$${formatArs(summary.localPending)}`}
                  hint="Efectivo, tarjeta, cuenta, etc."
                  accent="amber"
                />
                {summary.nonCashServiceTotal > 0 && (
                  <SummaryCard
                    label="Abono y canje"
                    value={`$${formatArs(summary.nonCashServiceTotal)}`}
                    hint="No entra plata en caja; sí genera comisión al barbero"
                  />
                )}
              </div>

              <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                  label="Comisiones barberos"
                  value={`$${formatArs(summary.commissions)}`}
                  hint="Sobre valor del servicio (incluye abono y canje)"
                />
                <SummaryCard
                  label="Neto en caja (est.)"
                  value={`$${formatArs(summary.shopNetEstimate)}`}
                  hint="Ingreso en caja − comisiones a pagar"
                  accent="gold"
                />
                <SummaryCard
                  label="Facturado AFIP"
                  value={`$${formatArs(summary.afipInvoicedTotal)}`}
                  hint={`${summary.afipInvoicedCount} comprobante(s)`}
                />
                {summary.tipsTotal > 0 && (
                  <SummaryCard
                    label="Propinas"
                    value={`$${formatArs(summary.tipsTotal)}`}
                    hint="No se facturan con AFIP"
                    accent="gold"
                  />
                )}
                <SummaryCard
                  label="Sin facturar AFIP"
                  value={String(summary.pendingAfipCount)}
                  hint={
                    summary.cancelledInWeek > 0
                      ? `${summary.cancelledInWeek} cancelado(s) en el período`
                      : 'Turnos con importe'
                  }
                />
              </div>

              <section className="mb-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-3">
                  <h2 className="font-black text-zinc-900">Cobros en local por método</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Saldo cobrado en el turno (sin abono). El abono por cortes no suma acá.
                  </p>
                </div>
                <div className="cash-close-table-wrap overflow-x-auto p-4">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="pb-2 text-left">Método</th>
                        <th className="pb-2 text-right">Importe en local</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {SERVICE_PAYMENT_METHODS.map((m) => (
                        <tr key={m}>
                          <td className="py-2 font-medium text-zinc-800">
                            <ServicePaymentMethodLabel method={m} />
                          </td>
                          <td className="py-2 text-right tabular-nums">${formatArs(summary.localByMethod[m])}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="py-2 font-medium text-zinc-500">Sin registrar</td>
                        <td className="py-2 text-right tabular-nums text-amber-800">
                          ${formatArs(summary.localByMethod.unregistered)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mb-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-3">
                  <h2 className="font-black text-zinc-900">Por barbero</h2>
                </div>
                {byBarber.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-zinc-500">
                    Sin turnos en{' '}
                    {periodMode === 'day' ? 'este día' : periodMode === 'month' ? 'este mes' : 'esta semana'}.
                  </p>
                ) : (
                  <div className="cash-close-table-wrap overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="bg-zinc-100 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="px-4 py-3">Barbero</th>
                          <th className="px-4 py-3 text-right">Turnos</th>
                          <th className="px-4 py-3 text-right">Servicios</th>
                          <th className="px-4 py-3 text-right">Señas MP</th>
                          <th className="px-4 py-3 text-right">En local</th>
                          <th className="px-4 py-3 text-right">Comisión</th>
                          <th className="px-4 py-3 text-right">Propinas</th>
                          <th className="px-4 py-3 text-right">AFIP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {byBarber.map((b) => (
                          <tr key={b.barberKey} className="hover:bg-zinc-50/70">
                            <td className="px-4 py-3 font-semibold text-zinc-900">{b.barberName}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{b.appointments}</td>
                            <td className="px-4 py-3 text-right tabular-nums">${formatArs(b.serviceGross)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                              ${formatArs(b.depositsMp)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-amber-800">
                              ${formatArs(b.localPending)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium">
                              ${formatArs(b.commission)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-violet-700">
                              {b.tips > 0 ? `$${formatArs(b.tips)}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">${formatArs(b.afipInvoiced)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t border-zinc-200 bg-zinc-50 font-bold">
                        <tr>
                          <td className="px-4 py-3">Total</td>
                          <td className="px-4 py-3 text-right">{summary.appointments}</td>
                          <td className="px-4 py-3 text-right">${formatArs(summary.serviceGross)}</td>
                          <td className="px-4 py-3 text-right text-emerald-800">
                            ${formatArs(summary.depositsMp)}
                          </td>
                          <td className="px-4 py-3 text-right text-amber-900">
                            ${formatArs(summary.localPending)}
                          </td>
                          <td className="px-4 py-3 text-right">${formatArs(summary.commissions)}</td>
                          <td className="px-4 py-3 text-right text-violet-800">
                            {summary.tipsTotal > 0 ? `$${formatArs(summary.tipsTotal)}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">${formatArs(summary.afipInvoicedTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>

              <section className="cash-close-detail-section overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-3 flex items-center justify-between">
                  <h2 className="font-black text-zinc-900">Detalle de turnos</h2>
                  <span className="text-xs font-bold text-zinc-500">{rows.length} filas</span>
                </div>
                {rows.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-zinc-500">
                    No hay turnos confirmados en{' '}
                    {periodMode === 'day' ? 'este día' : periodMode === 'month' ? 'este mes' : 'esta semana'}.
                  </p>
                ) : (
                  <div className="cash-close-table-wrap overflow-x-auto md:max-h-[min(50vh,520px)] md:overflow-y-auto">
                    <table className="w-full min-w-[960px] text-left text-sm">
                      <thead className="bg-zinc-100 text-[11px] font-bold uppercase tracking-wide text-zinc-500 md:sticky md:top-0 md:z-10">
                        <tr>
                          <th className="px-3 py-2">Fecha</th>
                          <th className="px-3 py-2">Hora</th>
                          <th className="px-3 py-2">Cliente</th>
                          <th className="px-3 py-2">Servicio</th>
                          <th className="px-3 py-2">Barbero</th>
                          <th className="px-3 py-2 text-right">Servicio</th>
                          <th className="px-3 py-2 text-right">Seña</th>
                          <th className="px-3 py-2 text-right">En local</th>
                          <th className="px-3 py-2 text-right">Propina</th>
                          <th className="px-3 py-2">Pago</th>
                          <th className="px-3 py-2 text-right">Comisión</th>
                          <th className="px-3 py-2 text-center">AFIP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {rows.map((r) => (
                          <tr key={r.appointmentId} className="hover:bg-zinc-50/70">
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-zinc-700">{r.date}</td>
                            <td className="px-3 py-2 font-mono text-xs">{r.time}</td>
                            <td className="max-w-[10rem] truncate px-3 py-2 font-medium">
                              <ClientProfileLink
                                userId={r.clientUserId}
                                name={r.clientName}
                                adminClients={adminClients}
                                className="font-medium hover:text-[#b39055]"
                              />
                            </td>
                            <td className="max-w-[12rem] truncate px-3 py-2 text-zinc-700">{r.serviceName}</td>
                            <td className="max-w-[8rem] truncate px-3 py-2">{r.barberName}</td>
                            <td className="px-3 py-2 text-right tabular-nums">${formatArs(r.serviceAmount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                              {r.depositPaid ? (
                                `$${formatArs(r.depositAmount)}`
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-amber-800">
                              {r.localPending <= 0 && r.subscriptionAmount + r.canjeAmount > 0 ? (
                                <span className="text-violet-700" title="Abono o canje de puntos">
                                  {r.canjeAmount > 0 && r.subscriptionAmount <= 0
                                    ? 'Canje'
                                    : r.subscriptionAmount > 0 && r.canjeAmount <= 0
                                      ? 'Abono'
                                      : 'Abono/Canje'}
                                </span>
                              ) : (
                                `$${formatArs(r.localPending)}`
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-violet-700">
                              {r.tipAmount > 0 ? `$${formatArs(r.tipAmount)}` : '—'}
                            </td>
                            <td className="max-w-[14rem] px-3 py-2 text-xs font-medium text-zinc-700">
                              {formatServicePaymentSplits(
                                r.servicePaymentSplits,
                                r.servicePaymentMethod,
                                r.localPending
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              ${formatArs(r.commissionAmount)}
                              <span className="block text-[10px] font-normal text-zinc-400">
                                {r.commissionPercent}% serv.
                                {r.productCommissionAmount > 0 &&
                                  ` + ${BARBER_PRODUCT_COMMISSION_PERCENT}% prod.`}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {r.afipInvoiced ? (
                                <span className="text-[10px] font-bold text-emerald-700">Sí</span>
                              ) : (
                                <span className="text-[10px] text-zinc-400">No</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

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

              <p className="mt-6 text-xs text-zinc-500 max-w-3xl">
                Las señas son el {DEPOSIT_PERCENT}% del servicio. La comisión de productos ({BARBER_PRODUCT_COMMISSION_PERCENT}
                %) aplica solo si se facturaron productos en AFIP con ese turno. «En local» es el saldo estimado (servicio −
                seña). Registrá los cobros en cada turno desde la agenda; podés combinar métodos (ej. efectivo + tarjeta) con el
                monto de cada uno.
              </p>
            </>
          )}
        </DashboardPanelShell>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'emerald' | 'amber' | 'gold';
}) {
  const border =
    accent === 'emerald'
      ? 'border-emerald-200 bg-emerald-50/40'
      : accent === 'amber'
        ? 'border-amber-200 bg-amber-50/40'
        : accent === 'gold'
          ? 'border-[#e5c185]/50 bg-[#e5c185]/10'
          : 'border-zinc-200 bg-white';
  const valueColor =
    accent === 'emerald' ? 'text-emerald-800' : accent === 'amber' ? 'text-amber-900' : 'text-zinc-900';

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${border}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-black tabular-nums ${valueColor}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}
