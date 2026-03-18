import { Request, Response, NextFunction } from 'express';
import { verifyJwt, JwtPayload } from '../auth.js';
import { findUserById } from '../repositories/users.js';

export interface AuthRequest extends Request {
  user?: JwtPayload & { id: number; name: string; email: string; role: string };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }
  try {
    const payload = verifyJwt(token);
    const user = await findUserById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'Usuario no encontrado' });
      return;
    }
    req.user = {
      ...payload,
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Solo administradores' });
    return;
  }
  next();
}
