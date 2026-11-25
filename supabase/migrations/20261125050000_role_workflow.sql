-- Role workflow:
--   DOS creates/manages subjects and assigns teachers to class subjects.
--   Teachers enroll students into the classes they are assigned to.
--   Other roles cannot change these records.

-- Subjects: only DOS may insert/update/delete.
DROP POLICY IF EXISTS "Teachers can add subjects" ON public.subjects;
DROP POLICY IF EXISTS "Teachers can update subjects" ON public.subjects;
DROP POLICY IF EXISTS "Teachers can delete subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins manage subjects" ON public.subjects;
DROP POLICY IF EXISTS "DOS manages subjects" ON public.subjects;
CREATE POLICY "DOS manages subjects" ON public.subjects
  FOR ALL TO authenticated
  USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));

-- Class/subject assignments: only DOS may insert/update/delete.
DROP POLICY IF EXISTS "Admins manage class_subjects" ON public.class_subjects;
DROP POLICY IF EXISTS "DOS manages class subjects" ON public.class_subjects;
CREATE POLICY "DOS manages class subjects" ON public.class_subjects
  FOR ALL TO authenticated
  USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));

-- Only a user with the teacher role can be assigned as a class teacher.
CREATE OR REPLACE FUNCTION public.validate_class_subject_teacher()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.teacher_id IS NOT NULL AND NOT public.has_role(NEW.teacher_id, 'teacher') THEN
    RAISE EXCEPTION 'Only users with the teacher role can be assigned to a class subject';
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.validate_class_subject_teacher() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS class_subjects_validate_teacher ON public.class_subjects;
CREATE TRIGGER class_subjects_validate_teacher
  BEFORE INSERT OR UPDATE OF teacher_id ON public.class_subjects
  FOR EACH ROW EXECUTE FUNCTION public.validate_class_subject_teacher();

-- DOS needs to look up which users are teachers and their names.
DROP POLICY IF EXISTS "DOS views user roles" ON public.user_roles;
CREATE POLICY "DOS views user roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_dos(auth.uid()));
DROP POLICY IF EXISTS "DOS views profiles" ON public.profiles;
CREATE POLICY "DOS views profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_dos(auth.uid()));

-- Enrollment: teachers may enroll students only in classes assigned to them.
-- (The existing "Teachers enroll in assigned classes" / "Teachers transfer remove
-- in assigned classes" policies already enforce this with class_subjects.)

NOTIFY pgrst, 'reload schema';
