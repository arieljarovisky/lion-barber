import type { ServicePaymentMethod } from '../api';
import { SERVICE_PAYMENT_METHOD_LABELS } from '../utils/servicePaymentMethod';

type Props = {
  method: ServicePaymentMethod;
  className?: string;
};

export default function ServicePaymentMethodLabel({ method, className = '' }: Props) {
  const label = SERVICE_PAYMENT_METHOD_LABELS[method] ?? method;
  return <span className={className}>{label}</span>;
}
