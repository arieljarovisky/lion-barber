import mercadoPagoLogo from '../assets/mercadopago-logo.png';

const HEIGHT: Record<'xs' | 'sm' | 'md', string> = {
  xs: 'h-3',
  sm: 'h-4',
  md: 'h-6',
};

type Props = {
  size?: 'xs' | 'sm' | 'md';
  className?: string;
};

/** Logo oficial de Mercado Pago (seña online y método de cobro). */
export default function MercadoPagoLogo({ size = 'sm', className = '' }: Props) {
  return (
    <img
      src={mercadoPagoLogo}
      alt="Mercado Pago"
      className={`${HEIGHT[size]} w-auto object-contain shrink-0 ${className}`.trim()}
      loading="lazy"
      decoding="async"
    />
  );
}
