import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setAuthToken } from '../api';

const TOKEN_KEY = 'lion_barber_token';

export interface UserProfile {
  name: string;
  email: string;
  points: number;
  role: 'client' | 'admin';
  phone?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  loginWithGoogle: async () => {},
  logout: async () => {},
  isAdmin: false,
});

export const useAuth = () => useContext(AuthContext);

function profileFromBackend(u: { id: number; email: string; name: string; role: string }): UserProfile {
  return {
    name: u.name,
    email: u.email,
    points: 0,
    role: u.role === 'admin' ? 'admin' : 'client',
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loginWithGoogle = async (idToken: string) => {
    const { token, user } = await api.auth.postGoogle(idToken);
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    setProfile(profileFromBackend(user));
  };

  const logout = async () => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setProfile(null);
  };

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      setAuthToken(token);
      api.auth
        .getMe()
        .then((user) => setProfile(profileFromBackend(user)))
        .catch(() => {
          localStorage.removeItem(TOKEN_KEY);
          setAuthToken(null);
          setProfile(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user: profile,
        profile,
        loading,
        loginWithGoogle,
        logout,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
