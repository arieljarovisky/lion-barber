import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { WeeklyBarberSummary, WeeklyCashRow, WeeklyCashSummary } from './weeklyCashClose';
import {
  SERVICE_PAYMENT_METHODS,
  SERVICE_PAYMENT_METHOD_LABELS,
  formatServicePaymentSplits,
} from './servicePaymentMethod';

export type WeeklyCashCloseExportData = {
  weekLabel: string;
  fromYmd: string;
  toYmd: string;
  depositPercent: number;
  summary: WeeklyCashSummary;
  byBarber: WeeklyBarberSummary[];
  rows: WeeklyCashRow[];
};

function fileBase(data: WeeklyCashCloseExportData): string {
  return `cierre-caja_${data.fromYmd}_${data.toYmd}`;
}

function paymentLabel(r: WeeklyCashRow): string {
  return formatServicePaymentSplits(r.servicePaymentSplits, r.servicePaymentMethod, r.localPending);
}

/** — */
const NA = '—';

export function exportWeeklyCashCloseExcel(data: WeeklyCashCloseExportData): void {
  const wb = XLSX.utils.book_new();

  const resumenRows: (string | number)[][] = [
    ['Lion Barber — Cierre de caja semanal'],
    ['Semana', data.weekLabel],
    ['Desde', data.fromYmd],
    ['Hasta', data.toYmd],
    ['Seña configurada (%)', data.depositPercent],
    [],
    ['Concepto', 'Valor'],
    ['Turnos confirmados', data.summary.appointments],
    ['Total servicios (ARS)', data.summary.serviceGross],
    ['Señas Mercado Pago (ARS)', data.summary.depositsMp],
    ['Por cobrar en local (ARS)', data.summary.localPending],
    ['Comisiones barberos (ARS)', data.summary.commissions],
    ['Neto local estimado (ARS)', data.summary.shopNetEstimate],
    ['Facturado AFIP (ARS)', data.summary.afipInvoicedTotal],
    ['Comprobantes AFIP', data.summary.afipInvoicedCount],
    ['Sin facturar AFIP', data.summary.pendingAfipCount],
    ['Cancelados en la semana', data.summary.cancelledInWeek],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumenRows), 'Resumen');

  const metodoRows: (string | number)[][] = [
    ['Método', 'Importe en local (ARS)'],
    ...SERVICE_PAYMENT_METHODS.map((m) => [
      SERVICE_PAYMENT_METHOD_LABELS[m],
      data.summary.localByMethod[m],
    ]),
    ['Sin registrar', data.summary.localByMethod.unregistered],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metodoRows), 'Por método');

  const barberRows: (string | number)[][] = [
    ['Barbero', 'Turnos', 'Servicios', 'Señas MP', 'En local', 'Comisión', 'AFIP'],
    ...data.byBarber.map((b) => [
      b.barberName,
      b.appointments,
      b.serviceGross,
      b.depositsMp,
      b.localPending,
      b.commission,
      b.afipInvoiced,
    ]),
    [
      'TOTAL',
      data.summary.appointments,
      data.summary.serviceGross,
      data.summary.depositsMp,
      data.summary.localPending,
      data.summary.commissions,
      data.summary.afipInvoicedTotal,
    ],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(barberRows), 'Por barbero');

  const detalleRows: (string | number)[][] = [
    [
      'Fecha',
      'Hora',
      'Cliente',
      'Servicio',
      'Barbero',
      'Servicio ARS',
      'Seña ARS',
      'En local ARS',
      'Forma de pago',
      'Comisión ARS',
      '% Comisión',
      'AFIP',
    ],
    ...data.rows.map((r) => [
      r.date,
      r.time,
      r.clientName,
      r.serviceName,
      r.barberName,
      r.serviceAmount,
      r.depositPaid ? r.depositAmount : NA,
      r.localPending,
      paymentLabel(r),
      r.commissionAmount,
      r.commissionPercent > 0 ? r.commissionPercent : NA,
      r.afipInvoiced ? 'Sí' : 'No',
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalleRows), 'Detalle');

  XLSX.writeFile(wb, `${fileBase(data)}.xlsx`);
}

const PDF_GOLD: [number, number, number] = [179, 144, 85];
const PDF_HEAD: [number, number, number] = [39, 39, 42];

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PDF_HEAD);
  doc.text(title, 14, y);
  return y + 6;
}

function nextY(doc: jsPDF, margin = 12): number {
  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return (finalY ?? 40) + margin;
}

export function exportWeeklyCashClosePdf(data: WeeklyCashCloseExportData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...PDF_HEAD);
  doc.text('Lion Barber', pageWidth / 2, 18, { align: 'center' });

  doc.setFontSize(12);
  doc.text('Cierre de caja semanal', pageWidth / 2, 26, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(data.weekLabel, pageWidth / 2, 33, { align: 'center' });
  doc.text(`${data.fromYmd} → ${data.toYmd}`, pageWidth / 2, 39, { align: 'center' });

  let y = 48;
  y = addSectionTitle(doc, 'Resumen', y);

  autoTable(doc, {
    startY: y,
    head: [['Concepto', 'Valor']],
    body: [
      ['Turnos confirmados', String(data.summary.appointments)],
      ['Total servicios', `$${data.summary.serviceGross.toLocaleString('es-AR')}`],
      ['Señas (Mercado Pago)', `$${data.summary.depositsMp.toLocaleString('es-AR')}`],
      ['Por cobrar en local', `$${data.summary.localPending.toLocaleString('es-AR')}`],
      ['Comisiones barberos', `$${data.summary.commissions.toLocaleString('es-AR')}`],
      ['Neto local (est.)', `$${data.summary.shopNetEstimate.toLocaleString('es-AR')}`],
      ['Facturado AFIP', `$${data.summary.afipInvoicedTotal.toLocaleString('es-AR')}`],
      ['Comprobantes AFIP', String(data.summary.afipInvoicedCount)],
      ['Sin facturar AFIP', String(data.summary.pendingAfipCount)],
      ...(data.summary.cancelledInWeek > 0
        ? [['Cancelados en la semana', String(data.summary.cancelledInWeek)]]
        : []),
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: PDF_GOLD, textColor: [30, 30, 30], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  y = nextY(doc);
  y = addSectionTitle(doc, 'Cobros en local por método', y);

  autoTable(doc, {
    startY: y,
    head: [['Método', 'Importe en local']],
    body: [
      ...SERVICE_PAYMENT_METHODS.map((m) => [
        SERVICE_PAYMENT_METHOD_LABELS[m],
        `$${data.summary.localByMethod[m].toLocaleString('es-AR')}`,
      ]),
      ['Sin registrar', `$${data.summary.localByMethod.unregistered.toLocaleString('es-AR')}`],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: PDF_GOLD, textColor: [30, 30, 30], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  y = nextY(doc);
  y = addSectionTitle(doc, 'Por barbero', y);

  autoTable(doc, {
    startY: y,
    head: [['Barbero', 'Turnos', 'Servicios', 'Señas MP', 'En local', 'Comisión', 'AFIP']],
    body: [
      ...data.byBarber.map((b) => [
        b.barberName,
        String(b.appointments),
        `$${b.serviceGross.toLocaleString('es-AR')}`,
        `$${b.depositsMp.toLocaleString('es-AR')}`,
        `$${b.localPending.toLocaleString('es-AR')}`,
        `$${b.commission.toLocaleString('es-AR')}`,
        `$${b.afipInvoiced.toLocaleString('es-AR')}`,
      ]),
      [
        'TOTAL',
        String(data.summary.appointments),
        `$${data.summary.serviceGross.toLocaleString('es-AR')}`,
        `$${data.summary.depositsMp.toLocaleString('es-AR')}`,
        `$${data.summary.localPending.toLocaleString('es-AR')}`,
        `$${data.summary.commissions.toLocaleString('es-AR')}`,
        `$${data.summary.afipInvoicedTotal.toLocaleString('es-AR')}`,
      ],
    ],
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: PDF_GOLD, textColor: [30, 30, 30], fontStyle: 'bold' },
    footStyles: { fontStyle: 'bold' },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
    margin: { left: 10, right: 10 },
  });

  if (data.rows.length > 0) {
    doc.addPage('a4', 'landscape');
    const landscapeW = doc.internal.pageSize.getWidth();
    addSectionTitle(doc, `Detalle de turnos (${data.rows.length})`, 16);

    autoTable(doc, {
      startY: 22,
      head: [
        [
          'Fecha',
          'Hora',
          'Cliente',
          'Servicio',
          'Barbero',
          'Serv.',
          'Seña',
          'Local',
          'Pago',
          'Com.',
          'AFIP',
        ],
      ],
      body: data.rows.map((r) => [
        r.date,
        r.time,
        r.clientName,
        r.serviceName,
        r.barberName,
        `$${r.serviceAmount.toLocaleString('es-AR')}`,
        r.depositPaid ? `$${r.depositAmount.toLocaleString('es-AR')}` : NA,
        `$${r.localPending.toLocaleString('es-AR')}`,
        paymentLabel(r),
        `$${r.commissionAmount.toLocaleString('es-AR')}`,
        r.afipInvoiced ? 'Sí' : 'No',
      ]),
      styles: { fontSize: 7, cellPadding: 1.2, overflow: 'linebreak' },
      headStyles: { fillColor: PDF_GOLD, textColor: [30, 30, 30], fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 12 },
        2: { cellWidth: 28 },
        3: { cellWidth: 32 },
        4: { cellWidth: 22 },
        5: { cellWidth: 18, halign: 'right' },
        6: { cellWidth: 16, halign: 'right' },
        7: { cellWidth: 18, halign: 'right' },
        8: { cellWidth: 36 },
        9: { cellWidth: 16, halign: 'right' },
        10: { cellWidth: 10, halign: 'center' },
      },
      margin: { left: 8, right: 8 },
      showHead: 'everyPage',
    });
  }

  const pageCount = doc.getNumberOfPages();
  const generatedAt = new Date().toLocaleString('es-AR');
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Generado ${generatedAt} — Página ${i} de ${pageCount}`, w / 2, h - 6, {
      align: 'center',
    });
  }

  doc.save(`${fileBase(data)}.pdf`);
}
