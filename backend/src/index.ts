import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import appointments from './routes/appointments.js';
import services from './routes/services.js';
import barbers from './routes/barbers.js';
import barberSchedule from './routes/barberSchedule.js';
import staffInvites from './routes/staffInvites.js';
import staffPermissions from './routes/staffPermissions.js';
import shopSettings from './routes/shopSettings.js';
import auth from './routes/auth.js';
import checkout, { logMercadoPagoEnvHint, mercadopagoWebhook } from './routes/checkout.js';
import afip from './routes/afip.js';
import expenses from './routes/expenses.js';
import cashClose from './routes/cashClose.js';
import admin from './routes/admin.js';
import users from './routes/users.js';
import shopProducts from './routes/shopProducts.js';
import productOrders from './routes/productOrders.js';
import subscriptionPlans from './routes/subscriptionPlans.js';
import promotions from './routes/promotions.js';
import pointsRedemptionOptions from './routes/pointsRedemptionOptions.js';
import { runAppointmentReminderEmails } from './jobs/runAppointmentReminderEmails.js';
import { runExpirePendingPayments } from './jobs/runExpirePendingPayments.js';
import { backfillMissingDepositAmountsFromMercadoPago } from './services/mercadopagoDepositBackfill.js';
import { getProductUploadsDir, migrateLegacyProductImages } from './services/productImageUpload.js';

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
/** Iconos de servicios y fotos de productos (data URLs / base64). */
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

app.use('/api/uploads/products', express.static(getProductUploadsDir(), { maxAge: '7d' }));

app.use('/api/auth', auth);
app.use('/api/users', users);
app.use('/api/appointments', appointments);
app.use('/api/checkout', checkout);
app.use('/api/services', services);
app.use('/api/shop-products', shopProducts);
app.use('/api/product-orders', productOrders);
app.use('/api/subscription-plans', subscriptionPlans);
app.use('/api/promotions', promotions);
app.use('/api/points-redemption-options', pointsRedemptionOptions);
app.use('/api/barbers', barbers);
app.use('/api/barber-schedule', barberSchedule);
app.use('/api/staff-invites', staffInvites);
app.use('/api/staff-permissions', staffPermissions);
app.use('/api/shop-settings', shopSettings);
app.use('/api/afip', afip);
app.use('/api/expenses', expenses);
app.use('/api/cash-close', cashClose);
app.use('/api/admin', admin);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

async function start() {
  try {
    await initDb();
    await migrateLegacyProductImages();
    console.log('Base de datos MySQL lista.');
    logMercadoPagoEnvHint();
    void backfillMissingDepositAmountsFromMercadoPago().catch((e) =>
      console.warn('[MP backfill] no se pudo completar:', e)
    );
  } catch (err) {
    console.error('Error al iniciar la base de datos:', err);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`Lion Barber API en http://localhost:${PORT}`);
  });

  const reminderMs = 5 * 60 * 1000;
  setInterval(() => {
    void runAppointmentReminderEmails().catch((e) => console.error('[Reminder] job', e));
  }, reminderMs);
  void runAppointmentReminderEmails().catch((e) => console.error('[Reminder] job inicial', e));

  const expirePendingMs = 60 * 1000;
  setInterval(() => {
    void runExpirePendingPayments().catch((e) => console.error('[ExpirePending] job', e));
  }, expirePendingMs);
  void runExpirePendingPayments().catch((e) => console.error('[ExpirePending] job inicial', e));
}

start();
