-- In-app notifications. Each row belongs to one user (recipient) so a
-- notification is only ever shown to the user it concerns.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'info' CHECK (category IN ('info', 'success', 'warning', 'danger')),
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Internal insert helper used by triggers (bypasses RLS).
CREATE OR REPLACE FUNCTION public.insert_notification(
  _user_id uuid, _title text, _body text,
  _category text DEFAULT 'info', _link text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, title, body, category, link)
  VALUES (_user_id, left(_title, 150), left(_body, 500), COALESCE(_category, 'info'), _link);
END; $$;
REVOKE EXECUTE ON FUNCTION public.insert_notification(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

-- Publish a notification to the student (if they have an account) and to the
-- parents linked to that student.
CREATE OR REPLACE FUNCTION public.notify_student_related(
  _student_id uuid, _title text, _body text,
  _category text DEFAULT 'info', _link text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  recipient uuid;
BEGIN
  SELECT user_id INTO recipient FROM public.students WHERE id = _student_id;
  IF recipient IS NOT NULL THEN
    PERFORM public.insert_notification(recipient, _title, _body, _category, _link);
  END IF;

  FOR recipient IN
    SELECT p.user_id FROM public.student_parents sp
    JOIN public.parents p ON p.id = sp.parent_id
    WHERE sp.student_id = _student_id
  LOOP
    IF recipient IS NOT NULL THEN
      PERFORM public.insert_notification(recipient, _title, _body, _category, _link);
    END IF;
  END LOOP;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_student_related(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

-- Manual publishing by academic staff / DOD.
CREATE OR REPLACE FUNCTION public.create_notification(
  _user_id uuid, _title text, _body text,
  _category text DEFAULT 'info', _link text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_academic_staff(auth.uid()) OR public.is_dod(auth.uid())) THEN
    RAISE EXCEPTION 'You are not allowed to publish notifications';
  END IF;
  PERFORM public.insert_notification(_user_id, _title, _body, _category, _link);
END; $$;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text) TO authenticated;

-- Behavior score changes: notify the student and their parents.
CREATE OR REPLACE FUNCTION public.notify_behavior_score_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  student_name text;
BEGIN
  SELECT concat(first_name, ' ', last_name) INTO student_name
    FROM public.students WHERE id = NEW.student_id;
  PERFORM public.notify_student_related(
    NEW.student_id,
    'Behavior score updated',
    format('A behavior score for %s was recorded: %s point(s).', COALESCE(student_name, 'your child'), NEW.score),
    'warning',
    '/scores'
  );
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS behavior_score_notify ON public.behavior_scores;
CREATE TRIGGER behavior_score_notify
  AFTER INSERT OR UPDATE OF score, category ON public.behavior_scores
  FOR EACH ROW EXECUTE FUNCTION public.notify_behavior_score_change();

-- Discipline incidents: notify the student and their parents.
CREATE OR REPLACE FUNCTION public.notify_discipline_incident()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  student_name text;
BEGIN
  SELECT concat(first_name, ' ', last_name) INTO student_name
    FROM public.students WHERE id = NEW.student_id;
  PERFORM public.notify_student_related(
    NEW.student_id,
    'Discipline incident reported',
    format('An incident was reported for %s: %s', COALESCE(student_name, 'your child'), NEW.description),
    'danger',
    '/discipline'
  );
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS discipline_incident_notify ON public.discipline_incidents;
CREATE TRIGGER discipline_incident_notify
  AFTER INSERT ON public.discipline_incidents
  FOR EACH ROW EXECUTE FUNCTION public.notify_discipline_incident();

-- Enrollment changes: notify the student and their parents.
CREATE OR REPLACE FUNCTION public.notify_enrollment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_student_related(
    NEW.student_id,
    'Enrollment updated',
    format('Your enrollment status is now %s.', NEW.status),
    'info',
    '/dashboard'
  );
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS enrollment_notify ON public.enrollments;
CREATE TRIGGER enrollment_notify
  AFTER UPDATE OF status ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.notify_enrollment_change();

-- Published announcements are broadcast to every user with an account.
CREATE OR REPLACE FUNCTION public.notify_announcement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  recipient uuid;
  should_publish boolean := NEW.is_published;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    should_publish := NEW.is_published AND NOT OLD.is_published;
  END IF;

  IF should_publish THEN
    FOR recipient IN SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL LOOP
      PERFORM public.insert_notification(
        recipient, NEW.title, COALESCE(NEW.body, ''), 'info', '/dashboard'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS announcement_notify ON public.announcements;
CREATE TRIGGER announcement_notify
  AFTER INSERT OR UPDATE OF is_published ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.notify_announcement();

-- Allow the bell menu to receive new notifications without a reload.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
