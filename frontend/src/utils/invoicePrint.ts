import type { Appointment, AfipInvoiceDetail, Barber, Service } from '../api';
import { formatInstantInArgentina } from './argentinaTime';
import { formatArs, resolveAppointmentServiceAmountArs } from './money';

export type AfipComprobantePrintVariant = 'invoice' | 'credit_note';

type LineRow = {
  qty: number;
  code: string;
  description: string;
  dispatch: string;
  unitPrice: number;
  amount: number;
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCuitAr(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length !== 11) return esc(digits);
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

function formatDateArFromYmd(ymd: string): string {
  const clean = ymd.slice(0, 10);
  const [y, m, d] = clean.split('-');
  if (!y || !m || !d) return esc(clean);
  return `${d}/${m}/${y}`;
}

function formatMoneyAr(amount: number): string {
  return `$ ${formatArs(amount)}`;
}

/** Nombre completo del peluquero según ficha (agenda). */
export function resolveBarberNameForInvoice(app: Appointment, barbers?: Barber[]): string {
  const bid = app.barberId?.trim();
  if (bid && barbers?.length) {
    const b = barbers.find((x) => x.id === bid);
    if (b?.name?.trim()) return b.name.trim();
  }
  return app.barber?.trim() || '—';
}

function resolveCbteTipoForPrint(cbteTipo: number | undefined, variant: AfipComprobantePrintVariant): number {
  const base = cbteTipo ?? 11;
  if (variant === 'credit_note') {
    if (base === 6) return 8;
    if (base === 11) return 13;
    if (base === 1) return 3;
    if (base === 19) return 21;
    return 13;
  }
  return base;
}

function comprobanteLetter(cbteTipo: number): string {
  if (cbteTipo === 11 || cbteTipo === 13) return 'C';
  if (cbteTipo === 6 || cbteTipo === 8) return 'B';
  if (cbteTipo === 1 || cbteTipo === 3) return 'A';
  return 'X';
}

function comprobanteTitle(cbteTipo: number, variant: AfipComprobantePrintVariant): string {
  const letter = comprobanteLetter(cbteTipo);
  if (variant === 'credit_note') return `NOTA DE CRÉDITO ${letter}`;
  if (letter === 'C') return 'FACTURA C';
  if (letter === 'B') return 'FACTURA B';
  if (letter === 'A') return 'FACTURA A';
  return 'COMPROBANTE';
}

function buildLineRows(
  detail: AfipInvoiceDetail | undefined,
  app: Appointment,
  services: Service[]
): LineRow[] {
  const rows: LineRow[] = [];
  if (detail) {
    rows.push({
      qty: 1,
      code: app.serviceId?.trim() || 'SRV',
      description: detail.serviceLabel,
      dispatch: '',
      unitPrice: detail.serviceAmount,
      amount: detail.serviceAmount,
    });
    for (const pl of detail.productLines) {
      rows.push({
        qty: pl.quantity,
        code: pl.productId,
        description: pl.name,
        dispatch: '',
        unitPrice: pl.unitPrice,
        amount: pl.subtotal,
      });
    }
    return rows;
  }
  const amt = resolveAppointmentServiceAmountArs(app, services);
  if (amt != null) {
    rows.push({
      qty: 1,
      code: app.serviceId?.trim() || 'SRV',
      description: app.service,
      dispatch: '',
      unitPrice: amt,
      amount: amt,
    });
  }
  return rows;
}

function buildAfipComprobanteHtml(opts: {
  app: Appointment;
  services: Service[];
  barbers?: Barber[];
  emitterCuit?: string | null;
  cbteTipo?: number;
  variant: AfipComprobantePrintVariant;
}): string {
  const { app, services, barbers, emitterCuit, variant } = opts;
  const cbteTipo = resolveCbteTipoForPrint(opts.cbteTipo, variant);
  const title = comprobanteTitle(cbteTipo, variant);
  const barberLabel = resolveBarberNameForInvoice(app, barbers);
  const detail = app.afipInvoiceDetail;
  const lineRows = buildLineRows(detail, app, services);
  const total =
    detail?.total ??
    lineRows.reduce((s, r) => s + r.amount, 0) ??
    resolveAppointmentServiceAmountArs(app, services) ??
    0;

  const fechaServYmd = app.date.slice(0, 10);
  const emitidoAr = app.afipFacturadoAt ? formatInstantInArgentina(app.afipFacturadoAt) : null;
  const fechaCbteDisplay = emitidoAr
    ? emitidoAr.split(',')[0]?.trim() || formatDateArFromYmd(fechaServYmd)
    : formatDateArFromYmd(fechaServYmd);

  const periodFrom = formatDateArFromYmd(fechaServYmd);
  const periodTo = formatDateArFromYmd(fechaServYmd);
  const vtoPago = formatDateArFromYmd(fechaServYmd);

  const tableBody =
    lineRows.length > 0
      ? lineRows
          .map(
            (r) => `<tr>
      <td class="n">${r.qty}</td>
      <td class="c">${esc(r.code)}</td>
      <td class="d">${esc(r.description)}</td>
      <td class="c">${esc(r.dispatch)}</td>
      <td class="n">${formatMoneyAr(r.unitPrice)}</td>
      <td class="n">${formatMoneyAr(r.amount)}</td>
    </tr>`
          )
          .join('')
      : `<tr><td colspan="6" class="d" style="text-align:center;color:#666">Sin detalle</td></tr>`;

  const refInvoice =
    variant === 'credit_note' && app.afipCbteNro != null && app.afipPtoVta != null
      ? `<p class="ref">Comprobante asociado: Factura ${comprobanteLetter(opts.cbteTipo ?? 11)} · Pto. Vta. ${app.afipPtoVta} · Nº ${String(app.afipCbteNro).padStart(8, '0')}</p>`
      : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)} · Lion Barber</title>
  <style>
    @page { margin: 12mm; size: A4; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #000;
      background: #fff;
      line-height: 1.35;
    }
    .wrap { max-width: 210mm; margin: 0 auto; }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 2px solid #000;
    }
    .emitter { flex: 1; }
    .emitter h2 { margin: 0 0 4px; font-size: 14px; font-weight: 700; text-transform: uppercase; }
    .emitter p { margin: 0; font-size: 10px; }
    .tipo-box {
      border: 2px solid #000;
      text-align: center;
      min-width: 88px;
      padding: 6px 10px;
    }
    .tipo-box .letter { font-size: 28px; font-weight: 800; line-height: 1; }
    .tipo-box .label { font-size: 9px; font-weight: 700; text-transform: uppercase; margin-top: 4px; }
    .tipo-box .meta { font-size: 9px; margin-top: 6px; border-top: 1px solid #000; padding-top: 4px; }
    .period-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border: 1px solid #000;
      margin-bottom: 0;
    }
    .period-row .cell {
      padding: 6px 8px;
      font-size: 10px;
      border-right: 1px solid #000;
    }
    .period-row .cell:last-child { border-right: none; }
    .period-row .cell strong { font-weight: 700; }
    .party-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border: 1px solid #000;
      border-top: none;
      margin-bottom: 10px;
    }
    .party-row .cell {
      padding: 8px;
      font-size: 10px;
      border-right: 1px solid #000;
      min-height: 72px;
    }
    .party-row .cell:last-child { border-right: none; }
    .party-row p { margin: 0 0 4px; }
    .party-row .lbl { font-weight: 700; }
    table.items {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000;
      font-size: 10px;
    }
    table.items thead th {
      border-bottom: 1px solid #000;
      padding: 6px 5px;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 9px;
      text-align: left;
      background: #fff;
    }
    table.items tbody td {
      border-bottom: 1px solid #ccc;
      padding: 5px;
      vertical-align: top;
    }
    table.items tbody tr:last-child td { border-bottom: none; }
    table.items .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    table.items .c { text-align: left; }
    table.items .d { text-align: left; }
    table.items th.n, table.items th:last-child { text-align: right; }
    table.items th:nth-child(5), table.items th:nth-child(6) { text-align: right; }
    .total-row {
      display: flex;
      justify-content: flex-end;
      border: 1px solid #000;
      border-top: none;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 700;
    }
    .cae {
      margin-top: 12px;
      border: 1px solid #000;
      padding: 10px 12px;
      font-size: 10px;
    }
    .cae strong { font-weight: 700; }
    .ref { margin: 8px 0 0; font-size: 10px; font-style: italic; }
    .foot {
      margin-top: 10px;
      font-size: 8px;
      color: #444;
      text-align: center;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="emitter">
        <h2>Lion Barber</h2>
        <p><span class="lbl">Prestador / Barbero:</span> ${esc(barberLabel)}</p>
        <p><span class="lbl">CUIT emisor:</span> ${emitterCuit ? formatCuitAr(emitterCuit) : '—'}</p>
      </div>
      <div class="tipo-box">
        <div class="letter">${comprobanteLetter(cbteTipo)}</div>
        <div class="label">${esc(title)}</div>
        <div class="meta">
          Pto. Vta. ${app.afipPtoVta ?? '—'}<br />
          Comp. Nº ${app.afipCbteNro != null ? String(app.afipCbteNro).padStart(8, '0') : '—'}<br />
          Fecha ${esc(fechaCbteDisplay)}
        </div>
      </div>
    </div>

    <div class="period-row">
      <div class="cell">
        <strong>Período Facturado Desde:</strong> ${periodFrom}
        &nbsp;&nbsp;<strong>Hasta:</strong> ${periodTo}
      </div>
      <div class="cell">
        <strong>Fecha de Vto. para el pago:</strong> ${vtoPago}
      </div>
    </div>

    <div class="party-row">
      <div class="cell">
        <p><span class="lbl">Sr./es:</span> ${esc(app.name)}</p>
        <p><span class="lbl">Tel.:</span> ${esc(app.phone || '—')}</p>
        <p><span class="lbl">C.U.I.T.:</span> —</p>
        <p><span class="lbl">Condición frente al IVA:</span> Consumidor Final</p>
      </div>
      <div class="cell">
        <p><span class="lbl">Transporte:</span> —</p>
        <p><span class="lbl">N° Transporte:</span> —</p>
        <p><span class="lbl">Condición de venta:</span> Contado</p>
        <p><span class="lbl">Servicio:</span> ${esc(fechaServYmd)} · ${esc(app.time)}</p>
      </div>
    </div>

    ${refInvoice}

    <table class="items" aria-label="Detalle">
      <thead>
        <tr>
          <th class="n" style="width:8%">Cant.</th>
          <th style="width:12%">Código</th>
          <th style="width:36%">Descripción</th>
          <th style="width:14%">N° Despacho</th>
          <th class="n" style="width:15%">P. Unitario</th>
          <th class="n" style="width:15%">Importe</th>
        </tr>
      </thead>
      <tbody>${tableBody}</tbody>
    </table>

    <div class="total-row">
      <span>Importe total:&nbsp; ${formatMoneyAr(total)}</span>
    </div>

    <div class="cae">
      <strong>CAE Nº</strong> ${esc(app.afipCae ?? '—')} &nbsp;|&nbsp;
      <strong>Fecha Vto. CAE</strong> ${app.afipCaeVto ? esc(formatDateArFromYmd(app.afipCaeVto)) : '—'}
    </div>

    <p class="foot">Comprobante autorizado por AFIP · Documento no válido como factura en soporte papel salvo normativa vigente</p>
  </div>
</body>
</html>`;
}

function openPrintWindow(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'width=980,height=1200');
  if (!w) {
    URL.revokeObjectURL(url);
    return;
  }

  const revokeLater = () => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  const triggerPrint = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
  };

  setTimeout(triggerPrint, 450);
  w.addEventListener('afterprint', revokeLater, { once: true });
  setTimeout(revokeLater, 5 * 60 * 1000);
}

function printAfipComprobante(opts: {
  appointment: Appointment;
  services: Service[];
  barbers?: Barber[];
  emitterCuit?: string | null;
  cbteTipo?: number;
  variant: AfipComprobantePrintVariant;
}): void {
  if (!opts.appointment.afipCae) return;
  const html = buildAfipComprobanteHtml({
    app: opts.appointment,
    services: opts.services,
    barbers: opts.barbers,
    emitterCuit: opts.emitterCuit,
    cbteTipo: opts.cbteTipo,
    variant: opts.variant,
  });
  openPrintWindow(html);
}

/**
 * Comprobante estilo AFIP (período, cliente, tabla CANT/CÓDIGO/DESCRIPCIÓN/P. UNITARIO/IMPORTE).
 */
export function printLionBarberInvoice(opts: {
  appointment: Appointment;
  services: Service[];
  barbers?: Barber[];
  emitterCuit?: string | null;
  cbteTipo?: number;
}): void {
  printAfipComprobante({ ...opts, variant: 'invoice' });
}

/** Misma plantilla AFIP, titulada como Nota de Crédito (tipo 13/8 según factura original). */
export function printLionBarberCreditNote(opts: {
  appointment: Appointment;
  services: Service[];
  barbers?: Barber[];
  emitterCuit?: string | null;
  cbteTipo?: number;
}): void {
  printAfipComprobante({ ...opts, variant: 'credit_note' });
}
