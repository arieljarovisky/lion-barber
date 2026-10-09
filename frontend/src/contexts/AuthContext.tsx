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

/** setTimeout se satura cerca de 2^31 ms (~24.8 días); renovamos o reprogramamos antes. */
const MAX_TIMEOUT_MS = 2_147_483_000;
/** Renovar el JWT un día antes de que venza (o al llegar al tope de setTimeout). */
const REFRESH_BEFORE_EXPIRY_MS = 24 * 60 * 60 * 1000;

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
  /** Facturación AFIP, cierre de caja, estadísticas contables y topes de monotributo. */
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

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  /** Timer que renueva (o, solo si falla, cierra) la sesión antes del vencimiento. */
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);
  const scheduleSessionKeepAliveRef = useRef<(token: string) => void>(() => {});

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

  const persistToken = useCallback((token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
    setAuthToken(token);
  }, []);

  /**
   * Renueva el JWT en el backend y actualiza storage/perfil.
   * Devuelve true si la sesión sigue viva.
   */
  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const run = (async () => {
      const current = readStoredToken();
      if (!current || isJwtExpired(current)) return false;
      try {
        const { token, user } = await api.auth.refresh();
        persistToken(token);
        setProfile(profileFromBackend(user));
        setSessionExpired(false);
        scheduleSessionKeepAliveRef.current(token);
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return false;
        }
        /** Fallo de red u otro error: mantener la sesión local si el token aún vale. */
        return !isJwtExpired(current);
      }
    })();
    refreshInFlightRef.current = run;
    try {
      return await run;
    } finally {
      if (refreshInFlightRef.current === run) refreshInFlightRef.current = null;
    }
  }, [persistToken]);

  /**
   * Programa renovación silenciosa antes del vencimiento.
   * Si setTimeout no alcanza (tokens largos), reprograma en trozos sin cerrar sesión.
   */
  const scheduleSessionKeepAlive = useCallback(
    (token: string) => {
      clearExpiryTimer();
      const expSec = getJwtExpSeconds(token);
      if (expSec == null) return;
      const msUntilExpiry = expSec * 1000 - Date.now();
      if (msUntilExpiry <= 0) {
        handleSessionExpired();
        return;
      }
      const refreshIn = Math.max(msUntilExpiry - REFRESH_BEFORE_EXPIRY_MS, 0);
      const ms = Math.min(refreshIn > 0 ? refreshIn : msUntilExpiry, MAX_TIMEOUT_MS);
      expiryTimerRef.current = setTimeout(() => {
        void (async () => {
          const latest = readStoredToken();
          if (!latest) return;
          if (isJwtExpired(latest)) {
            handleSessionExpired();
            return;
          }
          const ok = await refreshSession();
          if (ok) return;
          const still = readStoredToken();
          if (still && !isJwtExpired(still)) {
            scheduleSessionKeepAliveRef.current(still);
            return;
          }
          handleSessionExpired();
        })();
      }, ms);
    },
    [clearExpiryTimer, handleSessionExpired, refreshSession]
  );

  scheduleSessionKeepAliveRef.current = scheduleSessionKeepAlive;

  const loginWithGoogle = async (idToken: string, linkPhone?: string) => {
    const { token, user } = await api.auth.postGoogle(idToken, linkPhone);
    persistToken(token);
    setProfile(profileFromBackend(user));
    setSessionExpired(false);
    scheduleSessionKeepAlive(token);
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
    const token = readStoredToken();
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
    scheduleSessionKeepAlive(token);
    let cancelled = false;
    (async () => {
      try {
        /** Renueva al abrir la app para alargar tokens viejos (p. ej. de 7 días). */
        const renewed = await refreshSession();
        if (cancelled) return;
        if (!renewed) {
          const still = readStoredToken();
          if (!still || isJwtExpired(still)) return;
          const user = await api.auth.getMe();
          if (!cancelled) setProfile(profileFromBackend(user));
        }
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
  }, [handleSessionExpired, scheduleSessionKeepAlive, refreshSession]);

  /** Limpia el timer si se desmonta el provider. */
  useEffect(() => {
    return () => clearExpiryTimer();
  }, [clearExpiryTimer]);

  /**
   * Al volver a la pestaña: si el token sigue válido, renovamos;
   * solo cerramos sesión si realmente venció.
   */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const token = readStoredToken();
      if (!token) return;
      if (isJwtExpired(token)) {
        handleSessionExpired();
        return;
      }
      void refreshSession();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [handleSessionExpired, refreshSession]);

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
