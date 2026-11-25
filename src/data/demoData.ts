import type {
  DoseLog,
  MedicationReminder,
  PatientProfile,
  Prescription,
} from '../types/carescript';
import { toDateKey } from '../utils/dateUtils';

// Clean, high-contrast sample prescription SVG for demo preview (clearly watermarked SAMPLE DEMO)
export const DEMO_PRESCRIPTION_SVG_DATA_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="460" viewBox="0 0 640 460">
  <rect width="640" height="460" fill="#FFFFFF"/>
  <rect x="16" y="16" width="608" height="428" rx="14" fill="#FFFFFF" stroke="#003B46" stroke-width="2"/>
  <rect x="16" y="16" width="608" height="72" rx="14" fill="#E8F0FF"/>
  <text x="36" y="48" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#17183D">Community Care Clinic — Sample Rx</text>
  <text x="36" y="72" font-family="Arial, sans-serif" font-size="13" fill="#004B55">Dr. Kavitha Rao, MBBS  |  DEMO SAMPLE ONLY (Not a real prescription)</text>
  <text x="36" y="118" font-family="Arial, sans-serif" font-size="14" fill="#17183D">Patient: Lakshmi Narayanan   |   Date: Sample Date</text>
  <line x1="36" y1="134" x2="604" y2="134" stroke="#DCE2F5" stroke-width="1.5"/>
  <text x="36" y="170" font-family="Georgia, serif" font-size="22" font-weight="bold" fill="#009C95">Rx</text>
  <text x="36" y="205" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#17183D">1. Metformin (Tab) — 500 mg</text>
  <text x="56" y="228" font-family="Arial, sans-serif" font-size="14" fill="#17183D">1 tablet twice daily (08:00 AM &amp; 08:00 PM) — After Food — 30 days</text>
  <text x="36" y="272" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#17183D">2. Amlodipine (Tab) — 5 mg</text>
  <text x="56" y="295" font-family="Arial, sans-serif" font-size="14" fill="#17183D">1 tablet once daily (09:00 AM) — After Food — 30 days</text>
  <text x="36" y="340" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#B7791F">3. Vitamin D3 — [Smudged handwriting: 60,000 IU?]</text>
  <text x="56" y="364" font-family="Arial, sans-serif" font-size="14" fill="#B7791F">Frequency unclear — Please verify with pharmacist</text>
  <rect x="36" y="392" width="568" height="32" rx="8" fill="#FEF5E7"/>
  <text x="50" y="413" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#B7791F">SAMPLE DEMO PRESCRIPTION FOR TESTING REVIEW WORKFLOW</text>
</svg>`);

export const DEMO_PATIENT_PROFILE: PatientProfile = {
  id: 'CS-DEMO-1042',
  fullName: 'Lakshmi Narayanan',
  age: '64',
  height: '158 cm',
  weight: '62 kg',
  bloodGroup: 'O+',
  email: 'lakshmi.demo@carescript.local',
};

export function createDemoSeedData(): {
  profile: PatientProfile;
  prescriptions: Prescription[];
  reminders: MedicationReminder[];
  doseLogs: Record<string, DoseLog>;
} {
  const today = new Date();
  const todayKey = toDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = toDateKey(yesterday);
  const start = new Date(today);
  start.setDate(today.getDate() - 5);
  const startKey = toDateKey(start);

  const end = new Date(today);
  end.setDate(today.getDate() + 25);
  const endKey = toDateKey(end);

  const prescriptions: Prescription[] = [
    {
      id: 'demo-rx-1',
      title: 'Sample Morning & Evening Routine (Demo)',
      doctorName: 'Dr. Kavitha Rao (Demo)',
      uploadDate: new Date(today.getTime() - 86400000 * 3).toISOString(),
      fileName: 'sample_demo_prescription.svg',
      fileType: 'image/svg+xml',
      fileSize: 2480,
      hasFilePreview: true,
      processingState: 'extraction_completed',
      reviewStatus: 'verified',
      isDemoSample: true,
      medicines: [
        {
          id: 'demo-med-1',
          name: 'Metformin',
          strength: '500 mg',
          dosage: '1 tablet',
          frequency: 'Twice daily',
          timing: '08:00, 20:00',
          duration: '30 days',
          foodInstruction: 'after_food',
          unclearFields: [],
          notes: 'Sample demo medicine for demonstration only.',
        },
        {
          id: 'demo-med-2',
          name: 'Amlodipine',
          strength: '5 mg',
          dosage: '1 tablet',
          frequency: 'Once daily',
          timing: '09:00',
          duration: '30 days',
          foodInstruction: 'after_food',
          unclearFields: [],
          notes: 'Sample demo medicine for demonstration only.',
        },
      ],
    },
  ];

  const reminders: MedicationReminder[] = [
    {
      id: 'demo-rem-1',
      medicineName: 'Metformin',
      strength: '500 mg',
      dosage: '1 tablet',
      frequency: 'Twice daily',
      scheduledTimes: ['08:00', '20:30'],
      startDate: startKey,
      endDate: endKey,
      durationDays: 30,
      foodInstruction: 'after_food',
      notes: 'Take with a full glass of water (Sample demo reminder).',
      sourcePrescriptionId: 'demo-rx-1',
      verified: true,
      active: true,
    },
    {
      id: 'demo-rem-2',
      medicineName: 'Amlodipine',
      strength: '5 mg',
      dosage: '1 tablet',
      frequency: 'Once daily',
      scheduledTimes: ['09:00'],
      startDate: startKey,
      endDate: endKey,
      durationDays: 30,
      foodInstruction: 'after_food',
      notes: 'Sample demo reminder.',
      sourcePrescriptionId: 'demo-rx-1',
      verified: true,
      active: true,
    },
    {
      id: 'demo-rem-3',
      medicineName: 'Pantoprazole',
      strength: '40 mg',
      dosage: '1 capsule',
      frequency: 'Once daily',
      scheduledTimes: ['18:30'],
      startDate: startKey,
      endDate: endKey,
      durationDays: 14,
      foodInstruction: 'before_food',
      notes: 'Take 30 minutes before dinner (Sample demo reminder).',
      sourcePrescriptionId: 'demo-rx-1',
      verified: true,
      active: true,
    },
  ];

  const doseLogs: Record<string, DoseLog> = {
    [`demo-rem-1_${yesterdayKey}_08:00`]: {
      id: `demo-rem-1_${yesterdayKey}_08:00`,
      reminderId: 'demo-rem-1',
      date: yesterdayKey,
      scheduledTime: '08:00',
      status: 'taken',
      takenAt: new Date(yesterday.setHours(8, 10, 0, 0)).toISOString(),
    },
    [`demo-rem-2_${yesterdayKey}_09:00`]: {
      id: `demo-rem-2_${yesterdayKey}_09:00`,
      reminderId: 'demo-rem-2',
      date: yesterdayKey,
      scheduledTime: '09:00',
      status: 'taken',
      takenAt: new Date(yesterday.setHours(9, 5, 0, 0)).toISOString(),
    },
    [`demo-rem-1_${yesterdayKey}_20:30`]: {
      id: `demo-rem-1_${yesterdayKey}_20:30`,
      reminderId: 'demo-rem-1',
      date: yesterdayKey,
      scheduledTime: '20:30',
      status: 'taken',
      takenAt: new Date(yesterday.setHours(20, 35, 0, 0)).toISOString(),
    },
    [`demo-rem-1_${todayKey}_08:00`]: {
      id: `demo-rem-1_${todayKey}_08:00`,
      reminderId: 'demo-rem-1',
      date: todayKey,
      scheduledTime: '08:00',
      status: 'taken',
      takenAt: new Date(new Date().setHours(8, 12, 0, 0)).toISOString(),
    },
  };

  return {
    profile: DEMO_PATIENT_PROFILE,
    prescriptions,
    reminders,
    doseLogs,
  };
}
