import { Request, Response, NextFunction } from 'express';
import { verifyJwt, JwtPayload } from '../auth.js';
import { findUserById } from '../repositories/users.js';

export interface AuthRequest extends Request {
  user?: JwtPayload & {
    id: number;
    name: string;
    email: string;
    role: string;
    /** Solo staff: id del barbero en `barbers` */
    barberId: string | null;
  };
}

async function attachUserFromToken(req: AuthRequest, token: string): Promise<boolean> {
  try {
    const payload = verifyJwt(token);
    const user = await findUserById(payload.userId);
    if (!user) return false;
    req.user = {
      ...payload,
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      barberId: user.barber_id ?? null,
    };
    return true;
  } catch {
    return false;
  }
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }
  const ok = await attachUserFromToken(req, token);
  if (!ok) {
    res.status(401).json({ error: 'Token inválido' });
    return;
  }
  next();
}

/** Carga usuario si hay Bearer; no responde 401 si falta token o es inválido. */
export async function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    next();
    return;
  }
  await attachUserFromToken(req, token);
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Solo administradores' });
    return;
  }
  next();
}

/** Panel interno: administrador o empleado (staff). */
export function requireStaffOrAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  const r = req.user?.role;
  if (r !== 'admin' && r !== 'staff') {
    res.status(403).json({ error: 'Acceso al panel denegado' });
    return;
  }
  next();
}
