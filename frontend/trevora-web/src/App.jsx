import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import ManualEntryPage from './pages/ManualEntryPage.jsx';
import ReceiptUploadPage from './pages/ReceiptUploadPage.jsx';
import ServiceInputMethodPage from './pages/ServiceInputMethodPage.jsx';
import ServiceDraftReviewPage from './pages/ServiceDraftReviewPage.jsx';
import StructuredServiceDraftPage from './pages/StructuredServiceDraftPage.jsx';
import VehicleProfileSelectionPage from './pages/VehicleProfileSelectionPage.jsx';
import VoiceInputPage from './pages/VoiceInputPage.jsx';

function RedirectToServiceInput({ method }) {
  const { vehicleId } = useParams();
  return <Navigate to={`/service-input/${vehicleId}/${method}`} replace />;
}

function RedirectToServiceDraft() {
  const { draftId } = useParams();
  return <Navigate to={`/service-drafts/${draftId}`} replace />;
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/vehicles" replace />} />
        <Route path="/vehicles" element={<VehicleProfileSelectionPage />} />
        <Route path="/service-input/:vehicleId" element={<ServiceInputMethodPage />} />
        <Route path="/service-input/:vehicleId/manual" element={<ManualEntryPage />} />
        <Route path="/service-input/:vehicleId/receipt" element={<ReceiptUploadPage />} />
        <Route path="/service-input/:vehicleId/voice" element={<VoiceInputPage />} />
        <Route path="/service-drafts/:draftId" element={<StructuredServiceDraftPage />} />
        <Route path="/service-drafts/:draftId/review" element={<ServiceDraftReviewPage />} />

        <Route path="/manual/:vehicleId" element={<RedirectToServiceInput method="manual" />} />
        <Route path="/receipt/:vehicleId" element={<RedirectToServiceInput method="receipt" />} />
        <Route path="/voice/:vehicleId" element={<RedirectToServiceInput method="voice" />} />
        <Route path="/drafts/:draftId" element={<RedirectToServiceDraft />} />
        <Route path="*" element={<Navigate to="/vehicles" replace />} />
      </Routes>
    </AppShell>
  );
}
