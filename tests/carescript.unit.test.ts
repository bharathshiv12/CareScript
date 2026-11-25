import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARESCRIPT_CONTRACT } from '../backend/shared/careScriptContract.mjs';
import {
  buildScheduleForDate,
  calculateAdherence,
  formatTime12h,
  getMonthGridDates,
  getTodayKey,
  getWeekDates,
  resolveDoseStatus,
  toDateKey,
} from '../frontend/src/utils/dateUtils';
import {
  computeAgeFromDob,
  formatFriendlyBackendError,
  resolvePrescriptionMimeType,
  validatePrescriptionFileContent,
} from '../frontend/src/services/careScriptApi';
import { sendAiBuddyMessage } from '../frontend/src/services/aiService';
import { TRANSLATIONS } from '../frontend/src/i18n/translations';
import type { DoseLog, MedicationReminder, Prescription } from '../frontend/src/types/carescript';

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectKeys(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

test('resolveDoseStatus honors explicit logs including backend grace-period upcoming', () => {
  const takenLog: DoseLog = {
    id: 'r1_2025-01-01_08:00',
    reminderId: 'r1',
    date: '2025-01-01',
    scheduledTime: '08:00',
    status: 'taken',
    takenAt: '2025-01-01T08:05:00Z',
  };
  assert.equal(resolveDoseStatus('2025-01-01', '08:00', takenLog, '2026-11-25', '18:00'), 'taken');

  const missedLog: DoseLog = {
    id: 'r1_2026-11-25_08:00',
    reminderId: 'r1',
    date: '2026-11-25',
    scheduledTime: '08:00',
    status: 'missed',
  };
  assert.equal(resolveDoseStatus('2026-11-25', '08:00', missedLog, '2026-11-25', '07:00'), 'missed');

  const graceUpcomingLog: DoseLog = {
    id: 'r1_2026-11-25_17:45',
    reminderId: 'r1',
    date: '2026-11-25',
    scheduledTime: '17:45',
    status: 'upcoming',
  };
  // Even though 17:45 < 18:00, backend grace period marks it upcoming and frontend must preserve it
  assert.equal(
    resolveDoseStatus('2026-11-25', '17:45', graceUpcomingLog, '2026-11-25', '18:00'),
    'upcoming'
  );

  // Fallback client evaluation without log
  assert.equal(resolveDoseStatus('2026-11-24', '20:00', undefined, '2026-11-25', '09:00'), 'missed');
  assert.equal(resolveDoseStatus('2026-11-25', '08:00', undefined, '2026-11-25', '09:00'), 'missed');
  assert.equal(resolveDoseStatus('2026-11-25', '21:00', undefined, '2026-11-25', '09:00'), 'upcoming');
  assert.equal(resolveDoseStatus('2026-11-26', '08:00', undefined, '2026-11-25', '09:00'), 'upcoming');
});

test('buildScheduleForDate filters inactive/out-of-range reminders and sorts chronologically', () => {
  const reminders: MedicationReminder[] = [
    {
      id: 'rem-active',
      medicineName: 'Metformin',
      strength: '500 mg',
      dosage: '1 tablet',
      frequencyLabel: 'Twice daily',
      scheduledTimes: ['21:00', '08:00'],
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      foodInstruction: 'after_food',
      sourcePrescriptionId: 'demo-rx-1',
      verified: true,
      active: true,
    },
    {
      id: 'rem-inactive',
      medicineName: 'InactiveMed',
      strength: '10 mg',
      dosage: '1 tablet',
      frequencyLabel: 'Once daily',
      scheduledTimes: ['09:00'],
      startDate: '2026-11-01',
      foodInstruction: 'no_instruction',
      verified: true,
      active: false,
    },
    {
      id: 'rem-expired',
      medicineName: 'ExpiredMed',
      strength: '250 mg',
      dosage: '1 capsule',
      frequencyLabel: 'Once daily',
      scheduledTimes: ['10:00'],
      startDate: '2026-10-01',
      endDate: '2026-10-10',
      foodInstruction: 'before_food',
      verified: true,
      active: true,
    },
  ];

  const schedule = buildScheduleForDate('2026-11-20', reminders, {}, true);
  assert.equal(schedule.length, 2);
  assert.equal(schedule[0].scheduledTime, '08:00');
  assert.equal(schedule[1].scheduledTime, '21:00');
  assert.equal(schedule[0].isDemo, true);
});

test('calculateAdherence excludes future doses and handles empty logs cleanly', () => {
  const emptyResult = calculateAdherence([], {});
  assert.deepEqual(emptyResult, { percentage: null, takenCount: 0, totalEvaluated: 0 });

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(today.getDate() - 2);
  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + 2);

  const rem: MedicationReminder = {
    id: 'rem-adh',
    medicineName: 'Vitamin D3',
    strength: '1000 IU',
    dosage: '1 softgel',
    frequencyLabel: 'Once daily',
    scheduledTimes: ['00:01'],
    startDate: toDateKey(twoDaysAgo),
    foodInstruction: 'after_food',
    verified: true,
    active: true,
  };

  const doseLogs: Record<string, DoseLog> = {
    [`rem-adh_${toDateKey(twoDaysAgo)}_00:01`]: {
      id: `rem-adh_${toDateKey(twoDaysAgo)}_00:01`,
      reminderId: 'rem-adh',
      date: toDateKey(twoDaysAgo),
      scheduledTime: '00:01',
      status: 'taken',
      takenAt: twoDaysAgo.toISOString(),
    },
    [`rem-adh_${toDateKey(yesterday)}_00:01`]: {
      id: `rem-adh_${toDateKey(yesterday)}_00:01`,
      reminderId: 'rem-adh',
      date: toDateKey(yesterday),
      scheduledTime: '00:01',
      status: 'taken',
      takenAt: yesterday.toISOString(),
    },
    [`rem-adh_${getTodayKey()}_00:01`]: {
      id: `rem-adh_${getTodayKey()}_00:01`,
      reminderId: 'rem-adh',
      date: getTodayKey(),
      scheduledTime: '00:01',
      status: 'missed',
    },
  };

  // Future reminder should NOT count in totalEvaluated
  const futureRem: MedicationReminder = {
    ...rem,
    id: 'rem-future',
    startDate: toDateKey(futureDate),
  };

  const adh = calculateAdherence([rem, futureRem], doseLogs);
  assert.equal(adh.takenCount, 2);
  assert.equal(adh.totalEvaluated, 3);
  assert.equal(adh.percentage, 67);
});

test('calendar date utilities and 12h formatting behave correctly', () => {
  const week = getWeekDates(new Date(2026, 10, 25)); // Wednesday Nov 25, 2026
  assert.equal(week.length, 7);
  assert.equal(week[0].getDay(), 1); // Monday
  assert.equal(toDateKey(week[0]), '2026-11-23');
  assert.equal(toDateKey(week[6]), '2026-11-29');

  const grid = getMonthGridDates(2026, 10); // Nov 2026 (starts Sunday -> 6 leading nulls, 30 days = 36 -> padded to 42)
  assert.equal(grid.length % 7, 0);
  const nonNullDays = grid.filter((d): d is Date => d !== null);
  assert.equal(nonNullDays.length, 30);
  assert.equal(nonNullDays[0].getDate(), 1);
  assert.equal(nonNullDays[29].getDate(), 30);

  assert.equal(formatTime12h('00:05'), '12:05 AM');
  assert.equal(formatTime12h('08:30'), '8:30 AM');
  assert.equal(formatTime12h('12:00'), '12:00 PM');
  assert.equal(formatTime12h('21:15'), '9:15 PM');
});

test('computeAgeFromDob calculates age accurately and handles invalid inputs', () => {
  assert.equal(computeAgeFromDob(null), '');
  assert.equal(computeAgeFromDob('not-a-date'), '');

  const now = new Date();
  const y = now.getFullYear();
  const futureDob = `${y + 1}-01-01`;
  assert.equal(computeAgeFromDob(futureDob), '');

  const pastBirthYear = y - 40;
  const pastMonth = now.getMonth() + 1;
  const pastDay = Math.max(1, now.getDate() - 1);
  if (now.getDate() > 1) {
    const dob = `${pastBirthYear}-${String(pastMonth).padStart(2, '0')}-${String(pastDay).padStart(2, '0')}`;
    assert.equal(computeAgeFromDob(dob), '40');
  }
});

test('formatFriendlyBackendError maps cryptic PostgREST and Edge Function errors', () => {
  const jwtErr = formatFriendlyBackendError(new Error('No suitable key or wrong key type (PGRST301)'));
  assert.match(jwtErr, /Supabase session/i);
  assert.doesNotMatch(jwtErr, /PGRST301/);

  const rlsErr = formatFriendlyBackendError(new Error('permission denied for table profiles (42501)'));
  assert.match(rlsErr, /row security/i);

  const geminiErr = formatFriendlyBackendError(new Error('GEMINI API key is not configured (503)'));
  assert.match(geminiErr, /Gemini AI service/i);
});

test('validatePrescriptionFileContent checks extensions, size bounds, and magic headers', async () => {
  const validPng = new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    'rx.png',
    { type: 'image/png' }
  );
  assert.equal(await validatePrescriptionFileContent(validPng), null);

  const validJpg = new File(
    [new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])],
    'rx.jpg',
    { type: 'image/jpeg' }
  );
  assert.equal(await validatePrescriptionFileContent(validJpg), null);

  const validPdf = new File(
    [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])],
    'rx.pdf',
    { type: 'application/pdf' }
  );
  assert.equal(await validatePrescriptionFileContent(validPdf), null);

  const spoofedPng = new File(['hello world'], 'fake.png', { type: 'image/png' });
  const spoofMsg = await validatePrescriptionFileContent(spoofedPng);
  assert.ok(spoofMsg && spoofMsg.toLowerCase().includes('signature'));

  const emptyFile = new File([], 'empty.png', { type: 'image/png' });
  const emptyMsg = await validatePrescriptionFileContent(emptyFile);
  assert.ok(emptyMsg && emptyMsg.toLowerCase().includes('empty'));

  const unsupported = new File(['abc'], 'notes.txt', { type: 'text/plain' });
  const unsupportedMsg = await validatePrescriptionFileContent(unsupported);
  assert.ok(unsupportedMsg && unsupportedMsg.toLowerCase().includes('unsupported'));

  const oversizedMock = {
    name: 'big.pdf',
    type: 'application/pdf',
    size: 11 * 1024 * 1024,
    slice: () => new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]),
  } as unknown as File;
  const sizeMsg = await validatePrescriptionFileContent(oversizedMock);
  assert.ok(sizeMsg && sizeMsg.includes('10 MB'));
});

test('Demo AI Buddy enforces medical safety boundaries and only summarizes verified prescriptions', async () => {
  const unverifiedRx: Prescription = {
    id: 'rx-unverified',
    title: 'Draft Unverified Rx',
    doctorName: 'Dr. Test',
    uploadDate: new Date().toISOString(),
    fileName: 'draft.png',
    fileType: 'image/png',
    fileSize: 1024,
    processingState: 'review_required',
    reviewStatus: 'pending_review',
    medicines: [
      {
        id: 'm1',
        name: 'SecretDraftMed',
        strength: '500 mg',
        dosage: '1 tab',
        frequency: 'BD',
        scheduledTimes: ['08:00', '20:00'],
        foodInstruction: 'after_food',
        verified: false,
      },
    ],
  };

  const diagRes = await sendAiBuddyMessage('Can you diagnose what disease I have and double my dose?', {
    patientName: 'Asha',
    prescriptions: [unverifiedRx],
    reminders: [],
    isDemoAccount: true,
  });
  assert.equal(diagRes.isDemo, true);
  assert.match(diagRes.text, /cannot diagnose|prescribe|adjusting/i);

  const rxBlockedRes = await sendAiBuddyMessage('Please explain my prescription', {
    patientName: 'Asha',
    prescriptions: [unverifiedRx],
    reminders: [],
    isDemoAccount: true,
  });
  assert.doesNotMatch(rxBlockedRes.text, /SecretDraftMed/);
  assert.match(rxBlockedRes.text, /do not have any verified prescriptions/i);

  const verifiedRx: Prescription = {
    ...unverifiedRx,
    id: 'rx-verified',
    title: 'Clinic Visit Rx',
    reviewStatus: 'verified',
    processingState: 'extraction_completed',
    medicines: [{ ...unverifiedRx.medicines[0], name: 'Metformin', verified: true }],
  };
  const rxAllowedRes = await sendAiBuddyMessage('Explain my prescription please', {
    patientName: 'Asha',
    prescriptions: [verifiedRx],
    reminders: [],
    isDemoAccount: true,
  });
  assert.match(rxAllowedRes.text, /Metformin/);
});

test('EN and KN translations preserve full key parity and non-empty strings', () => {
  const enKeys = collectKeys(TRANSLATIONS.en as unknown as Record<string, unknown>);
  const knKeys = collectKeys(TRANSLATIONS.kn as unknown as Record<string, unknown>);
  assert.deepEqual(enKeys, knKeys);
  assert.ok(enKeys.length > 40);

  for (const key of enKeys) {
    const enVal = getByPath(TRANSLATIONS.en as unknown as Record<string, unknown>, key);
    const knVal = getByPath(TRANSLATIONS.kn as unknown as Record<string, unknown>, key);
    assert.equal(typeof enVal, 'string', `Expected EN string at ${key}`);
    assert.equal(typeof knVal, 'string', `Expected KN string at ${key}`);
    assert.ok((enVal as string).trim().length > 0, `Empty EN translation at ${key}`);
    assert.ok((knVal as string).trim().length > 0, `Empty KN translation at ${key}`);
  }
});

test('resolvePrescriptionMimeType normalizes image/jpg and empty MIME types from extensions', () => {
  assert.equal(resolvePrescriptionMimeType(new File(['a'], 'scan.JPG', { type: '' })), 'image/jpeg');
  assert.equal(
    resolvePrescriptionMimeType(new File(['a'], 'scan.jpg', { type: 'image/jpg' })),
    'image/jpeg'
  );
  assert.equal(resolvePrescriptionMimeType(new File(['a'], 'scan.png', { type: '' })), 'image/png');
  assert.equal(
    resolvePrescriptionMimeType(new File(['a'], 'scan.pdf', { type: '' })),
    'application/pdf'
  );
});

test('formatFriendlyBackendError translates rate limit, timeout, model, and API key failures cleanly', () => {
  assert.match(formatFriendlyBackendError(new Error('429 rate limit exceeded')), /rate limit/i);
  assert.match(formatFriendlyBackendError(new Error('Request timed out (504)')), /timed out/i);
  assert.match(formatFriendlyBackendError(new Error('422 GEMINI_MODEL invalid')), /model/i);
  assert.match(
    formatFriendlyBackendError(new Error('502 Gemini API key error')),
    /Gemini AI service/i
  );
});

test('Backend shared contract matches Edge Function safety limits and model defaults', () => {
  assert.equal(CARESCRIPT_CONTRACT.authProvider, 'supabase');
  assert.equal(CARESCRIPT_CONTRACT.ai.defaultGeminiModel, 'gemini-3.8-flash');
  assert.equal(CARESCRIPT_CONTRACT.prescriptionUpload.maxBytes, 10 * 1024 * 1024);

  const geminiHelper = readFileSync('supabase/functions/_shared/gemini.ts', 'utf8');
  assert.match(geminiHelper, /store:\s*false/);
  assert.match(geminiHelper, /429/);
  assert.match(geminiHelper, /504/);
});
