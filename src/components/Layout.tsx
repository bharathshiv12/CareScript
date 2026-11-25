import React from 'react';
import { X, CheckCircle2, Info, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';
import { useCareScript } from '../context/CareScriptContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { Header } from './Header';
import { MobileNavigation } from './MobileNavigation';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  onOpenProfileModal?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, onOpenProfileModal }) => {
  const { toast, dismissToast, session, backendStatus, backendError, refreshBackendData } = useCareScript();

  const getToastStyle = (tone: 'success' | 'info' | 'warning' | 'error') => {
    switch (tone) {
      case 'success':
        return { bg: 'var(--color-success-bg)', color: 'var(--color-success)', Icon: CheckCircle2 };
      case 'warning':
        return { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)', Icon: AlertTriangle };
      case 'error':
        return { bg: 'var(--color-danger-bg)', color: 'var(--color-danger)', Icon: AlertCircle };
      default:
        return { bg: 'var(--color-light-blue)', color: 'var(--color-primary)', Icon: Info };
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <Sidebar />

      <div className="flex-1 md:pl-64 lg:pl-72 flex flex-col min-h-screen min-w-0">
        <Header onOpenProfileModal={onOpenProfileModal} />

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-10">
          {!session.isDemoAccount && session.firebaseUid && !isSupabaseConfigured && (
            <div
              role="status"
              className="mb-5 p-3.5 rounded-xl border flex items-start gap-2.5 text-xs sm:text-sm"
              style={{
                backgroundColor: 'var(--color-warning-bg)',
                borderColor: 'var(--color-warning)',
                color: 'var(--color-warning)',
              }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Firebase Authentication is active, but Supabase environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are not configured yet. Cloud database sync is paused until configured.
              </span>
            </div>
          )}

          {backendStatus === 'error' && backendError && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs sm:text-sm"
              style={{
                backgroundColor: 'var(--color-danger-bg)',
                borderColor: 'var(--color-danger)',
                color: 'var(--color-danger)',
              }}
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>Backend sync error: {backendError}</span>
              </div>
              <button
                type="button"
                onClick={() => refreshBackendData()}
                className="cs-btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Retry
              </button>
            </div>
          )}

          {children}
        </main>
      </div>

      <MobileNavigation />

      {toast && (() => {
        const { bg, color, Icon } = getToastStyle(toast.tone);
        return (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 max-w-sm cs-card p-3.5 flex items-center gap-3"
            style={{ backgroundColor: bg, color, borderColor: color }}
          >
            <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span className="text-sm font-semibold flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={dismissToast}
              aria-label="Dismiss notification"
              className="p-1 rounded-lg hover:opacity-75"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })()}
    </div>
  );
};
