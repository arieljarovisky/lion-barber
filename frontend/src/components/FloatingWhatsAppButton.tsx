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
      className="fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_4px_20px_rgba(37,211,102,0.45)] transition-transform hover:scale-105 hover:bg-[#1ebe5d] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      aria-label="Contactar por WhatsApp"
      title="WhatsApp"
    >
      <WhatsAppIcon size={30} className="text-white" />
    </a>
  );
}
