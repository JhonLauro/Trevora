import React, { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { isLoggedIn } from './api/currentUser.js';
import AppShell from './components/AppShell.jsx';

/* Every screen below is its own chunk, fetched the first time it is
   opened rather than on first paint. The bundle was one 721KB file: every
   page, every icon and the QR library downloaded before a signed-out
   visitor could read the landing page.

   The landing page, login and the app shell stay eager on purpose -- they
   are the first thing rendered in each of the two entry paths, and a chunk
   boundary there would add a round trip exactly where it hurts. */
const AccountSettingsPage = lazy(() => import('./pages/AccountSettingsPage.jsx'));
const AddVehiclePage = lazy(() => import('./pages/AddVehiclePage.jsx'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage.jsx'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage.jsx'));
const GaragePage = lazy(() => import('./pages/GaragePage.jsx'));
const ManualEntryPage = lazy(() => import('./pages/ManualEntryPage.jsx'));
const MechanicAccessRequestPage = lazy(() => import('./pages/MechanicAccessRequestPage.jsx'));
const MechanicAccessSessionPlaceholderPage = lazy(() => import('./pages/MechanicAccessSessionPlaceholderPage.jsx'));
const MechanicSharedRecordDetailPage = lazy(() => import('./pages/MechanicSharedRecordDetailPage.jsx'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx'));
const OwnerAccessRequestsPage = lazy(() => import('./pages/OwnerAccessRequestsPage.jsx'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage.jsx'));
const QRSharingPage = lazy(() => import('./pages/QRSharingPage.jsx'));
const ReceiptUploadPage = lazy(() => import('./pages/ReceiptUploadPage.jsx'));
const RecordsPage = lazy(() => import('./pages/RecordsPage.jsx'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'));
const RegisterVehiclePage = lazy(() => import('./pages/RegisterVehiclePage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.jsx'));
const ServiceDraftReviewPage = lazy(() => import('./pages/ServiceDraftReviewPage.jsx'));
const ServiceInputMethodPage = lazy(() => import('./pages/ServiceInputMethodPage.jsx'));
const ServiceRecordConfirmationPage = lazy(() => import('./pages/ServiceRecordConfirmationPage.jsx'));
const ServiceRecordDetailPage = lazy(() => import('./pages/ServiceRecordDetailPage.jsx'));
const ServiceRecordSavedPage = lazy(() => import('./pages/ServiceRecordSavedPage.jsx'));
const TermsPage = lazy(() => import('./pages/TermsPage.jsx'));
const VehiclePage = lazy(() => import('./pages/VehiclePage.jsx'));
const VoiceInputPage = lazy(() => import('./pages/VoiceInputPage.jsx'));
const WelcomePage = lazy(() => import('./pages/WelcomePage.jsx'));

import LandingPage from './pages/LandingPage.jsx';

import LoginPage from './pages/LoginPage.jsx';

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

/* Deliberately empty: a chunk usually arrives within a frame or two on a
   warm connection, and a spinner flashing in and out is worse than a
   moment of the previous screen staying put. */
const Loading = null;

function AppRoutes() {
  const location = useLocation();

  if (!isLoggedIn()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <AppShell>
      <Suspense fallback={Loading}>
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
        <Route path="/service-drafts/:draftId" element={<ServiceDraftReviewPage />} />
        {/* Review and correction were separate screens: one that accepted
            edits and discarded them, one that saved. Both are the draft
            screen now, and the old paths still resolve. */}
        <Route path="/service-drafts/:draftId/review" element={<RedirectToServiceDraft />} />
        <Route path="/service-drafts/:draftId/correct" element={<RedirectToServiceDraft />} />
        <Route path="/service-drafts/:draftId/confirm" element={<ServiceRecordConfirmationPage />} />
        <Route path="/service-drafts/:draftId/saved" element={<ServiceRecordSavedPage />} />

        <Route path="/manual/:vehicleId" element={<RedirectToServiceInput method="manual" />} />
        <Route path="/receipt/:vehicleId" element={<RedirectToServiceInput method="receipt" />} />
        <Route path="/voice/:vehicleId" element={<RedirectToServiceInput method="voice" />} />
        <Route path="/drafts/:draftId" element={<RedirectToServiceDraft />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </AppShell>
  );
}

function RootRoute() {
  return isLoggedIn() ? <AppRoutes /> : <LandingPage />;
}

export default function App() {
  return (
    <Suspense fallback={Loading}>
    <Routes>
      {/* `/` is the Garage for a signed-in owner and the marketing page for
          everyone else. It used to be the landing page unconditionally, which
          sent returning users to a sales pitch for a product they already had. */}
      <Route path="/" element={<RootRoute />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/register/vehicle" element={<RegisterVehiclePage />} />
      {/* The onboarding walkthrough, between signing up and adding the
          first vehicle. Outside AppShell like the rest of signup: there
          is no garage to navigate yet, and the page previews the app
          rather than being part of it. */}
      <Route path="/welcome" element={<WelcomePage />} />
      {/* Public and outside the auth guard: the account form links to both,
          and somebody deciding whether to agree has to be able to read them
          without an account. */}
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/access/request/:token" element={<MechanicAccessRequestPage />} />
      <Route path="/mechanic/access/:sessionId" element={<MechanicAccessSessionPlaceholderPage />} />
      <Route path="/mechanic/access/:sessionId/history/:recordId" element={<MechanicSharedRecordDetailPage />} />
      <Route path="*" element={<AppRoutes />} />
    </Routes>
    </Suspense>
  );
}

