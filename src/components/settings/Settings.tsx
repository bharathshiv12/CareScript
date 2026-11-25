import React, { useState } from 'react';
import {
  Bell,
  Globe,
  Info,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Sun,
  Type,
} from 'lucide-react';
import { useCareScript } from '../../context/CareScriptContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { SUPPORTED_LANGUAGES } from '../../i18n/translations';
import type { Language, TextSize, ThemeMode } from '../../types/carescript';
import { ConfirmDialog } from '../ui/ConfirmDialog';

export const Settings: React.FC = () => {
  const {
    settings,
    updateSettings,
    notificationPermission,
    requestBrowserNotifications,
    session,
    profile,
    backendStatus,
    logout,
    showToast,
    t,
  } = useCareScript();

  const [logoutOpen, setLogoutOpen] = useState(false);

  const themeOptions: {
    value: ThemeMode;
    label: string;
    Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  }[] = [
    { value: 'light', label: t.settings.lightTheme, Icon: Sun },
    { value: 'dark', label: t.settings.darkTheme, Icon: Moon },
    { value: 'system', label: t.settings.systemTheme, Icon: Monitor },
  ];

  const textSizeOptions: { value: TextSize; label: string; sample: string }[] = [
    { value: 'small', label: t.settings.small, sample: 'Aa' },
    { value: 'medium', label: t.settings.medium, sample: 'Aa' },
    { value: 'large', label: t.settings.large, sample: 'Aa' },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <section className="cs-card p-5 sm:p-6">
        <h1 className="text-2xl font-bold">{t.settings.title}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Personalize CareScript for comfortable reading, notifications, and language preferences.
        </p>
      </section>

      {/* A. Appearance */}
      <section className="cs-card p-5 sm:p-6 space-y-4" aria-labelledby="settings-appearance">
        <div className="flex items-center gap-2.5">
          <Sun className="w-5 h-5" style={{ color: 'var(--color-dark-teal)' }} aria-hidden="true" />
          <h2 id="settings-appearance" className="text-lg font-bold">
            {t.settings.appearance}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {themeOptions.map(({ value, label, Icon }) => {
            const active = settings.theme === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  updateSettings((prev) => ({ ...prev, theme: value }));
                  showToast(`Theme set to ${label}.`, 'info');
                }}
                className="p-4 rounded-xl border text-left flex items-center gap-3 transition-all"
                style={{
                  borderColor: active ? 'var(--color-purple)' : 'var(--color-border)',
                  borderWidth: active ? '2px' : '1px',
                  backgroundColor: active ? 'var(--color-light-purple)' : 'var(--color-surface)',
                }}
              >
                <Icon className="w-5 h-5 shrink-0" style={{ color: active ? 'var(--color-purple)' : 'var(--color-dark-teal)' }} />
                <span className="font-semibold text-sm">{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* B. Text Size */}
      <section className="cs-card p-5 sm:p-6 space-y-4" aria-labelledby="settings-textsize">
        <div className="flex items-center gap-2.5">
          <Type className="w-5 h-5" style={{ color: 'var(--color-dark-teal)' }} aria-hidden="true" />
          <h2 id="settings-textsize" className="text-lg font-bold">
            {t.settings.textSize}
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {textSizeOptions.map(({ value, label }) => {
            const active = settings.textSize === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  updateSettings((prev) => ({ ...prev, textSize: value }));
                  showToast(`Text size set to ${label}.`, 'info');
                }}
                className="p-4 rounded-xl border text-center transition-all"
                style={{
                  borderColor: active ? 'var(--color-purple)' : 'var(--color-border)',
                  borderWidth: active ? '2px' : '1px',
                  backgroundColor: active ? 'var(--color-light-purple)' : 'var(--color-surface)',
                }}
              >
                <div
                  className="font-bold mb-1"
                  style={{
                    fontSize: value === 'small' ? '14px' : value === 'medium' ? '18px' : '22px',
                    color: active ? 'var(--color-purple)' : 'var(--color-dark-teal)',
                  }}
                >
                  Aa
                </div>
                <div className="text-sm font-semibold">{label}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* C. Language */}
      <section className="cs-card p-5 sm:p-6 space-y-4" aria-labelledby="settings-language">
        <div className="flex items-center gap-2.5">
          <Globe className="w-5 h-5" style={{ color: 'var(--color-dark-teal)' }} aria-hidden="true" />
          <div>
            <h2 id="settings-language" className="text-lg font-bold">
              {t.settings.language}
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t.settings.languageHint}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const active = settings.language === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  updateSettings((prev) => ({ ...prev, language: lang.code as Language }));
                  showToast(`Language updated to ${lang.label}.`, 'info');
                }}
                className="p-4 rounded-xl border text-left flex items-center justify-between transition-all"
                style={{
                  borderColor: active ? 'var(--color-purple)' : 'var(--color-border)',
                  borderWidth: active ? '2px' : '1px',
                  backgroundColor: active ? 'var(--color-light-purple)' : 'var(--color-surface)',
                }}
              >
                <div>
                  <div className="font-bold text-sm">{lang.nativeLabel}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {lang.label}
                  </div>
                </div>
                {active && (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }}
                  >
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* D. Notifications */}
      <section className="cs-card p-5 sm:p-6 space-y-4" aria-labelledby="settings-notifications">
        <div className="flex items-center gap-2.5">
          <Bell className="w-5 h-5" style={{ color: 'var(--color-dark-teal)' }} aria-hidden="true" />
          <h2 id="settings-notifications" className="text-lg font-bold">
            {t.settings.notifications}
          </h2>
        </div>

        <div className="space-y-3">
          <div
            className="p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{ backgroundColor: 'var(--color-light-blue)' }}
          >
            <div>
              <div className="font-semibold text-sm">Browser Medication Notifications</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                Permission status:{' '}
                <strong className="uppercase">{notificationPermission}</strong>. Browser alerts work while CareScript is open and cannot guarantee background device alarms.
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
                <button
                  type="button"
                  onClick={async () => {
                    const res = await requestBrowserNotifications();
                    if (res === 'denied') {
                      showToast('Notification permission denied in browser settings.', 'warning');
                    }
                  }}
                  className="cs-btn-primary px-3.5 py-2 text-xs"
                >
                  Request Permission
                </button>
              )}
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={settings.notifications.enabled}
                  disabled={notificationPermission === 'denied' || notificationPermission === 'unsupported'}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    if (checked && notificationPermission === 'default') {
                      await requestBrowserNotifications();
                      return;
                    }
                    updateSettings((prev) => ({
                      ...prev,
                      notifications: { ...prev.notifications, enabled: checked },
                    }));
                  }}
                  className="w-5 h-5 accent-[var(--color-primary)]"
                />
                Enabled
              </label>
            </div>
          </div>

          <div
            className="p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 border"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div>
              <div className="font-semibold text-sm">Alert Timing Preference</div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                How early before a scheduled dose to notify
              </div>
            </div>
            <select
              className="cs-input w-auto text-sm"
              value={settings.notifications.leadMinutes}
              onChange={(e) =>
                updateSettings((prev) => ({
                  ...prev,
                  notifications: { ...prev.notifications, leadMinutes: Number(e.target.value) },
                }))
              }
            >
              <option value={0}>At scheduled time</option>
              <option value={5}>5 minutes before</option>
              <option value={10}>10 minutes before</option>
              <option value={15}>15 minutes before</option>
              <option value={30}>30 minutes before</option>
            </select>
          </div>
        </div>
      </section>

      {/* E. Security & Privacy */}
      <section className="cs-card p-5 sm:p-6 space-y-3" aria-labelledby="settings-security">
        <div className="flex items-center gap-2.5">
          <Lock className="w-5 h-5" style={{ color: 'var(--color-dark-teal)' }} aria-hidden="true" />
          <h2 id="settings-security" className="text-lg font-bold">
            {t.settings.securityPrivacy}
          </h2>
        </div>
        <div className="p-4 rounded-xl text-sm space-y-2" style={{ backgroundColor: 'var(--color-light-blue)' }}>
          <p>
            <strong>Session Type:</strong>{' '}
            {session.isDemoAccount
              ? 'Sample Demo Patient Session (Local Browser)'
              : session.firebaseUid
              ? `Firebase Authenticated (${profile.email || 'Signed-in account'})`
              : 'Local Browser Session'}
          </p>
          <p>
            <strong>Cloud Database Sync:</strong>{' '}
            {session.isDemoAccount
              ? 'Disabled in Demo Mode (local browser storage only)'
              : !isSupabaseConfigured
              ? 'Not configured'
              : backendStatus === 'ready'
              ? 'Active (Supabase PostgreSQL + Row Level Security + Private Storage)'
              : backendStatus === 'syncing'
              ? 'Connecting...'
              : 'Unavailable — check Supabase Third-Party Auth & role claims'}
          </p>
          <p style={{ color: 'var(--color-text-muted)' }}>
            {session.isDemoAccount
              ? 'Sample demo prescriptions and schedules are kept locally in this browser (IndexedDB & localStorage).'
              : 'Patient profiles, prescriptions, schedules, and dose logs are scoped per Firebase UID with Postgres Row Level Security and private storage buckets. AI and service-role secrets are never exposed in frontend code.'}
          </p>
        </div>
      </section>

      {/* F. About CareScript */}
      <section className="cs-card p-5 sm:p-6 space-y-2" aria-labelledby="settings-about">
        <div className="flex items-center gap-2.5">
          <Info className="w-5 h-5" style={{ color: 'var(--color-dark-teal)' }} aria-hidden="true" />
          <h2 id="settings-about" className="text-lg font-bold">
            {t.settings.about}
          </h2>
        </div>
        <p className="text-sm font-semibold">CareScript — Version 1.0.0</p>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          Your Personal Prescription and Medication Companion, designed to make prescriptions easier to organize and understand for patients of every age. CareScript is an organizational and educational aid and does not replace professional care from a doctor or pharmacist.
        </p>
      </section>

      {/* G. Logout (Visually Separated at Bottom) */}
      <section
        className="cs-card p-5 sm:p-6 border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        style={{ borderColor: 'var(--color-danger-bg)' }}
      >
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--color-danger)' }}>
            Account Session
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Sign out of your current CareScript session and return to the welcome screen.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLogoutOpen(true)}
          className="px-5 py-3 rounded-xl text-sm font-semibold text-white inline-flex items-center justify-center gap-2 shrink-0"
          style={{ backgroundColor: 'var(--color-danger)' }}
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          {t.settings.logout}
        </button>
      </section>

      <ConfirmDialog
        open={logoutOpen}
        title={t.settings.logoutConfirmTitle}
        description={t.settings.logoutConfirmBody}
        confirmLabel={t.settings.logout}
        cancelLabel={t.common.cancel}
        onConfirm={() => {
          setLogoutOpen(false);
          logout();
        }}
        onCancel={() => setLogoutOpen(false)}
      />
    </div>
  );
};
