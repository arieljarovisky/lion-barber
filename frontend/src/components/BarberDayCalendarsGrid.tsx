import { Plus, Pencil, Trash2, MessageCircle } from 'lucide-react';
import type { AdminClientWithHistory, Appointment, Barber } from '../api';
import AppointmentPaymentBadge from './AppointmentPaymentBadge';
import ClientProfileLink from './ClientProfileLink';
import {
  addMinutesToClock,
  buildDayTimelineRows,
  TIMELINE_ROW_UNIT_REM,
} from '../utils/agendaTimeline';
import {
  appointmentNeedsManualContact,
  buildAppointmentWhatsappUrl,
} from '../utils/appointmentWhatsapp';

export type BarberDayColumn = {
  barber: Barber;
  appointments: Appointment[];
};

type Props = {
  columns: BarberDayColumn[];
  timeSlots: string[];
  dateStr: string;
  getBlockedSlotsForBarber: (barberId: string) => Set<string>;
  adminClients: AdminClientWithHistory[];
  shopWhatsappMessageTemplate: string | null;
  onCreateSlot: (dateStr: string, slot: string, barberId: string) => void;
  onEdit: (app: Appointment) => void;
  onDelete: (id: string) => void;
  /** Altura máxima del área scrolleable (CSS). */
  scrollMaxHeight?: string;
  /** Altura mínima del área scrolleable (CSS). */
  scrollMinHeight?: string;
  /** Si true, el scroll usa el alto del contenedor padre (flex) en lugar de vh fijos. */
  fillAvailableHeight?: boolean;
  /** Filas más compactas en el panel principal. */
  compact?: boolean;
};

const COMPACT_SPAN_REM = 2.5;
const COMFORT_SPAN_REM = 3.25;

function renderTimelineRow(
  row: ReturnType<typeof buildDayTimelineRows>[number],
  ctx: {
    barberId: string;
    dateStr: string;
    spanUnitRem: number;
    adminClients: AdminClientWithHistory[];
    shopWhatsappMessageTemplate: string | null;
    onCreateSlot: Props['onCreateSlot'];
    onEdit: Props['onEdit'];
    onDelete: Props['onDelete'];
  }
) {
  const {
    barberId,
    dateStr,
    spanUnitRem,
    adminClients,
    shopWhatsappMessageTemplate,
    onCreateSlot,
    onEdit,
    onDelete,
  } = ctx;

  if (row.kind === 'free') {
    return (
      <button
        key={row.slot}
        type="button"
        onClick={() => onCreateSlot(dateStr, row.slot, barberId)}
        className="flex w-full items-center gap-2 rounded-lg py-2.5 text-left text-sm min-h-[2.75rem] transition-colors hover:bg-emerald-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c185]/40"
        title={`Nuevo turno · ${row.slot}`}
      >
        <span className="w-14 font-mono text-zinc-500 flex-shrink-0 text-xs font-semibold">
          {row.slot}
        </span>
        <span className="flex flex-1 items-center gap-1.5 border border-dashed border-zinc-200/80 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:border-[#e5c185] hover:text-[#b39055]">
          <Plus size={12} aria-hidden />
          Libre
        </span>
      </button>
    );
  }

  if (row.kind === 'blocked') {
    return (
      <div
        key={`blocked-${barberId}-${row.slot}`}
        className="flex items-center gap-2 rounded-lg py-2.5 text-left text-sm min-h-[2.75rem] bg-red-50/70"
        title={`Bloqueado · ${row.slot}`}
      >
        <span className="w-14 font-mono text-red-700 flex-shrink-0 text-xs font-semibold">
          {row.slot}
        </span>
        <span className="flex flex-1 items-center gap-1.5 border border-red-200 rounded-md px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-red-600">
          Bloqueado
        </span>
      </div>
    );
  }

  const { app, span, slot } = row;
  const dm = app.durationMinutes ?? 30;
  const endClock = addMinutesToClock(slot, dm);

  return (
    <div
      key={`${app.id}-${slot}`}
      className="flex items-stretch gap-2 py-2.5 text-sm"
      style={{ minHeight: `${span * spanUnitRem}rem` }}
    >
      <span className="w-14 font-mono text-zinc-500 flex-shrink-0 text-xs font-semibold pt-0.5">
        {slot}
        {span > 1 ? (
          <span className="block text-[10px] text-zinc-400 mt-0.5">{endClock}</span>
        ) : null}
      </span>
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2 border border-amber-200/80 bg-amber-50/50 rounded-lg px-2.5 py-2">
        <div className="min-w-0">
          <ClientProfileLink
            userId={app.userId}
            name={app.name}
            phone={app.phone}
            adminClients={adminClients}
            className="font-medium text-zinc-800 truncate block hover:text-[#b39055] text-sm"
            stopPropagation
          />
          <span className="text-[10px] text-zinc-500">{dm} min</span>
          <AppointmentPaymentBadge app={app} className="mt-1" />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {appointmentNeedsManualContact(app) && (() => {
            const waUrl = buildAppointmentWhatsappUrl(app, shopWhatsappMessageTemplate);
            if (!waUrl) return null;
            return (
              <a
                href={waUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                title="Enviar WhatsApp"
              >
                <MessageCircle size={14} />
              </a>
            );
          })()}
          <button
            type="button"
            onClick={() => onEdit(app)}
            className="p-1.5 text-zinc-400 hover:text-[#e5c185] hover:bg-amber-50 rounded-lg transition-colors"
            title="Editar"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => void onDelete(app.id)}
            className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BarberDayCalendarsGrid({
  columns,
  timeSlots,
  dateStr,
  getBlockedSlotsForBarber,
  adminClients,
  shopWhatsappMessageTemplate,
  onCreateSlot,
  onEdit,
  onDelete,
  scrollMaxHeight = 'calc(100vh - 280px)',
  scrollMinHeight = 'min(72vh, 720px)',
  fillAvailableHeight = false,
  compact = false,
}: Props) {
  if (columns.length === 0) return null;

  const spanUnitRem = compact ? COMPACT_SPAN_REM : COMFORT_SPAN_REM;
  const minColWidth = compact ? 240 : 280;

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-x-auto">
      <div
        className="flex flex-col min-h-0 flex-1"
        style={{
          minWidth: `${columns.length * minColWidth + Math.max(0, columns.length - 1) * 16}px`,
        }}
      >
      <div
        className="grid gap-4 shrink-0"
        style={{
          gridTemplateColumns: `repeat(${columns.length}, minmax(${minColWidth}px, 1fr))`,
        }}
      >
        {columns.map(({ barber }) => (
          <div
            key={barber.id}
            className="border border-zinc-200 rounded-t-2xl overflow-hidden shadow-sm bg-gradient-to-r from-zinc-900 to-zinc-800 text-white"
          >
            <div className="p-4 flex items-center gap-3">
              <img
                src={barber.photo}
                alt={barber.name}
                className={`${compact ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl object-cover ring-2 ring-white/10`}
                referrerPolicy="no-referrer"
              />
              <p className={`font-bold leading-tight ${compact ? 'text-sm' : 'text-base'}`}>
                {barber.name}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div
        className={`overflow-y-auto overflow-x-hidden overscroll-contain border border-t-0 border-zinc-200 rounded-b-2xl bg-white shadow-sm ${
          fillAvailableHeight ? 'flex-1 min-h-0' : ''
        }`}
        style={
          fillAvailableHeight
            ? undefined
            : { maxHeight: scrollMaxHeight, minHeight: scrollMinHeight }
        }
      >
        <div
          className="grid gap-4 p-3 sm:p-4"
          style={{
            gridTemplateColumns: `repeat(${columns.length}, minmax(${minColWidth}px, 1fr))`,
          }}
        >
          {columns.map(({ barber, appointments }) => (
            <div key={barber.id} className="divide-y divide-zinc-100 min-w-0">
              {buildDayTimelineRows(
                appointments,
                timeSlots,
                getBlockedSlotsForBarber(barber.id)
              ).map((row) =>
                renderTimelineRow(row, {
                  barberId: barber.id,
                  dateStr,
                  spanUnitRem,
                  adminClients,
                  shopWhatsappMessageTemplate,
                  onCreateSlot,
                  onEdit,
                  onDelete,
                })
              )}
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

export { TIMELINE_ROW_UNIT_REM };
