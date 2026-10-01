REVOKE EXECUTE ON FUNCTION public.is_dos(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_dod(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_academic_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_enrollment_history() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) FROM PUBLIC, anon;