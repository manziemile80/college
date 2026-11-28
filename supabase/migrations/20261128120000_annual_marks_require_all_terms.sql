-- Annual marks must only exist when Term 1, Term 2 AND Term 3 all have
-- recorded results. Missing terms stay NULL (never 0, never a copy of an
-- earlier term). A genuine score of zero IS a valid recorded result.
-- Nothing in this migration modifies or deletes existing marks rows.

CREATE OR REPLACE FUNCTION public.get_student_annual_result(
  _student_id uuid,
  _academic_year text
)
RETURNS TABLE (
  term1_total numeric,
  term1_count integer,
  term2_total numeric,
  term2_count integer,
  term3_total numeric,
  term3_count integer,
  annual_total numeric,
  annual_percentage numeric,
  annual_available boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH valid_marks AS (
    SELECT m.term, (m.cat_score + m.exam_score) AS total
    FROM public.marks m
    WHERE m.student_id = _student_id
      AND m.academic_year = _academic_year
      AND m.cat_score IS NOT NULL
      AND m.exam_score IS NOT NULL
  ),
  aggregated AS (
    SELECT
      SUM(total) FILTER (WHERE term = 'term1') AS t1_total,
      COUNT(*) FILTER (WHERE term = 'term1')::int AS t1_count,
      SUM(total) FILTER (WHERE term = 'term2') AS t2_total,
      COUNT(*) FILTER (WHERE term = 'term2')::int AS t2_count,
      SUM(total) FILTER (WHERE term = 'term3') AS t3_total,
      COUNT(*) FILTER (WHERE term = 'term3')::int AS t3_count,
      COUNT(DISTINCT term)::int AS terms_present
    FROM valid_marks
  )
  SELECT
    t1_total, t1_count, t2_total, t2_count, t3_total, t3_count,
    CASE WHEN terms_present = 3
      THEN COALESCE(t1_total, 0) + COALESCE(t2_total, 0) + COALESCE(t3_total, 0)
      ELSE NULL END AS annual_total,
    CASE WHEN terms_present = 3 AND (t1_count + t2_count + t3_count) > 0
      THEN (COALESCE(t1_total, 0) + COALESCE(t2_total, 0) + COALESCE(t3_total, 0))
           / (t1_count + t2_count + t3_count)
      ELSE NULL END AS annual_percentage,
    (terms_present = 3) AS annual_available
  FROM aggregated;
$$;

CREATE OR REPLACE FUNCTION public.get_class_annual_results(
  _class_id uuid,
  _academic_year text
)
RETURNS TABLE (
  student_id uuid,
  term1_total numeric,
  term1_count integer,
  term2_total numeric,
  term2_count integer,
  term3_total numeric,
  term3_count integer,
  annual_total numeric,
  annual_percentage numeric,
  annual_available boolean,
  position integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH per_student AS (
    SELECT
      s.id AS sid,
      SUM(m.cat_score + m.exam_score) FILTER (WHERE m.term = 'term1') AS t1_total,
      COUNT(m.id) FILTER (WHERE m.term = 'term1')::int AS t1_count,
      SUM(m.cat_score + m.exam_score) FILTER (WHERE m.term = 'term2') AS t2_total,
      COUNT(m.id) FILTER (WHERE m.term = 'term2')::int AS t2_count,
      SUM(m.cat_score + m.exam_score) FILTER (WHERE m.term = 'term3') AS t3_total,
      COUNT(m.id) FILTER (WHERE m.term = 'term3')::int AS t3_count,
      COUNT(DISTINCT m.term)::int AS terms_present
    FROM public.students s
    LEFT JOIN public.marks m
      ON m.student_id = s.id
     AND m.academic_year = _academic_year
     AND m.cat_score IS NOT NULL
     AND m.exam_score IS NOT NULL
    WHERE s.class_id = _class_id
    GROUP BY s.id
  ),
  computed AS (
    SELECT
      sid,
      COALESCE(t1_total, 0) AS t1_total, t1_count,
      COALESCE(t2_total, 0) AS t2_total, t2_count,
      COALESCE(t3_total, 0) AS t3_total, t3_count,
      CASE WHEN terms_present = 3
        THEN COALESCE(t1_total, 0) + COALESCE(t2_total, 0) + COALESCE(t3_total, 0)
        ELSE NULL END AS annual_total,
      CASE WHEN terms_present = 3 AND (t1_count + t2_count + t3_count) > 0
        THEN (COALESCE(t1_total, 0) + COALESCE(t2_total, 0) + COALESCE(t3_total, 0))
             / (t1_count + t2_count + t3_count)
        ELSE NULL END AS annual_percentage,
      (terms_present = 3) AS annual_available
    FROM per_student
  )
  SELECT
    sid,
    t1_total, t1_count, t2_total, t2_count, t3_total, t3_count,
    annual_total, annual_percentage, annual_available,
    CASE WHEN annual_available
      THEN RANK() OVER (ORDER BY annual_percentage DESC NULLS LAST, sid)::int
      ELSE NULL END AS position
  FROM computed
  ORDER BY annual_percentage DESC NULLS LAST, sid;
$$;

-- Convenience read API for clients: one row per student/academic year with
-- nullable annual columns and no annual position until Term 3 is recorded.
CREATE OR REPLACE VIEW public.student_annual_results
WITH (security_invoker = true) AS
SELECT
  s.id AS student_id,
  s.class_id,
  m.academic_year,
  SUM(m.cat_score + m.exam_score) FILTER (WHERE m.term = 'term1') AS term1_total,
  COUNT(m.id) FILTER (WHERE m.term = 'term1')::int AS term1_count,
  SUM(m.cat_score + m.exam_score) FILTER (WHERE m.term = 'term2') AS term2_total,
  COUNT(m.id) FILTER (WHERE m.term = 'term2')::int AS term2_count,
  SUM(m.cat_score + m.exam_score) FILTER (WHERE m.term = 'term3') AS term3_total,
  COUNT(m.id) FILTER (WHERE m.term = 'term3')::int AS term3_count,
  CASE WHEN COUNT(DISTINCT m.term) = 3
    THEN SUM(m.cat_score + m.exam_score)
    ELSE NULL END AS annual_total,
  CASE WHEN COUNT(DISTINCT m.term) = 3 AND COUNT(m.id) > 0
    THEN SUM(m.cat_score + m.exam_score) / COUNT(m.id)
    ELSE NULL END AS annual_percentage,
  (COUNT(DISTINCT m.term) = 3) AS annual_available
FROM public.students s
JOIN public.marks m ON m.student_id = s.id
GROUP BY s.id, s.class_id, m.academic_year;

REVOKE ALL ON FUNCTION public.get_student_annual_result(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_class_annual_results(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_annual_result(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_class_annual_results(uuid, text) TO authenticated;
GRANT SELECT ON public.student_annual_results TO authenticated;
