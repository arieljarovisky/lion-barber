import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import ClientView from './pages/ClientView';
import Dashboard from './pages/Dashboard';
import AdminClientsListPage from './pages/AdminClientsListPage';
import AdminClientDetailPage from './pages/AdminClientDetailPage';
import Login from './pages/Login';
import Perfil from './pages/Perfil';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import MercadoPagoInit from './components/MercadoPagoInit';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

export default function App() {
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AuthProvider>
        <ConfirmProvider>
        <BrowserRouter>
        <MercadoPagoInit />
        <Routes>
          <Route path="/" element={<ClientView />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard/clientes/:clientId"
            element={
              <ProtectedRoute dashboardAccess adminOnly>
                <AdminClientDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/clientes"
            element={
              <ProtectedRoute dashboardAccess adminOnly>
                <AdminClientsListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute dashboardAccess>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/perfil"
            element={
              <ProtectedRoute>
                <Perfil />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
        </ConfirmProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
