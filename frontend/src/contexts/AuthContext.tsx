import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  api,
  setAuthToken,
  ApiError,
  getJwtExpSeconds,
  isJwtExpired,
  setUnauthorizedHandler,
  type ClientSubscriptionInfo,
} from '../api';

const TOKEN_KEY = 'lion_barber_token';

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  points: number;
  role: 'client' | 'admin' | 'staff';
  phone?: string;
  /** Cuenta de barbero (staff): id en la agenda */
  barberId?: string | null;
  avatarUrl?: string | null;
  /** Cliente exento de pagar seña: reserva turnos directo, sin Mercado Pago. */
  depositExempt?: boolean;
  /** Abono activo (cortes incluidos). */
  subscription?: ClientSubscriptionInfo | null;
  /** Facturación AFIP, cierre de caja, estadísticas contables y monotributo. */
  isSuperAdmin?: boolean;
  /** Permisos de agenda (solo staff). */
  staffPermissions?: { viewAllAgendas: boolean; editAllAgendas: boolean } | null;
}

interface AuthContextType {
  user: UserProfile | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: (idToken: string, linkPhone?: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  /** Acceso a la parte contable (facturación, cierre de caja, estadísticas). */
  isSuperAdmin: boolean;
  /** Admin o empleado: puede entrar al panel /dashboard */
  canAccessDashboard: boolean;
  /** True cuando se cerró sesión automáticamente porque el token expiró. */
  sessionExpired: boolean;
  /** Limpia el flag de sesión expirada (típicamente al mostrar el aviso). */
  clearSessionExpired: () => void;
  /** Recarga nombre, puntos, abono, etc. desde el backend. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  loginWithGoogle: async () => {},
  logout: async () => {},
  isAdmin: false,
  isSuperAdmin: false,
  canAccessDashboard: false,
  sessionExpired: false,
  clearSessionExpired: () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

function profileFromBackend(u: {
  id: number;
  email: string;
  name: string;
  role: string;
  points?: number;
  barberId?: string | null;
  avatarUrl?: string | null;
  depositExempt?: boolean;
  subscription?: ClientSubscriptionInfo | null;
  isSuperAdmin?: boolean;
  staffPermissions?: { viewAllAgendas: boolean; editAllAgendas: boolean } | null;
}): UserProfile {
  const role =
    u.role === 'admin' ? 'admin' : u.role === 'staff' ? 'staff' : 'client';
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    points: u.points ?? 0,
    role,
    barberId: u.barberId ?? null,
    avatarUrl: u.avatarUrl ?? null,
    depositExempt: Boolean(u.depositExempt),
    subscription: u.subscription ?? null,
    isSuperAdmin: Boolean(u.isSuperAdmin),
    staffPermissions: u.staffPermissions ?? null,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  /** Timer que dispara el logout automático cuando vence el token. */
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExpiryTimer = useCallback(() => {
    if (expiryTimerRef.current != null) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  const clearAuthLocally = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setAuthToken(null);
    setProfile(null);
    clearExpiryTimer();
  }, [clearExpiryTimer]);

  const handleSessionExpired = useCallback(() => {
    clearAuthLocally();
    setSessionExpired(true);
  }, [clearAuthLocally]);

  /**
   * Programa el logout automático en cuanto venza el token actual.
   * Usa el `exp` del propio JWT para no depender del reloj del servidor.
   */
  const scheduleExpiryLogout = useCallback(
    (token: string) => {
      clearExpiryTimer();
      const expSec = getJwtExpSeconds(token);
      if (expSec == null) return;
      const msUntilExpiry = expSec * 1000 - Date.now();
      if (msUntilExpiry <= 0) {
        handleSessionExpired();
        return;
      }
      /** setTimeout corta en ~24.8 días: lo recortamos por seguridad. */
      const ms = Math.min(msUntilExpiry, 2_147_483_000);
      expiryTimerRef.current = setTimeout(() => {
        handleSessionExpired();
      }, ms);
    },
    [clearExpiryTimer, handleSessionExpired]
  );

  const loginWithGoogle = async (idToken: string, linkPhone?: string) => {
    const { token, user } = await api.auth.postGoogle(idToken, linkPhone);
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
    setAuthToken(token);
    setProfile(profileFromBackend(user));
    setSessionExpired(false);
    scheduleExpiryLogout(token);
  };

  const logout = async () => {
    clearAuthLocally();
    setSessionExpired(false);
  };

  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const user = await api.auth.getMe();
      setProfile(profileFromBackend(user));
    } catch {
      /* perfil desactualizado o sesión inválida */
    }
  }, []);

  /** Registra el handler global para 401: lo invoca `fetchApi` cuando detecta sesión inválida. */
  useEffect(() => {
    setUnauthorizedHandler((reason) => {
      if (reason === 'expired') {
        handleSessionExpired();
      } else {
        clearAuthLocally();
      }
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [handleSessionExpired, clearAuthLocally]);

  useEffect(() => {
    const token = (() => {
      try {
        return localStorage.getItem(TOKEN_KEY);
      } catch {
        return null;
      }
    })();
    if (!token) {
      setLoading(false);
      return;
    }
    /** Si ya está vencido al cargar la app, no hace falta llamar al backend. */
    if (isJwtExpired(token)) {
      handleSessionExpired();
      setLoading(false);
      return;
    }
    setAuthToken(token);
    scheduleExpiryLogout(token);
    let cancelled = false;
    (async () => {
      try {
        const user = await api.auth.getMe();
        if (!cancelled) setProfile(profileFromBackend(user));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          /** El handler global ya limpió el estado; no hace falta hacer nada extra acá. */
          return;
        }
        try {
          await new Promise((r) => setTimeout(r, 700));
          const user = await api.auth.getMe();
          if (!cancelled) setProfile(profileFromBackend(user));
        } catch (err2) {
          if (err2 instanceof ApiError && err2.status === 401) {
            /** Idem: el handler global se encarga. */
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handleSessionExpired, scheduleExpiryLogout]);

  /** Limpia el timer si se desmonta el provider. */
  useEffect(() => {
    return () => clearExpiryTimer();
  }, [clearExpiryTimer]);

  /**
   * Cuando el usuario vuelve a la pestaña tras un rato, revisamos el token:
   * si venció durante el background, cerramos sesión sin esperar al próximo request.
   */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      let token: string | null = null;
      try {
        token = localStorage.getItem(TOKEN_KEY);
      } catch {
        /* ignore */
      }
      if (token && isJwtExpired(token)) {
        handleSessionExpired();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [handleSessionExpired]);

  const isAdmin = profile?.role === 'admin';
  const isSuperAdmin = Boolean(profile?.isSuperAdmin);
  const canAccessDashboard = profile?.role === 'admin' || profile?.role === 'staff';

  return (
    <AuthContext.Provider
      value={{
        user: profile,
        profile,
        loading,
        loginWithGoogle,
        logout,
        isAdmin,
        isSuperAdmin,
        canAccessDashboard,
        sessionExpired,
        clearSessionExpired,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
