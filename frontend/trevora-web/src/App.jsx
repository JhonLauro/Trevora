import React from "react";
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { isLoggedIn } from './api/currentUser.js';
import AppShell from './components/AppShell.jsx';
import AccountSettingsPage from './pages/AccountSettingsPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ManualEntryPage from './pages/ManualEntryPage.jsx';
import MechanicAccessRequestPage from './pages/MechanicAccessRequestPage.jsx';
import MechanicAccessSessionPlaceholderPage from './pages/MechanicAccessSessionPlaceholderPage.jsx';
import MechanicSharedRecordDetailPage from './pages/MechanicSharedRecordDetailPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import OwnerAccessRequestsPage from './pages/OwnerAccessRequestsPage.jsx';
import QRSharingPage from './pages/QRSharingPage.jsx';
import ReceiptUploadPage from './pages/ReceiptUploadPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ServiceDraftCorrectionPage from './pages/ServiceDraftCorrectionPage.jsx';
import ServiceInputMethodPage from './pages/ServiceInputMethodPage.jsx';
import ServiceDraftReviewPage from './pages/ServiceDraftReviewPage.jsx';
import ServiceRecordConfirmationPage from './pages/ServiceRecordConfirmationPage.jsx';
import ServiceRecordDetailPage from './pages/ServiceRecordDetailPage.jsx';
import ServiceRecordSavedPage from './pages/ServiceRecordSavedPage.jsx';
import StructuredServiceDraftPage from './pages/StructuredServiceDraftPage.jsx';
import VehicleProfileSelectionPage from './pages/VehicleProfileSelectionPage.jsx';
import VehicleServiceHistoryPage from './pages/VehicleServiceHistoryPage.jsx';
import VoiceInputPage from './pages/VoiceInputPage.jsx';

function RedirectToServiceInput({ method }) {
  const { vehicleId } = useParams();
  return <Navigate to={`/service-input/${vehicleId}/${method}`} replace />;
}

function RedirectToServiceDraft() {
  const { draftId } = useParams();
  return <Navigate to={`/service-drafts/${draftId}`} replace />;
}

function AppRoutes() {
  const location = useLocation();

  if (!isLoggedIn()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/vehicles" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/account-settings" element={<AccountSettingsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/access/requests" element={<OwnerAccessRequestsPage />} />
        <Route path="/vehicles" element={<VehicleProfileSelectionPage />} />
        <Route path="/vehicles/:vehicleId/share" element={<QRSharingPage />} />
        <Route path="/vehicles/:vehicleId/history" element={<VehicleServiceHistoryPage />} />
        <Route path="/vehicles/:vehicleId/history/:recordId" element={<ServiceRecordDetailPage />} />
        <Route path="/service-input/:vehicleId" element={<ServiceInputMethodPage />} />
        <Route path="/service-input/:vehicleId/manual" element={<ManualEntryPage />} />
        <Route path="/service-input/:vehicleId/receipt" element={<ReceiptUploadPage />} />
        <Route path="/service-input/:vehicleId/voice" element={<VoiceInputPage />} />
        <Route path="/service-drafts/:draftId" element={<StructuredServiceDraftPage />} />
        <Route path="/service-drafts/:draftId/review" element={<ServiceDraftReviewPage />} />
        <Route path="/service-drafts/:draftId/correct" element={<ServiceDraftCorrectionPage />} />
        <Route path="/service-drafts/:draftId/confirm" element={<ServiceRecordConfirmationPage />} />
        <Route path="/service-drafts/:draftId/saved" element={<ServiceRecordSavedPage />} />

        <Route path="/manual/:vehicleId" element={<RedirectToServiceInput method="manual" />} />
        <Route path="/receipt/:vehicleId" element={<RedirectToServiceInput method="receipt" />} />
        <Route path="/voice/:vehicleId" element={<RedirectToServiceInput method="voice" />} />
        <Route path="/drafts/:draftId" element={<RedirectToServiceDraft />} />
        <Route path="*" element={<Navigate to="/vehicles" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/access/request/:token" element={<MechanicAccessRequestPage />} />
      <Route path="/mechanic/access/:sessionId" element={<MechanicAccessSessionPlaceholderPage />} />
      <Route path="/mechanic/access/:sessionId/history/:recordId" element={<MechanicSharedRecordDetailPage />} />
      <Route path="*" element={<AppRoutes />} />
    </Routes>
  );
}

