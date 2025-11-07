import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import PropertyTypePage from './pages/PropertyTypePage';
import RentApartmentWizard from './components/RentApartmentWizard';
import Header from './components/Header';
import DocumentEditorPage from './pages/DocumentEditorPage';
import DocumentDiffPage from './pages/DocumentDiffPage';
import AgreementPage from './pages/AgreementPage';
import UserDashboard from './pages/UserDashboard';
import RegisterPage from './pages/RegisterPage';
import MagicHandlerPage from './pages/MagicHandlerPage';
import LoginPage from './pages/LoginPage'; // если ещё не импортирован
import RegistrationWizard from './pages/RegistrationWizard';




// Заглушки для других страниц
const AboutPage = () => <div className="max-w-4xl mx-auto px-4 py-8">О нас</div>;

function App() {
  return (
    <Router>
      <Header />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/magic" element={<MagicHandlerPage />} />
          <Route path="/property-type/:transactionType" element={<PropertyTypePage />} />
          <Route path="/rent/apartment" element={<RentApartmentWizard />} />
          <Route path="/register" element={<RegistrationWizard />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/agreement" element={<AgreementPage />} />
          <Route path="/about" element={<AboutPage />} /> {/* Добавлено */}
          <Route path="/cabinet" element={<UserDashboard />} />
          <Route path="/user-dashboard" element={<Navigate to="/cabinet" replace />} />
          <Route path="/document-editor" element={<DocumentEditorPage />} />
          <Route path="/document-diff" element={<DocumentDiffPage />} />
          

        </Routes>
      </div>
    </Router>
  );
}
export default App;