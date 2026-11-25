-- ============================================================================
-- CareScript Migration 0003: SECURITY INVOKER RPCs & Scheduling Engine
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Get or create patient profile & default settings on first login
--    Never overwrites existing profile values on subsequent logins.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_profile(
  p_full_name text DEFAULT 'Patient',
  p_email text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid text := public.firebase_uid();
  v_profile public.profiles;
  v_settings public.user_settings;
BEGIN
  IF v_uid IS NULL OR v_uid = '' THEN
    RAISE EXCEPTION 'Unauthorized: missing Firebase subject claim';
  END IF;

  INSERT INTO public.profiles (firebase_uid, full_name, email, avatar_url)
  VALUES (
    v_uid,
    COALESCE(NULLIF(trim(p_full_name), ''), 'Patient'),
    NULLIF(trim(p_email), ''),
    NULLIF(trim(p_avatar_url), '')
  )
  ON CONFLICT (firebase_uid) DO NOTHING;

  INSERT INTO public.user_settings (firebase_uid, timezone)
  VALUES (v_uid, COALESCE(NULLIF(trim(p_timezone), ''), 'UTC'))
  ON CONFLICT (firebase_uid) DO NOTHING;

  SELECT * INTO v_profile FROM public.profiles WHERE firebase_uid = v_uid;
  SELECT * INTO v_settings FROM public.user_settings WHERE firebase_uid = v_uid;

  RETURN jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'settings', to_jsonb(v_settings)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Generate scheduled_doses for a medication_schedule over a bounded window
--    Prevents duplicates via UNIQUE (schedule_id, scheduled_at).
--    Respects patient timezone including DST transitions.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_doses_for_schedule(
  p_schedule_id uuid,
  p_days_ahead integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sched public.medication_schedules;
  v_med public.medications;
  v_local_today date;
  v_from_date date;
  v_to_date date;
  v_day date;
  v_time text;
  v_ts timestamptz;
  v_inserted integer := 0;
BEGIN
  SELECT ms.* INTO v_sched
  FROM public.medication_schedules ms
  WHERE ms.id = p_schedule_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule not found or access denied';
  END IF;

  SELECT m.* INTO v_med
  FROM public.medications m
  WHERE m.id = v_sched.medication_id;

  IF NOT FOUND OR NOT v_med.active THEN
    RETURN 0;
  END IF;

  v_local_today := (now() AT TIME ZONE v_sched.timezone)::date;
  v_from_date := GREATEST(v_sched.start_date, v_local_today);
  v_to_date := v_local_today + LEAST(GREATEST(p_days_ahead, 1), 90);
  IF v_sched.end_date IS NOT NULL THEN
    v_to_date := LEAST(v_to_date, v_sched.end_date);
  END IF;

  IF v_from_date > v_to_date THEN
    RETURN 0;
  END IF;

  FOR v_day IN SELECT generate_series(v_from_date, v_to_date, interval '1 day')::date LOOP
    FOREACH v_time IN ARRAY v_sched.scheduled_times LOOP
      IF v_time ~ '^\d{2}:\d{2}$' THEN
        v_ts := ((v_day::text || ' ' || v_time || ':00')::timestamp AT TIME ZONE v_sched.timezone);
        INSERT INTO public.scheduled_doses (
          schedule_id, scheduled_at, local_date, local_time, status
        )
        VALUES (
          v_sched.id, v_ts, v_day, v_time, 'upcoming'
        )
        ON CONFLICT (schedule_id, scheduled_at) DO NOTHING;

        IF FOUND THEN
          v_inserted := v_inserted + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Sync missed doses based on configurable grace period (default 30 min)
--    Never changes a 'taken' dose or counts discontinued future schedules.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_missed_doses(
  p_grace_minutes integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid text := public.firebase_uid();
  v_updated integer := 0;
BEGIN
  UPDATE public.scheduled_doses sd
  SET status = 'missed',
      missed_at = now()
  FROM public.medication_schedules ms
  JOIN public.medications m ON m.id = ms.medication_id
  WHERE sd.schedule_id = ms.id
    AND m.firebase_uid = v_uid
    AND m.active = true
    AND sd.superseded_at IS NULL
    AND sd.status = 'upcoming'
    AND sd.scheduled_at < (now() - make_interval(mins => GREATEST(p_grace_minutes, 0)));

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Atomic Mark Taken (prevents duplicate submissions & race conditions)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_dose_taken(
  p_dose_id uuid,
  p_allow_early_future boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_dose public.scheduled_doses;
  v_med_name text;
BEGIN
  SELECT sd.* INTO v_dose
  FROM public.scheduled_doses sd
  JOIN public.medication_schedules ms ON ms.id = sd.schedule_id
  JOIN public.medications m ON m.id = ms.medication_id
  WHERE sd.id = p_dose_id
  FOR UPDATE OF sd;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dose not found or unauthorized';
  END IF;

  SELECT m.medicine_name INTO v_med_name
  FROM public.medication_schedules ms
  JOIN public.medications m ON m.id = ms.medication_id
  WHERE ms.id = v_dose.schedule_id;

  IF v_dose.status = 'taken' THEN
    RETURN jsonb_build_object(
      'already_taken', true,
      'dose', to_jsonb(v_dose)
    );
  END IF;

  IF v_dose.status = 'missed' THEN
    RAISE EXCEPTION 'Missed doses cannot automatically become taken';
  END IF;

  IF NOT p_allow_early_future AND v_dose.local_date > (now() AT TIME ZONE COALESCE(
    (SELECT timezone FROM public.medication_schedules WHERE id = v_dose.schedule_id), 'UTC'
  ))::date THEN
    RAISE EXCEPTION 'Future date doses require explicit confirmation';
  END IF;

  UPDATE public.scheduled_doses
  SET status = 'taken',
      taken_at = now(),
      missed_at = NULL
  WHERE id = p_dose_id
    AND status = 'upcoming'
  RETURNING * INTO v_dose;

  RETURN jsonb_build_object(
    'already_taken', false,
    'medicine_name', v_med_name,
    'dose', to_jsonb(v_dose)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Confirm reviewed prescription (separates raw extraction vs user edits)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_prescription(
  p_prescription_id uuid,
  p_prescription_name text,
  p_doctor_name text DEFAULT NULL,
  p_corrected_data jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid text := public.firebase_uid();
  v_rx public.prescriptions;
BEGIN
  UPDATE public.prescriptions
  SET prescription_name = COALESCE(NULLIF(trim(p_prescription_name), ''), prescription_name),
      doctor_name = NULLIF(trim(p_doctor_name), ''),
      status = 'confirmed'
  WHERE id = p_prescription_id
    AND firebase_uid = v_uid
    AND deleted_at IS NULL
  RETURNING * INTO v_rx;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescription not found or unauthorized';
  END IF;

  INSERT INTO public.prescription_extractions (
    prescription_id, corrected_data, extraction_status, reviewed_at, confirmed_at
  )
  VALUES (
    p_prescription_id, p_corrected_data, 'confirmed', now(), now()
  )
  ON CONFLICT (prescription_id) DO UPDATE SET
    corrected_data = EXCLUDED.corrected_data,
    extraction_status = 'confirmed',
    reviewed_at = now(),
    confirmed_at = now();

  RETURN to_jsonb(v_rx);
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Create Medication + Schedule + Generate Initial Doses (Transactional)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_medication_with_schedule(
  p_medicine_name text,
  p_strength text,
  p_dosage text,
  p_frequency text,
  p_scheduled_times text[],
  p_start_date date,
  p_end_date date DEFAULT NULL,
  p_food_instruction text DEFAULT 'no_instruction',
  p_additional_notes text DEFAULT NULL,
  p_prescription_id uuid DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid text := public.firebase_uid();
  v_med public.medications;
  v_sched public.medication_schedules;
  v_generated integer;
BEGIN
  IF p_prescription_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.prescriptions
      WHERE id = p_prescription_id AND firebase_uid = v_uid AND status = 'confirmed' AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Cannot create medication schedule from an unconfirmed prescription';
    END IF;
  END IF;

  INSERT INTO public.medications (
    firebase_uid, prescription_id, medicine_name, strength, dosage, food_instruction, additional_notes, active
  )
  VALUES (
    v_uid, p_prescription_id, trim(p_medicine_name), trim(p_strength), trim(p_dosage), p_food_instruction, NULLIF(trim(p_additional_notes), ''), true
  )
  RETURNING * INTO v_med;

  INSERT INTO public.medication_schedules (
    medication_id, frequency, scheduled_times, start_date, end_date, timezone
  )
  VALUES (
    v_med.id, trim(p_frequency), p_scheduled_times, p_start_date, p_end_date, COALESCE(NULLIF(trim(p_timezone), ''), 'UTC')
  )
  RETURNING * INTO v_sched;

  v_generated := public.generate_doses_for_schedule(v_sched.id, 30);

  RETURN jsonb_build_object(
    'medication', to_jsonb(v_med),
    'schedule', to_jsonb(v_sched),
    'doses_generated', v_generated
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Update Medication & Schedule (Preserves historical/completed doses!)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_medication_with_schedule(
  p_medication_id uuid,
  p_medicine_name text,
  p_strength text,
  p_dosage text,
  p_frequency text,
  p_scheduled_times text[],
  p_start_date date,
  p_end_date date DEFAULT NULL,
  p_food_instruction text DEFAULT 'no_instruction',
  p_additional_notes text DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid text := public.firebase_uid();
  v_med public.medications;
  v_sched public.medication_schedules;
  v_generated integer;
BEGIN
  UPDATE public.medications
  SET medicine_name = trim(p_medicine_name),
      strength = trim(p_strength),
      dosage = trim(p_dosage),
      food_instruction = p_food_instruction,
      additional_notes = NULLIF(trim(p_additional_notes), '')
  WHERE id = p_medication_id
    AND firebase_uid = v_uid
  RETURNING * INTO v_med;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Medication not found or unauthorized';
  END IF;

  UPDATE public.medication_schedules
  SET frequency = trim(p_frequency),
      scheduled_times = p_scheduled_times,
      start_date = p_start_date,
      end_date = p_end_date,
      timezone = COALESCE(NULLIF(trim(p_timezone), ''), timezone)
  WHERE medication_id = p_medication_id
  RETURNING * INTO v_sched;

  UPDATE public.scheduled_doses
  SET superseded_at = now()
  WHERE schedule_id = v_sched.id
    AND status = 'upcoming'
    AND scheduled_at > now()
    AND superseded_at IS NULL;

  UPDATE public.scheduled_doses
  SET superseded_at = NULL
  WHERE schedule_id = v_sched.id
    AND local_time = ANY(p_scheduled_times)
    AND local_date >= p_start_date
    AND (p_end_date IS NULL OR local_date <= p_end_date)
    AND status = 'upcoming'
    AND superseded_at IS NOT NULL;

  v_generated := public.generate_doses_for_schedule(v_sched.id, 30);

  RETURN jsonb_build_object(
    'medication', to_jsonb(v_med),
    'schedule', to_jsonb(v_sched),
    'doses_generated', v_generated
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Deactivate Medication (Preserves historical doses, stops future doses)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_medication(
  p_medication_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid text := public.firebase_uid();
BEGIN
  UPDATE public.medications
  SET active = false,
      discontinued_at = now()
  WHERE id = p_medication_id
    AND firebase_uid = v_uid;

  UPDATE public.scheduled_doses sd
  SET superseded_at = now()
  FROM public.medication_schedules ms
  WHERE sd.schedule_id = ms.id
    AND ms.medication_id = p_medication_id
    AND sd.status = 'upcoming'
    AND sd.scheduled_at > now()
    AND sd.superseded_at IS NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Dashboard Summary RPC (Single efficient query for all Dashboard cards)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_local_date date DEFAULT CURRENT_DATE,
  p_grace_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid text := public.firebase_uid();
  v_active_meds integer;
  v_saved_rx integer;
  v_verified_rx integer;
  v_taken_eligible integer;
  v_total_eligible integer;
  v_adherence_pct integer;
  v_today_doses jsonb;
  v_next_med jsonb;
  v_total_today integer;
  v_taken_today integer;
  v_upcoming_today integer;
  v_missed_today integer;
BEGIN
  PERFORM public.sync_missed_doses(p_grace_minutes);

  SELECT count(*)::integer INTO v_active_meds
  FROM public.medications
  WHERE firebase_uid = v_uid AND active = true;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE status = 'confirmed')::integer
  INTO v_saved_rx, v_verified_rx
  FROM public.prescriptions
  WHERE firebase_uid = v_uid AND deleted_at IS NULL;

  -- 14-day adherence based strictly on past/eligible doses (never future doses)
  SELECT
    count(*) FILTER (WHERE sd.status = 'taken')::integer,
    count(*) FILTER (WHERE sd.status IN ('taken', 'missed'))::integer
  INTO v_taken_eligible, v_total_eligible
  FROM public.scheduled_doses sd
  JOIN public.medication_schedules ms ON ms.id = sd.schedule_id
  JOIN public.medications m ON m.id = ms.medication_id
  WHERE m.firebase_uid = v_uid
    AND sd.superseded_at IS NULL
    AND sd.local_date >= (p_local_date - 13)
    AND sd.local_date <= p_local_date
    AND sd.local_date >= ms.start_date;

  IF v_total_eligible > 0 THEN
    v_adherence_pct := round((v_taken_eligible::numeric / v_total_eligible::numeric) * 100)::integer;
  ELSE
    v_adherence_pct := NULL;
  END IF;

  SELECT
    COALESCE(jsonb_agg(row_data ORDER BY row_data->>'scheduled_time'), '[]'::jsonb),
    count(*)::integer,
    count(*) FILTER (WHERE (row_data->>'status') = 'taken')::integer,
    count(*) FILTER (WHERE (row_data->>'status') = 'upcoming')::integer,
    count(*) FILTER (WHERE (row_data->>'status') = 'missed')::integer
  INTO v_today_doses, v_total_today, v_taken_today, v_upcoming_today, v_missed_today
  FROM (
    SELECT jsonb_build_object(
      'id', sd.id,
      'schedule_id', sd.schedule_id,
      'medication_id', m.id,
      'medicine_name', m.medicine_name,
      'strength', m.strength,
      'dosage', m.dosage,
      'food_instruction', m.food_instruction,
      'notes', m.additional_notes,
      'local_date', sd.local_date,
      'scheduled_time', sd.local_time,
      'scheduled_at', sd.scheduled_at,
      'status', sd.status,
      'taken_at', sd.taken_at,
      'missed_at', sd.missed_at
    ) AS row_data
    FROM public.scheduled_doses sd
    JOIN public.medication_schedules ms ON ms.id = sd.schedule_id
    JOIN public.medications m ON m.id = ms.medication_id
    WHERE m.firebase_uid = v_uid
      AND m.active = true
      AND sd.superseded_at IS NULL
      AND sd.local_date = p_local_date
  ) sub;

  SELECT elem INTO v_next_med
  FROM jsonb_array_elements(v_today_doses) elem
  WHERE elem->>'status' = 'upcoming'
  ORDER BY elem->>'scheduled_time' ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'active_medications', v_active_meds,
    'saved_prescriptions', v_saved_rx,
    'verified_prescriptions', v_verified_rx,
    'adherence_percentage', v_adherence_pct,
    'adherence_taken', v_taken_eligible,
    'adherence_total', v_total_eligible,
    'today_stats', jsonb_build_object(
      'total', v_total_today,
      'taken', v_taken_today,
      'upcoming', v_upcoming_today,
      'missed', v_missed_today
    ),
    'next_medication', v_next_med,
    'today_doses', v_today_doses
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.firebase_uid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_carescript_firebase_jwt() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_profile(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_doses_for_schedule(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_missed_doses(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_dose_taken(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_prescription(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_medication_with_schedule(text, text, text, text, text[], date, date, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_medication_with_schedule(uuid, text, text, text, text, text[], date, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_medication(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(date, integer) TO authenticated;
