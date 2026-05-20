import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { createDatabaseBackupSql } from '../services/databaseBackup.js';

const router = Router();

/** Descarga un volcado SQL de toda la base (solo super admin). */
router.get('/backup', requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    const backup = await createDatabaseBackupSql();
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
    res.setHeader('X-Backup-Tables', String(backup.tableCount));
    res.setHeader('X-Backup-Rows', String(backup.rowCount));
    res.send(backup.sql);
  } catch (e) {
    console.error('[Backup] Error generando copia:', e);
    res.status(500).json({ error: 'No se pudo generar la copia de seguridad' });
  }
});

export default router;
