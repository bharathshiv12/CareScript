export type TabId = 'dashboard' | 'scan' | 'ai-buddy' | 'reminders' | 'settings';

export type ThemeMode = 'light' | 'dark' | 'system';
export type TextSize = 'small' | 'medium' | 'large';
export type Language = 'en' | 'kn';

export type FoodInstruction =
  | 'before_food'
  | 'after_food'
  | 'with_food'
  | 'no_instruction';

export type DoseStatus = 'taken' | 'upcoming' | 'missed';

export interface PatientProfile {
  id: string;
  firebaseUid?: string;
  fullName: string;
  age: string;
  dateOfBirth?: string;
  height: string;
  weight: string;
  bloodGroup: string;
  email: string;
  avatarUrl?: string;
}

export interface AuthSession {
  isAuthenticated: boolean;
  isDemoAccount: boolean;
  loggedInAt: string;
  firebaseUid?: string;
}

export interface ExtractedMedicine {
  id: string;
  name: string;
  strength: string;
  dosage: string;
  frequency: string;
  timing: string;
  duration: string;
  foodInstruction: FoodInstruction | 'unclear';
  unclearFields: string[];
  notes?: string;
}

export type ProcessingState =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'extraction_completed'
  | 'review_required'
  | 'failed';

export interface Prescription {
  id: string;
  title: string;
  doctorName?: string;
  uploadDate: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath?: string;
  signedUrl?: string;
  hasFilePreview: boolean;
  processingState: ProcessingState;
  reviewStatus: 'pending_review' | 'verified';
  isDemoSample: boolean;
  medicines: ExtractedMedicine[];
}

export interface MedicationReminder {
  id: string;
  medicineName: string;
  strength: string;
  dosage: string;
  frequency: string;
  scheduledTimes: string[]; // HH:mm sorted
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  durationDays?: number;
  foodInstruction: FoodInstruction;
  notes?: string;
  sourcePrescriptionId?: string;
  verified: boolean;
  active: boolean;
}

export interface DoseLog {
  id: string; // `${reminderId}_${date}_${scheduledTime}`
  reminderId: string;
  date: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  status: DoseStatus;
  takenAt?: string; // ISO string
}

export interface DashboardSummary {
  activeMedications: number;
  savedPrescriptions: number;
  verifiedPrescriptions: number;
  adherencePercentage: number | null;
  adherenceTaken: number;
  adherenceTotal: number;
  todayStats: {
    total: number;
    taken: number;
    upcoming: number;
    missed: number;
  };
}

export interface ScheduledDoseInstance {
  id: string; // `${reminder.id}_${date}_${scheduledTime}`
  reminderId: string;
  medicineName: string;
  strength: string;
  dosage: string;
  scheduledTime: string;
  date: string;
  foodInstruction: FoodInstruction;
  notes?: string;
  status: DoseStatus;
  takenAt?: string;
  isDemo?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isDemo?: boolean;
  isError?: boolean;
  retryPrompt?: string;
}

export interface NotificationPrefs {
  enabled: boolean;
  reminderAlerts: boolean;
  leadMinutes: number;
}

export interface AppSettings {
  theme: ThemeMode;
  textSize: TextSize;
  language: Language;
  notifications: NotificationPrefs;
}
