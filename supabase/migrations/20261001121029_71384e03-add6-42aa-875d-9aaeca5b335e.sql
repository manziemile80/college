-- Helper role checks
CREATE OR REPLACE FUNCTION public.is_dos(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'dos')
$$;

CREATE OR REPLACE FUNCTION public.is_dod(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'dod')
$$;

CREATE OR REPLACE FUNCTION public.is_academic_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'teacher') OR public.has_role(_user_id, 'dos')
$$;

-- ============ Discipline rules ============
CREATE TABLE public.discipline_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'discipline',
  marks_deduction integer NOT NULL DEFAULT 1 CHECK (marks_deduction >= 1 AND marks_deduction <= 40),
  severity text NOT NULL DEFAULT 'minor',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discipline_rules TO authenticated;
GRANT ALL ON public.discipline_rules TO service_role;
ALTER TABLE public.discipline_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view discipline rules" ON public.discipline_rules
  FOR SELECT TO authenticated USING (public.is_academic_staff(auth.uid()) OR public.is_dod(auth.uid()));
CREATE POLICY "Admins manage discipline rules" ON public.discipline_rules
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOD manages discipline rules" ON public.discipline_rules
  FOR ALL TO authenticated USING (public.is_dod(auth.uid())) WITH CHECK (public.is_dod(auth.uid()));

-- ============ Discipline incidents ============
CREATE TABLE public.discipline_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id),
  class_id uuid REFERENCES public.classes(id),
  rule_id uuid REFERENCES public.discipline_rules(id),
  reported_by uuid NOT NULL,
  incident_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed')),
  marks_deducted integer NOT NULL DEFAULT 0 CHECK (marks_deducted >= 0 AND marks_deducted <= 40),
  reviewed_by uuid,
  reviewed_at timestamptz,
  follow_up text,
  behavior_score_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.discipline_incidents TO authenticated;
GRANT ALL ON public.discipline_incidents TO service_role;
ALTER TABLE public.discipline_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view all incidents" ON public.discipline_incidents
  FOR SELECT TO authenticated USING (public.is_academic_staff(auth.uid()) OR public.is_dod(auth.uid()));
CREATE POLICY "Teachers report incidents" ON public.discipline_incidents
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'teacher') AND reported_by = auth.uid()
  );
CREATE POLICY "DOD and admins review incidents" ON public.discipline_incidents
  FOR UPDATE TO authenticated USING (public.is_dod(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_dod(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Parents view children incidents" ON public.discipline_incidents
  FOR SELECT TO authenticated USING (
    student_id IN (SELECT public.get_parent_student_ids(auth.uid()))
  );
CREATE POLICY "Students view own incidents" ON public.discipline_incidents
  FOR SELECT TO authenticated USING (student_id = public.get_current_student_id(auth.uid()));

-- ============ Enrollments ============
CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id),
  class_id uuid NOT NULL REFERENCES public.classes(id),
  academic_year text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','transferred','removed')),
  enrolled_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, class_id, academic_year)
);
CREATE INDEX idx_enrollments_student ON public.enrollments(student_id);
CREATE INDEX idx_enrollments_class ON public.enrollments(class_id, academic_year);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view enrollments" ON public.enrollments
  FOR SELECT TO authenticated USING (public.is_academic_staff(auth.uid()));
CREATE POLICY "Admins manage enrollments" ON public.enrollments
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages enrollments" ON public.enrollments
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Teachers enroll in assigned classes" ON public.enrollments
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'teacher') AND enrolled_by = auth.uid() AND EXISTS (
      SELECT 1 FROM public.class_subjects cs
      WHERE cs.class_id = class_id AND cs.teacher_id = auth.uid()
    )
  );
CREATE POLICY "Teachers transfer remove in assigned classes" ON public.enrollments
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'teacher') AND EXISTS (
      SELECT 1 FROM public.class_subjects cs
      WHERE cs.class_id = enrollments.class_id AND cs.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.class_subjects cs
      WHERE cs.class_id = class_id AND cs.teacher_id = auth.uid()
    )
  );

-- ============ Enrollment history (auto-written by trigger) ============
CREATE TABLE public.enrollment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  action text NOT NULL,
  details text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.enrollment_history TO authenticated;
GRANT ALL ON public.enrollment_history TO service_role;
ALTER TABLE public.enrollment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view enrollment history" ON public.enrollment_history
  FOR SELECT TO authenticated USING (public.is_academic_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.record_enrollment_history()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  action_name text;
  detail text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_name := 'enrolled';
    detail := 'Enrolled in class ' || NEW.class_id::text || ' for ' || NEW.academic_year;
  ELSE
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      action_name := NEW.status;
      detail := 'Status changed from ' || OLD.status || ' to ' || NEW.status;
    ELSE
      RETURN NEW;
    END IF;
  END IF;
  INSERT INTO public.enrollment_history (enrollment_id, action, details, performed_by)
  VALUES (NEW.id, action_name, detail, COALESCE(NEW.enrolled_by, auth.uid()));
  RETURN NEW;
END;
$$;

CREATE TRIGGER enrollments_history
AFTER INSERT OR UPDATE OF status ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.record_enrollment_history();

-- ============ Announcements ============
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all',
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read announcements" ON public.announcements
  FOR SELECT TO authenticated USING (is_published = true);
CREATE POLICY "Admins manage announcements" ON public.announcements
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages announcements" ON public.announcements
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));

-- ============ Audit logs ============
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_audit(_action text, _entity text, _entity_id uuid DEFAULT NULL, _details jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, details)
  VALUES (auth.uid(), _action, _entity, _entity_id, _details);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) TO authenticated;

-- ============ Timestamps ============
CREATE OR REPLACE TRIGGER update_discipline_rules_updated_at BEFORE UPDATE ON public.discipline_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER update_discipline_incidents_updated_at BEFORE UPDATE ON public.discipline_incidents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER update_enrollments_updated_at BEFORE UPDATE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER update_announcements_updated_at BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Extend existing access for DOS and DOD ============
CREATE POLICY "DOS views students" ON public.students
  FOR SELECT TO authenticated USING (public.is_dos(auth.uid()));
CREATE POLICY "DOS manages students" ON public.students
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "DOS views classes" ON public.classes
  FOR SELECT TO authenticated USING (public.is_dos(auth.uid()));
CREATE POLICY "DOS manages classes" ON public.classes
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "DOS manages subjects" ON public.subjects
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "DOS manages class subjects" ON public.class_subjects
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "DOS views marks" ON public.marks
  FOR SELECT TO authenticated USING (public.is_dos(auth.uid()));
CREATE POLICY "DOS manages marks" ON public.marks
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "DOS manages attendance" ON public.attendance
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "DOS views behavior scores" ON public.behavior_scores
  FOR SELECT TO authenticated USING (public.is_dos(auth.uid()));
CREATE POLICY "DOD manages behavior scores" ON public.behavior_scores
  FOR ALL TO authenticated USING (public.is_dod(auth.uid())) WITH CHECK (public.is_dod(auth.uid()));