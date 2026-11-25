import type { Language } from '../types/carescript';

export const SUPPORTED_LANGUAGES: { code: Language; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
];

type TranslationKeys = {
  appName: string;
  tagline: string;
  nav: {
    dashboard: string;
    scan: string;
    aiBuddy: string;
    reminders: string;
    settings: string;
  };
  greetings: {
    morning: string;
    afternoon: string;
    evening: string;
    welcomeBack: string;
  };
  common: {
    save: string;
    cancel: string;
    edit: string;
    delete: string;
    confirm: string;
    close: string;
    loading: string;
    demoBadge: string;
    verified: string;
    needsVerification: string;
    viewAll: string;
    beforeFood: string;
    afterFood: string;
    withFood: string;
    noInstruction: string;
    taken: string;
    upcoming: string;
    missed: string;
    markTaken: string;
    takeNow: string;
  };
  dashboard: {
    personalInfo: string;
    editProfile: string;
    patientId: string;
    age: string;
    height: string;
    weight: string;
    bloodGroup: string;
    activeMeds: string;
    upcomingReminders: string;
    savedPrescriptions: string;
    adherence: string;
    adherenceNote: string;
    nextMedication: string;
    noNextMedication: string;
    todaysOverview: string;
    totalScheduled: string;
    todaysMedications: string;
    scheduledForToday: string;
  };
  scan: {
    title: string;
    subtitle: string;
    chooseFile: string;
    takePhoto: string;
    tryDemo: string;
    supportedFormats: string;
    savedTitle: string;
    reviewConfirm: string;
    unclearWarning: string;
    createReminders: string;
  };
  aiBuddy: {
    title: string;
    assistantName: string;
    welcomeMessage: string;
    placeholder: string;
    send: string;
    disclaimer: string;
    suggestedTitle: string;
    q1: string;
    q2: string;
    q3: string;
    q4: string;
  };
  reminders: {
    title: string;
    today: string;
    thisWeek: string;
    thisMonth: string;
    addReminder: string;
    completedSection: string;
    upcomingSection: string;
    missedSection: string;
    enableNotifications: string;
  };
  settings: {
    title: string;
    appearance: string;
    lightTheme: string;
    darkTheme: string;
    systemTheme: string;
    textSize: string;
    small: string;
    medium: string;
    large: string;
    language: string;
    languageHint: string;
    notifications: string;
    securityPrivacy: string;
    about: string;
    logout: string;
    logoutConfirmTitle: string;
    logoutConfirmBody: string;
  };
};

export const TRANSLATIONS: Record<Language, TranslationKeys> = {
  en: {
    appName: 'CareScript',
    tagline: 'Your Personal Prescription and Medication Companion',
    nav: {
      dashboard: 'Dashboard',
      scan: 'Scan Prescription',
      aiBuddy: 'AI Buddy',
      reminders: 'Reminders',
      settings: 'Settings',
    },
    greetings: {
      morning: 'Good Morning',
      afternoon: 'Good Afternoon',
      evening: 'Good Evening',
      welcomeBack: 'Welcome back',
    },
    common: {
      save: 'Save Changes',
      cancel: 'Cancel',
      edit: 'Edit',
      delete: 'Delete',
      confirm: 'Confirm',
      close: 'Close',
      loading: 'Loading...',
      demoBadge: 'Sample Demo Data',
      verified: 'Verified',
      needsVerification: 'Unclear / Needs Verification',
      viewAll: 'View All',
      beforeFood: 'Before Food',
      afterFood: 'After Food',
      withFood: 'With Food',
      noInstruction: 'No special food instruction',
      taken: 'Taken',
      upcoming: 'Upcoming',
      missed: 'Missed',
      markTaken: 'Mark Taken',
      takeNow: 'Take Now',
    },
    dashboard: {
      personalInfo: 'Personal Information',
      editProfile: 'Edit Profile',
      patientId: 'Patient ID',
      age: 'Age',
      height: 'Height',
      weight: 'Weight',
      bloodGroup: 'Blood Group',
      activeMeds: 'Active Medications',
      upcomingReminders: 'Upcoming Today',
      savedPrescriptions: 'Saved Prescriptions',
      adherence: 'Dose Adherence',
      adherenceNote: 'Tracks recorded doses only, not clinical outcome.',
      nextMedication: 'Next Medication',
      noNextMedication: 'All scheduled doses for today are complete or none are pending.',
      todaysOverview: "Today's Overview",
      totalScheduled: 'Total Scheduled Today',
      todaysMedications: "Today's Medications",
      scheduledForToday: 'Your medication schedule for today',
    },
    scan: {
      title: 'Scan Prescription',
      subtitle: 'Upload a prescription image or PDF to review and organize your medicines safely.',
      chooseFile: 'Choose File',
      takePhoto: 'Take Photo',
      tryDemo: 'Load Sample Demo Prescription',
      supportedFormats: 'Supported formats: JPG, JPEG, PNG, PDF (max 10 MB)',
      savedTitle: 'Saved Prescriptions',
      reviewConfirm: 'Review and Confirm',
      unclearWarning: 'Some fields are marked Unclear / Needs Verification. Please check with your doctor or pharmacist before confirming.',
      createReminders: 'Create Reminders from Verified Medicines',
    },
    aiBuddy: {
      title: 'AI Buddy',
      assistantName: 'CareScript AI Buddy',
      welcomeMessage:
        "Hello! I'm your CareScript AI Buddy. I can help you understand your prescription, explain medical terms, and provide general health information. What would you like to know today?",
      placeholder: 'Ask about your verified prescription or a medical term...',
      send: 'Send',
      disclaimer:
        'Educational companion only. CareScript AI Buddy does not diagnose conditions, prescribe medicines, or replace your doctor or pharmacist.',
      suggestedTitle: 'Suggested Questions',
      q1: 'Explain my prescription',
      q2: 'When should I take my medicine?',
      q3: 'Explain this medical term',
      q4: 'Give me general health information',
    },
    reminders: {
      title: 'Reminders',
      today: 'Today',
      thisWeek: 'This Week',
      thisMonth: 'This Month',
      addReminder: 'Add Reminder',
      completedSection: 'Completed',
      upcomingSection: 'Upcoming',
      missedSection: 'Missed',
      enableNotifications: 'Enable Browser Notifications',
    },
    settings: {
      title: 'Settings',
      appearance: 'Appearance',
      lightTheme: 'Light Theme',
      darkTheme: 'Dark Theme',
      systemTheme: 'System Theme',
      textSize: 'Text Size',
      small: 'Small',
      medium: 'Medium',
      large: 'Large',
      language: 'Language',
      languageHint: 'CareScript currently supports English and Kannada.',
      notifications: 'Notifications',
      securityPrivacy: 'Security & Privacy',
      about: 'About CareScript',
      logout: 'Log Out',
      logoutConfirmTitle: 'Log out of CareScript?',
      logoutConfirmBody: 'You will return to the welcome screen. Your saved local data on this device will remain intact unless you clear it.',
    },
  },
  kn: {
    appName: 'ಕೇರ್‌ಸ್ಕ್ರಿಪ್ಟ್ (CareScript)',
    tagline: 'ನಿಮ್ಮ ವೈಯಕ್ತಿಕ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಮತ್ತು ಔಷಧಿ ಸಹಾಯಕ',
    nav: {
      dashboard: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
      scan: 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಸ್ಕ್ಯಾನ್',
      aiBuddy: 'AI ಬಡ್ಡಿ',
      reminders: 'ಜ್ಞಾಪನೆಗಳು',
      settings: 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
    },
    greetings: {
      morning: 'ಶುಭೋದಯ',
      afternoon: 'ಶುಭ ಮಧ್ಯಾಹ್ನ',
      evening: 'ಶುಭ ಸಂಜೆ',
      welcomeBack: 'ಮತ್ತೆ ಸ್ವಾಗತ',
    },
    common: {
      save: 'ಬದಲಾವಣೆಗಳನ್ನು ಉಳಿಸಿ',
      cancel: 'ರದ್ದುಮಾಡಿ',
      edit: 'ತಿದ್ದುಪಡಿ',
      delete: 'ಅಳಿಸಿ',
      confirm: 'ದೃಢೀಕರಿಸಿ',
      close: 'ಮುಚ್ಚಿ',
      loading: 'ಲೋಡ್ ಆಗುತ್ತಿದೆ...',
      demoBadge: 'ಮಾದರಿ ಡೆಮೊ ಡೇಟಾ',
      verified: 'ಪರಿಶೀಲಿಸಲಾಗಿದೆ',
      needsVerification: 'ಅಸ್ಪಷ್ಟ / ಪರಿಶೀಲನೆ ಅಗತ್ಯವಿದೆ',
      viewAll: 'ಎಲ್ಲಾ ನೋಡಿ',
      beforeFood: 'ಊಟಕ್ಕೆ ಮುಂಚೆ',
      afterFood: 'ಊಟದ ನಂತರ',
      withFood: 'ಊಟದ ಜೊತೆ',
      noInstruction: 'ವಿಶೇಷ ಆಹಾರ ಸೂಚನೆ ಇಲ್ಲ',
      taken: 'ತೆಗೆದುಕೊಳ್ಳಲಾಗಿದೆ',
      upcoming: 'ಮುಂದಿನದು',
      missed: 'ತಪ್ಪಿಹೋಗಿದೆ',
      markTaken: 'ತೆಗೆದುಕೊಂಡೆ ಎಂದು ಗುರುತಿಸಿ',
      takeNow: 'ಈಗ ತೆಗೆದುಕೊಳ್ಳಿ',
    },
    dashboard: {
      personalInfo: 'ವೈಯಕ್ತಿಕ ಮಾಹಿತಿ',
      editProfile: 'ಪ್ರೊಫೈಲ್ ತಿದ್ದುಪಡಿ',
      patientId: 'ರೋಗಿಯ ID',
      age: 'ವಯಸ್ಸು',
      height: 'ಎತ್ತರ',
      weight: 'ತೂಕ',
      bloodGroup: 'ರಕ್ತದ ಗುಂಪು',
      activeMeds: 'ಸಕ್ರಿಯ ಔಷಧಿಗಳು',
      upcomingReminders: 'ಇಂದಿನ ಬಾಕಿ ಡೋಸ್‌ಗಳು',
      savedPrescriptions: 'ಉಳಿಸಿದ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್‌ಗಳು',
      adherence: 'ಔಷಧಿ ಪಾಲನೆ',
      adherenceNote: 'ದಾಖಲಾದ ಡೋಸ್‌ಗಳನ್ನು ಮಾತ್ರ ತೋರಿಸುತ್ತದೆ, ರೋಗ ಗುಣಮುಖದ ಸೂಚಕವಲ್ಲ.',
      nextMedication: 'ಮುಂದಿನ ಔಷಧಿ',
      noNextMedication: 'ಇಂದಿನ ಎಲ್ಲಾ ಔಷಧಿ ಡೋಸ್‌ಗಳು ಪೂರ್ಣಗೊಂಡಿವೆ ಅಥವಾ ಬಾಕಿ ಇಲ್ಲ.',
      todaysOverview: 'ಇಂದಿನ ಸಾರಾಂಶ',
      totalScheduled: 'ಇಂದಿನ ಒಟ್ಟು ಡೋಸ್‌ಗಳು',
      todaysMedications: 'ಇಂದಿನ ಔಷಧಿಗಳು',
      scheduledForToday: 'ಇಂದಿನ ನಿಮ್ಮ ಔಷಧಿ ವೇಳಾಪಟ್ಟಿ',
    },
    scan: {
      title: 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಸ್ಕ್ಯಾನ್',
      subtitle: 'ನಿಮ್ಮ ಔಷಧಿಗಳನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಪರಿಶೀಲಿಸಲು ಮತ್ತು ಜೋಡಿಸಲು ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಚಿತ್ರ ಅಥವಾ PDF ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.',
      chooseFile: 'ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ',
      takePhoto: 'ಫೋಟೋ ತೆಗೆಯಿರಿ',
      tryDemo: 'ಮಾದರಿ ಡೆಮೊ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಲೋಡ್ ಮಾಡಿ',
      supportedFormats: 'ಬೆಂಬಲಿತ ಫಾರ್ಮ್ಯಾಟ್‌ಗಳು: JPG, JPEG, PNG, PDF (ಗರಿಷ್ಠ 10 MB)',
      savedTitle: 'ಉಳಿಸಿದ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್‌ಗಳು',
      reviewConfirm: 'ಪರಿಶೀಲಿಸಿ ಮತ್ತು ದೃಢೀಕರಿಸಿ',
      unclearWarning: 'ಕೆಲವು ಮಾಹಿತಿಗಳು ಅಸ್ಪಷ್ಟವಾಗಿವೆ. ದೃಢೀಕರಿಸುವ ಮೊದಲು ದಯವಿಟ್ಟು ನಿಮ್ಮ ವೈದ್ಯರು ಅಥವಾ ಔಷಧಿಕಾರರೊಂದಿಗೆ ಖಚಿತಪಡಿಸಿಕೊಳ್ಳಿ.',
      createReminders: 'ಪರಿಶೀಲಿಸಿದ ಔಷಧಿಗಳಿಂದ ಜ್ಞಾಪನೆ ರಚಿಸಿ',
    },
    aiBuddy: {
      title: 'AI ಬಡ್ಡಿ',
      assistantName: 'ಕೇರ್‌ಸ್ಕ್ರಿಪ್ಟ್ AI ಬಡ್ಡಿ',
      welcomeMessage:
        'ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ ಕೇರ್‌ಸ್ಕ್ರಿಪ್್ಟ್ AI ಬಡ್ಡಿ. ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು, ವೈದ್ಯಕೀಯ ಪದಗಳನ್ನು ವಿವರಿಸಲು ಮತ್ತು ಸಾಮಾನ್ಯ ಆರೋಗ್ಯ ಮಾಹಿತಿ ನೀಡಲು ನಾನು ಸಹಾಯ ಮಾಡುತ್ತೇನೆ. ಇಂದು ನಿಮಗೆ ಏನು ತಿಳಿಯಬೇಕು?',
      placeholder: 'ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಅಥವಾ ವೈದ್ಯಕೀಯ ಪದದ ಬಗ್ಗೆ ಕೇಳಿ...',
      send: 'ಕಳುಹಿಸಿ',
      disclaimer:
        'ಸಾಮಾನ್ಯ ಮಾಹಿತಿಗಾಗಿ ಮಾತ್ರ. AI ಬಡ್ಡಿ ರೋಗನಿರ್ಣಯ ಮಾಡುವುದಿಲ್ಲ, ಔಷಧಿ ಬರೆಯುವುದಿಲ್ಲ ಅಥವಾ ವೈದ್ಯರ ಬದಲಿಯಾಗುವುದಿಲ್ಲ.',
      suggestedTitle: 'ಸೂಚಿಸಲಾದ ಪ್ರಶ್ನೆಗಳು',
      q1: 'ನನ್ನ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ವಿವರಿಸಿ',
      q2: 'ನಾನು ನನ್ನ ಔಷಧಿಯನ್ನು ಯಾವಾಗ ತೆಗೆದುಕೊಳ್ಳಬೇಕು?',
      q3: 'ಈ ವೈದ್ಯಕೀಯ ಪದವನ್ನು ವಿವರಿಸಿ',
      q4: 'ಸಾಮಾನ್ಯ ಆರೋಗ್ಯ ಮಾಹಿತಿ ನೀಡಿ',
    },
    reminders: {
      title: 'ಜ್ಞಾಪನೆಗಳು',
      today: 'ಇಂದು',
      thisWeek: 'ಈ ವಾರ',
      thisMonth: 'ಈ ತಿಂಗಳು',
      addReminder: 'ಜ್ಞಾಪನೆ ಸೇರಿಸಿ',
      completedSection: 'ಪೂರ್ಣಗೊಂಡಿದೆ',
      upcomingSection: 'ಮುಂದಿನದು',
      missedSection: 'ತಪ್ಪಿಹೋಗಿದೆ',
      enableNotifications: 'ಬ್ರೌಸರ್ ಅಧಿಸೂಚನೆಗಳನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಿ',
    },
    settings: {
      title: 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
      appearance: 'ಥೀಮ್ ನೋಟ',
      lightTheme: 'ಲೈಟ್ ಥೀಮ್',
      darkTheme: 'ಡಾರ್ಕ್ ಥೀಮ್',
      systemTheme: 'ಸಿಸ್ಟಮ್ ಥೀಮ್',
      textSize: 'ಅಕ್ಷರ ಗಾತ್ರ',
      small: 'ಚಿಕ್ಕದು',
      medium: 'ಮಧ್ಯಮ',
      large: 'ದೊಡ್ಡದು',
      language: 'ಭಾಷೆ',
      languageHint: 'ಪ್ರಸ್ತುತ ಕೇರ್‌ಸ್ಕ್ರಿಪ್್ಟ್ ಇಂಗ್ಲಿಷ್ ಮತ್ತು ಕನ್ನಡವನ್ನು ಬೆಂಬಲಿಸುತ್ತದೆ.',
      notifications: 'ಅಧಿಸೂಚನೆಗಳು',
      securityPrivacy: 'ಭದ್ರತೆ ಮತ್ತು ಗೌಪ್ಯತೆ',
      about: 'ಕೇರ್‌ಸ್ಕ್ರಿಪ್್ಟ್ ಬಗ್ಗೆ',
      logout: 'ಲಾಗ್ ಔಟ್',
      logoutConfirmTitle: 'ಕೇರ್‌ಸ್ಕ್ರಿಪ್್ಟ್‌ನಿಂದ ಲಾಗ್ ಔಟ್ ಆಗಬೇಕೇ?',
      logoutConfirmBody: 'ನೀವು ಸ್ವಾಗತ ಪರದೆಗೆ ಹಿಂತಿರುಗುತ್ತೀರಿ. ಈ ಸಾಧನದಲ್ಲಿ ಉಳಿಸಿದ ಸ್ಥಳೀಯ ಡೇಟಾ ಸುರಕ್ಷಿತವಾಗಿರುತ್ತದೆ.',
    },
  },
};
