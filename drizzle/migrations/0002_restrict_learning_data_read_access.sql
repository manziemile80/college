CREATE OR REPLACE FUNCTION public.get_current_user_class_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.class_id
  FROM public.students s
  WHERE s.class_id IS NOT NULL
    AND (
      s.user_id = auth.uid()
      OR s.id IN (SELECT public.get_parent_student_ids(auth.uid()))
    )

  UNION

  SELECT e.class_id
  FROM public.enrollments e
  WHERE e.status = 'active'
    AND (
      e.student_id = public.get_current_student_id(auth.uid())
      OR e.student_id IN (SELECT public.get_parent_student_ids(auth.uid()))
    );
$$;

REVOKE ALL ON FUNCTION public.get_current_user_class_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_class_ids() TO authenticated;

DROP POLICY IF EXISTS "Authenticated view materials" ON public.materials;
CREATE POLICY "Staff and families view relevant materials"
ON public.materials
FOR SELECT
TO authenticated
USING (
  public.is_academic_staff(auth.uid())
  OR (
    (
      public.has_role(auth.uid(), 'student'::public.app_role)
      OR public.has_role(auth.uid(), 'parent'::public.app_role)
    )
    AND (
      class_id IS NULL
      OR class_id IN (SELECT public.get_current_user_class_ids())
    )
  )
);

DROP POLICY IF EXISTS "Authenticated view class_subjects" ON public.class_subjects;
CREATE POLICY "Staff and families view relevant class subjects"
ON public.class_subjects
FOR SELECT
TO authenticated
USING (
  public.is_academic_staff(auth.uid())
  OR (
    (
      public.has_role(auth.uid(), 'student'::public.app_role)
      OR public.has_role(auth.uid(), 'parent'::public.app_role)
    )
    AND class_id IN (SELECT public.get_current_user_class_ids())
  )
);

DROP POLICY IF EXISTS "Anyone authenticated can view subjects" ON public.subjects;
DROP POLICY IF EXISTS "Students view subjects" ON public.subjects;
CREATE POLICY "Users view relevant subjects"
ON public.subjects
FOR SELECT
TO authenticated
USING (
  public.is_academic_staff(auth.uid())
  OR public.has_role(auth.uid(), 'viewer'::public.app_role)
  OR (
    (
      public.has_role(auth.uid(), 'student'::public.app_role)
      OR public.has_role(auth.uid(), 'parent'::public.app_role)
    )
    AND (
      id IN (
        SELECT cs.subject_id
        FROM public.class_subjects cs
        WHERE cs.class_id IN (SELECT public.get_current_user_class_ids())
      )
      OR id IN (
        SELECT m.subject_id
        FROM public.marks m
        WHERE
          m.student_id = public.get_current_student_id(auth.uid())
          OR m.student_id IN (SELECT public.get_parent_student_ids(auth.uid()))
      )
      OR id IN (
        SELECT c.subject_id
        FROM public.courses c
        WHERE c.is_published = TRUE
      )
      OR id IN (
        SELECT a.subject_id
        FROM public.assignments a
        WHERE a.is_published = TRUE
      )
      OR id IN (
        SELECT q.subject_id
        FROM public.quizzes q
        WHERE q.is_published = TRUE
      )
      OR id IN (
        SELECT m.subject_id
        FROM public.materials m
        WHERE
          m.class_id IS NULL
          OR m.class_id IN (SELECT public.get_current_user_class_ids())
      )
    )
  )
);