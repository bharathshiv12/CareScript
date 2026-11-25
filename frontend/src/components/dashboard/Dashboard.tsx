import React, { useMemo } from 'react';
import {
  Activity,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock,
  Edit3,
  FileText,
  Pill,
  Utensils,
} from 'lucide-react';
import { useCareScript } from '../../context/CareScriptContext';
import {
  buildScheduleForDate,
  formatIsoTime,
  formatTime12h,
  getFoodInstructionLabel,
  getTimeOfDayGreetingKey,
  getTodayKey,
} from '../../utils/dateUtils';
import { StatusBadge } from '../ui/StatusBadge';

interface DashboardProps {
  onEditProfile: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onEditProfile }) => {
  const {
    profile,
    reminders,
    prescriptions,
    doseLogs,
    markDoseTaken,
    setActiveTab,
    todayStats,
    adherence,
    backendDashboard,
    session,
    showToast,
    t,
  } = useCareScript();

  const greetingKey = getTimeOfDayGreetingKey();
  const greetingText = t.greetings[greetingKey];

  const initials = useMemo(() => {
    const parts = (profile.fullName || 'P').trim().split(/\s+/);
    return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || 'P';
  }, [profile.fullName]);

  const todayKey = getTodayKey();
  const todaySchedule = useMemo(
    () => buildScheduleForDate(todayKey, reminders, doseLogs, session.isDemoAccount),
    [todayKey, reminders, doseLogs, session.isDemoAccount]
  );

  const nextMedication = useMemo(
    () => todaySchedule.find((d) => d.status === 'upcoming') ?? null,
    [todaySchedule]
  );

  const activeMedCount = useMemo(
    () => (backendDashboard ? backendDashboard.activeMedications : reminders.filter((r) => r.active).length),
    [backendDashboard, reminders]
  );

  const progressPct =
    todayStats.total > 0 ? Math.round((todayStats.taken / todayStats.total) * 100) : 0;

  const handleMarkTaken = async (reminderId: string, time: string, medName: string) => {
    const ok = await markDoseTaken(reminderId, todayKey, time);
    if (ok) {
      showToast(`Marked ${medName} as taken.`, 'success');
    }
  };

  const foodLabels = {
    beforeFood: t.common.beforeFood,
    afterFood: t.common.afterFood,
    withFood: t.common.withFood,
    noInstruction: t.common.noInstruction,
    needsVerification: t.common.needsVerification,
  };

  // SVG Circular ring math
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (progressPct / 100) * circumference;

  return (
    <div className="space-y-6">
      {/* A. Welcome Section */}
      <section className="cs-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold text-white shrink-0 overflow-hidden"
            style={{ backgroundColor: 'var(--color-primary)' }}
            aria-hidden="true"
          >
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
              {greetingText}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t.greetings.welcomeBack}, {profile.fullName}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('scan')}
            className="cs-btn-secondary px-4 py-2.5 text-sm inline-flex items-center gap-2"
          >
            <FileText className="w-4 h-4" aria-hidden="true" />
            {t.nav.scan}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reminders')}
            className="cs-btn-primary px-4 py-2.5 text-sm inline-flex items-center gap-2"
          >
            <BellRing className="w-4 h-4" aria-hidden="true" />
            {t.nav.reminders}
          </button>
        </div>
      </section>

      {/* B. Personal Information Card */}
      <section className="cs-card p-5 sm:p-6" aria-labelledby="personal-info-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 id="personal-info-heading" className="text-lg font-bold">
            {t.dashboard.personalInfo}
          </h2>
          <button
            type="button"
            onClick={onEditProfile}
            className="cs-btn-secondary px-3.5 py-2 text-sm inline-flex items-center gap-2"
          >
            <Edit3 className="w-4 h-4" aria-hidden="true" />
            {t.dashboard.editProfile}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Full Name', value: profile.fullName },
            { label: t.dashboard.patientId, value: profile.id || '—' },
            { label: t.dashboard.age, value: profile.age ? `${profile.age} yrs` : 'Not set' },
            { label: t.dashboard.height, value: profile.height || 'Not set' },
            { label: t.dashboard.weight, value: profile.weight || 'Not set' },
            { label: t.dashboard.bloodGroup, value: profile.bloodGroup || 'Optional' },
          ].map((item) => (
            <div
              key={item.label}
              className="p-3.5 rounded-xl"
              style={{ backgroundColor: 'var(--color-light-blue)' }}
            >
              <div className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {item.label}
              </div>
              <div className="mt-1 text-sm sm:text-base font-bold truncate">{item.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* C. Health Overview Cards (4 cards) */}
      <section aria-label="Health Overview" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          className="cs-card p-5 flex items-start justify-between gap-3"
          style={{ backgroundColor: 'var(--color-light-blue)' }}
        >
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              {t.dashboard.activeMeds}
            </div>
            <div className="mt-2 text-3xl font-bold" style={{ color: 'var(--color-primary)' }}>
              {activeMedCount}
            </div>
            <div className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Active reminder schedules
            </div>
          </div>
          <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-primary)' }}>
            <Pill className="w-6 h-6" aria-hidden="true" />
          </div>
        </div>

        <div
          className="cs-card p-5 flex items-start justify-between gap-3"
          style={{ backgroundColor: 'var(--color-light-blue)' }}
        >
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              {t.dashboard.upcomingReminders}
            </div>
            <div className="mt-2 text-3xl font-bold" style={{ color: 'var(--color-upcoming)' }}>
              {todayStats.upcoming}
            </div>
            <div className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Doses remaining today
            </div>
          </div>
          <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-upcoming)' }}>
            <Clock className="w-6 h-6" aria-hidden="true" />
          </div>
        </div>

        <div
          className="cs-card p-5 flex items-start justify-between gap-3"
          style={{ backgroundColor: 'var(--color-light-blue)' }}
        >
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              {t.dashboard.savedPrescriptions}
            </div>
            <div className="mt-2 text-3xl font-bold" style={{ color: 'var(--color-purple)' }}>
              {backendDashboard ? backendDashboard.savedPrescriptions : prescriptions.length}
            </div>
            <div className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {backendDashboard
                ? backendDashboard.verifiedPrescriptions
                : prescriptions.filter((p) => p.reviewStatus === 'verified').length}{' '}
              verified
            </div>
          </div>
          <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-purple)' }}>
            <FileText className="w-6 h-6" aria-hidden="true" />
          </div>
        </div>

        <div
          className="cs-card p-5 flex items-start justify-between gap-3"
          style={{ backgroundColor: 'var(--color-light-blue)' }}
        >
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              {t.dashboard.adherence}
            </div>
            <div className="mt-2 text-3xl font-bold" style={{ color: 'var(--color-success)' }}>
              {adherence.percentage === null ? '—' : `${adherence.percentage}%`}
            </div>
            <div className="mt-1 text-xs leading-snug" style={{ color: 'var(--color-text-muted)' }}>
              {adherence.totalEvaluated > 0
                ? `${adherence.takenCount} of ${adherence.totalEvaluated} due doses logged`
                : 'No past doses logged yet'}
            </div>
            <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {t.dashboard.adherenceNote}
            </div>
          </div>
          <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-success)' }}>
            <Activity className="w-6 h-6" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* D & E: Next Medication + Today's Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* D. Next Medication */}
        <section
          className="lg:col-span-7 cs-card p-5 sm:p-6 flex flex-col justify-between border-2"
          style={{ borderColor: nextMedication ? 'var(--color-primary)' : 'var(--color-border)' }}
          aria-labelledby="next-med-heading"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <span
                className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide"
                style={{ backgroundColor: 'var(--color-upcoming-bg)', color: 'var(--color-upcoming)' }}
              >
                {t.dashboard.nextMedication}
              </span>
              {nextMedication && (
                <span className="text-sm font-bold" style={{ color: 'var(--color-accent)' }}>
                  {formatTime12h(nextMedication.scheduledTime)}
                </span>
              )}
            </div>

            {nextMedication ? (
              <div className="mt-4">
                <h2 id="next-med-heading" className="text-2xl font-bold">
                  {nextMedication.medicineName}{' '}
                  <span className="text-lg font-semibold" style={{ color: 'var(--color-primary)' }}>
                    {nextMedication.strength}
                  </span>
                </h2>

                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium"
                    style={{ backgroundColor: 'var(--color-light-blue)' }}
                  >
                    <Pill className="w-4 h-4" style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
                    {nextMedication.dosage}
                  </span>
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium"
                    style={{ backgroundColor: 'var(--color-light-blue)' }}
                  >
                    <Utensils className="w-4 h-4" style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
                    {getFoodInstructionLabel(nextMedication.foodInstruction, foodLabels)}
                  </span>
                </div>

                {nextMedication.notes && (
                  <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    Note: {nextMedication.notes}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-5 py-6 text-center rounded-xl" style={{ backgroundColor: 'var(--color-light-blue)' }}>
                <CheckCircle2 className="w-9 h-9 mx-auto mb-2" style={{ color: 'var(--color-success)' }} />
                <h2 id="next-med-heading" className="text-lg font-bold">
                  {t.dashboard.nextMedication}
                </h2>
                <p className="mt-1 text-sm px-4" style={{ color: 'var(--color-text-muted)' }}>
                  {t.dashboard.noNextMedication}
                </p>
              </div>
            )}
          </div>

          {nextMedication && (
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  handleMarkTaken(
                    nextMedication.reminderId,
                    nextMedication.scheduledTime,
                    nextMedication.medicineName
                  )
                }
                className="cs-btn-accent px-5 py-3 text-sm sm:text-base flex-1 sm:flex-none inline-flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                {t.common.takeNow}
              </button>
              <button
                type="button"
                onClick={() =>
                  handleMarkTaken(
                    nextMedication.reminderId,
                    nextMedication.scheduledTime,
                    nextMedication.medicineName
                  )
                }
                className="cs-btn-primary px-5 py-3 text-sm sm:text-base flex-1 sm:flex-none inline-flex items-center justify-center gap-2"
              >
                {t.common.markTaken}
              </button>
            </div>
          )}
        </section>

        {/* E. Today's Overview */}
        <section className="lg:col-span-5 cs-card p-5 sm:p-6 flex flex-col justify-between" aria-labelledby="todays-overview-heading">
          <h2 id="todays-overview-heading" className="text-lg font-bold">
            {t.dashboard.todaysOverview}
          </h2>

          <div className="my-4 flex items-center gap-5">
            <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 104 104" aria-hidden="true">
                <circle
                  cx="52"
                  cy="52"
                  r={radius}
                  fill="none"
                  stroke="var(--color-light-blue)"
                  strokeWidth="10"
                />
                <circle
                  cx="52"
                  cy="52"
                  r={radius}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                  style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold">{progressPct}%</span>
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {todayStats.taken}/{todayStats.total}
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--color-text-muted)' }}>{t.dashboard.totalScheduled}</span>
                <span className="font-bold">{todayStats.total}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--color-success)' }}>{t.common.taken}</span>
                <span className="font-bold" style={{ color: 'var(--color-success)' }}>
                  {todayStats.taken}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--color-upcoming)' }}>{t.common.upcoming}</span>
                <span className="font-bold" style={{ color: 'var(--color-upcoming)' }}>
                  {todayStats.upcoming}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--color-danger)' }}>{t.common.missed}</span>
                <span className="font-bold" style={{ color: 'var(--color-danger)' }}>
                  {todayStats.missed}
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-light-blue)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%`, backgroundColor: 'var(--color-accent)' }}
              />
            </div>
          </div>
        </section>
      </div>

      {/* F. Today's Medications */}
      <section className="cs-card p-5 sm:p-6" aria-labelledby="todays-meds-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 id="todays-meds-heading" className="text-lg font-bold">
              {t.dashboard.todaysMedications}
            </h2>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t.dashboard.scheduledForToday}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('reminders')}
            className="cs-btn-secondary px-4 py-2 text-sm inline-flex items-center gap-1.5"
          >
            {t.common.viewAll}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {todaySchedule.length === 0 ? (
          <div className="p-6 text-center rounded-xl" style={{ backgroundColor: 'var(--color-light-blue)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
              No medications scheduled for today yet.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('reminders')}
              className="cs-btn-primary mt-3 px-4 py-2 text-sm"
            >
              {t.reminders.addReminder}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {todaySchedule.map((dose) => (
              <div
                key={dose.id}
                className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className="px-3 py-2 rounded-xl text-center shrink-0 min-w-[82px]"
                    style={{ backgroundColor: 'var(--color-light-blue)' }}
                  >
                    <div className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                      {formatTime12h(dose.scheduledTime)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-base truncate">
                      {dose.medicineName}{' '}
                      <span className="font-medium text-sm" style={{ color: 'var(--color-text-muted)' }}>
                        {dose.strength}
                      </span>
                    </div>
                    <div className="mt-1 text-xs sm:text-sm flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--color-text-muted)' }}>
                      <span>{dose.dosage}</span>
                      <span>·</span>
                      <span>{getFoodInstructionLabel(dose.foodInstruction, foodLabels)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <StatusBadge status={dose.status} takenTimeLabel={formatIsoTime(dose.takenAt)} />
                  {dose.status === 'upcoming' && (
                    <button
                      type="button"
                      onClick={() => handleMarkTaken(dose.reminderId, dose.scheduledTime, dose.medicineName)}
                      className="cs-btn-accent px-3.5 py-2 text-xs font-semibold"
                    >
                      {t.common.markTaken}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
