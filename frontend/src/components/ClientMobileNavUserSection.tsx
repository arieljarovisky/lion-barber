import React from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, LogOut, User } from 'lucide-react';
import type { UserProfile } from '../contexts/AuthContext';

type ClientMobileNavUserSectionProps = {
  profile: UserProfile | null;
  canAccessDashboard: boolean;
  onClose: () => void;
  onLogout: () => void | Promise<void>;
};

export default function ClientMobileNavUserSection({
  profile,
  canAccessDashboard,
  onClose,
  onLogout,
}: ClientMobileNavUserSectionProps) {
  if (!profile) {
    return (
      <Link
        to="/login"
        onClick={onClose}
        className="block rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-zinc-200 transition-colors hover:border-[#e5c185]/40 hover:text-[#e5c185]"
      >
        Iniciar sesión
      </Link>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e5c185]/15 text-sm font-black uppercase text-[#e5c185]">
          {profile.name.trim().charAt(0) || '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{profile.name}</p>
          <p className="truncate text-xs text-zinc-500">{profile.email}</p>
          {profile.subscription && profile.subscription.cutsRemaining > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-[#e5c185]">
              Abono · {profile.subscription.cutsRemaining} corte
              {profile.subscription.cutsRemaining === 1 ? '' : 's'} disponible
              {profile.subscription.cutsRemaining === 1 ? '' : 's'}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link
          to="/perfil"
          onClick={onClose}
          className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-xs font-bold text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-800"
        >
          <User size={16} />
          Mi perfil
        </Link>
        {canAccessDashboard ? (
          <Link
            to="/dashboard"
            onClick={onClose}
            className="flex items-center justify-center gap-2 rounded-xl border border-[#e5c185]/30 bg-[#e5c185]/10 px-3 py-2.5 text-xs font-bold text-[#e5c185] transition-colors hover:bg-[#e5c185]/15"
          >
            <LayoutDashboard size={16} />
            Panel
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              onClose();
              void onLogout();
            }}
            className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-xs font-bold text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
          >
            <LogOut size={16} />
            Salir
          </button>
        )}
      </div>

      {canAccessDashboard && (
        <button
          type="button"
          onClick={() => {
            onClose();
            void onLogout();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      )}
    </div>
  );
}
