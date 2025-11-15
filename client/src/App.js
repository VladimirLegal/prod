import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';

import Header from './components/Header';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import MagicHandlerPage from './pages/MagicHandlerPage';
import AgreementPage from './pages/AgreementPage';
import AboutPage from './pages/AboutPage';
import PropertyTypePage from './pages/PropertyTypePage';
import RentApartmentWizard from './components/RentApartmentWizard';
import RegistrationWizard from './pages/RegistrationWizard';
import RegisterPage from './pages/RegisterPage';
import UserDashboard from './pages/UserDashboard';
import DocumentEditorPage from './pages/DocumentEditorPage';
import DocumentDiffPage from './pages/DocumentDiffPage';
import AdminApp from './pages/admin/AdminApp';

function AdminRoute({ roles = ['admin', 'manager'], children }) {
  const [state, setState] = React.useState({ loading: true, user: null });
  const location = useLocation();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/me', { credentials: 'include' });
        const data = await response.json().catch(() => ({}));
        if (!cancelled) {
          setState({ loading: false, user: data?.user || null });
        }
      } catch (err) {
        if (!cancelled) setState({ loading: false, user: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state.loading) {
    return <div className="py-10 text-center text-gray-500">Загрузка…</div>;
  }
  if (!state.user) {
    return <Navigate to="/login" replace />;
  }
  if (!roles.includes(state.user.role)) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegistrationWizard />} />
      <Route path="/register/simple" element={<RegisterPage />} />
      <Route path="/auth/magic" element={<MagicHandlerPage />} />
      <Route path="/agreement" element={<AgreementPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/property-type/:transactionType" element={<PropertyTypePage />} />
      <Route path="/rent/apartment" element={<RentApartmentWizard />} />
      <Route path="/cabinet" element={<UserDashboard />} />
      <Route path="/user-dashboard" element={<Navigate to="/cabinet" replace />} />
      <Route path="/document-editor" element={<DocumentEditorPage />} />
      <Route path="/document-diff" element={<DocumentDiffPage />} />
      <Route
        path="/admin/*"
        element={(
          <AdminRoute>
            <AdminApp />
          </AdminRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <Header />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <AppRoutes />
      </div>
    </Router>
  );
}

export default App;