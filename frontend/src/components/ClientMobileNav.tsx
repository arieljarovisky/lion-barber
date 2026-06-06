import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  LayoutDashboard,
  LogOut,
  MapPin,
  Repeat,
  Scissors,
  User,
  Users,
  X,
} from 'lucide-react';
import type { UserProfile } from '../contexts/AuthContext';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

type ClientMobileNavProps = {
  isOpen: boolean;
  onClose: () => void;
  showAbonosSection: boolean;
  profile: UserProfile | null;
  canAccessDashboard: boolean;
  onLogout: () => void | Promise<void>;
  onReserva: () => void;
};

const BASE_NAV: NavItem[] = [
  { href: '#servicios', label: 'Servicios', icon: Scissors },
  { href: '#barberos', label: 'Barberos', icon: Users },
  { href: '#contacto', label: 'Contacto', icon: MapPin },
];

export default function ClientMobileNav({
  isOpen,
  onClose,
  showAbonosSection,
  profile,
  canAccessDashboard,
  onLogout,
  onReserva,
}: ClientMobileNavProps) {
  const navItems: NavItem[] = showAbonosSection
    ? [
        BASE_NAV[0],
        BASE_NAV[1],
        { href: '#abonos', label: 'Abonos', icon: Repeat },
        BASE_NAV[2],
      ]
    : BASE_NAV;

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const goToSection = (href: string) => {
    onClose();
    window.requestAnimationFrame(() => {
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div
      className={`fixed inset-0 z-[60] lg:hidden ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        aria-label="Cerrar menú"
        className={`absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        tabIndex={isOpen ? 0 : -1}
      />

      <aside
        id="client-mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        className={`absolute inset-y-0 right-0 flex w-[min(100vw,20.5rem)] flex-col border-l border-zinc-800/80 bg-zinc-950 shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-4">
          <div className="min-w-0">
            <p className="font-serif text-sm font-black uppercase tracking-widest text-white">Lion Barber</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Navegación</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:border-[#e5c185]/40 hover:text-[#e5c185]"
            aria-label="Cerrar menú"
            tabIndex={isOpen ? 0 : -1}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
          <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">Secciones</p>
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <button
                    type="button"
                    onClick={() => goToSection(item.href)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-zinc-900 active:bg-zinc-800/80"
                    tabIndex={isOpen ? 0 : -1}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e5c185]/10 text-[#e5c185]">
                      <Icon size={18} />
                    </span>
                    <span className="text-base font-semibold text-zinc-100">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="my-5 h-px bg-zinc-800/80" />

          <button
            type="button"
            onClick={onReserva}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e5c185] px-4 py-3.5 text-sm font-black uppercase tracking-wide text-zinc-950 transition-colors hover:bg-[#d4b074] active:scale-[0.99]"
            tabIndex={isOpen ? 0 : -1}
          >
            <Calendar size={18} />
            Reservar turno
          </button>
        </nav>

        <div className="border-t border-zinc-800/80 px-4 py-4">
          {profile ? (
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
                  tabIndex={isOpen ? 0 : -1}
                >
                  <User size={16} />
                  Mi perfil
                </Link>
                {canAccessDashboard ? (
                  <Link
                    to="/dashboard"
                    onClick={onClose}
                    className="flex items-center justify-center gap-2 rounded-xl border border-[#e5c185]/30 bg-[#e5c185]/10 px-3 py-2.5 text-xs font-bold text-[#e5c185] transition-colors hover:bg-[#e5c185]/15"
                    tabIndex={isOpen ? 0 : -1}
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
                    tabIndex={isOpen ? 0 : -1}
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
                  tabIndex={isOpen ? 0 : -1}
                >
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              onClick={onClose}
              className="flex w-full items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-200 transition-colors hover:border-[#e5c185]/40 hover:text-[#e5c185]"
              tabIndex={isOpen ? 0 : -1}
            >
              Iniciar sesión
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}
