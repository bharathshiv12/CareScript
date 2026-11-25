-- CareScript identity migration: Firebase JWT ownership -> native Supabase Auth UUIDs.
-- Safe guard: do not attempt an implicit Firebase UID-to-UUID conversion if patient data appears.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.profiles) > 0
     OR (SELECT count(*) FROM public.user_settings) > 0
     OR (SELECT count(*) FROM public.prescriptions) > 0
     OR (SELECT count(*) FROM public.prescription_extractions) > 0
     OR (SELECT count(*) FROM public.medications) > 0
     OR (SELECT count(*) FROM public.medication_schedules) > 0
     OR (SELECT count(*) FROM public.scheduled_doses) > 0
     OR (SELECT count(*) FROM public.dose_audit_logs) > 0
     OR (SELECT count(*) FROM public.conversations) > 0
     OR (SELECT count(*) FROM public.chat_messages) > 0
     OR (SELECT count(*) FROM public.notifications) > 0
     OR (SELECT count(*) FROM storage.objects WHERE bucket_id = 'prescriptions') > 0 THEN
    RAISE EXCEPTION 'CareScript identity migration stopped: existing patient rows or prescription files require an explicit verified identity mapping.';
  END IF;
END;
$$;

-- Remove policies that refer to Firebase claims/columns before changing those columns.
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE (schemaname = 'public' AND tablename IN (
      'profiles', 'user_settings', 'prescriptions', 'prescription_extractions',
      'medications', 'medication_schedules', 'scheduled_doses', 'dose_audit_logs',
      'conversations', 'chat_messages', 'notifications'
    ))
    OR (schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'rx_storage_%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END;
$$;

-- Drop legacy ownership foreign keys so the empty identifier columns can be converted safely.
ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS user_settings_firebase_uid_fkey;
ALTER TABLE public.prescriptions DROP CONSTRAINT IF EXISTS prescriptions_firebase_uid_fkey;
ALTER TABLE public.medications DROP CONSTRAINT IF EXISTS medications_firebase_uid_fkey;
ALTER TABLE public.dose_audit_logs DROP CONSTRAINT IF EXISTS dose_audit_logs_firebase_uid_fkey;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_firebase_uid_fkey;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_firebase_uid_fkey;

ALTER TABLE public.profiles ALTER COLUMN firebase_uid TYPE uuid USING firebase_uid::uuid;
ALTER TABLE public.profiles RENAME COLUMN firebase_uid TO user_id;
ALTER TABLE public.user_settings ALTER COLUMN firebase_uid TYPE uuid USING firebase_uid::uuid;
ALTER TABLE public.user_settings RENAME COLUMN firebase_uid TO user_id;
ALTER TABLE public.prescriptions ALTER COLUMN firebase_uid TYPE uuid USING firebase_uid::uuid;
ALTER TABLE public.prescriptions RENAME COLUMN firebase_uid TO user_id;
ALTER TABLE public.medications ALTER COLUMN firebase_uid TYPE uuid USING firebase_uid::uuid;
ALTER TABLE public.medications RENAME COLUMN firebase_uid TO user_id;
ALTER TABLE public.dose_audit_logs ALTER COLUMN firebase_uid TYPE uuid USING firebase_uid::uuid;
ALTER TABLE public.dose_audit_logs RENAME COLUMN firebase_uid TO user_id;
ALTER TABLE public.conversations ALTER COLUMN firebase_uid TYPE uuid USING firebase_uid::uuid;
ALTER TABLE public.conversations RENAME COLUMN firebase_uid TO user_id;
ALTER TABLE public.notifications ALTER COLUMN firebase_uid TYPE uuid USING firebase_uid::uuid;
ALTER TABLE public.notifications RENAME COLUMN firebase_uid TO user_id;

ALTER TABLE public.profiles
  ALTER COLUMN user_id SET DEFAULT auth.uid(),
  ADD CONSTRAINT profiles_user_id_auth_users_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_settings ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.prescriptions ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.medications ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.dose_audit_logs ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.conversations ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.notifications ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.medications ADD CONSTRAINT medications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.dose_audit_logs ADD CONSTRAINT dose_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Rewrite the existing SECURITY INVOKER RPCs against auth.uid() and native UUID columns.
DO $$
DECLARE
  r record;
  definition text;
BEGIN
  FOR r IN
    SELECT p.oid, pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname NOT IN ('firebase_uid', 'is_carescript_firebase_jwt')
      AND pg_get_functiondef(p.oid) LIKE '%firebase_uid%'
  LOOP
    definition := replace(r.definition, 'public.firebase_uid()', 'auth.uid()');
    definition := replace(definition, 'firebase_uid', 'user_id');
    definition := replace(definition, 'v_uid text', 'v_uid uuid');
    definition := replace(definition, $find$v_uid IS NULL OR v_uid = ''$find$, 'v_uid IS NULL');
    EXECUTE definition;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.firebase_uid();
DROP FUNCTION IF EXISTS public.is_carescript_firebase_jwt();

-- Keep RLS enabled and scope every operation to auth.uid().
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY settings_select_own ON public.user_settings FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY settings_insert_own ON public.user_settings FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY settings_update_own ON public.user_settings FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY prescriptions_select_own ON public.prescriptions FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY prescriptions_insert_own ON public.prescriptions FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY prescriptions_update_own ON public.prescriptions FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY prescriptions_delete_own ON public.prescriptions FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY extractions_select_own ON public.prescription_extractions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.prescriptions p WHERE p.id = prescription_extractions.prescription_id AND p.user_id = (SELECT auth.uid()))
);
CREATE POLICY extractions_insert_own ON public.prescription_extractions FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.prescriptions p WHERE p.id = prescription_extractions.prescription_id AND p.user_id = (SELECT auth.uid()))
);
CREATE POLICY extractions_update_own ON public.prescription_extractions FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.prescriptions p WHERE p.id = prescription_extractions.prescription_id AND p.user_id = (SELECT auth.uid()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.prescriptions p WHERE p.id = prescription_extractions.prescription_id AND p.user_id = (SELECT auth.uid()))
);

CREATE POLICY medications_select_own ON public.medications FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY medications_insert_own ON public.medications FOR INSERT TO authenticated WITH CHECK (
  user_id = (SELECT auth.uid()) AND (prescription_id IS NULL OR EXISTS (
    SELECT 1 FROM public.prescriptions p WHERE p.id = medications.prescription_id AND p.user_id = (SELECT auth.uid()) AND p.status = 'confirmed'
  ))
);
CREATE POLICY medications_update_own ON public.medications FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY schedules_select_own ON public.medication_schedules FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.medications m WHERE m.id = medication_schedules.medication_id AND m.user_id = (SELECT auth.uid()))
);
CREATE POLICY schedules_insert_own ON public.medication_schedules FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.medications m WHERE m.id = medication_schedules.medication_id AND m.user_id = (SELECT auth.uid()))
);
CREATE POLICY schedules_update_own ON public.medication_schedules FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.medications m WHERE m.id = medication_schedules.medication_id AND m.user_id = (SELECT auth.uid()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.medications m WHERE m.id = medication_schedules.medication_id AND m.user_id = (SELECT auth.uid()))
);

CREATE POLICY doses_select_own ON public.scheduled_doses FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.medication_schedules s JOIN public.medications m ON m.id = s.medication_id WHERE s.id = scheduled_doses.schedule_id AND m.user_id = (SELECT auth.uid()))
);
CREATE POLICY doses_insert_own ON public.scheduled_doses FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.medication_schedules s JOIN public.medications m ON m.id = s.medication_id WHERE s.id = scheduled_doses.schedule_id AND m.user_id = (SELECT auth.uid()))
);
CREATE POLICY doses_update_own ON public.scheduled_doses FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.medication_schedules s JOIN public.medications m ON m.id = s.medication_id WHERE s.id = scheduled_doses.schedule_id AND m.user_id = (SELECT auth.uid()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.medication_schedules s JOIN public.medications m ON m.id = s.medication_id WHERE s.id = scheduled_doses.schedule_id AND m.user_id = (SELECT auth.uid()))
);
CREATE POLICY doses_delete_future_upcoming_own ON public.scheduled_doses FOR DELETE TO authenticated USING (
  status = 'upcoming' AND scheduled_at > now() AND EXISTS (
    SELECT 1 FROM public.medication_schedules s JOIN public.medications m ON m.id = s.medication_id WHERE s.id = scheduled_doses.schedule_id AND m.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY audit_select_own ON public.dose_audit_logs FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY audit_insert_own ON public.dose_audit_logs FOR INSERT TO authenticated WITH CHECK (
  user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.scheduled_doses d JOIN public.medication_schedules s ON s.id = d.schedule_id JOIN public.medications m ON m.id = s.medication_id
    WHERE d.id = dose_audit_logs.dose_id AND m.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY conversations_all_own ON public.conversations FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY chat_messages_select_own ON public.chat_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = chat_messages.conversation_id AND c.user_id = (SELECT auth.uid()))
);
CREATE POLICY chat_messages_insert_own ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = chat_messages.conversation_id AND c.user_id = (SELECT auth.uid()))
);

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_insert_own ON public.notifications FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY rx_storage_select_own ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'prescriptions' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);
CREATE POLICY rx_storage_insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'prescriptions' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);
CREATE POLICY rx_storage_update_own ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'prescriptions' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
) WITH CHECK (
  bucket_id = 'prescriptions' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);
CREATE POLICY rx_storage_delete_own ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'prescriptions' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

-- This maintenance function is not an application API; remove its public execution grants.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
