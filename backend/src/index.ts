import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import appointments from './routes/appointments.js';
import services from './routes/services.js';
import barbers from './routes/barbers.js';
import auth from './routes/auth.js';

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors({ origin: true }));
app.use(express.json());

app.use('/api/auth', auth);
app.use('/api/appointments', appointments);
app.use('/api/services', services);
app.use('/api/barbers', barbers);

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
