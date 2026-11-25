import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createDemoSeedData, DEMO_PRESCRIPTION_SVG_DATA_URL } from '../data/demoData';
import { TRANSLATIONS } from '../i18n/translations';
import {
  ensureSupabaseRoleClaim,
  firebaseAuth,
  isFirebaseConfigured,
  signOutFirebase,
  subscribeToFirebaseAuth,
} from '../lib/firebase';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  bootstrapBackendUser,
  confirmPrescriptionInBackend,
  createMedicationInBackend,
  deactivateMedicationInBackend,
  deletePrescriptionInBackend,
  fetchDashboardSummaryFromBackend,
  formatFriendlyBackendError,
  markDoseTakenInBackend,
  saveProfileToBackend,
  saveSettingsToBackend,
  updateMedicationInBackend,
  uploadPrescriptionToBackend,
} from '../services/careScriptApi';
import {
  deletePrescriptionFile,
  loadJson,
  saveJson,
  savePrescriptionFile,
} from '../services/storageService';
import type {
  AppSettings,
  AuthSession,
  ChatMessage,
  DashboardSummary,
  DoseLog,
  MedicationReminder,
  PatientProfile,
  Prescription,
  TabId,
} from '../types/carescript';
import {
  buildScheduleForDate,
  calculateAdherence,
  formatTime12h,
  getTodayKey,
} from '../utils/dateUtils';

const KEYS = {
  SESSION: 'cs_session_v1',
  PROFILE: 'cs_profile_v1',
  PRESCRIPTIONS: 'cs_prescriptions_v1',
  REMINDERS: 'cs_reminders_v1',
  DOSE_LOGS: 'cs_dose_logs_v1',
  SETTINGS: 'cs_settings_v1',
  ACTIVE_TAB: 'cs_active_tab_v1',
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  textSize: 'medium',
  language: 'en',
  notifications: {
    enabled: false,
    reminderAlerts: true,
    leadMinutes: 10,
  },
};

const EMPTY_PROFILE: PatientProfile = {
  id: 'CS-1001',
  fullName: 'Patient',
  age: '',
  height: '',
  weight: '',
  bloodGroup: '',
  email: '',
};

export interface ToastNotice {
  id: string;
  message: string;
  tone: 'success' | 'info' | 'warning' | 'error';
}

interface CareScriptContextValue {
  session: AuthSession;
  authReady: boolean;
  backendStatus: 'idle' | 'syncing' | 'ready' | 'error';
  backendError: string | null;
  backendDashboard: DashboardSummary | null;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  profile: PatientProfile;
  updateProfile: (next: PatientProfile) => Promise<void>;
  prescriptions: Prescription[];
  uploadAndExtractPrescription: (file: File) => Promise<{
    prescription: Prescription;
    extractionError?: string;
  }>;
  addOrUpdatePrescription: (rx: Prescription, fileDataUrl?: string) => Promise<void>;
  confirmPrescription: (rx: Prescription, fileDataUrl?: string) => Promise<void>;
  removePrescription: (id: string) => Promise<void>;
  reminders: MedicationReminder[];
  addReminder: (rem: Omit<MedicationReminder, 'id'>) => Promise<MedicationReminder>;
  updateReminder: (rem: MedicationReminder) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  doseLogs: Record<string, DoseLog>;
  markDoseTaken: (
    reminderId: string,
    dateKey: string,
    scheduledTime: string,
    allowEarlyFuture?: boolean
  ) => Promise<boolean>;
  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;
  settings: AppSettings;
  updateSettings: (updater: (prev: AppSettings) => AppSettings) => void;
  resolvedTheme: 'light' | 'dark';
  notificationPermission: NotificationPermission | 'unsupported';
  requestBrowserNotifications: () => Promise<NotificationPermission | 'unsupported'>;
  loginAsDemo: () => Promise<void>;
  loginWithForm: (email: string, name?: string) => void;
  registerAccount: (name: string, email: string) => void;
  logout: () => Promise<void>;
  refreshBackendData: () => Promise<void>;
  t: (typeof TRANSLATIONS)['en'];
  toast: ToastNotice | null;
  showToast: (message: string, tone?: ToastNotice['tone']) => void;
  dismissToast: () => void;
  todayStats: {
    total: number;
    taken: number;
    upcoming: number;
    missed: number;
  };
  adherence: {
    percentage: number | null;
    takenCount: number;
    totalEvaluated: number;
  };
}

const CareScriptContext = createContext<CareScriptContextValue | null>(null);

export const CareScriptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession>(() =>
    loadJson<AuthSession>(KEYS.SESSION, {
      isAuthenticated: false,
      isDemoAccount: false,
      loggedInAt: '',
    })
  );

  const [authReady, setAuthReady] = useState<boolean>(!isFirebaseConfigured);
  const [backendStatus, setBackendStatus] = useState<'idle' | 'syncing' | 'ready' | 'error'>('idle');
  const [backendError, setBackendError] = useState<string | null>(null);

  const [activeTab, setActiveTabState] = useState<TabId>(() =>
    loadJson<TabId>(KEYS.ACTIVE_TAB, 'dashboard')
  );

  const [profile, setProfile] = useState<PatientProfile>(() =>
    loadJson<PatientProfile>(KEYS.PROFILE, EMPTY_PROFILE)
  );

  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() =>
    loadJson<Prescription[]>(KEYS.PRESCRIPTIONS, [])
  );

  const [reminders, setReminders] = useState<MedicationReminder[]>(() =>
    loadJson<MedicationReminder[]>(KEYS.REMINDERS, [])
  );

  const [doseLogs, setDoseLogs] = useState<Record<string, DoseLog>>(() =>
    loadJson<Record<string, DoseLog>>(KEYS.DOSE_LOGS, {})
  );

  // Maps UI dose key (`${reminderId}_${date}_${time}`) -> Postgres `scheduled_doses.id`
  const [doseIdMap, setDoseIdMap] = useState<Record<string, string>>({});
  const [backendDashboard, setBackendDashboard] = useState<DashboardSummary | null>(null);

  const [settings, setSettings] = useState<AppSettings>(() =>
    loadJson<AppSettings>(KEYS.SETTINGS, DEFAULT_SETTINGS)
  );

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome-msg',
      sender: 'assistant',
      text: TRANSLATIONS[loadJson<AppSettings>(KEYS.SETTINGS, DEFAULT_SETTINGS).language].aiBuddy.welcomeMessage,
      timestamp: new Date().toISOString(),
      isDemo: !isSupabaseConfigured,
    },
  ]);

  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );

  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  const [toast, setToast] = useState<ToastNotice | null>(null);

  const showToast = useCallback((message: string, tone: ToastNotice['tone'] = 'info') => {
    const id = String(Date.now());
    setToast({ id, message, tone });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const syncFromSupabase = useCallback(
    async (fbUser: { uid: string; displayName: string | null; email: string | null; photoURL: string | null }) => {
      if (!isSupabaseConfigured) {
        setBackendStatus('idle');
        setBackendError(null);
        setBackendDashboard(null);
        setProfile((prev) => ({
          ...prev,
          firebaseUid: fbUser.uid,
          email: fbUser.email || prev.email,
          fullName: fbUser.displayName || prev.fullName || fbUser.email?.split('@')[0] || 'Patient',
          avatarUrl: fbUser.photoURL || prev.avatarUrl,
        }));
        return;
      }

      setBackendStatus('syncing');
      setBackendError(null);
      try {
        if (firebaseAuth?.currentUser && firebaseAuth.currentUser.uid === fbUser.uid) {
          await ensureSupabaseRoleClaim(firebaseAuth.currentUser);
        }
        const data = await bootstrapBackendUser({
          firebaseUid: fbUser.uid,
          fullName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Patient',
          email: fbUser.email || '',
          avatarUrl: fbUser.photoURL || undefined,
        });
        setProfile(data.profile);
        setSettings(data.settings);
        setPrescriptions(data.prescriptions);
        setReminders(data.reminders);
        setDoseLogs(data.doseLogs);
        setDoseIdMap(data.doseIdMap);
        setBackendDashboard(data.dashboardSummary);
        setBackendStatus('ready');
      } catch (err) {
        setBackendStatus('error');
        setBackendDashboard(null);
        setBackendError(formatFriendlyBackendError(err));
      }
    },
    []
  );

  // Firebase Auth Session Listener & Token Refresh Observer
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthReady(true);
      return;
    }

    const unsubscribe = subscribeToFirebaseAuth((fbUser) => {
      if (fbUser) {
        setSession({
          isAuthenticated: true,
          isDemoAccount: false,
          loggedInAt: new Date().toISOString(),
          firebaseUid: fbUser.uid,
        });
        syncFromSupabase(fbUser);
      } else {
        setSession((prev) => {
          if (prev.isDemoAccount && prev.isAuthenticated) {
            return prev; // Preserve explicit Sample Demo Patient session
          }
          return {
            isAuthenticated: false,
            isDemoAccount: false,
            loggedInAt: '',
          };
        });
        setBackendStatus('idle');
        setBackendError(null);
      }
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, [syncFromSupabase]);

  const refreshBackendData = useCallback(async () => {
    if (session.isDemoAccount || !session.firebaseUid || !isSupabaseConfigured) return;
    await syncFromSupabase({
      uid: session.firebaseUid,
      displayName: profile.fullName,
      email: profile.email,
      photoURL: profile.avatarUrl ?? null,
    });
  }, [session.isDemoAccount, session.firebaseUid, profile.fullName, profile.email, profile.avatarUrl, syncFromSupabase]);

  const refreshDashboardSummary = useCallback(async () => {
    if (session.isDemoAccount || !session.firebaseUid || !isSupabaseConfigured) return;
    const summary = await fetchDashboardSummaryFromBackend().catch(() => null);
    if (summary) {
      setBackendDashboard(summary);
    }
  }, [session.isDemoAccount, session.firebaseUid]);

  // Reset AI chat and backend dashboard summary cleanly when account identity changes
  useEffect(() => {
    setChatMessages([
      {
        id: `welcome-${session.firebaseUid || (session.isDemoAccount ? 'demo' : 'anon')}`,
        sender: 'assistant',
        text: TRANSLATIONS[settings.language].aiBuddy.welcomeMessage,
        timestamp: new Date().toISOString(),
        isDemo: session.isDemoAccount || !isSupabaseConfigured,
      },
    ]);
    if (!session.firebaseUid) {
      setBackendDashboard(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.firebaseUid, session.isDemoAccount]);

  // Listen to system dark mode changes
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;

  // Apply theme & text size to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-text-size', settings.textSize);
    document.documentElement.lang = settings.language;
  }, [resolvedTheme, settings.textSize, settings.language]);

  // Keep the initial welcome message localized when language changes
  useEffect(() => {
    setChatMessages((prev) =>
      prev.map((msg) =>
        msg.id.startsWith('welcome-')
          ? {
              ...msg,
              text: TRANSLATIONS[settings.language].aiBuddy.welcomeMessage,
              isDemo: session.isDemoAccount || !isSupabaseConfigured,
            }
          : msg
      )
    );
  }, [settings.language, session.isDemoAccount]);

  // Persist local cache (for Demo Mode and fast UX)
  useEffect(() => saveJson(KEYS.SESSION, session), [session]);
  useEffect(() => saveJson(KEYS.ACTIVE_TAB, activeTab), [activeTab]);
  useEffect(() => {
    if (session.isDemoAccount || !isSupabaseConfigured) {
      saveJson(KEYS.PROFILE, profile);
      saveJson(KEYS.PRESCRIPTIONS, prescriptions);
      saveJson(KEYS.REMINDERS, reminders);
      saveJson(KEYS.DOSE_LOGS, doseLogs);
    }
    saveJson(KEYS.SETTINGS, settings);
  }, [session.isDemoAccount, profile, prescriptions, reminders, doseLogs, settings]);

  // Foreground browser notifications for due reminders when enabled
  useEffect(() => {
    if (!session.isAuthenticated) return;
    if (!settings.notifications.enabled || !settings.notifications.reminderAlerts) return;
    if (notificationPermission !== 'granted') return;

    const checkDue = () => {
      const todayKey = getTodayKey();
      const now = new Date();
      const schedule = buildScheduleForDate(todayKey, reminders, doseLogs, session.isDemoAccount);
      for (const dose of schedule) {
        if (dose.status !== 'upcoming') continue;
        const [hh, mm] = dose.scheduledTime.split(':').map(Number);
        const scheduledDate = new Date();
        scheduledDate.setHours(hh, mm, 0, 0);
        const diffMinutes = (scheduledDate.getTime() - now.getTime()) / 60000;
        const notifiedKey = `cs_notified_${dose.id}`;
        if (
          diffMinutes <= settings.notifications.leadMinutes &&
          diffMinutes >= -5 &&
          !sessionStorage.getItem(notifiedKey)
        ) {
          sessionStorage.setItem(notifiedKey, '1');
          try {
            new Notification(`CareScript Reminder: ${dose.medicineName}`, {
              body: `${dose.strength} — ${dose.dosage} at ${formatTime12h(dose.scheduledTime)}`,
            });
          } catch {
            // Ignore browser Notification runtime issues
          }
        }
      }
    };

    checkDue();
    const interval = setInterval(checkDue, 30000);
    return () => clearInterval(interval);
  }, [session, settings.notifications, notificationPermission, reminders, doseLogs]);

  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabState(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const isLiveBackend = !session.isDemoAccount && Boolean(session.firebaseUid) && isSupabaseConfigured;

  const updateProfile = useCallback(
    async (next: PatientProfile) => {
      if (isLiveBackend) {
        try {
          await saveProfileToBackend(next);
          setProfile(next);
          showToast('Profile saved.', 'success');
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Failed to save profile.', 'error');
        }
        return;
      }
      setProfile(next);
      showToast('Profile saved.', 'success');
    },
    [isLiveBackend, showToast]
  );

  const uploadAndExtractPrescription = useCallback(
    async (file: File): Promise<{ prescription: Prescription; extractionError?: string }> => {
      if (isLiveBackend && session.firebaseUid) {
        const res = await uploadPrescriptionToBackend(session.firebaseUid, file);
        setPrescriptions((prev) => [res.prescription, ...prev]);
        return res;
      }

      // Local fallback for Demo Mode / unconfigured Supabase
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });

      const localRx: Prescription = {
        id: `rx-${Date.now()}`,
        title: file.name.replace(/\.[^.]+$/, '') || 'Uploaded Prescription',
        doctorName: '',
        uploadDate: new Date().toISOString(),
        fileName: file.name,
        fileType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png'),
        fileSize: file.size,
        hasFilePreview: true,
        processingState: 'review_required',
        reviewStatus: 'pending_review',
        isDemoSample: false,
        medicines: [],
      };
      await savePrescriptionFile(localRx.id, dataUrl);
      return { prescription: localRx };
    },
    [isLiveBackend, session.firebaseUid]
  );

  const addOrUpdatePrescription = useCallback(async (rx: Prescription, fileDataUrl?: string) => {
    if (fileDataUrl) {
      await savePrescriptionFile(rx.id, fileDataUrl);
    }
    setPrescriptions((prev) => {
      const idx = prev.findIndex((item) => item.id === rx.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = rx;
        return copy;
      }
      return [rx, ...prev];
    });
  }, []);

  const confirmPrescription = useCallback(
    async (rx: Prescription, fileDataUrl?: string) => {
      if (isLiveBackend && !rx.isDemoSample && rx.storagePath) {
        await confirmPrescriptionInBackend(rx);
        await refreshDashboardSummary();
      } else if (fileDataUrl) {
        await savePrescriptionFile(rx.id, fileDataUrl);
      }

      setPrescriptions((prev) => {
        const idx = prev.findIndex((item) => item.id === rx.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = rx;
          return copy;
        }
        return [rx, ...prev];
      });
    },
    [isLiveBackend, refreshDashboardSummary]
  );

  const removePrescription = useCallback(
    async (id: string) => {
      const target = prescriptions.find((p) => p.id === id);
      if (isLiveBackend && target && !target.isDemoSample && target.storagePath) {
        try {
          await deletePrescriptionInBackend(target);
          void refreshDashboardSummary();
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Failed to delete prescription.', 'error');
          return;
        }
      } else {
        await deletePrescriptionFile(id);
      }
      setPrescriptions((prev) => prev.filter((item) => item.id !== id));
      showToast('Prescription removed.', 'info');
    },
    [isLiveBackend, prescriptions, refreshDashboardSummary, showToast]
  );

  const addReminder = useCallback(
    async (rem: Omit<MedicationReminder, 'id'>): Promise<MedicationReminder> => {
      if (isLiveBackend) {
        const createdId = await createMedicationInBackend(rem);
        await refreshBackendData();
        return {
          ...rem,
          id: createdId,
          scheduledTimes: [...rem.scheduledTimes].sort(),
        };
      }

      const created: MedicationReminder = {
        ...rem,
        id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        scheduledTimes: [...rem.scheduledTimes].sort(),
      };
      setReminders((prev) => [created, ...prev]);
      return created;
    },
    [isLiveBackend, refreshBackendData]
  );

  const updateReminder = useCallback(
    async (rem: MedicationReminder) => {
      if (isLiveBackend) {
        await updateMedicationInBackend(rem);
        await refreshBackendData();
        return;
      }
      const normalized: MedicationReminder = {
        ...rem,
        scheduledTimes: [...rem.scheduledTimes].sort(),
      };
      setReminders((prev) => prev.map((item) => (item.id === rem.id ? normalized : item)));
    },
    [isLiveBackend, refreshBackendData]
  );

  const deleteReminder = useCallback(
    async (id: string) => {
      if (isLiveBackend) {
        await deactivateMedicationInBackend(id);
        await refreshBackendData();
        return;
      }
      setReminders((prev) => prev.filter((item) => item.id !== id));
    },
    [isLiveBackend, refreshBackendData]
  );

  const markDoseTaken = useCallback(
    async (
      reminderId: string,
      dateKey: string,
      scheduledTime: string,
      allowEarlyFuture = false
    ): Promise<boolean> => {
      const uiKey = `${reminderId}_${dateKey}_${scheduledTime}`;
      if (doseLogs[uiKey]?.status === 'taken') {
        return false; // Prevent duplicate dose recording
      }

      if (isLiveBackend) {
        const dbDoseId = doseIdMap[uiKey];
        if (!dbDoseId) {
          showToast('Scheduled dose record not found in backend. Refreshing...', 'warning');
          await refreshBackendData();
          return false;
        }
        try {
          const res = await markDoseTakenInBackend(dbDoseId, allowEarlyFuture);
          if (res.alreadyTaken) return false;
          const takenAt = res.takenAt || new Date().toISOString();
          setDoseLogs((prev) => ({
            ...prev,
            [uiKey]: {
              id: uiKey,
              reminderId,
              date: dateKey,
              scheduledTime,
              status: 'taken',
              takenAt,
            },
          }));
          await refreshDashboardSummary();
          return true;
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Failed to mark dose taken.', 'error');
          return false;
        }
      }

      const takenAt = new Date().toISOString();
      setDoseLogs((prev) => {
        if (prev[uiKey]?.status === 'taken') return prev;
        return {
          ...prev,
          [uiKey]: {
            id: uiKey,
            reminderId,
            date: dateKey,
            scheduledTime,
            status: 'taken',
            takenAt,
          },
        };
      });
      return true;
    },
    [doseLogs, isLiveBackend, doseIdMap, refreshBackendData, refreshDashboardSummary, showToast]
  );

  const addChatMessage = useCallback((msg: ChatMessage) => {
    setChatMessages((prev) => [...prev, msg]);
  }, []);

  const clearChat = useCallback(() => {
    setChatMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'assistant',
        text: TRANSLATIONS[settings.language].aiBuddy.welcomeMessage,
        timestamp: new Date().toISOString(),
        isDemo: session.isDemoAccount || !isSupabaseConfigured,
      },
    ]);
  }, [settings.language, session.isDemoAccount]);

  const updateSettings = useCallback(
    (updater: (prev: AppSettings) => AppSettings) => {
      setSettings((prev) => {
        const next = updater(prev);
        if (isLiveBackend && session.firebaseUid) {
          saveSettingsToBackend(session.firebaseUid, next).catch((err) => {
            showToast(err instanceof Error ? err.message : 'Failed to sync settings.', 'error');
          });
        }
        return next;
      });
    },
    [isLiveBackend, session.firebaseUid, showToast]
  );

  const requestBrowserNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return 'unsupported';
    }
    const res = await Notification.requestPermission();
    setNotificationPermission(res);
    if (res === 'granted') {
      updateSettings((prev) => ({
        ...prev,
        notifications: { ...prev.notifications, enabled: true },
      }));
    } else if (res === 'denied') {
      updateSettings((prev) => ({
        ...prev,
        notifications: { ...prev.notifications, enabled: false },
      }));
    }
    return res;
  }, [updateSettings]);

  const loginAsDemo = useCallback(async () => {
    const seed = createDemoSeedData();
    await savePrescriptionFile('demo-rx-1', DEMO_PRESCRIPTION_SVG_DATA_URL);
    setProfile(seed.profile);
    setPrescriptions(seed.prescriptions);
    setReminders(seed.reminders);
    setDoseLogs(seed.doseLogs);
    setDoseIdMap({});
    setBackendDashboard(null);
    setBackendStatus('idle');
    setBackendError(null);
    setSession({
      isAuthenticated: true,
      isDemoAccount: true,
      loggedInAt: new Date().toISOString(),
    });
    setActiveTabState('dashboard');
  }, []);

  const loginWithForm = useCallback(
    (email: string, name?: string) => {
      const existing = loadJson<PatientProfile>(KEYS.PROFILE, EMPTY_PROFILE);
      const displayName =
        name?.trim() ||
        (existing.email === email && existing.fullName !== 'Patient'
          ? existing.fullName
          : email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
      setProfile({
        ...existing,
        email,
        fullName: displayName,
        id: existing.id || `CS-${Math.floor(1000 + Math.random() * 9000)}`,
      });
      setSession({
        isAuthenticated: true,
        isDemoAccount: false,
        loggedInAt: new Date().toISOString(),
      });
      setActiveTabState('dashboard');
    },
    []
  );

  const registerAccount = useCallback((name: string, email: string) => {
    const newProfile: PatientProfile = {
      id: `CS-${Math.floor(1000 + Math.random() * 9000)}`,
      fullName: name.trim(),
      age: '',
      height: '',
      weight: '',
      bloodGroup: '',
      email: email.trim(),
    };
    setProfile(newProfile);
    setPrescriptions([]);
    setReminders([]);
    setDoseLogs({});
    setSession({
      isAuthenticated: true,
      isDemoAccount: false,
      loggedInAt: new Date().toISOString(),
    });
    setActiveTabState('dashboard');
  }, []);

  const logout = useCallback(async () => {
    await signOutFirebase();
    [KEYS.SESSION, KEYS.PROFILE, KEYS.PRESCRIPTIONS, KEYS.REMINDERS, KEYS.DOSE_LOGS].forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        // Ignore storage restrictions
      }
    });
    setSession({
      isAuthenticated: false,
      isDemoAccount: false,
      loggedInAt: '',
    });
    setProfile(EMPTY_PROFILE);
    setPrescriptions([]);
    setReminders([]);
    setDoseLogs({});
    setDoseIdMap({});
    setBackendDashboard(null);
    setBackendStatus('idle');
    setBackendError(null);
    setActiveTabState('dashboard');
  }, []);

  const todayStats = useMemo(() => {
    if (isLiveBackend && backendDashboard) {
      return backendDashboard.todayStats;
    }
    const schedule = buildScheduleForDate(getTodayKey(), reminders, doseLogs, session.isDemoAccount);
    return {
      total: schedule.length,
      taken: schedule.filter((d) => d.status === 'taken').length,
      upcoming: schedule.filter((d) => d.status === 'upcoming').length,
      missed: schedule.filter((d) => d.status === 'missed').length,
    };
  }, [isLiveBackend, backendDashboard, reminders, doseLogs, session.isDemoAccount]);

  const adherence = useMemo(() => {
    if (isLiveBackend && backendDashboard) {
      return {
        percentage: backendDashboard.adherencePercentage,
        takenCount: backendDashboard.adherenceTaken,
        totalEvaluated: backendDashboard.adherenceTotal,
      };
    }
    return calculateAdherence(reminders, doseLogs);
  }, [isLiveBackend, backendDashboard, reminders, doseLogs]);

  const t = TRANSLATIONS[settings.language];

  const value: CareScriptContextValue = {
    session,
    authReady,
    backendStatus,
    backendError,
    backendDashboard,
    activeTab,
    setActiveTab,
    profile,
    updateProfile,
    prescriptions,
    uploadAndExtractPrescription,
    addOrUpdatePrescription,
    confirmPrescription,
    removePrescription,
    reminders,
    addReminder,
    updateReminder,
    deleteReminder,
    doseLogs,
    markDoseTaken,
    chatMessages,
    addChatMessage,
    clearChat,
    settings,
    updateSettings,
    resolvedTheme,
    notificationPermission,
    requestBrowserNotifications,
    loginAsDemo,
    loginWithForm,
    registerAccount,
    logout,
    refreshBackendData,
    t,
    toast,
    showToast,
    dismissToast,
    todayStats,
    adherence,
  };

  return <CareScriptContext.Provider value={value}>{children}</CareScriptContext.Provider>;
};

export function useCareScript(): CareScriptContextValue {
  const ctx = useContext(CareScriptContext);
  if (!ctx) throw new Error('useCareScript must be used within CareScriptProvider');
  return ctx;
}
