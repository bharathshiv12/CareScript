-- ============================================================================
-- CareScript Migration 0004: Scheduling Window & Range Query Fixes
-- ============================================================================

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
  SELECT ms.* INTO v_sched FROM public.medication_schedules ms WHERE ms.id = p_schedule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule not found or access denied'; END IF;

  SELECT m.* INTO v_med FROM public.medications m WHERE m.id = v_sched.medication_id;
  IF NOT FOUND OR NOT v_med.active THEN RETURN 0; END IF;

  v_local_today := (now() AT TIME ZONE v_sched.timezone)::date;
  v_from_date := GREATEST(v_sched.start_date, v_local_today);
  v_to_date := v_local_today + LEAST(GREATEST(p_days_ahead, 1), 90);
  IF v_sched.end_date IS NOT NULL THEN v_to_date := LEAST(v_to_date, v_sched.end_date); END IF;
  IF v_from_date > v_to_date THEN RETURN 0; END IF;

  FOR v_day IN SELECT generate_series(v_from_date, v_to_date, interval '1 day')::date LOOP
    FOREACH v_time IN ARRAY v_sched.scheduled_times LOOP
      IF v_time ~ '^\d{2}:\d{2}$' THEN
        v_ts := ((v_day::text || ' ' || v_time || ':00')::timestamp AT TIME ZONE v_sched.timezone);
        -- Do not retroactively generate already-expired doses from earlier today when creating/updating a schedule
        IF v_ts >= (now() - interval '30 minutes') THEN
          INSERT INTO public.scheduled_doses (schedule_id, scheduled_at, local_date, local_time, status)
          VALUES (v_sched.id, v_ts, v_day, v_time, 'upcoming')
          ON CONFLICT (schedule_id, scheduled_at) DO NOTHING;
          IF FOUND THEN v_inserted := v_inserted + 1; END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_reminders_range(
  p_from_date date,
  p_to_date date,
  p_grace_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid text := public.firebase_uid();
  v_rows jsonb;
BEGIN
  PERFORM public.sync_missed_doses(p_grace_minutes);

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'local_date'), (row_data->>'scheduled_time')), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'id', sd.id,
      'medication_id', m.id,
      'schedule_id', sd.schedule_id,
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
      AND sd.local_date >= p_from_date
      AND sd.local_date <= p_to_date
  ) sub;

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reminders_range(date, date, integer) TO authenticated;
