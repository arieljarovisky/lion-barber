import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Printer, Wallet } from 'lucide-react';
import DashboardPanelShell, { type DashboardPanelId } from '../components/DashboardPanelShell';
import { api } from '../api';
import type { Appointment, Barber, Service } from '../api';
import { BARBER_COMMISSION_PERCENT } from '../constants/barberBusiness';
import { formatArs } from '../utils/money';
import {
  buildWeeklyCashClose,
  formatWeekLabel,
  shiftWeekAnchor,
  weekBoundsFromAnchor,
} from '../utils/weeklyCashClose';
import {
  SERVICE_PAYMENT_METHODS,
  SERVICE_PAYMENT_METHOD_LABELS,
  formatServicePaymentSplits,
} from '../utils/servicePaymentMethod';
import {
  exportWeeklyCashCloseExcel,
  exportWeeklyCashClosePdf,
  type WeeklyCashCloseExportData,
} from '../utils/weeklyCashCloseExport';

export default function WeeklyCashClosePage() {
  const navigate = useNavigate();
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [depositPercent, setDepositPercent] = useState(30);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  const { start, end, fromYmd, toYmd } = useMemo(() => weekBoundsFromAnchor(weekAnchor), [weekAnchor]);
  const weekLabel = useMemo(() => formatWeekLabel(start, end), [start, end]);

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([api.getAppointments(), api.getBarbers(), api.getServices(), api.getShopSettings()])
      .then(([apps, barberList, serviceList, shop]) => {
        if (cancelled) return;
        setAppointments(apps);
        setBarbers(barberList);
        setServices(serviceList);
        setDepositPercent(shop.depositPercent);
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
  }, []);

  const { rows, byBarber, summary } = useMemo(
    () => buildWeeklyCashClose(appointments, services, barbers, depositPercent, start, end),
    [appointments, services, barbers, depositPercent, start, end]
  );

  const exportData = useMemo<WeeklyCashCloseExportData>(
    () => ({
      weekLabel,
      fromYmd,
      toYmd,
      depositPercent,
      summary,
      byBarber,
      rows,
    }),
    [weekLabel, fromYmd, toYmd, depositPercent, summary, byBarber, rows]
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
                Cierre de caja semanal
              </h1>
              <p className="mt-1 text-sm text-zinc-500 max-w-xl">
                Resumen de turnos confirmados (lunes a domingo): señas por Mercado Pago, saldo en local, comisión del barbero
                ({BARBER_COMMISSION_PERCENT}% del servicio) y facturación AFIP por el importe completo del turno. No incluye turnos con seña pendiente.
              </p>
            </div>
            <div className="no-print flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setWeekAnchor((d) => shiftWeekAnchor(d, -1))}
                className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
                aria-label="Semana anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="min-w-[12rem] rounded-xl border border-zinc-200 bg-white px-4 py-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Semana</p>
                <p className="text-sm font-bold text-zinc-900">{weekLabel}</p>
                <p className="text-[11px] text-zinc-500 tabular-nums">
                  {fromYmd} → {toYmd}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWeekAnchor((d) => shiftWeekAnchor(d, 1))}
                className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
                aria-label="Semana siguiente"
              >
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                onClick={() => setWeekAnchor(new Date())}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100"
              >
                Esta semana
              </button>
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

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="print-only mb-4 text-center">
            <p className="font-black text-lg">Lion Barber — Cierre de caja</p>
            <p className="text-sm text-zinc-600">{weekLabel}</p>
          </div>

          {loading ? (
            <p className="text-zinc-500">Cargando cierre…</p>
          ) : (
            <>
              <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="Turnos confirmados" value={String(summary.appointments)} />
                <SummaryCard
                  label="Total servicios"
                  value={`$${formatArs(summary.serviceGross)}`}
                  hint="Valor de catálogo"
                />
                <SummaryCard
                  label="Señas (Mercado Pago)"
                  value={`$${formatArs(summary.depositsMp)}`}
                  hint={`${depositPercent}% del servicio`}
                  accent="emerald"
                />
                <SummaryCard
                  label="Por cobrar en local (est.)"
                  value={`$${formatArs(summary.localPending)}`}
                  hint="Servicio menos seña ya pagada"
                  accent="amber"
                />
              </div>

              <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                  label="Comisiones barberos"
                  value={`$${formatArs(summary.commissions)}`}
                  hint="Según % configurado"
                />
                <SummaryCard
                  label="Neto local (est.)"
                  value={`$${formatArs(summary.shopNetEstimate)}`}
                  hint="Servicios − comisiones"
                  accent="gold"
                />
                <SummaryCard
                  label="Facturado AFIP"
                  value={`$${formatArs(summary.afipInvoicedTotal)}`}
                  hint={`${summary.afipInvoicedCount} comprobante(s)`}
                />
                <SummaryCard
                  label="Sin facturar AFIP"
                  value={String(summary.pendingAfipCount)}
                  hint={
                    summary.cancelledInWeek > 0
                      ? `${summary.cancelledInWeek} cancelado(s) en la semana`
                      : 'Turnos con importe'
                  }
                />
              </div>

              <section className="mb-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-3">
                  <h2 className="font-black text-zinc-900">Cobros en local por método</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Saldo estimado (servicio − seña) según el método registrado en cada turno.
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
                          <td className="py-2 font-medium text-zinc-800">{SERVICE_PAYMENT_METHOD_LABELS[m]}</td>
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
                  <p className="px-4 py-8 text-center text-sm text-zinc-500">Sin turnos en esta semana.</p>
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
                    No hay turnos confirmados en esta semana.
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
                            <td className="max-w-[10rem] truncate px-3 py-2 font-medium">{r.clientName}</td>
                            <td className="max-w-[12rem] truncate px-3 py-2 text-zinc-700">{r.serviceName}</td>
                            <td className="max-w-[8rem] truncate px-3 py-2">{r.barberName}</td>
                            <td className="px-3 py-2 text-right tabular-nums">${formatArs(r.serviceAmount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                              {r.depositPaid ? `$${formatArs(r.depositAmount)}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-amber-800">
                              ${formatArs(r.localPending)}
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
                              {r.commissionPercent > 0 && (
                                <span className="block text-[10px] font-normal text-zinc-400">
                                  {r.commissionPercent}%
                                </span>
                              )}
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

              <p className="mt-6 text-xs text-zinc-500 max-w-3xl">
                Las señas se calculan con el {depositPercent}% configurado. «En local» es el saldo estimado (servicio −
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
