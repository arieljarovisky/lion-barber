import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import ClientView from './pages/ClientView';
import BarberAgendasPage from './pages/BarberAgendasPage';
import Dashboard from './pages/Dashboard';
import BarberStatsPage from './pages/BarberStatsPage';
import WeeklyCashClosePage from './pages/WeeklyCashClosePage';
import AdminClientsListPage from './pages/AdminClientsListPage';
import AdminClientDetailPage from './pages/AdminClientDetailPage';
import Login from './pages/Login';
import Perfil from './pages/Perfil';
import PoliticaPrivacidad from './pages/PoliticaPrivacidad';
import TerminosCondiciones from './pages/TerminosCondiciones';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import MercadoPagoInit from './components/MercadoPagoInit';
import FloatingWhatsAppButton from './components/FloatingWhatsAppButton';

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
          <Route path="/privacidad" element={<PoliticaPrivacidad />} />
          <Route path="/terminos" element={<TerminosCondiciones />} />
          <Route
            path="/dashboard/clientes/:clientId"
            element={
              <ProtectedRoute dashboardAccess>
                <AdminClientDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/clientes"
            element={
              <ProtectedRoute dashboardAccess>
                <AdminClientsListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/estadisticas"
            element={
              <ProtectedRoute dashboardAccess adminOnly superAdminOnly>
                <BarberStatsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/cierre-caja"
            element={
              <ProtectedRoute dashboardAccess adminOnly superAdminOnly>
                <WeeklyCashClosePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/agendas"
            element={
              <ProtectedRoute dashboardAccess>
                <BarberAgendasPage />
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
        <FloatingWhatsAppButton />
      </BrowserRouter>
        </ConfirmProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
