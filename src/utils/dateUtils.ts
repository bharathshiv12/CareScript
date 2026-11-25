import type {
  DoseLog,
  DoseStatus,
  FoodInstruction,
  MedicationReminder,
  ScheduledDoseInstance,
} from '../types/carescript';

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayKey(): string {
  return toDateKey(new Date());
}

export function getCurrentHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function getTimeOfDayGreetingKey(date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr ?? 0);
  if (Number.isNaN(h)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatIsoTime(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatReadableDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getFoodInstructionLabel(
  instruction: FoodInstruction | 'unclear',
  labels: {
    beforeFood: string;
    afterFood: string;
    withFood: string;
    noInstruction: string;
    needsVerification: string;
  }
): string {
  switch (instruction) {
    case 'before_food':
      return labels.beforeFood;
    case 'after_food':
      return labels.afterFood;
    case 'with_food':
      return labels.withFood;
    case 'no_instruction':
      return labels.noInstruction;
    case 'unclear':
      return labels.needsVerification;
  }
}

export function isReminderActiveOnDate(reminder: MedicationReminder, dateKey: string): boolean {
  if (!reminder.active) return false;
  if (dateKey < reminder.startDate) return false;
  if (reminder.endDate && dateKey > reminder.endDate) return false;
  return true;
}

/**
 * Resolves the status of a scheduled dose on a given date.
 * - If explicitly logged as 'taken', returns 'taken'.
 * - If explicitly logged as 'missed', returns 'missed' (a missed dose never automatically becomes taken).
 * - If the date is in the past (< todayKey), an unlogged dose is 'missed'.
 * - If the date is today and scheduledTime < currentHHMM, an unlogged dose is 'missed'.
 * - Otherwise it is 'upcoming'.
 */
export function resolveDoseStatus(
  dateKey: string,
  scheduledTime: string,
  log?: DoseLog,
  todayKey = getTodayKey(),
  currentHHMM = getCurrentHHMM()
): DoseStatus {
  if (log?.status === 'taken') return 'taken';
  if (log?.status === 'missed') return 'missed';
  if (log?.status === 'upcoming') return 'upcoming';
  if (dateKey < todayKey) return 'missed';
  if (dateKey === todayKey && scheduledTime < currentHHMM) return 'missed';
  return 'upcoming';
}

export function buildScheduleForDate(
  dateKey: string,
  reminders: MedicationReminder[],
  doseLogs: Record<string, DoseLog>,
  isDemoAccount = false
): ScheduledDoseInstance[] {
  const todayKey = getTodayKey();
  const currentHHMM = getCurrentHHMM();
  const instances: ScheduledDoseInstance[] = [];

  for (const reminder of reminders) {
    if (!isReminderActiveOnDate(reminder, dateKey)) continue;
    for (const time of reminder.scheduledTimes) {
      const id = `${reminder.id}_${dateKey}_${time}`;
      const log = doseLogs[id];
      const status = resolveDoseStatus(dateKey, time, log, todayKey, currentHHMM);
      instances.push({
        id,
        reminderId: reminder.id,
        medicineName: reminder.medicineName,
        strength: reminder.strength,
        dosage: reminder.dosage,
        scheduledTime: time,
        date: dateKey,
        foodInstruction: reminder.foodInstruction,
        notes: reminder.notes,
        status,
        takenAt: log?.takenAt,
        isDemo: isDemoAccount && Boolean(reminder.sourcePrescriptionId?.startsWith('demo-')),
      });
    }
  }

  return instances.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
}

export function getWeekDates(anchorDate: Date = new Date()): Date[] {
  const start = new Date(anchorDate);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function getMonthGridDates(year: number, monthIndex: number): (Date | null)[] {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const leadingBlanks = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Monday-first
  const grid: (Date | null)[] = Array(leadingBlanks).fill(null);

  for (let day = 1; day <= lastDay.getDate(); day++) {
    grid.push(new Date(year, monthIndex, day));
  }
  while (grid.length % 7 !== 0) {
    grid.push(null);
  }
  return grid;
}

/**
 * Calculates adherence percentage strictly from real scheduled/logged doses
 * up to the current date/time (excluding future upcoming doses).
 */
export function calculateAdherence(
  reminders: MedicationReminder[],
  doseLogs: Record<string, DoseLog>
): { percentage: number | null; takenCount: number; totalEvaluated: number } {
  const today = new Date();
  const todayKey = toDateKey(today);
  const currentHHMM = getCurrentHHMM();

  let takenCount = 0;
  let totalEvaluated = 0;

  // Evaluate from up to last 14 days through today
  for (let offset = 0; offset < 14; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    const dateKey = toDateKey(d);
    for (const r of reminders) {
      if (!isReminderActiveOnDate(r, dateKey)) continue;
      for (const time of r.scheduledTimes) {
        const id = `${r.id}_${dateKey}_${time}`;
        const log = doseLogs[id];
        if (log?.status === 'taken') {
          takenCount += 1;
          totalEvaluated += 1;
        } else if (log?.status === 'missed' || dateKey < todayKey || (dateKey === todayKey && time < currentHHMM)) {
          totalEvaluated += 1;
        }
      }
    }
  }

  if (totalEvaluated === 0) {
    return { percentage: null, takenCount: 0, totalEvaluated: 0 };
  }
  return {
    percentage: Math.round((takenCount / totalEvaluated) * 100),
    takenCount,
    totalEvaluated,
  };
}
