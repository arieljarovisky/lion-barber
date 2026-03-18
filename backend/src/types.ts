export interface Appointment {
  id: string;
  name: string;
  phone: string;
  service: string;
  barber?: string;
  barberId?: string;
  date: string;
  time: string;
}

export interface Service {
  id: string;
  name: string;
  price: string;
  duration: number;
  desc: string;
  emoji?: string;
}

export interface Barber {
  id: string;
  name: string;
  role: string;
  photo: string;
  desc: string;
}
