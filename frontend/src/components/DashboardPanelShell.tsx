import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  BarChart3,
  Wallet,
  Package,
  Ban,
  UserPlus,
  Users,
  Settings,
  Award,
  ShoppingBag,
  Receipt,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export type DashboardPanelId =
  | 'agenda'
  | 'servicios'
  | 'horarios'
  | 'puntos'
  | 'productos'
  | 'facturacion'
  | 'estadisticas'
  | 'cierreCaja'
  | 'equipo'
  | 'clientes'
  | 'configuracion';

type DashboardPanelShellProps = {
  activePanel: DashboardPanelId;
  onNavigate: (panel: DashboardPanelId) => void;
  children: React.ReactNode;
};

export default function DashboardPanelShell({ activePanel, onNavigate, children }: DashboardPanelShellProps) {
  const { profile, logout, isAdmin, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const go = (panel: DashboardPanelId) => {
    setMobileNavOpen(false);
    onNavigate(panel);
  };

  return (
    <>
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-800 bg-zinc-950 text-white shadow-xl lg:shadow-none ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 p-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
            <img
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS9afJTOOxlqBtn27Asuu-Jvmb0NQZP6tKPGg&s"
              alt="Lion Logo"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-black uppercase tracking-widest">Lion Barber</h1>
            <p className="text-xs font-bold tracking-wider text-[#e5c185]">PANEL DE CONTROL</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="rounded-lg p-2 hover:bg-zinc-800 lg:hidden"
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <button
            type="button"
            onClick={() => go('agenda')}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${
              activePanel === 'agenda' ? 'bg-[#e5c185] text-zinc-950' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            <CalendarIcon size={18} className="flex-shrink-0" />
            Agenda
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => go('servicios')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${
                activePanel === 'servicios'
                  ? 'bg-[#e5c185] text-zinc-950'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <Package size={18} className="flex-shrink-0" />
              Servicios
            </button>
          )}
          <button
            type="button"
            onClick={() => go('horarios')}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${
              activePanel === 'horarios'
                ? 'bg-[#e5c185] text-zinc-950'
                : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            <Ban size={18} className="flex-shrink-0" />
            Horarios
          </button>
          {(profile?.role === 'admin' || profile?.role === 'staff') && (
            <button
              type="button"
              onClick={() => go('puntos')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${
                activePanel === 'puntos'
                  ? 'bg-[#e5c185] text-zinc-950'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <Award size={18} className="flex-shrink-0" />
              Puntos
            </button>
          )}
          {(profile?.role === 'admin' || profile?.role === 'staff') && (
            <button
              type="button"
              onClick={() => go('productos')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${
                activePanel === 'productos'
                  ? 'bg-[#e5c185] text-zinc-950'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <ShoppingBag size={18} className="flex-shrink-0" />
              Productos
            </button>
          )}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => go('facturacion')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${
                activePanel === 'facturacion'
                  ? 'bg-[#e5c185] text-zinc-950'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <Receipt size={18} className="flex-shrink-0" />
              Facturación
            </button>
          )}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => go('estadisticas')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${
                activePanel === 'estadisticas'
                  ? 'bg-[#e5c185] text-zinc-950'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <BarChart3 size={18} className="flex-shrink-0" />
              Estadísticas
            </button>
          )}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => go('cierreCaja')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${
                activePanel === 'cierreCaja'
                  ? 'bg-[#e5c185] text-zinc-950'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <Wallet size={18} className="flex-shrink-0" />
              Cierre de caja
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => go('equipo')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${
                activePanel === 'equipo' ? 'bg-[#e5c185] text-zinc-950' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <UserPlus size={18} className="flex-shrink-0" />
              Equipo
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => go('clientes')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${
                activePanel === 'clientes'
                  ? 'bg-[#e5c185] text-zinc-950'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <Users size={18} className="flex-shrink-0" />
              Clientes
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => go('configuracion')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${
                activePanel === 'configuracion'
                  ? 'bg-[#e5c185] text-zinc-950'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <Settings size={18} className="flex-shrink-0" />
              Configuración
            </button>
          )}
        </nav>

        <div className="space-y-3 border-t border-zinc-800 p-4">
          {profile && (
            <p className="text-sm text-zinc-400">
              {profile.name}{' '}
              {profile.role === 'admin' && <span className="text-[#e5c185]">(Admin)</span>}
              {profile.role === 'staff' && <span className="text-[#e5c185]">(Empleado)</span>}
            </p>
          )}
          <a
            href="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            Web
          </a>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3 text-white lg:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded-lg p-2 hover:bg-zinc-800"
            aria-label="Abrir menú"
          >
            <Menu size={22} />
          </button>
          <span className="text-sm font-black uppercase tracking-widest">Lion Barber</span>
          <button
            type="button"
            onClick={handleLogout}
            className="ml-auto rounded-lg p-2 hover:bg-zinc-800"
            aria-label="Cerrar sesión"
          >
            <LogOut size={20} />
          </button>
        </header>

        <main className="mx-auto w-full min-w-0 flex-1 max-w-7xl p-3 sm:p-4 md:p-8">{children}</main>
      </div>
    </>
  );
}
