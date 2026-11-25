import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { TRANSLATIONS } from '../i18n/translations';
import {
  getSupabaseUserName,
  isSupabaseConfigured,
  requireSupabase,
  signOutSupabase,
} from '../lib/supabase';
import {
  bootstrapBackendUser,
  confirmPrescriptionInBackend,
  createMedicationInBackend,
  deactivateMedicationInBackend,
  deletePrescriptionInBackend,
  fetchDashboardSummaryFromBackend,
  formatFriendlyBackendError,
  markDoseTakenInBackend,
  reExtractPrescriptionInBackend,
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
  id: '',
  fullName: '',
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
  backendConversationId: string | null;
  backendDashboard: DashboardSummary | null;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  profile: PatientProfile;
  updateProfile: (next: PatientProfile) => Promise<PatientProfile>;
  prescriptions: Prescription[];
  uploadAndExtractPrescription: (file: File) => Promise<{
    prescription: Prescription;
    extractionError?: string;
  }>;
  retryPrescriptionExtraction: (rxId: string) => Promise<Prescription | null>;
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
  const [session, setSession] = useState<AuthSession>(() => {
    const stored = loadJson<AuthSession>(KEYS.SESSION, {
      isAuthenticated: false,
      isDemoAccount: false,
      loggedInAt: '',
    });
    // Auth sessions are restored only from the Supabase Auth client, never from app storage.
    if (!stored.isDemoAccount) {
      return {
        isAuthenticated: false,
        isDemoAccount: false,
        loggedInAt: '',
      };
    }
    return stored;
  });

  const [authReady, setAuthReady] = useState<boolean>(!isSupabaseConfigured);
  const [backendStatus, setBackendStatus] = useState<'idle' | 'syncing' | 'ready' | 'error'>('idle');
  const [backendError, setBackendError] = useState<string | null>(null);
  const authEpochRef = useRef(0);
  const [backendConversationId, setBackendConversationId] = useState<string | null>(null);

  const [activeTab, setActiveTabState] = useState<TabId>(() =>
    loadJson<TabId>(KEYS.ACTIVE_TAB, 'dashboard')
  );

  const [profile, setProfile] = useState<PatientProfile>(() =>
    !isSupabaseConfigured || loadJson<AuthSession>(KEYS.SESSION, { isAuthenticated: false, isDemoAccount: false, loggedInAt: '' }).isDemoAccount
      ? loadJson<PatientProfile>(KEYS.PROFILE, EMPTY_PROFILE)
      : EMPTY_PROFILE
  );

  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() =>
    !isSupabaseConfigured || loadJson<AuthSession>(KEYS.SESSION, { isAuthenticated: false, isDemoAccount: false, loggedInAt: '' }).isDemoAccount
      ? loadJson<Prescription[]>(KEYS.PRESCRIPTIONS, [])
      : []
  );

  const [reminders, setReminders] = useState<MedicationReminder[]>(() =>
    !isSupabaseConfigured || loadJson<AuthSession>(KEYS.SESSION, { isAuthenticated: false, isDemoAccount: false, loggedInAt: '' }).isDemoAccount
      ? loadJson<MedicationReminder[]>(KEYS.REMINDERS, [])
      : []
  );

  const [doseLogs, setDoseLogs] = useState<Record<string, DoseLog>>(() =>
    !isSupabaseConfigured || loadJson<AuthSession>(KEYS.SESSION, { isAuthenticated: false, isDemoAccount: false, loggedInAt: '' }).isDemoAccount
      ? loadJson<Record<string, DoseLog>>(KEYS.DOSE_LOGS, {})
      : {}
  );

  // Maps UI dose key (`${reminderId}_${date}_${time}`) -> Postgres `scheduled_doses.id`
  const [doseIdMap, setDoseIdMap] = useState<Record<string, string>>({});
  const [backendDashboard, setBackendDashboard] = useState<DashboardSummary | null>(null);

  const [settings, setSettings] = useState<AppSettings>(() =>
    !isSupabaseConfigured || loadJson<AuthSession>(KEYS.SESSION, { isAuthenticated: false, isDemoAccount: false, loggedInAt: '' }).isDemoAccount
      ? loadJson<AppSettings>(KEYS.SETTINGS, DEFAULT_SETTINGS)
      : DEFAULT_SETTINGS
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
    async (user: import('@supabase/supabase-js').User) => {
      const authEpoch = ++authEpochRef.current;
      if (!isSupabaseConfigured) {
        setBackendStatus('idle');
        setBackendError(null);
        setBackendDashboard(null);
        return;
      }

      setBackendStatus('syncing');
      setBackendError(null);
      try {
        const fullName = getSupabaseUserName(user);
        const data = await bootstrapBackendUser({
          userId: user.id,
          fullName,
          email: user.email || '',
          avatarUrl: typeof user.user_metadata?.avatar_url === 'string'
            ? user.user_metadata.avatar_url
            : undefined,
        });
        if (authEpoch !== authEpochRef.current) return;
        setProfile(data.profile);
        setSettings(data.settings);
        setPrescriptions(data.prescriptions);
        setReminders(data.reminders);
        setDoseLogs(data.doseLogs);
        setDoseIdMap(data.doseIdMap);
        setBackendDashboard(data.dashboardSummary);
        setBackendConversationId(data.conversationId);
        if (data.chatMessages.length > 0) {
          setChatMessages([
            {
              id: `welcome-${user.id}`,
              sender: 'assistant',
              text: TRANSLATIONS[data.settings.language].aiBuddy.welcomeMessage,
              timestamp: new Date().toISOString(),
              isDemo: false,
            },
            ...data.chatMessages,
          ]);
        }
        setBackendStatus('ready');
      } catch (err) {
        if (authEpoch !== authEpochRef.current) return;
        setBackendStatus('error');
        setBackendDashboard(null);
        setBackendError(formatFriendlyBackendError(err));
      }
    },
    []
  );

  // Supabase Auth owns session persistence and refresh; sync database data after auth events.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      return;
    }

    const { data: { subscription } } = requireSupabase().auth.onAuthStateChange((_event, authSession) => {
      const user = authSession?.user ?? null;
      if (user) {
        setSession({
          isAuthenticated: true,
          isDemoAccount: false,
          loggedInAt: new Date().toISOString(),
          userId: user.id,
        });
        window.setTimeout(() => void syncFromSupabase(user), 0);
      } else {
        authEpochRef.current += 1;
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
        setBackendDashboard(null);
      }
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, [syncFromSupabase]);

  const refreshBackendData = useCallback(async () => {
    if (session.isDemoAccount || !session.userId || !isSupabaseConfigured) return;
    const { data, error } = await requireSupabase().auth.getUser();
    if (error || !data.user) throw error || new Error('Your Supabase session has expired. Please sign in again.');
    await syncFromSupabase(data.user);
  }, [session.isDemoAccount, session.userId, syncFromSupabase]);

  const refreshDashboardSummary = useCallback(async () => {
    if (session.isDemoAccount || !session.userId || !isSupabaseConfigured) return;
    const summary = await fetchDashboardSummaryFromBackend().catch(() => null);
    if (summary) {
      setBackendDashboard(summary);
    }
  }, [session.isDemoAccount, session.userId]);

  // Reset AI chat and backend dashboard summary cleanly when account identity changes
  useEffect(() => {
    setChatMessages([
      {
        id: `welcome-${session.userId || (session.isDemoAccount ? 'demo' : 'anon')}`,
        sender: 'assistant',
        text: TRANSLATIONS[settings.language].aiBuddy.welcomeMessage,
        timestamp: new Date().toISOString(),
        isDemo: session.isDemoAccount || !isSupabaseConfigured,
      },
    ]);
    if (!session.userId) {
      setBackendDashboard(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.userId, session.isDemoAccount]);

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

  // Only demo/local data is persisted in browser storage. Cloud users' health data stays in Supabase.
  useEffect(() => {
    if (session.isDemoAccount) saveJson(KEYS.SESSION, session);
    else {
      try { localStorage.removeItem(KEYS.SESSION); } catch { /* Ignore storage restrictions */ }
    }
  }, [session]);
  useEffect(() => saveJson(KEYS.ACTIVE_TAB, activeTab), [activeTab]);
  useEffect(() => {
    if (session.isDemoAccount || !isSupabaseConfigured) {
      saveJson(KEYS.PROFILE, profile);
      saveJson(KEYS.PRESCRIPTIONS, prescriptions);
      saveJson(KEYS.REMINDERS, reminders);
      saveJson(KEYS.DOSE_LOGS, doseLogs);
      saveJson(KEYS.SETTINGS, settings);
    } else {
      for (const key of [KEYS.PROFILE, KEYS.PRESCRIPTIONS, KEYS.REMINDERS, KEYS.DOSE_LOGS, KEYS.SETTINGS]) {
        try { localStorage.removeItem(key); } catch { /* Ignore storage restrictions */ }
      }
    }
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

  const isLiveBackend = !session.isDemoAccount && Boolean(session.userId) && isSupabaseConfigured;

  const updateProfile = useCallback(
    async (next: PatientProfile): Promise<PatientProfile> => {
      if (isLiveBackend) {
        try {
          const persisted = await saveProfileToBackend(next, session.userId);
          setProfile(persisted);
          showToast('Profile saved.', 'success');
          return persisted;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to save profile.';
          showToast(message, 'error');
          throw new Error(message);
        }
      }
      setProfile(next);
      showToast('Profile saved.', 'success');
      return next;
    },
    [isLiveBackend, session.userId, showToast]
  );

  const retryPrescriptionExtraction = useCallback(
    async (rxId: string): Promise<Prescription | null> => {
      if (!isLiveBackend) return null;
      const target = prescriptions.find((p) => p.id === rxId);
      if (!target || target.isDemoSample || !target.storagePath) return null;

      const ext = await reExtractPrescriptionInBackend(rxId);
      const updated: Prescription = {
        ...target,
        doctorName: ext.doctorName || target.doctorName,
        processingState: 'review_required',
        reviewStatus: 'pending_review',
        medicines: ext.medicines.length > 0 ? ext.medicines : target.medicines,
      };
      setPrescriptions((prev) => prev.map((item) => (item.id === rxId ? updated : item)));
      if (ext.extractionError) {
        showToast(ext.extractionError, 'warning');
      } else {
        showToast('Prescription extraction completed. Please review before confirming.', 'success');
      }
      return updated;
    },
    [isLiveBackend, prescriptions, showToast]
  );

  const uploadAndExtractPrescription = useCallback(
    async (file: File): Promise<{ prescription: Prescription; extractionError?: string }> => {
      if (isLiveBackend && session.userId) {
        const res = await uploadPrescriptionToBackend(session.userId, file);
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
    [isLiveBackend, session.userId]
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
        if (isLiveBackend && session.userId) {
          saveSettingsToBackend(session.userId, next).catch((err) => {
            showToast(err instanceof Error ? err.message : 'Failed to sync settings.', 'error');
          });
        }
        return next;
      });
    },
    [isLiveBackend, session.userId, showToast]
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

  const logout = useCallback(async () => {
    if (isSupabaseConfigured && !session.isDemoAccount) await signOutSupabase();
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
    setBackendConversationId(null);
    setBackendStatus('idle');
    setBackendError(null);
    setActiveTabState('dashboard');
  }, [session.isDemoAccount]);

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
    backendConversationId,
    backendDashboard,
    activeTab,
    setActiveTab,
    profile,
    updateProfile,
    prescriptions,
    uploadAndExtractPrescription,
    retryPrescriptionExtraction,
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
