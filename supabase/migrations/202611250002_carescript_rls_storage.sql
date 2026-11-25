-- ============================================================================
-- CareScript Migration 0002: Row Level Security & Private Storage Policies
-- ============================================================================

-- Helper: Extract Firebase UID string from verified JWT 'sub' claim
CREATE OR REPLACE FUNCTION public.firebase_uid()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT auth.jwt() ->> 'sub';
$$;

-- Helper: Restrictive project-level JWT check (Firebase project 'carescript')
CREATE OR REPLACE FUNCTION public.is_carescript_firebase_jwt()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (
    (auth.jwt() ->> 'iss') = 'https://securetoken.google.com/carescript'
    AND (auth.jwt() ->> 'aud') = 'carescript'
    AND nullif(auth.jwt() ->> 'sub', '') IS NOT NULL
  );
$$;

-- Enable RLS on all patient-specific tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_doses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dose_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Restrictive Project-ID Policies (blocks tokens from any other Firebase project)
-- ----------------------------------------------------------------------------
CREATE POLICY "restrict_project_profiles" ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.is_carescript_firebase_jwt()));
CREATE POLICY "restrict_project_settings" ON public.user_settings AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.is_carescript_firebase_jwt()));
CREATE POLICY "restrict_project_prescriptions" ON public.prescriptions AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.is_carescript_firebase_jwt()));
CREATE POLICY "restrict_project_extractions" ON public.prescription_extractions AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.is_carescript_firebase_jwt()));
CREATE POLICY "restrict_project_medications" ON public.medications AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.is_carescript_firebase_jwt()));
CREATE POLICY "restrict_project_schedules" ON public.medication_schedules AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.is_carescript_firebase_jwt()));
CREATE POLICY "restrict_project_doses" ON public.scheduled_doses AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.is_carescript_firebase_jwt()));
CREATE POLICY "restrict_project_audit" ON public.dose_audit_logs AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.is_carescript_firebase_jwt()));
CREATE POLICY "restrict_project_conversations" ON public.conversations AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.is_carescript_firebase_jwt()));
CREATE POLICY "restrict_project_chat_messages" ON public.chat_messages AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.is_carescript_firebase_jwt()));
CREATE POLICY "restrict_project_notifications" ON public.notifications AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.is_carescript_firebase_jwt()));

-- ----------------------------------------------------------------------------
-- Profiles Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (firebase_uid = (select public.firebase_uid()));

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (firebase_uid = (select public.firebase_uid()));

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (firebase_uid = (select public.firebase_uid()))
  WITH CHECK (firebase_uid = (select public.firebase_uid()));

-- ----------------------------------------------------------------------------
-- User Settings Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "settings_select_own" ON public.user_settings
  FOR SELECT TO authenticated
  USING (firebase_uid = (select public.firebase_uid()));

CREATE POLICY "settings_insert_own" ON public.user_settings
  FOR INSERT TO authenticated
  WITH CHECK (firebase_uid = (select public.firebase_uid()));

CREATE POLICY "settings_update_own" ON public.user_settings
  FOR UPDATE TO authenticated
  USING (firebase_uid = (select public.firebase_uid()))
  WITH CHECK (firebase_uid = (select public.firebase_uid()));

-- ----------------------------------------------------------------------------
-- Prescriptions Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "prescriptions_select_own" ON public.prescriptions
  FOR SELECT TO authenticated
  USING (firebase_uid = (select public.firebase_uid()));

CREATE POLICY "prescriptions_insert_own" ON public.prescriptions
  FOR INSERT TO authenticated
  WITH CHECK (firebase_uid = (select public.firebase_uid()));

CREATE POLICY "prescriptions_update_own" ON public.prescriptions
  FOR UPDATE TO authenticated
  USING (firebase_uid = (select public.firebase_uid()))
  WITH CHECK (firebase_uid = (select public.firebase_uid()));

CREATE POLICY "prescriptions_delete_own" ON public.prescriptions
  FOR DELETE TO authenticated
  USING (firebase_uid = (select public.firebase_uid()));

-- ----------------------------------------------------------------------------
-- Prescription Extractions Policies (relationship-chain verified)
-- ----------------------------------------------------------------------------
CREATE POLICY "extractions_select_own" ON public.prescription_extractions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_id
        AND p.firebase_uid = (select public.firebase_uid())
    )
  );

CREATE POLICY "extractions_insert_own" ON public.prescription_extractions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_id
        AND p.firebase_uid = (select public.firebase_uid())
    )
  );

CREATE POLICY "extractions_update_own" ON public.prescription_extractions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_id
        AND p.firebase_uid = (select public.firebase_uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_id
        AND p.firebase_uid = (select public.firebase_uid())
    )
  );

-- ----------------------------------------------------------------------------
-- Medications Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "medications_select_own" ON public.medications
  FOR SELECT TO authenticated
  USING (firebase_uid = (select public.firebase_uid()));

CREATE POLICY "medications_insert_own" ON public.medications
  FOR INSERT TO authenticated
  WITH CHECK (
    firebase_uid = (select public.firebase_uid())
    AND (
      prescription_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.prescriptions p
        WHERE p.id = prescription_id
          AND p.firebase_uid = (select public.firebase_uid())
          AND p.status = 'confirmed'
      )
    )
  );

CREATE POLICY "medications_update_own" ON public.medications
  FOR UPDATE TO authenticated
  USING (firebase_uid = (select public.firebase_uid()))
  WITH CHECK (firebase_uid = (select public.firebase_uid()));

-- ----------------------------------------------------------------------------
-- Medication Schedules Policies (relationship-chain verified)
-- ----------------------------------------------------------------------------
CREATE POLICY "schedules_select_own" ON public.medication_schedules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.medications m
      WHERE m.id = medication_id
        AND m.firebase_uid = (select public.firebase_uid())
    )
  );

CREATE POLICY "schedules_insert_own" ON public.medication_schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medications m
      WHERE m.id = medication_id
        AND m.firebase_uid = (select public.firebase_uid())
    )
  );

CREATE POLICY "schedules_update_own" ON public.medication_schedules
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.medications m
      WHERE m.id = medication_id
        AND m.firebase_uid = (select public.firebase_uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medications m
      WHERE m.id = medication_id
        AND m.firebase_uid = (select public.firebase_uid())
    )
  );

-- ----------------------------------------------------------------------------
-- Scheduled Doses Policies (complete chain: dose -> schedule -> medication -> user)
-- ----------------------------------------------------------------------------
CREATE POLICY "doses_select_own" ON public.scheduled_doses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.medication_schedules ms
      JOIN public.medications m ON m.id = ms.medication_id
      WHERE ms.id = schedule_id
        AND m.firebase_uid = (select public.firebase_uid())
    )
  );

CREATE POLICY "doses_insert_own" ON public.scheduled_doses
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.medication_schedules ms
      JOIN public.medications m ON m.id = ms.medication_id
      WHERE ms.id = schedule_id
        AND m.firebase_uid = (select public.firebase_uid())
    )
  );

CREATE POLICY "doses_update_own" ON public.scheduled_doses
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.medication_schedules ms
      JOIN public.medications m ON m.id = ms.medication_id
      WHERE ms.id = schedule_id
        AND m.firebase_uid = (select public.firebase_uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.medication_schedules ms
      JOIN public.medications m ON m.id = ms.medication_id
      WHERE ms.id = schedule_id
        AND m.firebase_uid = (select public.firebase_uid())
    )
  );

-- Only allow deleting unlogged future upcoming doses (preserves historical records)
CREATE POLICY "doses_delete_future_upcoming_own" ON public.scheduled_doses
  FOR DELETE TO authenticated
  USING (
    status = 'upcoming'
    AND scheduled_at > now()
    AND EXISTS (
      SELECT 1
      FROM public.medication_schedules ms
      JOIN public.medications m ON m.id = ms.medication_id
      WHERE ms.id = schedule_id
        AND m.firebase_uid = (select public.firebase_uid())
    )
  );

-- ----------------------------------------------------------------------------
-- Dose Audit Logs, Conversations, Chat Messages & Notifications Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "audit_select_own" ON public.dose_audit_logs
  FOR SELECT TO authenticated
  USING (firebase_uid = (select public.firebase_uid()));

CREATE POLICY "audit_insert_own" ON public.dose_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    firebase_uid = (select public.firebase_uid())
    AND EXISTS (
      SELECT 1
      FROM public.scheduled_doses sd
      JOIN public.medication_schedules ms ON ms.id = sd.schedule_id
      JOIN public.medications m ON m.id = ms.medication_id
      WHERE sd.id = dose_id
        AND m.firebase_uid = (select public.firebase_uid())
    )
  );

CREATE POLICY "conversations_all_own" ON public.conversations
  FOR ALL TO authenticated
  USING (firebase_uid = (select public.firebase_uid()))
  WITH CHECK (firebase_uid = (select public.firebase_uid()));

CREATE POLICY "chat_messages_select_own" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.firebase_uid = (select public.firebase_uid())
    )
  );

CREATE POLICY "chat_messages_insert_own" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.firebase_uid = (select public.firebase_uid())
    )
  );

CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (firebase_uid = (select public.firebase_uid()));

CREATE POLICY "notifications_insert_own" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (firebase_uid = (select public.firebase_uid()));

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (firebase_uid = (select public.firebase_uid()))
  WITH CHECK (firebase_uid = (select public.firebase_uid()));

-- ----------------------------------------------------------------------------
-- Private Storage Bucket ('prescriptions') & Strict Storage RLS Policies
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'prescriptions',
  'prescriptions',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

-- Storage policies: folder prefix must equal authenticated Firebase UID
-- Note: upsert requires SELECT + INSERT + UPDATE
CREATE POLICY "rx_storage_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'prescriptions'
    AND (select public.is_carescript_firebase_jwt())
    AND (storage.foldername(name))[1] = (select public.firebase_uid())
  );

CREATE POLICY "rx_storage_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'prescriptions'
    AND (select public.is_carescript_firebase_jwt())
    AND (storage.foldername(name))[1] = (select public.firebase_uid())
  );

CREATE POLICY "rx_storage_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'prescriptions'
    AND (select public.is_carescript_firebase_jwt())
    AND (storage.foldername(name))[1] = (select public.firebase_uid())
  )
  WITH CHECK (
    bucket_id = 'prescriptions'
    AND (select public.is_carescript_firebase_jwt())
    AND (storage.foldername(name))[1] = (select public.firebase_uid())
  );

CREATE POLICY "rx_storage_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'prescriptions'
    AND (select public.is_carescript_firebase_jwt())
    AND (storage.foldername(name))[1] = (select public.firebase_uid())
  );
