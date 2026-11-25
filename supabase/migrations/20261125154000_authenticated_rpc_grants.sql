-- Application RPCs are part of the signed-in patient API. PostgreSQL grants
-- EXECUTE to PUBLIC on new functions by default, so explicitly remove that
-- inherited access and grant only to authenticated users.
REVOKE EXECUTE ON FUNCTION public.get_or_create_profile(text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_doses_for_schedule(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_missed_doses(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_dose_taken(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_prescription(uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_medication_with_schedule(text, text, text, text, text[], date, date, text, text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_medication_with_schedule(uuid, text, text, text, text, text[], date, date, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deactivate_medication(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary(date, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_reminders_range(date, date, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_or_create_profile(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_doses_for_schedule(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_missed_doses(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_dose_taken(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_prescription(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_medication_with_schedule(text, text, text, text, text[], date, date, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_medication_with_schedule(uuid, text, text, text, text, text[], date, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_medication(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reminders_range(date, date, integer) TO authenticated;

-- Trigger-only utility; it is not an application RPC.
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
