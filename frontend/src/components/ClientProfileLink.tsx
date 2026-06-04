import React from 'react';
import { Link } from 'react-router-dom';
import type { AdminClientWithHistory } from '../api';
import { resolveAdminClientId } from '../utils/adminClientLookup';

type ClientProfileLinkProps = {
  userId?: number | null;
  name: string;
  phone?: string;
  adminClients?: AdminClientWithHistory[];
  className?: string;
  /** Evita que el click dispare handlers del contenedor (filas clickeables, etc.). */
  stopPropagation?: boolean;
};

export default function ClientProfileLink({
  userId,
  name,
  phone,
  adminClients,
  className,
  stopPropagation = false,
}: ClientProfileLinkProps) {
  const clientId = resolveAdminClientId({ userId, name, phone, adminClients });
  const displayName = name.trim() || 'Cliente';

  if (clientId == null) {
    return <span className={className}>{displayName}</span>;
  }

  return (
    <Link
      to={`/dashboard/clientes/${clientId}`}
      className={
        className ??
        'font-medium text-zinc-900 hover:text-[#b39055] hover:underline underline-offset-2 truncate'
      }
      title={`Ver ficha de ${displayName}`}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      {displayName}
    </Link>
  );
}
