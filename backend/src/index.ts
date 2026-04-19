import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import appointments from './routes/appointments.js';
import services from './routes/services.js';
import barbers from './routes/barbers.js';
import barberSchedule from './routes/barberSchedule.js';
import staffInvites from './routes/staffInvites.js';
import shopSettings from './routes/shopSettings.js';
import auth from './routes/auth.js';
import checkout, { logMercadoPagoEnvHint, mercadopagoWebhook } from './routes/checkout.js';
import afip from './routes/afip.js';
import users from './routes/users.js';

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
/** Iconos de servicios pueden ser data URLs (SVG/base64); el default 100kb devuelve 413. */
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use('/api/auth', auth);
app.use('/api/users', users);
app.use('/api/appointments', appointments);
app.use('/api/checkout', checkout);
app.use('/api/services', services);
app.use('/api/barbers', barbers);
app.use('/api/barber-schedule', barberSchedule);
app.use('/api/staff-invites', staffInvites);
app.use('/api/shop-settings', shopSettings);
app.use('/api/afip', afip);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

async function start() {
  try {
    await initDb();
    console.log('Base de datos MySQL lista.');
    logMercadoPagoEnvHint();
  } catch (err) {
    console.error('Error al iniciar la base de datos:', err);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`Lion Barber API en http://localhost:${PORT}`);
  });
}

start();
