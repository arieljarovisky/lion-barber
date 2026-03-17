export interface Appointment {
  id: string;
  name: string;
  phone: string;
  service: string;
  barber?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
}

const STORAGE_KEY = 'lion_barber_appointments';

const getInitialAppointments = (): Appointment[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  const today = new Date().toISOString().split('T')[0];
  return [
    {
      id: '1',
      name: 'Juan Perez',
      phone: '1123456789',
      service: 'Corte de cabello',
      date: today,
      time: '10:00',
    },
    {
      id: '2',
      name: 'Carlos Gomez',
      phone: '1198765432',
      service: 'Arreglo de barba',
      date: today,
      time: '11:30',
    }
  ];
};

let appointments: Appointment[] = getInitialAppointments();

export const getAppointments = () => appointments;

export const addAppointment = (app: Omit<Appointment, 'id'>) => {
  const newApp = { ...app, id: Math.random().toString(36).substring(7) };
  appointments = [...appointments, newApp];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appointments));
  return newApp;
};
