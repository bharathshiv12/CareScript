import React, { lazy, Suspense, useState } from 'react';
import { AlertCircle, LogOut, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { CareScriptProvider, useCareScript } from './context/CareScriptContext';
import { isSupabaseConfigured } from './lib/supabase';
const AuthScreen = lazy(() => import('./components/AuthScreen').then((m) => ({ default: m.AuthScreen })));
const Layout = lazy(() => import('./components/Layout').then((m) => ({ default: m.Layout })));
const Dashboard = lazy(() => import('./components/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const PatientProfileModal = lazy(() => import('./components/dashboard/PatientProfileModal').then((m) => ({ default: m.PatientProfileModal })));
const ScanPrescription = lazy(() => import('./components/scan/ScanPrescription').then((m) => ({ default: m.ScanPrescription })));
const AIBuddy = lazy(() => import('./components/aibuddy/AIBuddy').then((m) => ({ default: m.AIBuddy })));
const Reminders = lazy(() => import('./components/reminders/Reminders').then((m) => ({ default: m.Reminders })));
const Settings = lazy(() => import('./components/settings/Settings').then((m) => ({ default: m.Settings })));
const OAuthCallback = lazy(() => import('./components/auth/OAuthCallback').then((m) => ({ default: m.OAuthCallback })));

const PageLoading: React.FC = () => (
  <div className="min-h-48 flex items-center justify-center text-sm font-semibold" role="status">
    Loading CareScript…
  </div>
);

const CareScriptAppContent: React.FC = () => {
  const {
    session,
    authReady,
    backendStatus,
    backendError,
    profile,
    activeTab,
    refreshBackendData,
    logout,
  } = useCareScript();
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  if (window.location.pathname === '/auth/callback') {
    return <Suspense fallback={<PageLoading />}><OAuthCallback /></Suspense>;
  }

  if (!authReady) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ backgroundColor: 'var(--color-background)' }}
      >
        <div className="cs-card px-6 py-5 text-sm font-semibold">
          Restoring your CareScript session...
        </div>
      </div>
    );
  }

  if (!session.isAuthenticated) {
    return <Suspense fallback={<PageLoading />}><AuthScreen /></Suspense>;
  }

  // Never render a cloud dashboard until Supabase Auth and patient profile loading succeed.
  const requiresLiveBackend = !session.isDemoAccount && isSupabaseConfigured;
  if (requiresLiveBackend && (backendStatus === 'idle' || backendStatus === 'syncing')) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ backgroundColor: 'var(--color-background)' }}
      >
        <div className="cs-card max-w-md w-full p-6 text-center space-y-3">
          <div
            className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--color-light-blue)', color: 'var(--color-primary)' }}
          >
            <RefreshCw className="w-6 h-6 animate-spin" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-bold">Connecting Your CareScript Account</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Verifying your Supabase session and loading your patient profile...
          </p>
        </div>
      </div>
    );
  }

  if (requiresLiveBackend && (backendStatus === 'error' || !profile.userId)) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ backgroundColor: 'var(--color-background)' }}
      >
        <div className="cs-card max-w-xl w-full p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
            >
              <ShieldAlert className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Cloud Account Setup Incomplete</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Your Supabase sign-in succeeded, but CareScript could not load your protected patient data.
              </p>
            </div>
          </div>

          <div
            className="p-4 rounded-xl border text-xs sm:text-sm space-y-2"
            style={{
              backgroundColor: 'var(--color-light-blue)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
              <span>Supabase user: {session.userId ? `${session.userId.slice(0, 8)}…` : 'Not detected'}</span>
            </div>
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
              <span>Supabase JWT and row security are enforced for every database request.</span>
            </div>
          </div>

          {backendError && (
            <div
              role="alert"
              className="p-4 rounded-xl text-sm"
              style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
            >
              {backendError}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => void refreshBackendData()}
              className="cs-btn-primary px-4 py-2.5 text-sm inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Retry Cloud Sync
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 ml-auto"
              style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<PageLoading />}>
      <Layout onOpenProfileModal={() => setProfileModalOpen(true)}>
        {activeTab === 'dashboard' && (
          <Dashboard onEditProfile={() => setProfileModalOpen(true)} />
        )}
        {activeTab === 'scan' && <ScanPrescription />}
        {activeTab === 'ai-buddy' && <AIBuddy />}
        {activeTab === 'reminders' && <Reminders />}
        {activeTab === 'settings' && <Settings />}

        {profileModalOpen && (
          <PatientProfileModal
            open={profileModalOpen}
            onClose={() => setProfileModalOpen(false)}
          />
        )}
      </Layout>
    </Suspense>
  );
};

export function App() {
  return (
    <CareScriptProvider>
      <CareScriptAppContent />
    </CareScriptProvider>
  );
}
