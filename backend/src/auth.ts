import { jwtVerify, createRemoteJWKSet } from 'jose';
import jwt from 'jsonwebtoken';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const JWT_SECRET = process.env.JWT_SECRET ?? 'lion-barber-secret-change-in-production';

const ADMIN_EMAILS = (process.env.ADMIN_EMAIL ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Acceso a facturación AFIP, cierre de caja, estadísticas contables y topes de monotributo. */
const SUPER_ADMIN_EMAILS = [
  ...new Set(
    [
      'agustincarluccio@gmail.com',
      'jaroviskyariel@gmail.com',
      ...(process.env.SUPER_ADMIN_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ]
  ),
];

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export interface GoogleTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  aud: string;
  iss: string;
  iat: number;
  exp: number;
}

export async function verifyGoogleToken(idToken: string): Promise<GoogleTokenPayload> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: 'https://accounts.google.com',
    audience: GOOGLE_CLIENT_ID,
  });
  return payload as unknown as GoogleTokenPayload;
}

export function isSuperAdminEmail(email: string): boolean {
  return SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export function isAdminEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return ADMIN_EMAILS.includes(e) || isSuperAdminEmail(e);
}

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyJwt(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
  return decoded;
}
