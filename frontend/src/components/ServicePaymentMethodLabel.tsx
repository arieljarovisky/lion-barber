import type { ServicePaymentMethod } from '../api';
import { SERVICE_PAYMENT_METHOD_LABELS } from '../utils/servicePaymentMethod';
import MercadoPagoLogo from './MercadoPagoLogo';

type Props = {
  method: ServicePaymentMethod;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
};

export default function ServicePaymentMethodLabel({ method, size = 'sm', className = '' }: Props) {
  const label = SERVICE_PAYMENT_METHOD_LABELS[method] ?? method;
  if (method === 'mercadopago') {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
        <MercadoPagoLogo size={size} />
        <span>{label}</span>
      </span>
    );
  }
  return <span className={className}>{label}</span>;
}
