import type { Appointment, Service, Barber } from './types.js';

export const SERVICES: Service[] = [
  { id: 'corte', name: 'Corte de cabello', price: '$20.000', duration: 30, desc: 'Corte clásico o degradado con terminaciones a navaja.' },
  { id: 'corte_ninos', name: 'Corte de niños 0 a 6', price: '$22.000', duration: 30, desc: 'Corte especial para los más pequeños.' },
  { id: 'cabellos_largos', name: 'Cabellos largos 10cm', price: '$22.000', duration: 45, desc: 'Corte y estilizado para cabellos largos.' },
  { id: 'arreglo_barba', name: 'Arreglo de barba', price: '$10.000', duration: 30, desc: 'Perfilado, rebaje y toallas calientes.' },
  { id: 'perfilado_cejas', name: 'Perfilado de cejas', price: '$1.000', duration: 15, desc: 'Diseño y perfilado de cejas.' },
  { id: 'rapado', name: 'Rapado', price: '$10.000', duration: 20, desc: 'Rapado completo a máquina.' },
  { id: 'afeitado_tradicional', name: 'Afeitado tradicional', price: '$8.000', duration: 30, desc: 'Afeitado clásico con navaja y toallas calientes.' },
];

export const BARBERS: Barber[] = [
  { id: 'barber_1', name: 'Agus', role: 'Master Barber', photo: '/barbers/agus.png', desc: 'Especialista en cortes clásicos y perfilado de barba.' },
  { id: 'barber_2', name: 'Valen', role: 'Senior Barber', photo: '/barbers/valen.png', desc: 'Experto en degradados y estilos urbanos modernos.' },
  { id: 'barber_3', name: 'Toni', role: 'Barber', photo: '/barbers/toni.png', desc: 'Detallista y perfeccionista. Especialista en tijera.' },
];

const timeSlots = [
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30',
];

let appointments: Appointment[] = [];
let nextId = 1;

function generateId(): string {
  return String(nextId++);
}

export function getAllAppointments(): Appointment[] {
  return [...appointments];
}

export function getAppointmentsByDate(date: string): Appointment[] {
  return appointments.filter((a) => a.date === date);
}

export function getAppointmentsByBarber(barberId: string, date?: string): Appointment[] {
  let list = appointments.filter((a) => a.barberId === barberId || a.barber === BARBERS.find((b) => b.id === barberId)?.name);
  if (date) list = list.filter((a) => a.date === date);
  return list.sort((a, b) => a.time.localeCompare(b.time));
}

export function getAppointmentById(id: string): Appointment | undefined {
  return appointments.find((a) => a.id === id);
}

export function createAppointment(data: Omit<Appointment, 'id'>): Appointment {
  const barberName = data.barberId ? BARBERS.find((b) => b.id === data.barberId)?.name : data.barber;
  const app: Appointment = {
    ...data,
    id: generateId(),
    barber: barberName,
    barberId: data.barberId ?? (data.barber ? BARBERS.find((b) => b.name === data.barber)?.id : undefined),
  };
  appointments.push(app);
  return app;
}

export function updateAppointment(id: string, data: Partial<Appointment>): Appointment | null {
  const idx = appointments.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const updated = { ...appointments[idx], ...data };
  if (data.barberId) updated.barber = BARBERS.find((b) => b.id === data.barberId)?.name ?? updated.barber;
  appointments[idx] = updated;
  return updated;
}

export function deleteAppointment(id: string): boolean {
  const idx = appointments.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  appointments.splice(idx, 1);
  return true;
}

export function getTimeSlots(): string[] {
  return [...timeSlots];
}

export function getAvailableSlots(date: string, barberId: string): string[] {
  const taken = getAppointmentsByBarber(barberId, date).map((a) => a.time);
  return timeSlots.filter((t) => !taken.includes(t));
}
