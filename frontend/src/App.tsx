import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ClientView from './pages/ClientView';
import Dashboard from './pages/Dashboard';
import { AuthProvider } from './contexts/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ClientView />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
