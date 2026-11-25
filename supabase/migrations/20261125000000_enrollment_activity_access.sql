-- Enrollment is the source of truth for class participation. Students must
-- have an active enrollment before they can take quizzes, submit assignments
-- or see attendance records.

-- Students need to read their own enrollment status for the UI to gate actions.
DROP POLICY IF EXISTS "Students view own enrollments" ON public.enrollments;
CREATE POLICY "Students view own enrollments" ON public.enrollments
  FOR SELECT TO authenticated
  USING (student_id = public.get_current_student_id(auth.uid()));

-- Active enrollment in the activity's class (or any active enrollment when the
-- activity is not tied to a class). SECURITY DEFINER avoids recursive RLS.
CREATE OR REPLACE FUNCTION public.student_can_access_class(_student_id uuid, _class_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.student_id = _student_id
      AND e.status = 'active'
      AND (_class_id IS NULL OR e.class_id = _class_id)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.student_can_access_class(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_can_access_class(uuid, uuid) TO authenticated;

-- Quiz attempts: only enrolled students may submit answers.
DROP POLICY IF EXISTS "Students create own attempts" ON public.quiz_attempts;
CREATE POLICY "Students create own attempts" ON public.quiz_attempts FOR INSERT TO authenticated
  WITH CHECK (
    student_id = public.get_current_student_id(auth.uid())
    AND public.student_can_access_class(
      student_id,
      (SELECT class_id FROM public.quizzes WHERE id = quiz_id)
    )
  );

-- Assignment submissions: only enrolled students may submit work, including updates.
DROP POLICY IF EXISTS "Students create own submissions" ON public.assignment_submissions;
CREATE POLICY "Students create own submissions" ON public.assignment_submissions FOR INSERT TO authenticated
  WITH CHECK (
    student_id = public.get_current_student_id(auth.uid())
    AND public.student_can_access_class(
      student_id,
      (SELECT class_id FROM public.assignments WHERE id = assignment_id)
    )
  );

DROP POLICY IF EXISTS "Students update own submissions" ON public.assignment_submissions;
CREATE POLICY "Students update own submissions" ON public.assignment_submissions FOR UPDATE TO authenticated
  USING (student_id = public.get_current_student_id(auth.uid()))
  WITH CHECK (
    student_id = public.get_current_student_id(auth.uid())
    AND public.student_can_access_class(
      student_id,
      (SELECT class_id FROM public.assignments WHERE id = assignment_id)
    )
  );

-- Students only see attendance for classes they are actively enrolled in.
DROP POLICY IF EXISTS "Students view own attendance" ON public.attendance;
CREATE POLICY "Students view own attendance" ON public.attendance FOR SELECT TO authenticated
  USING (
    student_id = public.get_current_student_id(auth.uid())
    AND public.student_can_access_class(student_id, class_id)
  );
