import React, { useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Plus,
  Trash2,
  Utensils,
} from 'lucide-react';
import { useCareScript } from '../../context/CareScriptContext';
import type { MedicationReminder, ScheduledDoseInstance } from '../../types/carescript';
import {
  buildScheduleForDate,
  formatIsoTime,
  formatReadableDate,
  formatTime12h,
  getFoodInstructionLabel,
  getMonthGridDates,
  getTodayKey,
  getWeekDates,
  toDateKey,
} from '../../utils/dateUtils';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { StatusBadge } from '../ui/StatusBadge';
import { ReminderFormModal } from './ReminderFormModal';

type ViewMode = 'today' | 'week' | 'month';

export const Reminders: React.FC = () => {
  const {
    reminders,
    doseLogs,
    markDoseTaken,
    deleteReminder,
    todayStats,
    notificationPermission,
    requestBrowserNotifications,
    settings,
    session,
    showToast,
    t,
  } = useCareScript();

  const todayKey = getTodayKey();
  const [viewMode, setViewMode] = useState<ViewMode>('today');
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<MedicationReminder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MedicationReminder | null>(null);
  const [futureConfirmDose, setFutureConfirmDose] = useState<ScheduledDoseInstance | null>(null);

  const foodLabels = {
    beforeFood: t.common.beforeFood,
    afterFood: t.common.afterFood,
    withFood: t.common.withFood,
    noInstruction: t.common.noInstruction,
    needsVerification: t.common.needsVerification,
  };

  const activeDateKey = viewMode === 'today' ? todayKey : selectedDateKey;
  const activeSchedule = useMemo(
    () => buildScheduleForDate(activeDateKey, reminders, doseLogs, session.isDemoAccount),
    [activeDateKey, reminders, doseLogs, session.isDemoAccount]
  );

  const upcomingList = activeSchedule.filter((d) => d.status === 'upcoming');
  const takenList = activeSchedule.filter((d) => d.status === 'taken');
  const missedList = activeSchedule.filter((d) => d.status === 'missed');
  const nextDose = viewMode === 'today' ? upcomingList[0] ?? null : null;

  const progressPct =
    todayStats.total > 0 ? Math.round((todayStats.taken / todayStats.total) * 100) : 0;

  const weekDates = useMemo(() => getWeekDates(new Date()), []);
  const monthGrid = useMemo(
    () => getMonthGridDates(calendarMonth.year, calendarMonth.month),
    [calendarMonth]
  );

  const handleDoseAction = async (dose: ScheduledDoseInstance) => {
    if (dose.status !== 'upcoming') return;
    if (dose.date > todayKey) {
      // Do not allow a future scheduled date dose to be marked taken without explicit confirmation
      setFutureConfirmDose(dose);
      return;
    }
    const ok = await markDoseTaken(dose.reminderId, dose.date, dose.scheduledTime);
    if (ok) {
      showToast(`Marked ${dose.medicineName} as taken.`, 'success');
    }
  };

  const renderDoseCard = (dose: ScheduledDoseInstance, highlight = false) => (
    <div
      key={dose.id}
      className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      style={{
        borderColor: highlight ? 'var(--color-accent)' : 'var(--color-border)',
        borderWidth: highlight ? '2px' : '1px',
        backgroundColor: 'var(--color-surface)',
      }}
    >
      <div className="flex items-start gap-3.5 min-w-0">
        <div
          className="px-3 py-2 rounded-xl text-center shrink-0 min-w-[84px]"
          style={{ backgroundColor: 'var(--color-light-blue)' }}
        >
          <div className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
            {formatTime12h(dose.scheduledTime)}
          </div>
        </div>
        <div className="min-w-0">
          <div className="font-bold text-base">
            {dose.medicineName}{' '}
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
              {dose.strength}
            </span>
          </div>
          <div className="mt-1 text-xs sm:text-sm flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: 'var(--color-text-muted)' }}>
            <span>{dose.dosage}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Utensils className="w-3.5 h-3.5" aria-hidden="true" />
              {getFoodInstructionLabel(dose.foodInstruction, foodLabels)}
            </span>
          </div>
          {dose.notes && (
            <div className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {dose.notes}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
        <StatusBadge status={dose.status} takenTimeLabel={formatIsoTime(dose.takenAt)} />
        {dose.status === 'upcoming' && (
          <button
            type="button"
            onClick={() => handleDoseAction(dose)}
            className="cs-btn-accent px-4 py-2 text-xs sm:text-sm font-semibold"
          >
            {t.common.markTaken}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header + Summary */}
      <section className="cs-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t.reminders.title}</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Today: {todayStats.taken} of {todayStats.total} scheduled dose(s) taken · {todayStats.upcoming} upcoming · {todayStats.missed} missed
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingReminder(null);
              setFormOpen(true);
            }}
            className="cs-btn-primary px-4 py-2.5 text-sm inline-flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {t.reminders.addReminder}
          </button>
        </div>

        {/* Daily Progress Bar */}
        <div>
          <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
            <span>Today&apos;s Progress</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-3 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-light-blue)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%`, backgroundColor: 'var(--color-accent)' }}
            />
          </div>
        </div>

        {/* View Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div
            className="inline-flex rounded-xl p-1"
            style={{ backgroundColor: 'var(--color-light-blue)' }}
            role="tablist"
            aria-label="Schedule view selector"
          >
            {(['today', 'week', 'month'] as ViewMode[]).map((mode) => {
              const label =
                mode === 'today'
                  ? t.reminders.today
                  : mode === 'week'
                  ? t.reminders.thisWeek
                  : t.reminders.thisMonth;
              const selected = viewMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    setViewMode(mode);
                    if (mode === 'today') setSelectedDateKey(todayKey);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: selected ? 'var(--color-surface)' : 'transparent',
                    color: selected ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Browser Notification Bar */}
          <div className="flex items-center gap-2">
            {notificationPermission === 'granted' && settings.notifications.enabled ? (
              <span
                className="px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' }}
              >
                <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                Browser alerts active (when open)
              </span>
            ) : notificationPermission === 'denied' ? (
              <span
                className="px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
              >
                <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
                Notifications blocked in browser settings
              </span>
            ) : notificationPermission === 'unsupported' ? (
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Browser notifications unsupported here
              </span>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const res = await requestBrowserNotifications();
                  if (res === 'granted') {
                    showToast('Browser notifications enabled while app is open.', 'success');
                  } else if (res === 'denied') {
                    showToast('Permission denied. You can enable notifications in browser settings.', 'warning');
                  }
                }}
                className="cs-btn-secondary px-3.5 py-2 text-xs inline-flex items-center gap-1.5"
              >
                <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                {t.reminders.enableNotifications}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* THIS WEEK VIEW */}
      {viewMode === 'week' && (
        <section className="cs-card p-5 space-y-4" aria-label="Weekly overview">
          <div className="grid grid-cols-7 gap-2">
            {weekDates.map((d) => {
              const key = toDateKey(d);
              const daySchedule = buildScheduleForDate(key, reminders, doseLogs, session.isDemoAccount);
              const isSelected = selectedDateKey === key;
              const isToday = key === todayKey;
              const hasMissed = daySchedule.some((s) => s.status === 'missed');
              const hasUpcoming = daySchedule.some((s) => s.status === 'upcoming');
              const allTaken = daySchedule.length > 0 && daySchedule.every((s) => s.status === 'taken');

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDateKey(key)}
                  className="p-2.5 sm:p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1"
                  style={{
                    borderColor: isSelected ? 'var(--color-accent)' : 'var(--color-border)',
                    borderWidth: isSelected ? '2px' : '1px',
                    backgroundColor: isSelected ? 'var(--color-light-blue)' : 'var(--color-surface)',
                  }}
                >
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}
                  </span>
                  <span
                    className="text-sm sm:text-base font-bold"
                    style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-text)' }}
                  >
                    {d.getDate()}
                  </span>
                  <div className="flex items-center gap-1 min-h-[10px]">
                    {allTaken && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />}
                    {hasUpcoming && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-upcoming)' }} />}
                    {hasMissed && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-danger)' }} />}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* THIS MONTH VIEW */}
      {viewMode === 'month' && (
        <section className="cs-card p-5 space-y-4" aria-label="Monthly calendar">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
              {new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth((prev) =>
                    prev.month === 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: prev.month - 1 }
                  )
                }
                aria-label="Previous month"
                className="cs-btn-secondary p-2"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth((prev) =>
                    prev.month === 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: prev.month + 1 }
                  )
                }
                aria-label="Next month"
                className="cs-btn-secondary p-2"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((wd) => (
              <div key={wd} className="py-1">
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {monthGrid.map((d, idx) => {
              if (!d) return <div key={`blank-${idx}`} className="p-2" />;
              const key = toDateKey(d);
              const daySchedule = buildScheduleForDate(key, reminders, doseLogs, session.isDemoAccount);
              const isSelected = selectedDateKey === key;
              const isToday = key === todayKey;

              const takenCount = daySchedule.filter((s) => s.status === 'taken').length;
              const missedCount = daySchedule.filter((s) => s.status === 'missed').length;
              const upcomingCount = daySchedule.filter((s) => s.status === 'upcoming').length;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDateKey(key)}
                  className="p-2 rounded-xl border text-center min-h-[54px] flex flex-col items-center justify-between transition-colors"
                  style={{
                    borderColor: isSelected ? 'var(--color-accent)' : 'var(--color-border)',
                    borderWidth: isSelected ? '2px' : '1px',
                    backgroundColor: isSelected ? 'var(--color-light-blue)' : 'var(--color-surface)',
                  }}
                >
                  <span
                    className="text-xs sm:text-sm font-bold"
                    style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-text)' }}
                  >
                    {d.getDate()}
                  </span>
                  <div className="flex items-center gap-1">
                    {takenCount > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />}
                    {upcomingCount > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-upcoming)' }} />}
                    {missedCount > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-danger)' }} />}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Selected Day Schedule */}
      <section className="space-y-4" aria-label="Selected day schedule">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            Schedule for {activeDateKey === todayKey ? 'Today' : formatReadableDate(activeDateKey)}
          </h2>
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
            {activeSchedule.length} dose(s)
          </span>
        </div>

        {/* Highlight Next Scheduled Medication on Today view */}
        {nextDose && (
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>
              Next Scheduled Dose
            </div>
            {renderDoseCard(nextDose, true)}
          </div>
        )}

        {activeSchedule.length === 0 ? (
          <div className="cs-card p-6 text-center" style={{ backgroundColor: 'var(--color-light-blue)' }}>
            <Clock className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-primary)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
              No doses scheduled for this date.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {upcomingList.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-sm font-bold" style={{ color: 'var(--color-upcoming)' }}>
                  {t.reminders.upcomingSection} ({upcomingList.length})
                </h3>
                <div className="space-y-2.5">
                  {upcomingList.map((dose) => renderDoseCard(dose))}
                </div>
              </div>
            )}

            {missedList.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-sm font-bold" style={{ color: 'var(--color-danger)' }}>
                  {t.reminders.missedSection} ({missedList.length})
                </h3>
                <div className="space-y-2.5">
                  {missedList.map((dose) => renderDoseCard(dose))}
                </div>
              </div>
            )}

            {takenList.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-sm font-bold" style={{ color: 'var(--color-success)' }}>
                  {t.reminders.completedSection} ({takenList.length})
                </h3>
                <div className="space-y-2.5">
                  {takenList.map((dose) => renderDoseCard(dose))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Manage Reminder Schedules (Edit / Delete) */}
      <section className="cs-card p-5 sm:p-6" aria-labelledby="manage-reminders-heading">
        <h2 id="manage-reminders-heading" className="text-lg font-bold mb-4">
          Manage Medication Schedules ({reminders.length})
        </h2>

        {reminders.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            You haven&apos;t added any medication schedules yet. Click &ldquo;{t.reminders.addReminder}&rdquo; to create one.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {reminders.map((rem) => (
              <div
                key={rem.id}
                className="p-4 rounded-xl border flex items-start justify-between gap-3"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-light-blue)' }}
              >
                <div className="min-w-0">
                  <div className="font-bold text-base">
                    {rem.medicineName} ({rem.strength})
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    {rem.dosage} · {rem.frequency} · {rem.scheduledTimes.map(formatTime12h).join(', ')}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    From {rem.startDate}
                    {rem.endDate ? ` to ${rem.endDate}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingReminder(rem);
                      setFormOpen(true);
                    }}
                    aria-label={`Edit ${rem.medicineName}`}
                    className="p-2 rounded-lg"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(rem)}
                    aria-label={`Delete ${rem.medicineName}`}
                    className="p-2 rounded-lg"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ReminderFormModal
        open={formOpen}
        editingReminder={editingReminder}
        onClose={() => {
          setFormOpen(false);
          setEditingReminder(null);
        }}
      />

      {/* Delete Reminder Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete medication reminder?"
        description={`Are you sure you want to remove "${deleteTarget?.medicineName}" from your medication schedule?`}
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
        onConfirm={async () => {
          if (deleteTarget) {
            try {
              await deleteReminder(deleteTarget.id);
              showToast(`Deleted reminder for ${deleteTarget.medicineName}.`, 'info');
            } catch (err) {
              showToast(err instanceof Error ? err.message : 'Failed to delete reminder.', 'error');
            } finally {
              setDeleteTarget(null);
            }
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Future Scheduled Dose Confirmation */}
      <ConfirmDialog
        open={Boolean(futureConfirmDose)}
        title="Log future scheduled dose?"
        description={
          futureConfirmDose
            ? `${futureConfirmDose.medicineName} is scheduled for a future date (${formatReadableDate(
                futureConfirmDose.date
              )} at ${formatTime12h(
                futureConfirmDose.scheduledTime
              )}). Confirm only if you actually took this dose early.`
            : ''
        }
        confirmLabel="Confirm Mark Taken"
        cancelLabel={t.common.cancel}
        tone="primary"
        onConfirm={async () => {
          if (futureConfirmDose) {
            const ok = await markDoseTaken(
              futureConfirmDose.reminderId,
              futureConfirmDose.date,
              futureConfirmDose.scheduledTime,
              true
            );
            if (ok) {
              showToast(`Marked ${futureConfirmDose.medicineName} as taken.`, 'success');
            }
            setFutureConfirmDose(null);
          }
        }}
        onCancel={() => setFutureConfirmDose(null)}
      />

      {/* Subtle CheckCircle2 note about browser notifications */}
      <div className="text-xs px-1 flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
        <span>
          Note: Browser notifications work only while your browser permits them and cannot guarantee alarm delivery when a device sleeps or closes the browser.
        </span>
      </div>
    </div>
  );
};
