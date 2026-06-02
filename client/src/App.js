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
import ReviewEditorPage from './pages/ReviewEditorPage';
import CounterpartyCheckPage from './pages/CounterpartyCheckPage';
import OtherDocumentsPage from './pages/OtherDocumentsPage';
import MaternityCapitalSharesWizard from './pages/MaternityCapitalSharesWizard';


function buildReconsentUrl(location, fallbackNext = null) {
  const currentPath = `${location.pathname}${location.search || ''}`;
  const next = fallbackNext || currentPath || '/cabinet';
  return `/register?mode=reconsent&next=${encodeURIComponent(next)}`;
}

function AdminRoute({ roles = ['admin', 'manager'], children }) {
  const [state, setState] = React.useState({ loading: true, user: null });
  const location = useLocation();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!cancelled) {
          setState({ loading: false, user: data?.user || null });
        }
      } catch {
        if (!cancelled) setState({ loading: false, user: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search]);

  if (state.loading) {
    return <div className="py-10 text-center text-gray-500">Загрузка…</div>;
  }
  if (!state.user) {
    return <Navigate to="/login" replace />;
  }
  if (state.user.agreementsRequired === true) {
    return <Navigate to={buildReconsentUrl(location, '/admin')} replace />;
  }
  if (!roles.includes(state.user.role)) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function ProtectedRoute({ children }) {
  const [state, setState] = React.useState({ loading: true, user: null });
  const location = useLocation();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!cancelled) {
          setState({ loading: false, user: data?.user || null });
        }
      } catch {
        if (!cancelled) setState({ loading: false, user: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search]);

  if (state.loading) {
    return <div className="py-10 text-center text-gray-500">Загрузка…</div>;
  }
  if (!state.user) {
    return <Navigate to="/login" replace />;
  }
  if (state.user.agreementsRequired === true && location.pathname !== '/register') {
    return <Navigate to={buildReconsentUrl(location)} replace />;
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
      <Route path="/other-documents" element={<OtherDocumentsPage />} />
      <Route
        path="/other-documents/maternity-capital-shares"
        element={<MaternityCapitalSharesWizard />}
      />
      <Route path="/rent/apartment" element={<RentApartmentWizard />} />
      <Route
        path="/cabinet"
        element={(<ProtectedRoute><UserDashboard /></ProtectedRoute>)}
      />
      <Route path="/user-dashboard" element={<Navigate to="/cabinet" replace />} />
      <Route path="/document-editor" element={<DocumentEditorPage />} />
      <Route path="/document-diff" element={<DocumentDiffPage />} />
      <Route
        path="/counterparty-check"
        element={(
          <ProtectedRoute>
            <CounterpartyCheckPage />
          </ProtectedRoute>
        )}
      />
      <Route path="/review/:token" element={<ReviewEditorPage />} />
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