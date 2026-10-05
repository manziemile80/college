CREATE OR REPLACE FUNCTION public.get_marks_by_reg_number(_reg text)
RETURNS TABLE(student_name text, class_name text, subject text, term school_term, academic_year text, cat_score numeric, exam_score numeric, total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT s.first_name || ' ' || s.last_name, c.name, sub.name, m.term, m.academic_year, m.cat_score, m.exam_score, m.cat_score + m.exam_score
  FROM public.students s
  LEFT JOIN public.classes c ON c.id = s.class_id
  JOIN public.marks m ON m.student_id = s.id
  JOIN public.subjects sub ON sub.id = m.subject_id
  WHERE lower(trim(s.student_id)) = lower(trim(_reg)) AND length(trim(_reg)) > 0
  ORDER BY m.academic_year DESC, m.term, sub.name
$$;
REVOKE ALL ON FUNCTION public.get_marks_by_reg_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marks_by_reg_number(text) TO anon, authenticated;