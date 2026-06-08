import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { LION_LOGO_URL } from '../constants/brandLogo';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';

export default function Login() {
  const { loginWithGoogle, user, loading, canAccessDashboard, sessionExpired, clearSessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  /** Capturamos el flag al montar para que persista aunque el contexto se vacíe. */
  const [showExpiredNotice, setShowExpiredNotice] = useState(false);

  React.useEffect(() => {
    if (sessionExpired) {
      setShowExpiredNotice(true);
      clearSessionExpired();
    }
  }, [sessionExpired, clearSessionExpired]);

  const fromState = (location.state as { from?: { pathname: string; hash?: string } })?.from;
  const fromPath = fromState?.pathname ?? '/perfil';
  const fromHash = fromState?.hash?.replace(/^#/, '') ?? '';

  React.useEffect(() => {
    if (!loading && user) {
      if (canAccessDashboard) {
        navigate('/dashboard', { replace: true });
        return;
      }
      navigate({ pathname: fromPath, hash: fromHash || undefined }, { replace: true });
    }
  }, [user, loading, navigate, fromPath, fromHash, canAccessDashboard]);

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    const idToken = credentialResponse.credential;
    if (!idToken) {
      setError('No se recibió el token de Google');
      return;
    }
    setError('');
    try {
      await loginWithGoogle(idToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión con Google');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-[#e5c185] font-medium">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-zinc-950 text-zinc-50 font-sans flex flex-col items-center justify-center p-4 sm:p-6 w-full min-w-0 box-border">
      <div className="w-full max-w-md min-w-0 px-1">
        <div className="flex justify-center mb-6 sm:mb-8">
          <img
            src={LION_LOGO_URL}
            alt="Lion Barber"
            className="h-28 w-auto max-w-[min(100%,14rem)] object-contain sm:h-32"
          />
        </div>
        <h1 className="text-2xl sm:text-3xl font-serif font-black text-white text-center uppercase tracking-tight mb-2">
          Lion Barber
        </h1>
        <p className="text-zinc-400 text-center text-xs sm:text-sm mb-6 px-2">
          Iniciá sesión o registrate con tu cuenta de Google para continuar.
        </p>

        {showExpiredNotice && !error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-amber-950/40 border border-amber-500/30 rounded-xl text-amber-200 text-xs sm:text-sm text-center break-words">
            Tu sesión expiró por seguridad. Iniciá sesión otra vez para continuar.
          </div>
        )}

        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-950/50 border border-red-500/30 rounded-xl text-red-400 text-xs sm:text-sm text-center break-words">
            {error}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex justify-center min-w-0 overflow-hidden">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Error al conectar con Google')}
              useOneTap={false}
              theme="filled_black"
              size="large"
              text="continue_with"
              shape="rectangular"
              width="280"
            />
          </div>

          <p className="text-zinc-500 text-xs text-center">
            Si es tu primera vez, se creará tu cuenta al iniciar sesión con Google.
          </p>
        </motion.div>

        <a
          href="/"
          className="mt-10 block text-center text-zinc-400 hover:text-[#e5c185] text-sm font-medium transition-colors"
        >
          ← Volver al inicio
        </a>
      </div>
    </div>
  );
}
