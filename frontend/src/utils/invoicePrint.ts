import type { Appointment, AfipInvoiceDetail, Service } from '../api';
import { formatInstantInArgentina } from './argentinaTime';
import { formatArs, resolveAppointmentServiceAmountArs } from './money';

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

function comprobanteTitle(cbteTipo?: number): string {
  if (cbteTipo === 11) return 'Factura C · Monotributo';
  if (cbteTipo === 6) return 'Factura B';
  return 'Comprobante de venta electrónico';
}

function buildDetailRows(detail: AfipInvoiceDetail | undefined, app: Appointment, services: Service[]): string {
  if (detail) {
    const lines: string[] = [];
    lines.push(
      `<tr><td colspan="2">${esc(detail.serviceLabel)}</td><td class="r">$ ${formatArs(detail.serviceAmount)}</td></tr>`
    );
    for (const pl of detail.productLines) {
      lines.push(
        `<tr><td>${esc(pl.name)}</td><td class="c">${pl.quantity} × $ ${formatArs(pl.unitPrice)}</td><td class="r">$ ${formatArs(pl.subtotal)}</td></tr>`
      );
    }
    lines.push(
      `<tr class="total"><td colspan="2">Total</td><td class="r">$ ${formatArs(detail.total)}</td></tr>`
    );
    return lines.join('');
  }
  const amt = resolveAppointmentServiceAmountArs(app, services);
  const row = amt != null ? `$ ${formatArs(amt)}` : '—';
  return `<tr><td colspan="2">${esc(app.service)}</td><td class="r">${row}</td></tr>`;
}

/**
 * Abre una ventana con el comprobante estilizado Lion Barber y dispara el diálogo de impresión
 * (el usuario puede elegir «Guardar como PDF» en el navegador).
 *
 * Nota: no usar `noopener` en window.open: en Chrome la ventana queda en about:blank y document.write no aplica.
 */
export function printLionBarberInvoice(opts: {
  appointment: Appointment;
  services: Service[];
  emitterCuit?: string | null;
  cbteTipo?: number;
}): void {
  const { appointment: app, services, emitterCuit, cbteTipo } = opts;
  if (!app.afipCae) return;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const logoUrl = `${origin}/lion-barber-logo.png`;
  const title = comprobanteTitle(cbteTipo);
  const detailRows = buildDetailRows(app.afipInvoiceDetail, app, services);
  const fechaServ = new Date(app.date + 'T12:00:00').toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const emitido = app.afipFacturadoAt ? formatInstantInArgentina(app.afipFacturadoAt) : '—';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Lion Barber · Comprobante</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=Playfair+Display:ital,wght@0,700;1,400&display=swap" rel="stylesheet" />
  <style>
    @page { margin: 14mm; size: A4; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Montserrat", system-ui, sans-serif;
      color: #18181b;
      background: #fafaf9;
      font-size: 13px;
      line-height: 1.45;
    }
    .sheet {
      max-width: 720px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #e4e4e7;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(0,0,0,.06);
    }
    .head {
      background: linear-gradient(145deg, #18181b 0%, #27272a 55%, #18181b 100%);
      color: #fafafa;
      padding: 28px 32px 24px;
      text-align: center;
      border-bottom: 4px solid #b39055;
    }
    .head img { max-height: 52px; width: auto; margin-bottom: 10px; filter: brightness(1.08); }
    .brand-script {
      font-family: "Playfair Display", Georgia, serif;
      font-style: italic;
      font-size: 1.35rem;
      color: #e5c185;
      letter-spacing: 0.02em;
      margin: 0 0 4px;
    }
    .head h1 {
      margin: 0;
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.22em;
      color: #a1a1aa;
    }
    .badge {
      display: inline-block;
      margin-top: 14px;
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(179, 144, 85, 0.18);
      color: #e5c185;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    .body { padding: 28px 32px 32px; }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 24px;
      margin-bottom: 22px;
      font-size: 12px;
    }
    .grid dt { color: #71717a; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; margin: 0; }
    .grid dd { margin: 2px 0 0; font-weight: 600; color: #18181b; }
    table.lines { width: 100%; border-collapse: collapse; margin-top: 8px; }
    table.lines th {
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #71717a;
      border-bottom: 2px solid #e4e4e7;
      padding: 10px 8px;
    }
    table.lines td { padding: 10px 8px; border-bottom: 1px solid #f4f4f5; vertical-align: top; }
    table.lines .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    table.lines .c { text-align: center; font-variant-numeric: tabular-nums; }
    table.lines tr.total td { border-bottom: none; font-weight: 800; font-size: 1.05rem; padding-top: 16px; color: #18181b; }
    .cae {
      margin-top: 24px;
      padding: 16px 18px;
      border-radius: 10px;
      background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%);
      border: 1px solid #fde047;
      font-size: 12px;
    }
    .cae strong { color: #854d0e; }
    .foot {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid #e4e4e7;
      font-size: 10px;
      color: #a1a1aa;
      text-align: center;
      letter-spacing: 0.04em;
    }
    @media print {
      body { background: #fff; }
      .sheet { border: none; box-shadow: none; border-radius: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="head">
      <img src="${logoUrl.replace(/"/g, '%22')}" alt="Lion Barber" />
      <p class="brand-script">lionBARBER</p>
      <h1>${esc(title)}</h1>
      <div class="badge">${esc(app.afipPtoVta != null && app.afipCbteNro != null ? `Pto. venta ${app.afipPtoVta} · Nº ${app.afipCbteNro}` : 'AFIP')}</div>
    </header>
    <div class="body">
      <dl class="grid">
        <div><dt>Emisor (CUIT)</dt><dd>${emitterCuit ? formatCuitAr(emitterCuit) : '—'}</dd></div>
        <div><dt>Cliente</dt><dd>${esc(app.name)}</dd></div>
        <div><dt>Teléfono</dt><dd>${esc(app.phone || '—')}</dd></div>
        <div><dt>Fecha del servicio</dt><dd>${esc(fechaServ)} · ${esc(app.time)}</dd></div>
        <div><dt>Emitido</dt><dd>${esc(emitido)}</dd></div>
        <div><dt>Barbero</dt><dd>${esc(app.barber || '—')}</dd></div>
      </dl>
      <table class="lines" aria-label="Detalle">
        <thead><tr><th>Concepto</th><th class="c">Cant. / Precio</th><th class="r">Importe</th></tr></thead>
        <tbody>${detailRows}</tbody>
      </table>
      <div class="cae">
        <strong>CAE</strong> ${esc(app.afipCae)}<br />
        <strong>Vto. CAE</strong> ${esc(app.afipCaeVto || '—')}
      </div>
      <p class="foot">Documento no válido como factura en soporte papel salvo disposición normativa · Lion Barber</p>
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  /** Sin `noopener`: si no, en varios Chromium document del hijo no queda accesible y la pestaña sigue en about:blank. */
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
