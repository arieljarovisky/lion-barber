/** Mismo sufijo que genera el backend para clientes sin email. */
export const MANUAL_CLIENT_EMAIL_HOST = 'sin-email.lion-barber.internal';

export function isPlaceholderManualClientEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${MANUAL_CLIENT_EMAIL_HOST}`);
}

export function displayClientEmail(email: string): string {
  return isPlaceholderManualClientEmail(email) ? '—' : email;
}
