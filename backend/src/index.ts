import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import appointments from './routes/appointments.js';
import services from './routes/services.js';
import barbers from './routes/barbers.js';
import barberSchedule from './routes/barberSchedule.js';
import auth from './routes/auth.js';
import checkout, { mercadopagoWebhook } from './routes/checkout.js';

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors({ origin: true }));
app.post(
  '/api/webhooks/mercadopago',
  express.json({ limit: '1mb' }),
  express.urlencoded({ extended: true }),
  mercadopagoWebhook
);
app.get('/api/webhooks/mercadopago', mercadopagoWebhook);
app.use(express.json());

app.use('/api/auth', auth);
app.use('/api/appointments', appointments);
app.use('/api/checkout', checkout);
app.use('/api/services', services);
app.use('/api/barbers', barbers);
app.use('/api/barber-schedule', barberSchedule);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

async function start() {
  try {
    await initDb();
    console.log('Base de datos MySQL lista.');
  } catch (err) {
    console.error('Error al iniciar la base de datos:', err);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`Lion Barber API en http://localhost:${PORT}`);
  });
}

start();
