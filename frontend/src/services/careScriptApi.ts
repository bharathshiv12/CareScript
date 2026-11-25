import { requireSupabase } from '../lib/supabase';
import type {
  AppSettings,
  ChatMessage,
  DashboardSummary,
  DoseLog,
  DoseStatus,
  ExtractedMedicine,
  FoodInstruction,
  MedicationReminder,
  PatientProfile,
  Prescription,
  ProcessingState,
} from '../types/carescript';
import { getTodayKey, toDateKey } from '../utils/dateUtils';

export function computeAgeFromDob(dob?: string | null): string {
  if (!dob) return '';
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? String(age) : '';
}

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Translates raw Supabase/PostgREST/Edge Function errors into patient-friendly messages
 * while preserving clean diagnostic logs in dev console.
 */
export function formatFriendlyBackendError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();

  if (
    lower.includes('no suitable key') ||
    lower.includes('pgrst301') ||
    lower.includes('invalid or expired authentication token') ||
    lower.includes('jwt')
  ) {
    return 'Your Supabase session could not be verified. Please sign in again and retry.';
  }
  if (lower.includes('permission denied') || lower.includes('42501') || lower.includes('not authorized')) {
    return 'Supabase denied this operation under the active row security policies. Confirm your account is signed in and owns this record.';
  }
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('quota')) {
    return 'AI service rate limit reached. Please wait a moment and retry.';
  }
  if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('504')) {
    return 'The AI service request timed out. Please retry in a moment.';
  }
  if (lower.includes('gemini_model') || lower.includes('422') || (lower.includes('model') && lower.includes('unavailable'))) {
    return 'The configured Gemini AI model is invalid or unavailable on the backend.';
  }
  if (lower.includes('gemini api key') || lower.includes('503') || lower.includes('502')) {
    return 'The Gemini AI service is not configured or authenticated on the backend yet.';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network')) {
    return 'Network connection issue while contacting CareScript cloud services. Please check your internet connection and retry.';
  }
  return raw || 'An unexpected service error occurred. Please try again.';
}

/**
 * Extracts the real JSON error string from Supabase `FunctionsHttpError.context`
 * instead of showing the generic `"Edge Function returned a non-2xx status code"` message.
 */
export async function extractEdgeFunctionError(
  error: unknown,
  data: unknown,
  fallback: string
): Promise<string> {
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string') {
    return formatFriendlyBackendError((data as { error: string }).error);
  }

  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.clone === 'function') {
    try {
      const cloned = ctx.clone();
      const body = (await cloned.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (body?.error) return formatFriendlyBackendError(body.error);
      if (body?.message) return formatFriendlyBackendError(body.message);
    } catch {
      // Ignore parse failure
    }
  }

  const msg = error instanceof Error ? error.message : fallback;
  return formatFriendlyBackendError(msg || fallback);
}

export interface BootstrapPayload {
  profile: PatientProfile;
  settings: AppSettings;
  prescriptions: Prescription[];
  reminders: MedicationReminder[];
  doseLogs: Record<string, DoseLog>;
  doseIdMap: Record<string, string>;
  dashboardSummary: DashboardSummary | null;
  conversationId: string | null;
  chatMessages: ChatMessage[];
}

export function resolvePrescriptionMimeType(file: File): 'image/jpeg' | 'image/png' | 'application/pdf' {
  const mime = file.type.toLowerCase();
  if (mime === 'image/png') return 'image/png';
  if (mime === 'application/pdf') return 'application/pdf';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'image/jpeg';

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'pdf') return 'application/pdf';
  return 'image/jpeg';
}

function mapRxStatusToUi(status: string): {
  processingState: ProcessingState;
  reviewStatus: 'pending_review' | 'verified';
} {
  switch (status) {
    case 'confirmed':
      return { processingState: 'extraction_completed', reviewStatus: 'verified' };
    case 'processing':
      return { processingState: 'processing', reviewStatus: 'pending_review' };
    case 'failed':
      return { processingState: 'failed', reviewStatus: 'pending_review' };
    case 'uploaded':
    case 'review_required':
    default:
      return { processingState: 'review_required', reviewStatus: 'pending_review' };
  }
}

export async function validatePrescriptionFileContent(file: File): Promise<string | null> {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
  if (!allowedMimes.includes(file.type.toLowerCase()) && !['.jpg', '.jpeg', '.png', '.pdf'].includes(ext)) {
    return 'Unsupported file format. Please upload a JPG, JPEG, PNG, or PDF file.';
  }
  if (file.size <= 0) {
    return 'The selected file is empty.';
  }
  if (file.size > 10 * 1024 * 1024) {
    return 'File exceeds the 10 MB maximum upload size.';
  }

  const headerBuf = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isJpeg = headerBuf[0] === 0xff && headerBuf[1] === 0xd8 && headerBuf[2] === 0xff;
  const isPng =
    headerBuf[0] === 0x89 &&
    headerBuf[1] === 0x50 &&
    headerBuf[2] === 0x4e &&
    headerBuf[3] === 0x47;
  const isPdf =
    headerBuf[0] === 0x25 &&
    headerBuf[1] === 0x50 &&
    headerBuf[2] === 0x44 &&
    headerBuf[3] === 0x46;

  if (!isJpeg && !isPng && !isPdf) {
    return 'File signature does not match a valid JPG, PNG, or PDF document.';
  }
  return null;
}

export async function fetchDashboardSummaryFromBackend(): Promise<DashboardSummary | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('get_dashboard_summary', {
    p_local_date: getTodayKey(),
    p_grace_minutes: 30,
  });
  if (error || !data) return null;
  const raw = data as Record<string, unknown>;
  const stats = (raw.today_stats as Record<string, number>) || {};
  return {
    activeMedications: Number(raw.active_medications ?? 0),
    savedPrescriptions: Number(raw.saved_prescriptions ?? 0),
    verifiedPrescriptions: Number(raw.verified_prescriptions ?? 0),
    adherencePercentage:
      raw.adherence_percentage === null || raw.adherence_percentage === undefined
        ? null
        : Number(raw.adherence_percentage),
    adherenceTaken: Number(raw.adherence_taken ?? 0),
    adherenceTotal: Number(raw.adherence_total ?? 0),
    todayStats: {
      total: Number(stats.total ?? 0),
      taken: Number(stats.taken ?? 0),
      upcoming: Number(stats.upcoming ?? 0),
      missed: Number(stats.missed ?? 0),
    },
  };
}

export async function bootstrapBackendUser(params: {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
}): Promise<BootstrapPayload> {
  const supabase = requireSupabase();
  const tz = getBrowserTimezone();

  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_or_create_profile', {
    p_full_name: params.fullName,
    p_email: params.email,
    p_avatar_url: params.avatarUrl ?? null,
    p_timezone: tz,
  });

  if (rpcErr || !rpcData) {
    console.error('[CareScript] get_or_create_profile failed:', rpcErr?.code, rpcErr?.message);
    throw new Error(formatFriendlyBackendError(rpcErr?.message || 'Unable to load patient profile.'));
  }

  const rawProfile = (rpcData as { profile: Record<string, unknown> }).profile;
  const rawSettings = (rpcData as { settings: Record<string, unknown> }).settings;

  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 30);
  const toDate = new Date(today);
  toDate.setDate(today.getDate() + 45);
  const fromKey = toDateKey(fromDate);
  const toKey = toDateKey(toDate);

  const [dashboardSummary, rxRes, medsRes, convRes] = await Promise.all([
    fetchDashboardSummaryFromBackend(),
    supabase
      .from('prescriptions')
      .select(
        'id, prescription_name, doctor_name, storage_path, original_file_name, file_type, file_size, upload_date, status, prescription_extractions(extracted_data, corrected_data, extraction_status)'
      )
      .is('deleted_at', null)
      .order('upload_date', { ascending: false })
      .limit(50),
    supabase
      .from('medications')
      .select(
        'id, prescription_id, medicine_name, strength, dosage, food_instruction, additional_notes, active, medication_schedules(id, frequency, scheduled_times, start_date, end_date, scheduled_doses(id, local_date, local_time, status, taken_at, superseded_at))'
      )
      .eq('active', true)
      .gte('medication_schedules.scheduled_doses.local_date', fromKey)
      .lte('medication_schedules.scheduled_doses.local_date', toKey)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('conversations')
      .select('id, updated_at, chat_messages(id, role, content, is_demo, created_at)')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (rxRes.error) throw new Error(formatFriendlyBackendError(rxRes.error.message));
  if (medsRes.error) throw new Error(formatFriendlyBackendError(medsRes.error.message));

  const dob = (rawProfile.date_of_birth as string | null) ?? undefined;
  const profile: PatientProfile = {
    id: String(rawProfile.patient_id ?? ''),
    userId: String(rawProfile.user_id ?? params.userId),
    fullName: String(rawProfile.full_name ?? params.fullName),
    email: String(rawProfile.email ?? params.email),
    avatarUrl: (rawProfile.avatar_url as string | null) ?? undefined,
    dateOfBirth: dob,
    age: computeAgeFromDob(dob),
    height: String(rawProfile.height ?? ''),
    weight: String(rawProfile.weight ?? ''),
    bloodGroup: String(rawProfile.blood_group ?? ''),
  };

  const settings: AppSettings = {
    theme: (rawSettings?.theme as AppSettings['theme']) || 'light',
    textSize: (rawSettings?.text_size as AppSettings['textSize']) || 'medium',
    language: (rawSettings?.language as AppSettings['language']) || 'en',
    notifications: {
      enabled: Boolean(rawSettings?.notifications_enabled),
      reminderAlerts: rawSettings?.reminder_notifications_enabled !== false,
      leadMinutes: Number(rawSettings?.lead_minutes ?? 10),
    },
  };

  const prescriptions: Prescription[] = (rxRes.data ?? []).map((row) => {
    const extRow = Array.isArray(row.prescription_extractions)
      ? row.prescription_extractions[0]
      : (row.prescription_extractions as Record<string, unknown> | null);
    const medsList = (extRow?.corrected_data ?? extRow?.extracted_data ?? []) as ExtractedMedicine[];
    const mapped = mapRxStatusToUi(String(row.status));

    return {
      id: String(row.id),
      title: String(row.prescription_name),
      doctorName: (row.doctor_name as string | null) ?? undefined,
      uploadDate: String(row.upload_date),
      fileName: String(row.original_file_name),
      fileType: String(row.file_type),
      fileSize: Number(row.file_size),
      storagePath: String(row.storage_path),
      hasFilePreview: true,
      processingState: mapped.processingState,
      reviewStatus: mapped.reviewStatus,
      isDemoSample: false,
      medicines: Array.isArray(medsList) ? medsList : [],
    };
  });

  const reminders: MedicationReminder[] = [];
  const doseLogs: Record<string, DoseLog> = {};
  const doseIdMap: Record<string, string> = {};

  for (const m of medsRes.data ?? []) {
    const schedList = Array.isArray(m.medication_schedules) ? m.medication_schedules : [];
    const sched = schedList[0];
    if (!sched) continue;

    const remId = String(m.id);
    reminders.push({
      id: remId,
      medicineName: String(m.medicine_name),
      strength: String(m.strength),
      dosage: String(m.dosage),
      frequency: String(sched.frequency),
      scheduledTimes: Array.isArray(sched.scheduled_times) ? sched.scheduled_times : [],
      startDate: String(sched.start_date),
      endDate: sched.end_date ? String(sched.end_date) : undefined,
      foodInstruction: m.food_instruction as FoodInstruction,
      notes: m.additional_notes ? String(m.additional_notes) : undefined,
      sourcePrescriptionId: m.prescription_id ? String(m.prescription_id) : undefined,
      verified: true,
      active: Boolean(m.active),
    });

    const doses = (Array.isArray(sched.scheduled_doses) ? sched.scheduled_doses : []).filter(
      (d: { superseded_at?: string | null }) => !d.superseded_at
    );
    for (const d of doses) {
      const uiKey = `${remId}_${d.local_date}_${d.local_time}`;
      doseIdMap[uiKey] = String(d.id);
      doseLogs[uiKey] = {
        id: uiKey,
        reminderId: remId,
        date: String(d.local_date),
        scheduledTime: String(d.local_time),
        status: d.status as DoseStatus,
        takenAt: d.taken_at ? String(d.taken_at) : undefined,
      };
    }
  }

  let conversationId: string | null = null;
  const chatMessages: ChatMessage[] = [];
  if (convRes.data?.id) {
    conversationId = String(convRes.data.id);
    const rawMsgs = Array.isArray(convRes.data.chat_messages) ? convRes.data.chat_messages : [];
    const sortedMsgs = [...rawMsgs].sort((a, b) =>
      String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    );
    for (const m of sortedMsgs.slice(-30)) {
      chatMessages.push({
        id: String(m.id),
        sender: m.role === 'user' ? 'user' : 'assistant',
        text: String(m.content ?? ''),
        timestamp: String(m.created_at ?? new Date().toISOString()),
        isDemo: Boolean(m.is_demo),
      });
    }
  }

  return {
    profile,
    settings,
    prescriptions,
    reminders,
    doseLogs,
    doseIdMap,
    dashboardSummary,
    conversationId,
    chatMessages,
  };
}

function mapDbProfileToUi(row: Record<string, unknown>, fallbackUid: string): PatientProfile {
  const dob = (row.date_of_birth as string | null) ?? undefined;
  return {
    id: String(row.patient_id ?? ''),
    userId: String(row.user_id ?? fallbackUid),
    fullName: String(row.full_name ?? ''),
    email: String(row.email ?? ''),
    avatarUrl: (row.avatar_url as string | null) ?? undefined,
    dateOfBirth: dob,
    age: computeAgeFromDob(dob),
    height: String(row.height ?? ''),
    weight: String(row.weight ?? ''),
    bloodGroup: String(row.blood_group ?? ''),
  };
}

export async function saveProfileToBackend(
  profile: PatientProfile,
  sessionUserId?: string
): Promise<PatientProfile> {
  const supabase = requireSupabase();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Your Supabase session has expired. Please sign in again.');
  const userId = authData.user.id;
  if ((profile.userId && profile.userId !== userId) || (sessionUserId && sessionUserId !== userId)) {
    throw new Error('The active Supabase user changed. Reload your profile before saving.');
  }

  const trimmedName = profile.fullName.trim();
  if (!trimmedName) {
    throw new Error('Full name is required.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      full_name: trimmedName,
      date_of_birth: profile.dateOfBirth || null,
      height: profile.height.trim() || null,
      weight: profile.weight.trim() || null,
      blood_group: profile.bloodGroup.trim() || null,
    })
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(formatFriendlyBackendError(error?.message || 'Unable to save patient profile.'));
  }

  return mapDbProfileToUi(data as Record<string, unknown>, userId);
}

export async function saveSettingsToBackend(sessionUserId: string, settings: AppSettings): Promise<void> {
  const supabase = requireSupabase();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Your Supabase session has expired. Please sign in again.');
  if (authData.user.id !== sessionUserId) throw new Error('The active Supabase user changed. Reload settings before saving.');
  const { error } = await supabase
    .from('user_settings')
    .update({
      theme: settings.theme,
      text_size: settings.textSize,
      language: settings.language,
      notifications_enabled: settings.notifications.enabled,
      reminder_notifications_enabled: settings.notifications.reminderAlerts,
      lead_minutes: settings.notifications.leadMinutes,
      timezone: getBrowserTimezone(),
    })
    .eq('user_id', authData.user.id);

  if (error) throw new Error(formatFriendlyBackendError(error.message));
}

export async function uploadPrescriptionToBackend(
  sessionUserId: string,
  file: File
): Promise<{ prescription: Prescription; extractionError?: string }> {
  const supabase = requireSupabase();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Your Supabase session has expired. Please sign in again.');
  if (authData.user.id !== sessionUserId) throw new Error('The active Supabase user changed. Retry the upload.');
  const userId = authData.user.id;
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const normalizedMime = resolvePrescriptionMimeType(file);
  const storagePath = `${userId}/${Date.now()}-${cleanName}`;

  const { error: uploadErr } = await supabase.storage
    .from('prescriptions')
    .upload(storagePath, file, {
      contentType: normalizedMime,
      upsert: false,
    });

  if (uploadErr) {
    throw new Error(`Upload failed: ${formatFriendlyBackendError(uploadErr.message)}`);
  }

  const { data: inserted, error: dbErr } = await supabase
    .from('prescriptions')
    .insert({
      prescription_name: file.name.replace(/\.[^.]+$/, '') || 'Uploaded Prescription',
      storage_path: storagePath,
      original_file_name: file.name,
      file_type: normalizedMime,
      file_size: file.size,
      status: 'uploaded',
    })
    .select()
    .single();

  if (dbErr || !inserted) {
    await supabase.storage.from('prescriptions').remove([storagePath]);
    throw new Error(formatFriendlyBackendError(dbErr?.message || 'Failed to save prescription record.'));
  }

  let medicines: ExtractedMedicine[] = [];
  let doctorName: string | undefined;
  let extractionError: string | undefined;

  try {
    const ext = await reExtractPrescriptionInBackend(String(inserted.id));
    medicines = ext.medicines;
    doctorName = ext.doctorName || undefined;
    extractionError = ext.extractionError;
  } catch (err) {
    extractionError = formatFriendlyBackendError(err);
    await supabase
      .from('prescriptions')
      .update({ status: 'review_required' })
      .eq('id', inserted.id);
  }

  return {
    prescription: {
      id: String(inserted.id),
      title: String(inserted.prescription_name),
      doctorName,
      uploadDate: String(inserted.upload_date),
      fileName: String(inserted.original_file_name),
      fileType: String(inserted.file_type),
      fileSize: Number(inserted.file_size),
      storagePath,
      hasFilePreview: true,
      processingState: 'review_required',
      reviewStatus: 'pending_review',
      isDemoSample: false,
      medicines,
    },
    extractionError,
  };
}

export async function reExtractPrescriptionInBackend(prescriptionId: string): Promise<{
  doctorName?: string;
  medicines: ExtractedMedicine[];
  extractionError?: string;
}> {
  const supabase = requireSupabase();
  const { data: extData, error: fnErr } = await supabase.functions.invoke('extract-prescription', {
    body: { prescriptionId },
  });

  if (fnErr || (extData && typeof extData === 'object' && 'error' in extData)) {
    const extractionError = await extractEdgeFunctionError(
      fnErr,
      extData,
      'Automated extraction is currently unavailable.'
    );
    await supabase
      .from('prescriptions')
      .update({ status: 'review_required' })
      .eq('id', prescriptionId);
    return { medicines: [], extractionError };
  }

  const medicines = Array.isArray(extData?.medicines) ? (extData.medicines as ExtractedMedicine[]) : [];
  const doctorName = typeof extData?.doctorName === 'string' && extData.doctorName.trim()
    ? extData.doctorName.trim()
    : undefined;
  return { doctorName, medicines };
}

export async function getPrescriptionSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.storage
    .from('prescriptions')
    .createSignedUrl(storagePath, 120);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function confirmPrescriptionInBackend(rx: Prescription): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('confirm_prescription', {
    p_prescription_id: rx.id,
    p_prescription_name: rx.title,
    p_doctor_name: rx.doctorName ?? null,
    p_corrected_data: rx.medicines,
  });
  if (error) throw new Error(formatFriendlyBackendError(error.message));
}

export async function deletePrescriptionInBackend(rx: Prescription): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from('prescriptions')
    .update({ status: 'archived', deleted_at: new Date().toISOString() })
    .eq('id', rx.id);
  if (error) throw new Error(formatFriendlyBackendError(error.message));

  if (rx.storagePath) {
    await supabase.storage.from('prescriptions').remove([rx.storagePath]);
  }
}

export async function createMedicationInBackend(
  rem: Omit<MedicationReminder, 'id'>
): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('create_medication_with_schedule', {
    p_medicine_name: rem.medicineName,
    p_strength: rem.strength,
    p_dosage: rem.dosage,
    p_frequency: rem.frequency,
    p_scheduled_times: rem.scheduledTimes,
    p_start_date: rem.startDate || getTodayKey(),
    p_end_date: rem.endDate || null,
    p_food_instruction: rem.foodInstruction,
    p_additional_notes: rem.notes || null,
    p_prescription_id: rem.sourcePrescriptionId || null,
    p_timezone: getBrowserTimezone(),
  });
  if (error || !data) throw new Error(formatFriendlyBackendError(error?.message || 'Failed to save medication schedule.'));
  const med = (data as { medication: { id: string } }).medication;
  return med.id;
}

export async function updateMedicationInBackend(rem: MedicationReminder): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('update_medication_with_schedule', {
    p_medication_id: rem.id,
    p_medicine_name: rem.medicineName,
    p_strength: rem.strength,
    p_dosage: rem.dosage,
    p_frequency: rem.frequency,
    p_scheduled_times: rem.scheduledTimes,
    p_start_date: rem.startDate,
    p_end_date: rem.endDate || null,
    p_food_instruction: rem.foodInstruction,
    p_additional_notes: rem.notes || null,
    p_timezone: getBrowserTimezone(),
  });
  if (error) throw new Error(formatFriendlyBackendError(error.message));
}

export async function deactivateMedicationInBackend(medicationId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('deactivate_medication', {
    p_medication_id: medicationId,
  });
  if (error) throw new Error(formatFriendlyBackendError(error.message));
}

export async function markDoseTakenInBackend(
  doseId: string,
  allowEarlyFuture = false
): Promise<{ alreadyTaken: boolean; takenAt?: string }> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('mark_dose_taken', {
    p_dose_id: doseId,
    p_allow_early_future: allowEarlyFuture,
  });
  if (error || !data) throw new Error(formatFriendlyBackendError(error?.message || 'Failed to record taken dose.'));
  const res = data as { already_taken: boolean; dose?: { taken_at?: string } };
  return {
    alreadyTaken: Boolean(res.already_taken),
    takenAt: res.dose?.taken_at,
  };
}
