-- ============================================================================
-- CareScript Migration 0001: Core Normalized Schema, Constraints & Indexes
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper trigger for automatic updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. Profiles (keyed by Firebase UID text — never cast to UUID)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  firebase_uid text PRIMARY KEY,
  patient_id text UNIQUE NOT NULL DEFAULT ('CS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  full_name text NOT NULL DEFAULT 'Patient' CHECK (char_length(trim(full_name)) > 0),
  email text,
  avatar_url text,
  date_of_birth date CHECK (date_of_birth IS NULL OR (date_of_birth <= current_date AND date_of_birth >= date '1900-01-01')),
  height text,
  weight text,
  blood_group text CHECK (blood_group IS NULL OR blood_group = '' OR blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. User Settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text UNIQUE NOT NULL REFERENCES public.profiles(firebase_uid) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  text_size text NOT NULL DEFAULT 'medium' CHECK (text_size IN ('small', 'medium', 'large')),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'kn')),
  notifications_enabled boolean NOT NULL DEFAULT false,
  reminder_notifications_enabled boolean NOT NULL DEFAULT true,
  lead_minutes integer NOT NULL DEFAULT 10 CHECK (lead_minutes >= 0 AND lead_minutes <= 120),
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Prescriptions (Metadata for private Storage documents)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL REFERENCES public.profiles(firebase_uid) ON DELETE CASCADE,
  prescription_name text NOT NULL CHECK (char_length(trim(prescription_name)) > 0),
  doctor_name text,
  prescription_date date,
  storage_path text NOT NULL,
  original_file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('image/jpeg', 'image/jpg', 'image/png', 'application/pdf')),
  file_size bigint NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
  upload_date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'uploaded' CHECK (
    status IN ('uploaded', 'processing', 'review_required', 'confirmed', 'failed', 'archived')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_user_active
  ON public.prescriptions (firebase_uid, upload_date DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_prescriptions_updated_at
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Prescription Extractions (Preserves raw extraction vs user corrections)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prescription_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid UNIQUE NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  extracted_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  corrected_data jsonb,
  extraction_provider text NOT NULL DEFAULT 'manual',
  extraction_status text NOT NULL DEFAULT 'review_required' CHECK (
    extraction_status IN ('pending', 'processing', 'review_required', 'confirmed', 'failed')
  ),
  confidence_information jsonb,
  reviewed_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_prescription_extractions_updated_at
  BEFORE UPDATE ON public.prescription_extractions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Medications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL REFERENCES public.profiles(firebase_uid) ON DELETE CASCADE,
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  medicine_name text NOT NULL CHECK (char_length(trim(medicine_name)) > 0),
  strength text NOT NULL CHECK (char_length(trim(strength)) > 0),
  dosage text NOT NULL CHECK (char_length(trim(dosage)) > 0),
  dosage_unit text,
  food_instruction text NOT NULL DEFAULT 'no_instruction' CHECK (
    food_instruction IN ('before_food', 'after_food', 'with_food', 'no_instruction')
  ),
  additional_notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  discontinued_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_medications_user_active
  ON public.medications (firebase_uid, active);

CREATE INDEX IF NOT EXISTS idx_medications_prescription
  ON public.medications (prescription_id)
  WHERE prescription_id IS NOT NULL;

CREATE TRIGGER trg_medications_updated_at
  BEFORE UPDATE ON public.medications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. Medication Schedules
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.medication_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
  frequency text NOT NULL CHECK (char_length(trim(frequency)) > 0),
  scheduled_times text[] NOT NULL CHECK (cardinality(scheduled_times) > 0),
  start_date date NOT NULL,
  end_date date,
  timezone text NOT NULL DEFAULT 'UTC',
  recurrence_information jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_schedules_medication
  ON public.medication_schedules (medication_id);

CREATE TRIGGER trg_medication_schedules_updated_at
  BEFORE UPDATE ON public.medication_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 7. Scheduled Doses (Source of truth for reminders & adherence)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_doses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.medication_schedules(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  local_date date NOT NULL,
  local_time text NOT NULL,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'taken', 'missed')),
  taken_at timestamptz,
  missed_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, scheduled_at)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_doses_schedule_date
  ON public.scheduled_doses (schedule_id, local_date, local_time);

CREATE INDEX IF NOT EXISTS idx_scheduled_doses_status_at
  ON public.scheduled_doses (status, scheduled_at);

CREATE TRIGGER trg_scheduled_doses_updated_at
  BEFORE UPDATE ON public.scheduled_doses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 8. Dose Correction Audit Trail
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dose_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dose_id uuid NOT NULL REFERENCES public.scheduled_doses(id) ON DELETE CASCADE,
  firebase_uid text NOT NULL REFERENCES public.profiles(firebase_uid) ON DELETE CASCADE,
  original_status text NOT NULL CHECK (original_status IN ('upcoming', 'taken', 'missed')),
  corrected_status text NOT NULL CHECK (corrected_status IN ('upcoming', 'taken', 'missed')),
  reason text,
  corrected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dose_audit_user
  ON public.dose_audit_logs (firebase_uid, corrected_at DESC);

CREATE INDEX IF NOT EXISTS idx_dose_audit_dose
  ON public.dose_audit_logs (dose_id);

-- ----------------------------------------------------------------------------
-- 9. AI Buddy Conversations & Chat Messages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL REFERENCES public.profiles(firebase_uid) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user
  ON public.conversations (firebase_uid, updated_at DESC);

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON public.chat_messages (conversation_id, created_at ASC);

-- ----------------------------------------------------------------------------
-- 10. Notifications Log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL REFERENCES public.profiles(firebase_uid) ON DELETE CASCADE,
  dose_id uuid REFERENCES public.scheduled_doses(id) ON DELETE SET NULL,
  notification_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'dismissed')),
  scheduled_at timestamptz NOT NULL,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dose_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_scheduled
  ON public.notifications (firebase_uid, scheduled_at DESC);

-- ----------------------------------------------------------------------------
-- Explicit Data API Role Grants (Deny anon, allow authenticated + RLS)
-- ----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.prescription_extractions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.medications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medication_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_doses TO authenticated;
GRANT SELECT, INSERT ON public.dose_audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT ON public.chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
