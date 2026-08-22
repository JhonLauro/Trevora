import React from "react";
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { isLoggedIn } from './api/currentUser.js';
import AppShell from './components/AppShell.jsx';
import AccountSettingsPage from './pages/AccountSettingsPage.jsx';
import AddVehiclePage from './pages/AddVehiclePage.jsx';
import AuthCallbackPage from './pages/AuthCallbackPage.jsx';
import GaragePage from './pages/GaragePage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ManualEntryPage from './pages/ManualEntryPage.jsx';
import MechanicAccessRequestPage from './pages/MechanicAccessRequestPage.jsx';
import MechanicAccessSessionPlaceholderPage from './pages/MechanicAccessSessionPlaceholderPage.jsx';
import MechanicSharedRecordDetailPage from './pages/MechanicSharedRecordDetailPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import OwnerAccessRequestsPage from './pages/OwnerAccessRequestsPage.jsx';
import QRSharingPage from './pages/QRSharingPage.jsx';
import ReceiptUploadPage from './pages/ReceiptUploadPage.jsx';
import RecordsPage from './pages/RecordsPage.jsx';
import VehiclePage from './pages/VehiclePage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import RegisterVehiclePage from './pages/RegisterVehiclePage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import ServiceDraftCorrectionPage from './pages/ServiceDraftCorrectionPage.jsx';
import ServiceInputMethodPage from './pages/ServiceInputMethodPage.jsx';
import ServiceDraftReviewPage from './pages/ServiceDraftReviewPage.jsx';
import ServiceRecordConfirmationPage from './pages/ServiceRecordConfirmationPage.jsx';
import ServiceRecordDetailPage from './pages/ServiceRecordDetailPage.jsx';
import ServiceRecordSavedPage from './pages/ServiceRecordSavedPage.jsx';
import StructuredServiceDraftPage from './pages/StructuredServiceDraftPage.jsx';
import VoiceInputPage from './pages/VoiceInputPage.jsx';

function RedirectToServiceInput({ method }) {
  const { vehicleId } = useParams();
  return <Navigate to={`/service-input/${vehicleId}/${method}`} replace />;
}

function RedirectToVehicle() {
  const { vehicleId } = useParams();
  return <Navigate to={`/vehicles/${vehicleId}`} replace />;
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
        <Route path="/" element={<GaragePage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/account-settings" element={<AccountSettingsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/access/requests" element={<OwnerAccessRequestsPage />} />

        {/* The Garage replaces both the old dashboard and the vehicle list.
            There is no global "active vehicle" any more, so a list whose only
            job was choosing one has nothing left to do. */}
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/vehicles" element={<Navigate to="/" replace />} />

        {/* The vehicle page absorbs the old Service History screen: everything
            about one car lives here, titled with the car rather than with a
            feature. The old page stays on disk, unrouted, for comparison. */}
        <Route path="/vehicles/new" element={<AddVehiclePage />} />
        <Route path="/vehicles/:vehicleId" element={<VehiclePage />} />
        <Route path="/vehicles/:vehicleId/share" element={<QRSharingPage />} />
        <Route path="/vehicles/:vehicleId/history" element={<RedirectToVehicle />} />
        <Route path="/vehicles/:vehicleId/history/:recordId" element={<ServiceRecordDetailPage />} />
        <Route path="/service-input" element={<ServiceInputMethodPage />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function RootRoute() {
  return isLoggedIn() ? <AppRoutes /> : <LandingPage />;
}

export default function App() {
  return (
    <Routes>
      {/* `/` is the Garage for a signed-in owner and the marketing page for
          everyone else. It used to be the landing page unconditionally, which
          sent returning users to a sales pitch for a product they already had. */}
      <Route path="/" element={<RootRoute />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/register/vehicle" element={<RegisterVehiclePage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/access/request/:token" element={<MechanicAccessRequestPage />} />
      <Route path="/mechanic/access/:sessionId" element={<MechanicAccessSessionPlaceholderPage />} />
      <Route path="/mechanic/access/:sessionId/history/:recordId" element={<MechanicSharedRecordDetailPage />} />
      <Route path="*" element={<AppRoutes />} />
    </Routes>
  );
}

