import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api, ApiError } from '../api';
import type { Appointment, Service, ServicePaymentSplit } from '../api';
import ServicePaymentSplitsEditor from './ServicePaymentSplitsEditor';
import {
  appointmentLocalPendingArs,
  cleanServicePaymentSplits,
  formatServicePaymentSplits,
  initialSplitsFromAppointment,
} from '../utils/servicePaymentMethod';
import { formatArs } from '../utils/money';

type Props = {
  app: Appointment | null;
  services: Service[];
  depositPercent: number;
  onClose: () => void;
  onSaved: (updated: Appointment) => void;
  onError: (message: string) => void;
};

function tipAmountFromApp(app: Appointment): string {
  const t = app.tipAmount ?? 0;
  return t > 0 ? String(t).replace('.', ',') : '';
}

function parseTipInput(raw: string): number | 'invalid' {
  const tipRaw = raw.trim().replace(',', '.');
  if (tipRaw === '') return 0;
  const n = parseFloat(tipRaw);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return Math.round(n * 100) / 100;
}

export default function AppointmentPaymentSplitsModal({
  app,
  services,
  depositPercent,
  onClose,
  onSaved,
  onError,
}: Props) {
  const [splits, setSplits] = useState<ServicePaymentSplit[]>([]);
  const [tipAmount, setTipAmount] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!app) return;
    setSplits(initialSplitsFromAppointment(app, services, depositPercent));
    setTipAmount(tipAmountFromApp(app));
  }, [app, services, depositPercent]);

  if (!app) return null;

  const expectedLocal = appointmentLocalPendingArs(app, services, depositPercent);

  const handleSave = async () => {
    const parsedTip = parseTipInput(tipAmount);
    if (parsedTip === 'invalid') {
      onError('La propina debe ser un número ≥ 0.');
      return;
    }
    setSaving(true);
    try {
      const cleaned = cleanServicePaymentSplits(splits);
      const updated = await api.updateAppointment(app.id, {
        servicePaymentSplits: cleaned,
        tipAmount: parsedTip,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'No se pudieron guardar los cobros');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-zinc-100 flex justify-between items-start gap-3">
          <div>
            <h3 className="text-lg font-black text-zinc-900">Cobros del servicio</h3>
            <p className="text-sm text-zinc-600 mt-0.5">{app.name}</p>
            <p className="text-xs text-zinc-500 mt-1">
              Saldo en local: <span className="font-bold text-zinc-800">${formatArs(expectedLocal)}</span>
              {app.depositPaid && ' (ya descontada la seña por Mercado Pago)'}
            </p>
            {app.servicePaymentSplits?.length || app.servicePaymentMethod ? (
              <p className="text-[11px] text-zinc-400 mt-1">
                Actual:{' '}
                {formatServicePaymentSplits(
                  app.servicePaymentSplits,
                  app.servicePaymentMethod,
                  expectedLocal
                )}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
              Propina (opcional)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={tipAmount}
              onChange={(e) => setTipAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-zinc-500">No se incluye en la factura AFIP.</p>
          </div>
          <ServicePaymentSplitsEditor
            splits={splits}
            onChange={setSplits}
            expectedLocalAmount={expectedLocal}
          />
          <p className="text-xs text-zinc-500">
            Podés combinar métodos (ej. parte en efectivo y parte con tarjeta). Cada método solo aparece una vez.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-zinc-700 font-bold hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="flex-1 py-2.5 rounded-xl bg-[#e5c185] hover:bg-[#d4b074] text-zinc-950 font-bold disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
