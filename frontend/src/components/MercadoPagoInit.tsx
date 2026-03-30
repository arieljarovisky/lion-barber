import { useEffect } from 'react';
import { initMercadoPago } from '@mercadopago/sdk-react';

const PUBLIC_KEY = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY as string | undefined;

/** Debe montarse una vez; habilita Wallet y otros bricks con la Public Key (no el Access Token). */
export default function MercadoPagoInit() {
  useEffect(() => {
    if (PUBLIC_KEY) initMercadoPago(PUBLIC_KEY.trim());
  }, []);
  return null;
}
