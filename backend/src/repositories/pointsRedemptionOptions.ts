import { query } from '../db.js';
import type { PointsRedemptionOption } from '../types.js';

interface DbRow {
  id: string;
  label: string;
  points_cost: number;
  sort_order: number;
}

function rowToOption(r: DbRow): PointsRedemptionOption {
  return {
    id: r.id,
    label: r.label,
    pointsCost: r.points_cost,
    sortOrder: r.sort_order,
  };
}

function newId(): string {
  return `canje_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function listPointsRedemptionOptions(): Promise<PointsRedemptionOption[]> {
  const rows = await query<DbRow[]>(
    'SELECT * FROM points_redemption_options ORDER BY sort_order ASC, id ASC'
  );
  return rows.map(rowToOption);
}

export async function createPointsRedemptionOption(data: {
  label: string;
  pointsCost: number;
}): Promise<PointsRedemptionOption> {
  const id = newId();
  const label = data.label.trim();
  const pointsCost = Math.max(1, Math.min(999_999, Math.floor(data.pointsCost)));
  const maxRows = await query<{ maxOrder: number | null }[]>(
    'SELECT MAX(sort_order) AS maxOrder FROM points_redemption_options'
  );
  const nextOrder = Number(maxRows[0]?.maxOrder ?? 0) + 1;
  await query(
    'INSERT INTO points_redemption_options (id, label, points_cost, sort_order) VALUES (?, ?, ?, ?)',
    [id, label, pointsCost, nextOrder]
  );
  const rows = await query<DbRow[]>('SELECT * FROM points_redemption_options WHERE id = ? LIMIT 1', [id]);
  const r = rows[0];
  if (!r) throw new Error('Opción no creada');
  return rowToOption(r);
}

export async function updatePointsRedemptionOption(
  id: string,
  data: Partial<Pick<PointsRedemptionOption, 'label' | 'pointsCost'>>
): Promise<PointsRedemptionOption | null> {
  const currentRows = await query<DbRow[]>(
    'SELECT * FROM points_redemption_options WHERE id = ? LIMIT 1',
    [id]
  );
  const cur = currentRows[0];
  if (!cur) return null;
  const label = data.label !== undefined ? data.label.trim() : cur.label;
  const pointsCost =
    data.pointsCost !== undefined
      ? Math.max(1, Math.min(999_999, Math.floor(data.pointsCost)))
      : cur.points_cost;
  await query('UPDATE points_redemption_options SET label = ?, points_cost = ? WHERE id = ?', [
    label,
    pointsCost,
    id,
  ]);
  const rows = await query<DbRow[]>('SELECT * FROM points_redemption_options WHERE id = ? LIMIT 1', [id]);
  const r = rows[0];
  return r ? rowToOption(r) : null;
}

export async function deletePointsRedemptionOption(id: string): Promise<boolean> {
  const res = await query<{ affectedRows: number }>('DELETE FROM points_redemption_options WHERE id = ?', [id]);
  return (res as { affectedRows: number }).affectedRows > 0;
}
