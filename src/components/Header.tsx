import React, { useMemo, useState } from 'react';
import { Bell, CheckCircle2, Clock, AlertCircle, User } from 'lucide-react';
import { useCareScript } from '../context/CareScriptContext';
import { buildScheduleForDate, formatTime12h, getTodayKey } from '../utils/dateUtils';
import { Logo } from './ui/Logo';

interface HeaderProps {
  onOpenProfileModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenProfileModal }) => {
  const { profile, reminders, doseLogs, session, setActiveTab, t } = useCareScript();
  const [bellOpen, setBellOpen] = useState(false);

  const initials = useMemo(() => {
    const parts = (profile.fullName || 'P').trim().split(/\s+/);
    return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || 'P';
  }, [profile.fullName]);

  const todayAlerts = useMemo(() => {
    const schedule = buildScheduleForDate(getTodayKey(), reminders, doseLogs, session.isDemoAccount);
    return schedule.filter((d) => d.status === 'upcoming' || d.status === 'missed');
  }, [reminders, doseLogs, session.isDemoAccount]);

  return (
    <header
      className="sticky top-0 z-20 border-b px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="flex items-center gap-3 md:hidden">
        <Logo compact onDark={false} />
        <span className="font-bold text-base">CareScript</span>
      </div>

      <div className="hidden md:flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <span className="font-medium">{t.tagline}</span>
        {session.isDemoAccount && (
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}
          >
            {t.common.demoBadge}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 relative">
        {/* Notification Bell */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setBellOpen((o) => !o)}
            aria-label="Medication notifications"
            aria-expanded={bellOpen}
            className="relative p-2.5 rounded-xl border transition-colors"
            style={{
              backgroundColor: 'var(--color-light-blue)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-primary)',
            }}
          >
            <Bell className="w-5 h-5" aria-hidden="true" />
            {todayAlerts.length > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[11px] font-bold flex items-center justify-center text-white"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                {todayAlerts.length}
              </span>
            )}
          </button>

          {bellOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setBellOpen(false)} />
              <div
                className="cs-card absolute right-0 mt-2 w-80 max-w-[90vw] p-4 z-20"
                style={{ boxShadow: 'var(--shadow-elevated)' }}
              >
                <div className="flex items-center justify-between pb-2.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="font-bold text-sm">Today&apos;s Dose Alerts</span>
                  <button
                    type="button"
                    onClick={() => {
                      setBellOpen(false);
                      setActiveTab('reminders');
                    }}
                    className="text-xs font-semibold"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    {t.common.viewAll}
                  </button>
                </div>

                {todayAlerts.length === 0 ? (
                  <div className="py-5 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    <CheckCircle2 className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--color-success)' }} />
                    No pending or missed doses right now.
                  </div>
                ) : (
                  <ul className="mt-2.5 space-y-2 max-h-64 overflow-y-auto">
                    {todayAlerts.map((item) => (
                      <li
                        key={item.id}
                        className="p-2.5 rounded-xl flex items-start gap-2.5 text-xs"
                        style={{
                          backgroundColor:
                            item.status === 'missed' ? 'var(--color-danger-bg)' : 'var(--color-light-blue)',
                        }}
                      >
                        {item.status === 'missed' ? (
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--color-danger)' }} />
                        ) : (
                          <Clock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--color-accent)' }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">
                            {item.medicineName} ({item.strength})
                          </div>
                          <div style={{ color: 'var(--color-text-muted)' }}>
                            {formatTime12h(item.scheduledTime)} ·{' '}
                            {item.status === 'missed' ? t.common.missed : t.common.upcoming}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {/* Profile Access Button */}
        <button
          type="button"
          onClick={() => {
            if (onOpenProfileModal) {
              onOpenProfileModal();
            } else {
              setActiveTab('dashboard');
            }
          }}
          className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl border transition-colors"
          style={{
            backgroundColor: 'var(--color-light-blue)',
            borderColor: 'var(--color-border)',
          }}
          aria-label="Open patient profile"
        >
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.fullName}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              initials || <User className="w-4 h-4" />
            )}
          </span>
          <span className="hidden sm:inline text-sm font-semibold truncate max-w-[140px]">
            {profile.fullName}
          </span>
        </button>
      </div>
    </header>
  );
};
