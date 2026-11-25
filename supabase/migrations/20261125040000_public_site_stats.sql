-- Public landing-page statistics. Only aggregate counts are exposed; no
-- student records are readable by anonymous visitors. SECURITY DEFINER lets
-- the function count rows that RLS hides from the anon role.
CREATE OR REPLACE FUNCTION public.get_public_site_stats()
RETURNS TABLE (students bigint, classes bigint, attendance_rate integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*)::bigint FROM public.students),
    (SELECT count(*)::bigint FROM public.classes),
    COALESCE(
      (
        SELECT round(
                 100.0 * count(*) FILTER (WHERE status = 'present')
                 / NULLIF(count(*), 0)
               )::integer
          FROM public.attendance
         WHERE attendance_date >= date_trunc('year', CURRENT_DATE)::date
      ),
      0
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_site_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_site_stats() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
