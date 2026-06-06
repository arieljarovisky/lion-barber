import { useLocation } from 'react-router-dom';
import { BOOKING_FALLBACK_WHATSAPP_URL } from '../utils/backendHealth';
import { WhatsAppIcon } from './WhatsAppIcon';

/** Botón flotante para contactar / reservar por WhatsApp (páginas públicas). */
export default function FloatingWhatsAppButton() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/dashboard')) return null;

  return (
    <a
      href={BOOKING_FALLBACK_WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full transition-transform sm:bottom-6 sm:right-6 hover:scale-105 active:scale-95"
      aria-label="Contactar por WhatsApp"
      title="WhatsApp"
    >
      <WhatsAppIcon size={56} variant="lion" className="drop-shadow-[0_4px_20px_rgba(229,193,133,0.45)]" />
    </a>
  );
}
