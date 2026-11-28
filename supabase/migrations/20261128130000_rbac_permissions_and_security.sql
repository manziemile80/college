-- =============================================================================
-- 20261128130000_rbac_permissions_and_security.sql
--
-- Canonical RBAC catalogue, certificate requests, notifications, server-side
-- quiz grading, hardened helper functions and RLS corrections.
--
-- This migration is idempotent and non-destructive:
--   * tables / columns / constraints / indexes are created only when missing
--   * every policy is DROPped IF EXISTS before being recreated
--   * every function is CREATE OR REPLACEd
--   * no table is dropped and no business data is deleted
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Enum safety (all role values exist in earlier migrations; this is a guard)
-- -----------------------------------------------------------------------------
DO $enum$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'parent', 'student', 'viewer', 'stock_manager', 'dos', 'dod');
  END IF;
END
$enum$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'teacher';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'parent';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'student';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'stock_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'storekeeper';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dos';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dod';

-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- 1.1 public.permissions (canonical catalogue; mirrors src/lib/permissions.ts)
CREATE TABLE IF NOT EXISTS public.permissions (
  key         text PRIMARY KEY,
  module      text NOT NULL,
  description text
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

INSERT INTO public.permissions (key, module, description) VALUES
  ('dashboard.view',              'dashboard',     'View the dashboard'),
  ('profile.view',                'profile',       'View own profile'),
  ('profile.update',              'profile',       'Update own profile'),
  ('students.view',               'students',      'View students in scope'),
  ('students.view_all',           'students',      'View all student records'),
  ('students.manage',             'students',      'Create, update and remove students'),
  ('students.link',               'students',      'Link students to user accounts and parents'),
  ('classes.view',                'classes',       'View classes'),
  ('classes.manage',              'classes',       'Create, update and remove classes'),
  ('subjects.view',               'subjects',      'View subjects'),
  ('subjects.manage',             'subjects',      'Create, update and remove subjects'),
  ('enrollment.view',             'enrollment',    'View enrollments'),
  ('enrollment.manage',           'enrollment',    'Manage enrollments'),
  ('marks.view',                  'marks',         'View marks'),
  ('marks.enter',                 'marks',         'Record marks'),
  ('marks.review',                'marks',         'Review marks'),
  ('marks.publish',               'marks',         'Publish / finalise marks'),
  ('attendance.view',             'attendance',    'View attendance'),
  ('attendance.manage',           'attendance',    'Record and edit attendance'),
  ('reports.academic.view',       'reports',       'View academic reports'),
  ('reports.academic.generate',   'reports',       'Generate academic reports'),
  ('reports.class.view',          'reports',       'View class reports'),
  ('reports.behavior.view',       'reports',       'View behaviour reports'),
  ('reports.discipline.view',     'reports',       'View discipline reports'),
  ('results.annual.view',         'results',       'View annual results'),
  ('discipline.view',             'discipline',    'View discipline incidents'),
  ('discipline.manage',           'discipline',    'Report and manage discipline incidents'),
  ('discipline.review',           'discipline',    'Review discipline incidents'),
  ('scores.behavior.view',        'scores',        'View behaviour scores'),
  ('scores.behavior.manage',      'scores',        'Record and manage behaviour scores'),
  ('courses.view',                'courses',       'View courses'),
  ('courses.manage',              'courses',       'Create, update and remove courses'),
  ('materials.view',              'materials',     'View learning materials'),
  ('materials.manage',            'materials',     'Upload and manage learning materials'),
  ('assignments.view',            'assignments',   'View assignments'),
  ('assignments.manage',          'assignments',   'Create and grade assignments'),
  ('assignments.submit',          'assignments',   'Submit assignments'),
  ('quizzes.view',                'quizzes',       'View quizzes'),
  ('quizzes.manage',              'quizzes',       'Create and manage quizzes'),
  ('quizzes.take',                'quizzes',       'Take quizzes'),
  ('teacher.feedback.view',       'teacher',       'View teacher feedback'),
  ('certificates.request',        'certificates',  'Request certificates'),
  ('certificates.view',           'certificates',  'View certificates and requests'),
  ('certificates.approve',        'certificates',  'Approve or reject certificate requests'),
  ('announcements.view',          'announcements', 'View announcements'),
  ('announcements.manage',        'announcements', 'Publish and manage announcements'),
  ('notifications.view',          'notifications', 'View in-app notifications'),
  ('academic.calendar.manage',    'academic',      'Manage the academic calendar'),
  ('exam.schedule.manage',        'exam',          'Manage exam schedules'),
  ('stock.view',                  'stock',         'View stock items and movements'),
  ('stock.manage',                'stock',         'Manage stock items and movements'),
  ('stock.reports',               'stock',         'View stock reports'),
  ('users.view',                  'users',         'View user accounts'),
  ('users.manage',                'users',         'Manage user accounts'),
  ('roles.manage',                'roles',         'Assign and remove user roles'),
  ('permissions.manage',          'permissions',   'Change role permission mappings'),
  ('audit.view',                  'audit',         'View the audit log'),
  ('settings.manage',             'settings',      'Change system settings')
ON CONFLICT (key) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description;

-- 1.2 public.role_permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role           public.app_role NOT NULL,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_key)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Seed admin with the complete catalogue (admin === every permission).
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin'::public.app_role, p.key FROM public.permissions p
ON CONFLICT (role, permission_key) DO NOTHING;

-- Seed the exact defaults from DEFAULT_ROLE_PERMISSIONS for the other roles.
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('teacher','dashboard.view'), ('teacher','profile.view'), ('teacher','profile.update'),
  ('teacher','students.view'), ('teacher','classes.view'), ('teacher','subjects.view'),
  ('teacher','marks.view'), ('teacher','marks.enter'), ('teacher','marks.review'),
  ('teacher','attendance.view'), ('teacher','attendance.manage'),
  ('teacher','reports.academic.view'), ('teacher','reports.academic.generate'),
  ('teacher','reports.class.view'), ('teacher','reports.behavior.view'), ('teacher','results.annual.view'),
  ('teacher','discipline.view'), ('teacher','scores.behavior.view'), ('teacher','scores.behavior.manage'),
  ('teacher','courses.view'), ('teacher','courses.manage'), ('teacher','materials.view'), ('teacher','materials.manage'),
  ('teacher','assignments.view'), ('teacher','assignments.manage'), ('teacher','quizzes.view'), ('teacher','quizzes.manage'),
  ('teacher','teacher.feedback.view'), ('teacher','announcements.view'), ('teacher','notifications.view'),

  ('student','dashboard.view'), ('student','profile.view'), ('student','profile.update'),
  ('student','students.view'), ('student','attendance.view'), ('student','results.annual.view'),
  ('student','reports.academic.view'), ('student','reports.behavior.view'),
  ('student','discipline.view'), ('student','scores.behavior.view'),
  ('student','courses.view'), ('student','materials.view'),
  ('student','assignments.view'), ('student','assignments.submit'),
  ('student','quizzes.view'), ('student','quizzes.take'),
  ('student','certificates.request'), ('student','certificates.view'),
  ('student','announcements.view'), ('student','notifications.view'),

  ('parent','dashboard.view'), ('parent','profile.view'), ('parent','profile.update'),
  ('parent','students.view'), ('parent','attendance.view'), ('parent','results.annual.view'),
  ('parent','reports.academic.view'), ('parent','reports.behavior.view'), ('parent','reports.discipline.view'),
  ('parent','discipline.view'), ('parent','scores.behavior.view'), ('parent','teacher.feedback.view'),
  ('parent','courses.view'), ('parent','materials.view'), ('parent','assignments.view'), ('parent','quizzes.view'),
  ('parent','certificates.view'), ('parent','announcements.view'), ('parent','notifications.view'),

  ('stock_manager','dashboard.view'), ('stock_manager','profile.view'), ('stock_manager','profile.update'),
  ('stock_manager','stock.view'), ('stock_manager','stock.manage'), ('stock_manager','stock.reports'),
  ('stock_manager','announcements.view'), ('stock_manager','notifications.view'),

  ('storekeeper','dashboard.view'), ('storekeeper','profile.view'), ('storekeeper','profile.update'),
  ('storekeeper','stock.view'), ('storekeeper','stock.manage'), ('storekeeper','stock.reports'),
  ('storekeeper','announcements.view'), ('storekeeper','notifications.view'),

  ('dos','dashboard.view'), ('dos','profile.view'), ('dos','profile.update'),
  ('dos','students.view'), ('dos','students.view_all'), ('dos','students.manage'), ('dos','students.link'),
  ('dos','classes.view'), ('dos','classes.manage'), ('dos','subjects.view'), ('dos','subjects.manage'),
  ('dos','enrollment.view'), ('dos','enrollment.manage'),
  ('dos','marks.view'), ('dos','marks.review'), ('dos','marks.publish'),
  ('dos','attendance.view'), ('dos','reports.academic.view'), ('dos','reports.academic.generate'),
  ('dos','reports.class.view'), ('dos','reports.behavior.view'), ('dos','results.annual.view'),
  ('dos','academic.calendar.manage'), ('dos','exam.schedule.manage'),
  ('dos','courses.view'), ('dos','courses.manage'), ('dos','materials.view'), ('dos','materials.manage'),
  ('dos','assignments.view'), ('dos','assignments.manage'), ('dos','quizzes.view'), ('dos','quizzes.manage'),
  ('dos','certificates.approve'), ('dos','certificates.view'), ('dos','audit.view'),
  ('dos','announcements.view'), ('dos','announcements.manage'), ('dos','notifications.view'),

  ('dod','dashboard.view'), ('dod','profile.view'), ('dod','profile.update'),
  ('dod','students.view'), ('dod','discipline.view'), ('dod','discipline.manage'), ('dod','discipline.review'),
  ('dod','reports.discipline.view'), ('dod','scores.behavior.view'), ('dod','scores.behavior.manage'),
  ('dod','certificates.view'), ('dod','announcements.view'), ('dod','notifications.view'),

  ('viewer','dashboard.view'), ('viewer','profile.view'), ('viewer','profile.update'),
  ('viewer','students.view'), ('viewer','classes.view'), ('viewer','subjects.view'),
  ('viewer','reports.academic.view'), ('viewer','reports.class.view'), ('viewer','reports.behavior.view'),
  ('viewer','announcements.view'), ('viewer','notifications.view')
ON CONFLICT (role, permission_key) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated view permissions" ON public.permissions;
CREATE POLICY "Authenticated view permissions" ON public.permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage permissions catalogue" ON public.permissions;
CREATE POLICY "Admins manage permissions catalogue" ON public.permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated view role permissions" ON public.role_permissions;
CREATE POLICY "Authenticated view role permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage role permissions" ON public.role_permissions;
CREATE POLICY "Admins manage role permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
GRANT ALL ON public.role_permissions TO service_role;

-- 1.3 public.certificate_requests
CREATE TABLE IF NOT EXISTS public.certificate_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  request_type text NOT NULL,
  reason      text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  requested_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certificate_requests_student ON public.certificate_requests(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_certificate_requests_status ON public.certificate_requests(status);

ALTER TABLE public.certificate_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificate_requests TO authenticated;
GRANT ALL ON public.certificate_requests TO service_role;

DROP TRIGGER IF EXISTS update_certificate_requests_updated_at ON public.certificate_requests;
CREATE TRIGGER update_certificate_requests_updated_at
  BEFORE UPDATE ON public.certificate_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 1.4 public.notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role,
  title      text NOT NULL,
  body       text NOT NULL,
  kind       text NOT NULL DEFAULT 'info',
  entity     text,
  entity_id  uuid,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_role_created ON public.notifications(role, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- Guard against clients changing anything except is_read (RLS cannot do column checks).
CREATE OR REPLACE FUNCTION public.enforce_notification_update_acl()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF (to_jsonb(NEW) - 'is_read') IS DISTINCT FROM (to_jsonb(OLD) - 'is_read')
     AND NOT (
       auth.uid() IS NULL
       OR public.has_role(auth.uid(), 'admin')
     ) THEN
    RAISE EXCEPTION 'only is_read may be updated on a notification';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS notifications_read_only_fields ON public.notifications;
CREATE TRIGGER notifications_read_only_fields
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_notification_update_acl();

REVOKE ALL ON FUNCTION public.enforce_notification_update_acl() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 2. HELPER FUNCTIONS (RBAC)
-- All are SECURITY DEFINER with a hardened search_path and no anon/PUBLIC EXECUTE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS SETOF public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = _user_id
$fn$;

CREATE OR REPLACE FUNCTION public.current_user_permissions()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT DISTINCT rp.permission_key
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role = ur.role
  WHERE ur.user_id = auth.uid()
$fn$;

CREATE OR REPLACE FUNCTION public.get_all_permissions()
RETURNS TABLE (key text, module text, description text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT p.key, p.module, p.description FROM public.permissions p ORDER BY p.key
$fn$;

CREATE OR REPLACE FUNCTION public.get_role_permissions(_role public.app_role)
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT rp.permission_key FROM public.role_permissions rp WHERE rp.role = _role ORDER BY rp.permission_key
$fn$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.permission_key = _permission
  )
$fn$;

CREATE OR REPLACE FUNCTION public.set_role_permissions(_role public.app_role, _permissions text[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_list text[] := COALESCE(_permissions, ARRAY[]::text[]);
  v_bad  text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT p INTO v_bad
  FROM unnest(v_list) AS p
  WHERE NOT EXISTS (SELECT 1 FROM public.permissions perm WHERE perm.key = p)
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'unknown permission key: %', v_bad;
  END IF;

  DELETE FROM public.role_permissions rp WHERE rp.role = _role;

  INSERT INTO public.role_permissions (role, permission_key)
  SELECT _role, DISTINCT_KEY
  FROM (SELECT DISTINCT unnest(v_list) AS DISTINCT_KEY) s
  ON CONFLICT (role, permission_key) DO NOTHING;

  PERFORM public.log_audit(
    'set_role_permissions', 'role_permissions', NULL,
    jsonb_build_object('role', _role, 'permissions', to_jsonb(v_list))
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_user_roles(_user_id uuid, _roles public.app_role[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_roles public.app_role[] := COALESCE(_roles, ARRAY[]::public.app_role[]);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- An admin may never strip their own admin role (prevents self-lockout).
  IF _user_id = auth.uid()
     AND public.has_role(auth.uid(), 'admin')
     AND NOT ('admin'::public.app_role = ANY (v_roles)) THEN
    RAISE EXCEPTION 'an admin cannot remove their own admin role';
  END IF;

  DELETE FROM public.user_roles ur WHERE ur.user_id = _user_id;

  INSERT INTO public.user_roles (user_id, role)
  SELECT _user_id, r FROM (SELECT DISTINCT unnest(v_roles) AS r) s
  ON CONFLICT (user_id, role) DO NOTHING;

  PERFORM public.log_audit(
    'set_user_roles', 'user_roles', NULL,
    jsonb_build_object('user_id', _user_id, 'roles', to_jsonb(v_roles))
  );
END;
$fn$;

-- -----------------------------------------------------------------------------
-- Teacher-scope helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_teacher_of_class(_user_id uuid, _class_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT _class_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.classes c WHERE c.id = _class_id AND c.teacher_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.class_id = _class_id AND cs.teacher_id = _user_id)
  )
$fn$;

CREATE OR REPLACE FUNCTION public.is_teacher_of_subject(_user_id uuid, _subject_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT _subject_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.subject_id = _subject_id AND cs.teacher_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.courses c WHERE c.subject_id = _subject_id AND c.teacher_id = _user_id)
  )
$fn$;

CREATE OR REPLACE FUNCTION public.is_teacher_of_student(_user_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT _student_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = _student_id
      AND (
        public.is_teacher_of_class(_user_id, s.class_id)
        OR EXISTS (
          SELECT 1
          FROM public.enrollments e
          WHERE e.student_id = s.id
            AND e.status = 'active'
            AND public.is_teacher_of_class(_user_id, e.class_id)
        )
      )
  )
$fn$;

CREATE OR REPLACE FUNCTION public.is_linked_parent(_user_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT _user_id IS NOT NULL AND _student_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.parents p
    JOIN public.student_parents sp ON sp.parent_id = p.id
    WHERE p.user_id = _user_id AND sp.student_id = _student_id
  )
$fn$;

-- -----------------------------------------------------------------------------
-- Hardening of pre-existing role helpers
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_parent_student_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_current_student_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_parent_student_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_student_id(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.current_user_permissions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_all_permissions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_role_permissions(public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_role_permissions(public.app_role, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_user_roles(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_teacher_of_class(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_teacher_of_subject(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_teacher_of_student(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_linked_parent(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_role_permissions(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_role_permissions(public.app_role, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_roles(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_class(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_subject(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_student(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_linked_parent(uuid, uuid) TO authenticated;

-- =============================================================================
-- 3. NOTIFICATION RPCs (trigger-only; never callable by anon/authenticated)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_user(
  _user_id uuid, _title text, _body text,
  _kind text DEFAULT 'info', _entity text DEFAULT NULL, _entity_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, title, body, kind, entity, entity_id)
  VALUES (_user_id, _title, _body, COALESCE(_kind, 'info'), _entity, _entity_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notify_role(
  _role public.app_role, _title text, _body text,
  _kind text DEFAULT 'info', _entity text DEFAULT NULL, _entity_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF _role IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, role, title, body, kind, entity, entity_id)
  SELECT ur.user_id, _role, _title, _body, COALESCE(_kind, 'info'), _entity, _entity_id
  FROM public.user_roles ur
  WHERE ur.role = _role AND ur.user_id IS NOT NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notify_student_and_parents(
  _student_id uuid, _title text, _body text,
  _kind text DEFAULT 'info', _entity text DEFAULT NULL, _entity_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF _student_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, role, title, body, kind, entity, entity_id)
  SELECT s.user_id, 'student'::public.app_role, _title, _body, COALESCE(_kind, 'info'), _entity, _entity_id
  FROM public.students s
  WHERE s.id = _student_id AND s.user_id IS NOT NULL
  UNION ALL
  SELECT p.user_id, 'parent'::public.app_role, _title, _body, COALESCE(_kind, 'info'), _entity, _entity_id
  FROM public.student_parents sp
  JOIN public.parents p ON p.id = sp.parent_id
  WHERE sp.student_id = _student_id AND p.user_id IS NOT NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notify_class_students(
  _class_id uuid, _title text, _body text,
  _kind text DEFAULT 'info', _entity text DEFAULT NULL, _entity_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF _class_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, role, title, body, kind, entity, entity_id)
  SELECT DISTINCT s.user_id, 'student'::public.app_role, _title, _body, COALESCE(_kind, 'info'), _entity, _entity_id
  FROM public.students s
  WHERE s.user_id IS NOT NULL AND s.class_id = _class_id
  UNION
  SELECT DISTINCT s.user_id, 'student'::public.app_role, _title, _body, COALESCE(_kind, 'info'), _entity, _entity_id
  FROM public.enrollments e
  JOIN public.students s ON s.id = e.student_id
  WHERE e.class_id = _class_id AND e.status = 'active' AND s.user_id IS NOT NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_role(public.app_role, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_student_and_parents(uuid, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_class_students(uuid, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 4. CERTIFICATE REQUEST RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_certificate_request(_request_type text, _reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_student uuid := public.get_current_student_id(auth.uid());
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'no student profile is linked to this account';
  END IF;

  INSERT INTO public.certificate_requests (student_id, request_type, reason, requested_by)
  VALUES (v_student, _request_type, _reason, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.notify_role('dos', 'New certificate request',
    'A student has requested a certificate.', 'info', 'certificate_request', v_id);
  PERFORM public.notify_role('admin', 'New certificate request',
    'A student has requested a certificate.', 'info', 'certificate_request', v_id);
  PERFORM public.log_audit('certificate_request_created', 'certificate_requests', v_id,
    jsonb_build_object('student_id', v_student, 'request_type', _request_type));

  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.review_certificate_request(_request_id uuid, _status text, _note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_row public.certificate_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'dos') OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _status NOT IN ('pending','approved','rejected','completed') THEN
    RAISE EXCEPTION 'invalid certificate request status: %', _status;
  END IF;

  SELECT * INTO v_row FROM public.certificate_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'certificate request not found';
  END IF;

  UPDATE public.certificate_requests
  SET status = _status, reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = _note, updated_at = now()
  WHERE id = _request_id;

  PERFORM public.notify_student_and_parents(
    v_row.student_id,
    'Certificate request ' || _status,
    COALESCE(_note, 'Your certificate request is now ' || _status || '.'),
    'certificate', 'certificate_request', v_row.id
  );
  PERFORM public.log_audit('certificate_request_reviewed', 'certificate_requests', v_row.id,
    jsonb_build_object('status', _status, 'note', _note));
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_certificate_request(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_certificate_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_certificate_request(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_certificate_request(uuid, text, text) TO authenticated;

-- =============================================================================
-- 5. SERVER-SIDE QUIZ GRADING
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(_quiz_id uuid, _answers jsonb)
RETURNS TABLE (score numeric, total_points numeric, attempt_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_student   uuid := public.get_current_student_id(auth.uid());
  v_quiz      public.quizzes%ROWTYPE;
  v_question  record;
  v_answers   jsonb := COALESCE(_answers, '{}'::jsonb);
  v_score     numeric := 0;
  v_total     numeric := 0;
  v_first     timestamptz;
  v_attempt   uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'no student profile is linked to this account';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes q WHERE q.id = _quiz_id;
  IF NOT FOUND OR NOT v_quiz.is_published THEN
    RAISE EXCEPTION 'quiz is not available';
  END IF;

  -- Enrolment check when the quiz is class-scoped.
  IF v_quiz.class_id IS NOT NULL THEN
    IF NOT (
      EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.student_id = v_student AND e.class_id = v_quiz.class_id AND e.status = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id = v_student AND s.class_id = v_quiz.class_id
      )
    ) THEN
      RAISE EXCEPTION 'student is not enrolled in this quiz class';
    END IF;
  END IF;

  -- Time limit is measured from the student's first attempt.
  IF v_quiz.time_limit_minutes IS NOT NULL AND v_quiz.time_limit_minutes > 0 THEN
    SELECT MIN(qa.created_at) INTO v_first
    FROM public.quiz_attempts qa
    WHERE qa.quiz_id = _quiz_id AND qa.student_id = v_student;
    IF v_first IS NOT NULL
       AND now() > v_first + make_interval(mins => v_quiz.time_limit_minutes) THEN
      RAISE EXCEPTION 'quiz time limit exceeded';
    END IF;
  END IF;

  -- Grade strictly from the server-side answer key; never trust client scores.
  FOR v_question IN
    SELECT qq.id, qq.correct_option, qq.points
    FROM public.quiz_questions qq
    WHERE qq.quiz_id = _quiz_id
  LOOP
    v_total := v_total + COALESCE(v_question.points, 0);
    IF v_answers ->> v_question.id::text = v_question.correct_option THEN
      v_score := v_score + COALESCE(v_question.points, 0);
    END IF;
  END LOOP;

  INSERT INTO public.quiz_attempts (quiz_id, student_id, answers, score, total_points)
  VALUES (_quiz_id, v_student, v_answers, v_score, v_total)
  RETURNING id INTO v_attempt;

  PERFORM public.log_audit('quiz_attempt_submitted', 'quiz_attempts', v_attempt,
    jsonb_build_object('quiz_id', _quiz_id, 'student_id', v_student, 'score', v_score, 'total_points', v_total));

  RETURN QUERY SELECT v_score, v_total, v_attempt;
END;
$fn$;

REVOKE ALL ON FUNCTION public.submit_quiz_attempt(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, jsonb) TO authenticated;

-- Answer key RPC for staff only (base quiz_questions SELECT is revoked).
CREATE OR REPLACE FUNCTION public.get_quiz_answer_key(_quiz_id uuid)
RETURNS TABLE (question_id uuid, correct_option text, points numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT qq.id, qq.correct_option, qq.points
  FROM public.quiz_questions qq
  WHERE qq.quiz_id = _quiz_id
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'teacher')
      OR public.has_role(auth.uid(), 'dos')
    )
  ORDER BY qq.sort_order, qq.id
$fn$;

REVOKE ALL ON FUNCTION public.get_quiz_answer_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quiz_answer_key(uuid) TO authenticated;

-- =============================================================================
-- 6. HARDENED get_marks_by_reg_number
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_marks_by_reg_number(_reg text)
RETURNS TABLE (
  student_name text, class_name text, subject text, term public.school_term,
  academic_year text, cat_score numeric, exam_score numeric, total numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_academic_staff(auth.uid())
    OR public.is_dos(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE lower(trim(s.student_id)) = lower(trim(COALESCE(_reg, '')))
        AND s.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE lower(trim(s.student_id)) = lower(trim(COALESCE(_reg, '')))
        AND public.is_linked_parent(auth.uid(), s.id)
    )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    s.first_name || ' ' || s.last_name,
    c.name,
    sub.name,
    m.term,
    m.academic_year,
    m.cat_score,
    m.exam_score,
    m.cat_score + m.exam_score
  FROM public.students s
  LEFT JOIN public.classes c ON c.id = s.class_id
  JOIN public.marks m ON m.student_id = s.id
  JOIN public.subjects sub ON sub.id = m.subject_id
  WHERE lower(trim(s.student_id)) = lower(trim(COALESCE(_reg, '')))
    AND length(trim(COALESCE(_reg, ''))) > 0
  ORDER BY m.academic_year DESC, m.term, sub.name;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_marks_by_reg_number(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_marks_by_reg_number(text) TO authenticated;

-- =============================================================================
-- 7. SIGNUP TRIGGER: ALWAYS DEFAULT TO VIEWER
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email), NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  -- Never trust a client-supplied requested_role.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'viewer'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$fn$;

-- =============================================================================
-- 8. AUDIENCE HELPER FOR ANNOUNCEMENTS
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audience_visible(_audience text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_roles   public.app_role[];
  v_class   uuid;
BEGIN
  IF _audience IS NULL OR _audience = 'all' THEN
    RETURN true;
  END IF;

  v_roles := ARRAY(SELECT u FROM public.get_user_roles(auth.uid()) AS u);

  -- Accept plain role names and "role:<name>" audiences.
  IF _audience LIKE 'role:%' THEN
    RETURN split_part(_audience, ':', 2) = ANY (SELECT r::text FROM unnest(v_roles) AS r);
  END IF;
  IF _audience = ANY (SELECT r::text FROM unnest(v_roles) AS r) THEN
    RETURN true;
  END IF;

  IF _audience LIKE 'class:%' THEN
    BEGIN
      v_class := split_part(_audience, ':', 2)::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN false;
    END;
    RETURN v_class IN (SELECT public.get_current_user_class_ids());
  END IF;

  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION public.audience_visible(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audience_visible(text) TO authenticated;

-- =============================================================================
-- 9. AUDIT TRIGGER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_marks_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_action text := CASE TG_OP WHEN 'INSERT' THEN 'mark_insert' WHEN 'UPDATE' THEN 'mark_update' ELSE 'mark_delete' END;
  v_row jsonb;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(), v_action, 'marks',
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    jsonb_build_object(
      'operation', TG_OP,
      'student_id', v_row -> 'student_id',
      'subject_id', v_row -> 'subject_id',
      'teacher_id', v_row -> 'teacher_id',
      'cat_score', v_row -> 'cat_score',
      'exam_score', v_row -> 'exam_score'
    )
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.audit_stock_movement()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(), 'stock_movement', 'stock_movements', NEW.id,
    jsonb_build_object(
      'operation', 'INSERT',
      'item_id', NEW.item_id,
      'movement_type', NEW.movement_type,
      'quantity', NEW.quantity,
      'recorded_by', NEW.recorded_by
    )
  );
  RETURN NEW;
END;
$fn$;

-- Generic audit for stock_items / purchase_orders writes.
CREATE OR REPLACE FUNCTION public.audit_stock_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_id  uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(), lower(TG_TABLE_NAME) || '_' || lower(TG_OP), TG_TABLE_NAME, v_id,
    v_row || jsonb_build_object('operation', TG_OP)
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.audit_discipline_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_row jsonb := to_jsonb(NEW);
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(),
    CASE TG_OP WHEN 'INSERT' THEN 'discipline_incident_created' ELSE 'discipline_incident_updated' END,
    'discipline_incidents', NEW.id,
    jsonb_build_object(
      'operation', TG_OP,
      'student_id', v_row -> 'student_id',
      'status', v_row -> 'status',
      'marks_deducted', v_row -> 'marks_deducted',
      'reported_by', v_row -> 'reported_by'
    )
  );
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_row    jsonb;
  v_entity text;
  v_id     uuid;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_entity := TG_TABLE_NAME;
  v_id := NULL;

  IF TG_TABLE_NAME = 'user_roles' THEN
    v_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(), 'role_change', v_entity, v_id,
    v_row || jsonb_build_object('operation', TG_OP)
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.audit_marks_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_stock_movement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_stock_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_discipline_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_role_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_marks_insert_update_delete ON public.marks;
CREATE TRIGGER audit_marks_insert_update_delete
  AFTER INSERT OR UPDATE OR DELETE ON public.marks
  FOR EACH ROW EXECUTE FUNCTION public.audit_marks_changes();

DROP TRIGGER IF EXISTS audit_stock_movements_insert ON public.stock_movements;
CREATE TRIGGER audit_stock_movements_insert
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.audit_stock_movement();

DROP TRIGGER IF EXISTS audit_stock_items_writes ON public.stock_items;
CREATE TRIGGER audit_stock_items_writes
  AFTER INSERT OR UPDATE OR DELETE ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_stock_write();

DROP TRIGGER IF EXISTS audit_purchase_orders_writes ON public.purchase_orders;
CREATE TRIGGER audit_purchase_orders_writes
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_stock_write();

DROP TRIGGER IF EXISTS audit_discipline_incidents_changes ON public.discipline_incidents;
CREATE TRIGGER audit_discipline_incidents_changes
  AFTER INSERT OR UPDATE ON public.discipline_incidents
  FOR EACH ROW EXECUTE FUNCTION public.audit_discipline_changes();

DROP TRIGGER IF EXISTS audit_user_roles_changes ON public.user_roles;
CREATE TRIGGER audit_user_roles_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_role_changes();

DROP TRIGGER IF EXISTS audit_role_permissions_changes ON public.role_permissions;
CREATE TRIGGER audit_role_permissions_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_role_changes();

-- =============================================================================
-- 10. NOTIFICATION TRIGGER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_marks_inserted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NEW.student_id IS NOT NULL THEN
    PERFORM public.notify_student_and_parents(
      NEW.student_id, 'New marks recorded',
      'New marks have been recorded for your student.',
      'marks', 'marks', NEW.id
    );
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notify_low_stock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_qty   numeric;
  v_min   numeric;
  v_name  text;
BEGIN
  IF NEW.item_id IS NULL THEN RETURN NEW; END IF;

  SELECT si.quantity, si.min_quantity, si.name
  INTO v_qty, v_min, v_name
  FROM public.stock_items si WHERE si.id = NEW.item_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Compute the resulting quantity ourselves: trigger order is not guaranteed
  -- relative to the existing stock_movements_apply trigger.
  IF NEW.movement_type = 'in' THEN
    v_qty := v_qty + NEW.quantity;
  ELSE
    v_qty := GREATEST(v_qty - NEW.quantity, 0);
  END IF;

  IF v_qty <= COALESCE(v_min, 0) THEN
    PERFORM public.notify_role(
      'stock_manager', 'Low stock alert',
      COALESCE(v_name, 'An item') || ' is at or below its minimum quantity.',
      'stock', 'stock_item', NEW.item_id
    );
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notify_discipline_logged()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  PERFORM public.notify_role(
    'dod', 'New discipline incident',
    'A new discipline incident has been reported and awaits review.',
    'discipline', 'discipline_incident', NEW.id
  );
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notify_announcement_published()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  IF NOT NEW.is_published OR NEW.audience IS NULL THEN RETURN NEW; END IF;

  IF NEW.audience = 'all' THEN
    FOR r IN SELECT unnest(ARRAY[
      'admin'::public.app_role, 'teacher'::public.app_role, 'parent'::public.app_role,
      'student'::public.app_role, 'viewer'::public.app_role, 'stock_manager'::public.app_role,
      'dos'::public.app_role, 'dod'::public.app_role
    ]) AS role LOOP
      PERFORM public.notify_role(r.role, NEW.title, NEW.body, 'announcement', 'announcement', NEW.id);
    END LOOP;
  ELSIF NEW.audience LIKE 'role:%' OR NEW.audience NOT LIKE 'class:%' THEN
    BEGIN
      PERFORM public.notify_role(
        replace(NEW.audience, 'role:', '')::public.app_role,
        NEW.title, NEW.body, 'announcement', 'announcement', NEW.id
      );
    EXCEPTION WHEN invalid_text_representation THEN
      NULL; -- unknown audience value: skip notification
    END;
  END IF;
  -- class:<id> audiences are delivered by the class-scoped feed / read policy.
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notify_class_content_published()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_class   uuid;
  v_title   text;
  v_entity  text;
BEGIN
  IF TG_TABLE_NAME = 'assignments' THEN
    IF NOT NEW.is_published THEN RETURN NEW; END IF;
    v_class := NEW.class_id;
    v_title := NEW.title;
    v_entity := 'assignment';
  ELSE
    IF NOT NEW.is_published THEN RETURN NEW; END IF;
    v_class := NEW.class_id;
    v_title := NEW.title;
    v_entity := 'quiz';
  END IF;

  IF v_class IS NOT NULL THEN
    PERFORM public.notify_class_students(
      v_class, v_title, 'New ' || v_entity || ' published: ' || v_title,
      v_entity, v_entity, NEW.id
    );
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notify_marks_inserted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_low_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_discipline_logged() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_announcement_published() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_class_content_published() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_new_marks ON public.marks;
CREATE TRIGGER notify_new_marks
  AFTER INSERT ON public.marks
  FOR EACH ROW EXECUTE FUNCTION public.notify_marks_inserted();

DROP TRIGGER IF EXISTS notify_stock_low ON public.stock_movements;
CREATE TRIGGER notify_stock_low
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.notify_low_stock();

DROP TRIGGER IF EXISTS notify_discipline_incident ON public.discipline_incidents;
CREATE TRIGGER notify_discipline_incident
  AFTER INSERT ON public.discipline_incidents
  FOR EACH ROW EXECUTE FUNCTION public.notify_discipline_logged();

DROP TRIGGER IF EXISTS notify_announcement ON public.announcements;
CREATE TRIGGER notify_announcement
  AFTER INSERT ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.notify_announcement_published();

DROP TRIGGER IF EXISTS notify_new_assignment ON public.assignments;
CREATE TRIGGER notify_new_assignment
  AFTER INSERT ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_class_content_published();

DROP TRIGGER IF EXISTS notify_new_quiz ON public.quizzes;
CREATE TRIGGER notify_new_quiz
  AFTER INSERT ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public.notify_class_content_published();

-- =============================================================================
-- 11. RLS CORRECTIONS
-- =============================================================================

-- 11.1 students -----------------------------------------------------------------
DROP POLICY IF EXISTS "Students browse unclaimed records" ON public.students;
DROP POLICY IF EXISTS "Students claim unclaimed record" ON public.students;
DROP POLICY IF EXISTS "Students create own record" ON public.students;
DROP POLICY IF EXISTS "Staff can view all students" ON public.students;
DROP POLICY IF EXISTS "Teachers can update students" ON public.students;
DROP POLICY IF EXISTS "Teachers can insert students" ON public.students;
DROP POLICY IF EXISTS "Teachers can delete students" ON public.students;
DROP POLICY IF EXISTS "Students view own record" ON public.students;
DROP POLICY IF EXISTS "Parents can view their children" ON public.students;
DROP POLICY IF EXISTS "Viewers can view students" ON public.students;
DROP POLICY IF EXISTS "Admins can manage students" ON public.students;
DROP POLICY IF EXISTS "DOS views students" ON public.students;
DROP POLICY IF EXISTS "DOS manages students" ON public.students;

CREATE POLICY "Admins can manage students" ON public.students
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages students" ON public.students
  FOR ALL TO authenticated
  USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Teachers view assigned students" ON public.students
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND public.is_teacher_of_student(auth.uid(), id));
CREATE POLICY "Teachers update assigned students" ON public.students
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND public.is_teacher_of_student(auth.uid(), id))
  WITH CHECK (public.has_role(auth.uid(), 'teacher') AND public.is_teacher_of_student(auth.uid(), id));
CREATE POLICY "Students view own record" ON public.students
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Parents can view their children" ON public.students
  FOR SELECT TO authenticated USING (id IN (SELECT public.get_parent_student_ids(auth.uid())));
CREATE POLICY "Viewers can view students" ON public.students
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));

-- 11.2 classes ------------------------------------------------------------------
DROP POLICY IF EXISTS "Teachers and admins can view classes" ON public.classes;
DROP POLICY IF EXISTS "Teachers can update classes" ON public.classes;
DROP POLICY IF EXISTS "Teachers can insert classes" ON public.classes;
DROP POLICY IF EXISTS "Teachers can delete classes" ON public.classes;
DROP POLICY IF EXISTS "Students view classes" ON public.classes;
DROP POLICY IF EXISTS "Viewers can view classes" ON public.classes;
DROP POLICY IF EXISTS "Admins can manage classes" ON public.classes;
DROP POLICY IF EXISTS "DOS views classes" ON public.classes;
DROP POLICY IF EXISTS "DOS manages classes" ON public.classes;

CREATE POLICY "Admins can manage classes" ON public.classes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages classes" ON public.classes
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Teachers view assigned classes" ON public.classes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND public.is_teacher_of_class(auth.uid(), id));
CREATE POLICY "Students view enrolled classes" ON public.classes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'student') AND id IN (SELECT public.get_current_user_class_ids()));
CREATE POLICY "Parents view child classes" ON public.classes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'parent') AND id IN (SELECT public.get_current_user_class_ids()));
CREATE POLICY "Viewers can view classes" ON public.classes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));

-- 11.3 class_subjects -----------------------------------------------------------
-- The D2 policy "Staff and families view relevant class subjects" is kept.
DROP POLICY IF EXISTS "Admins manage class_subjects" ON public.class_subjects;
DROP POLICY IF EXISTS "DOS manages class subjects" ON public.class_subjects;
DROP POLICY IF EXISTS "Teachers view assigned class subjects" ON public.class_subjects;

CREATE POLICY "Admins manage class_subjects" ON public.class_subjects
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages class subjects" ON public.class_subjects
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Teachers view assigned class subjects" ON public.class_subjects
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND public.is_teacher_of_class(auth.uid(), class_id));

-- 11.4 marks --------------------------------------------------------------------
DROP POLICY IF EXISTS "Teachers view all marks" ON public.marks;
DROP POLICY IF EXISTS "Teachers insert marks" ON public.marks;
DROP POLICY IF EXISTS "Teachers update marks" ON public.marks;
DROP POLICY IF EXISTS "Teachers delete marks" ON public.marks;
DROP POLICY IF EXISTS "Teachers update own marks" ON public.marks;
DROP POLICY IF EXISTS "Teachers delete own marks" ON public.marks;
DROP POLICY IF EXISTS "Admins manage all marks" ON public.marks;
DROP POLICY IF EXISTS "Parents view their children marks" ON public.marks;
DROP POLICY IF EXISTS "Viewers can view marks" ON public.marks;
DROP POLICY IF EXISTS "Students view own marks" ON public.marks;
DROP POLICY IF EXISTS "DOS views marks" ON public.marks;
DROP POLICY IF EXISTS "DOS manages marks" ON public.marks;

CREATE POLICY "Admins manage all marks" ON public.marks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS views marks" ON public.marks
  FOR SELECT TO authenticated USING (public.is_dos(auth.uid()));
CREATE POLICY "DOS reviews marks" ON public.marks
  FOR UPDATE TO authenticated
  USING (public.is_dos(auth.uid()))
  WITH CHECK (
    public.is_dos(auth.uid())
    AND teacher_id = (SELECT m2.teacher_id FROM public.marks m2 WHERE m2.id = marks.id)
  );
CREATE POLICY "Teachers view assigned marks" ON public.marks
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND (public.is_teacher_of_student(auth.uid(), student_id) OR teacher_id = auth.uid())
  );
CREATE POLICY "Teachers insert marks" ON public.marks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    AND teacher_id = auth.uid()
    AND public.is_teacher_of_subject(auth.uid(), subject_id)
    AND public.is_teacher_of_student(auth.uid(), student_id)
  );
CREATE POLICY "Teachers update own marks" ON public.marks
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND teacher_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'teacher') AND teacher_id = auth.uid());
CREATE POLICY "Teachers delete own marks" ON public.marks
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND teacher_id = auth.uid());
CREATE POLICY "Parents view their children marks" ON public.marks
  FOR SELECT TO authenticated USING (student_id IN (SELECT public.get_parent_student_ids(auth.uid())));
CREATE POLICY "Students view own marks" ON public.marks
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = marks.student_id AND s.user_id = auth.uid()));
CREATE POLICY "Viewers can view marks" ON public.marks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));

-- 11.5 attendance ---------------------------------------------------------------
DROP POLICY IF EXISTS "Teachers manage attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admins manage attendance" ON public.attendance;
DROP POLICY IF EXISTS "DOS manages attendance" ON public.attendance;
DROP POLICY IF EXISTS "Parents view their children attendance" ON public.attendance;
DROP POLICY IF EXISTS "Viewers view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Students view own attendance" ON public.attendance;

CREATE POLICY "Admins manage attendance" ON public.attendance
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages attendance" ON public.attendance
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Teachers insert attendance" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    AND recorded_by = auth.uid()
    AND public.is_teacher_of_class(auth.uid(), class_id)
  );
CREATE POLICY "Teachers update attendance" ON public.attendance
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND recorded_by = auth.uid()
    AND public.is_teacher_of_class(auth.uid(), class_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    AND recorded_by = auth.uid()
    AND public.is_teacher_of_class(auth.uid(), class_id)
  );
CREATE POLICY "Teachers delete attendance" ON public.attendance
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND recorded_by = auth.uid()
    AND public.is_teacher_of_class(auth.uid(), class_id)
  );
CREATE POLICY "Parents view their children attendance" ON public.attendance
  FOR SELECT TO authenticated USING (student_id IN (SELECT public.get_parent_student_ids(auth.uid())));
CREATE POLICY "Students view own attendance" ON public.attendance
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = attendance.student_id AND s.user_id = auth.uid()));
CREATE POLICY "Viewers view attendance" ON public.attendance
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));

-- 11.6 parents ------------------------------------------------------------------
DROP POLICY IF EXISTS "Teachers can add parents" ON public.parents;
DROP POLICY IF EXISTS "Teachers can view parents" ON public.parents;
DROP POLICY IF EXISTS "Viewers view parents" ON public.parents;
DROP POLICY IF EXISTS "Parents can view their own record" ON public.parents;
DROP POLICY IF EXISTS "Parents can update their own record" ON public.parents;
DROP POLICY IF EXISTS "Admins can manage parents" ON public.parents;
DROP POLICY IF EXISTS "DOS manages parents" ON public.parents;

CREATE POLICY "Admins can manage parents" ON public.parents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages parents" ON public.parents
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Parents can view their own record" ON public.parents
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Parents can update their own record" ON public.parents
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Teachers view parents of their students" ON public.parents
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND EXISTS (
      SELECT 1
      FROM public.student_parents sp
      JOIN public.students s ON s.id = sp.student_id
      WHERE sp.parent_id = parents.id AND public.is_teacher_of_student(auth.uid(), s.id)
    )
  );

-- 11.7 student_parents ----------------------------------------------------------
DROP POLICY IF EXISTS "Teachers can manage student-parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Admins can manage student-parent links" ON public.student_parents;
DROP POLICY IF EXISTS "Parents can view their own links" ON public.student_parents;
DROP POLICY IF EXISTS "DOS manages student-parent links" ON public.student_parents;

CREATE POLICY "Admins can manage student-parent links" ON public.student_parents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages student-parent links" ON public.student_parents
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Teachers manage links for their students" ON public.student_parents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND public.is_teacher_of_student(auth.uid(), student_id))
  WITH CHECK (public.has_role(auth.uid(), 'teacher') AND public.is_teacher_of_student(auth.uid(), student_id));
CREATE POLICY "Parents can view their own links" ON public.student_parents
  FOR SELECT TO authenticated
  USING (parent_id IN (SELECT id FROM public.parents WHERE user_id = auth.uid()));

-- 11.8 behavior_scores ----------------------------------------------------------
DROP POLICY IF EXISTS "Teachers can manage behavior scores" ON public.behavior_scores;
DROP POLICY IF EXISTS "Teachers can view all behavior scores" ON public.behavior_scores;
DROP POLICY IF EXISTS "Admins can view all behavior scores" ON public.behavior_scores;
DROP POLICY IF EXISTS "Admins can manage all behavior scores" ON public.behavior_scores;
DROP POLICY IF EXISTS "Parents can view their children's scores" ON public.behavior_scores;
DROP POLICY IF EXISTS "Students view own behavior scores" ON public.behavior_scores;
DROP POLICY IF EXISTS "DOS views behavior scores" ON public.behavior_scores;
DROP POLICY IF EXISTS "DOD manages behavior scores" ON public.behavior_scores;
DROP POLICY IF EXISTS "Viewers can view behavior scores" ON public.behavior_scores;

CREATE POLICY "Admins can manage all behavior scores" ON public.behavior_scores
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS views behavior scores" ON public.behavior_scores
  FOR SELECT TO authenticated USING (public.is_dos(auth.uid()));
CREATE POLICY "DOD manages behavior scores" ON public.behavior_scores
  FOR ALL TO authenticated USING (public.is_dod(auth.uid())) WITH CHECK (public.is_dod(auth.uid()));
CREATE POLICY "Teachers view assigned behavior scores" ON public.behavior_scores
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND (teacher_id = auth.uid() OR public.is_teacher_of_student(auth.uid(), student_id))
  );
CREATE POLICY "Teachers insert behavior scores" ON public.behavior_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    AND teacher_id = auth.uid()
    AND public.is_teacher_of_student(auth.uid(), student_id)
  );
CREATE POLICY "Teachers update own behavior scores" ON public.behavior_scores
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND teacher_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'teacher') AND teacher_id = auth.uid());
CREATE POLICY "Teachers delete own behavior scores" ON public.behavior_scores
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND teacher_id = auth.uid());
CREATE POLICY "Parents can view their children's scores" ON public.behavior_scores
  FOR SELECT TO authenticated USING (student_id IN (SELECT public.get_parent_student_ids(auth.uid())));
CREATE POLICY "Students view own behavior scores" ON public.behavior_scores
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = behavior_scores.student_id AND s.user_id = auth.uid()));
CREATE POLICY "Viewers can view behavior scores" ON public.behavior_scores
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));

-- 11.9 discipline_incidents -----------------------------------------------------
DROP POLICY IF EXISTS "Staff view all incidents" ON public.discipline_incidents;
DROP POLICY IF EXISTS "Teachers report incidents" ON public.discipline_incidents;
DROP POLICY IF EXISTS "DOD and admins review incidents" ON public.discipline_incidents;
DROP POLICY IF EXISTS "Parents view children incidents" ON public.discipline_incidents;
DROP POLICY IF EXISTS "Students view own incidents" ON public.discipline_incidents;
DROP POLICY IF EXISTS "Admins manage incidents" ON public.discipline_incidents;
DROP POLICY IF EXISTS "DOD manages incidents" ON public.discipline_incidents;
DROP POLICY IF EXISTS "DOS views incidents" ON public.discipline_incidents;
DROP POLICY IF EXISTS "Teachers view incidents of their students" ON public.discipline_incidents;

CREATE POLICY "Admins manage incidents" ON public.discipline_incidents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOD manages incidents" ON public.discipline_incidents
  FOR ALL TO authenticated USING (public.is_dod(auth.uid())) WITH CHECK (public.is_dod(auth.uid()));
CREATE POLICY "DOS views incidents" ON public.discipline_incidents
  FOR SELECT TO authenticated USING (public.is_dos(auth.uid()));
CREATE POLICY "Teachers view incidents of their students" ON public.discipline_incidents
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND public.is_teacher_of_student(auth.uid(), student_id));
CREATE POLICY "Teachers report incidents" ON public.discipline_incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    AND reported_by = auth.uid()
    AND public.is_teacher_of_student(auth.uid(), student_id)
  );
CREATE POLICY "Parents view children incidents" ON public.discipline_incidents
  FOR SELECT TO authenticated USING (student_id IN (SELECT public.get_parent_student_ids(auth.uid())));
CREATE POLICY "Students view own incidents" ON public.discipline_incidents
  FOR SELECT TO authenticated
  USING (student_id = public.get_current_student_id(auth.uid()));

-- 11.10 report_remarks ----------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage report remarks" ON public.report_remarks;
DROP POLICY IF EXISTS "Teachers manage report remarks" ON public.report_remarks;
DROP POLICY IF EXISTS "Parents view their children remarks" ON public.report_remarks;
DROP POLICY IF EXISTS "Viewers view remarks" ON public.report_remarks;
DROP POLICY IF EXISTS "Students view own report remarks" ON public.report_remarks;
DROP POLICY IF EXISTS "DOS manages report remarks" ON public.report_remarks;

CREATE POLICY "Admins manage report remarks" ON public.report_remarks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages report remarks" ON public.report_remarks
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Teachers view assigned report remarks" ON public.report_remarks
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND public.is_teacher_of_student(auth.uid(), student_id));
CREATE POLICY "Teachers insert report remarks" ON public.report_remarks
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'teacher') AND public.is_teacher_of_student(auth.uid(), student_id));
CREATE POLICY "Teachers update class teacher remark" ON public.report_remarks
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND public.is_teacher_of_student(auth.uid(), student_id))
  WITH CHECK (public.has_role(auth.uid(), 'teacher') AND public.is_teacher_of_student(auth.uid(), student_id));
CREATE POLICY "Parents view their children remarks" ON public.report_remarks
  FOR SELECT TO authenticated USING (student_id IN (SELECT public.get_parent_student_ids(auth.uid())));
CREATE POLICY "Students view own report remarks" ON public.report_remarks
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = report_remarks.student_id AND s.user_id = auth.uid()));
CREATE POLICY "Viewers view remarks" ON public.report_remarks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));

-- principal_remark must not be editable by teachers (RLS cannot check columns).
CREATE OR REPLACE FUNCTION public.enforce_principal_remark_acl()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NEW.principal_remark IS DISTINCT FROM OLD.principal_remark
     AND auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(), 'admin') OR public.is_dos(auth.uid())) THEN
    RAISE EXCEPTION 'only an admin or DOS may edit principal_remark';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS report_remarks_principal_acl ON public.report_remarks;
CREATE TRIGGER report_remarks_principal_acl
  BEFORE UPDATE ON public.report_remarks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_principal_remark_acl();
REVOKE ALL ON FUNCTION public.enforce_principal_remark_acl() FROM PUBLIC, anon, authenticated;

-- 11.11 assignment_submissions --------------------------------------------------
DROP POLICY IF EXISTS "Staff manage submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Students view own submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Students create own submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Students update own submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Parents view child submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Admins manage submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "DOS grades submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Teachers manage submissions for their courses" ON public.assignment_submissions;

CREATE POLICY "Admins manage submissions" ON public.assignment_submissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS grades submissions" ON public.assignment_submissions
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Teachers manage submissions for their courses" ON public.assignment_submissions
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      LEFT JOIN public.courses c ON c.id = a.course_id
      WHERE a.id = assignment_submissions.assignment_id
        AND (
          a.created_by = auth.uid()
          OR (c.teacher_id = auth.uid())
          OR (a.class_id IS NOT NULL AND public.is_teacher_of_class(auth.uid(), a.class_id))
        )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      LEFT JOIN public.courses c ON c.id = a.course_id
      WHERE a.id = assignment_submissions.assignment_id
        AND (
          a.created_by = auth.uid()
          OR (c.teacher_id = auth.uid())
          OR (a.class_id IS NOT NULL AND public.is_teacher_of_class(auth.uid(), a.class_id))
        )
    )
  );
CREATE POLICY "Students view own submissions" ON public.assignment_submissions
  FOR SELECT TO authenticated
  USING (student_id = public.get_current_student_id(auth.uid()));
CREATE POLICY "Students create own submissions" ON public.assignment_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = public.get_current_student_id(auth.uid())
    AND graded_by IS NULL AND points_awarded IS NULL AND feedback IS NULL
  );
CREATE POLICY "Students update own submissions" ON public.assignment_submissions
  FOR UPDATE TO authenticated
  USING (student_id = public.get_current_student_id(auth.uid()) AND graded_by IS NULL)
  WITH CHECK (
    student_id = public.get_current_student_id(auth.uid())
    AND graded_by IS NULL AND points_awarded IS NULL AND feedback IS NULL
  );
CREATE POLICY "Parents view child submissions" ON public.assignment_submissions
  FOR SELECT TO authenticated USING (student_id IN (SELECT public.get_parent_student_ids(auth.uid())));

-- 11.12 quiz_questions (answer key hidden from direct SELECT) -------------------
DROP POLICY IF EXISTS "View questions of published quizzes" ON public.quiz_questions;
DROP VIEW IF EXISTS public.quiz_questions_public;

CREATE VIEW public.quiz_questions_public WITH (security_invoker = false) AS
SELECT
  qq.id, qq.quiz_id, qq.question_text, qq.option_a, qq.option_b,
  qq.option_c, qq.option_d, qq.points, qq.sort_order
FROM public.quiz_questions qq
WHERE EXISTS (
  SELECT 1 FROM public.quizzes q WHERE q.id = qq.quiz_id AND q.is_published
);

-- Staff-only view that includes the answer key (authorised authors/editors).
CREATE OR REPLACE VIEW public.quiz_questions_staff WITH (security_invoker = false) AS
SELECT qq.*
FROM public.quiz_questions qq
WHERE public.has_permission(auth.uid(), 'quizzes.manage');

REVOKE ALL ON public.quiz_questions_public FROM anon;
REVOKE ALL ON public.quiz_questions_staff FROM anon;
REVOKE SELECT ON public.quiz_questions FROM authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT SELECT ON public.quiz_questions_public TO authenticated;
GRANT SELECT ON public.quiz_questions_staff TO authenticated;
GRANT ALL ON public.quiz_questions_public TO service_role;
GRANT ALL ON public.quiz_questions_staff TO service_role;

-- 11.13 quiz_attempts -----------------------------------------------------------
DROP POLICY IF EXISTS "Students create own attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Students view own attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Parents view child attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Staff manage quiz attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Admins manage quiz attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "DOS manages quiz attempts" ON public.quiz_attempts;

CREATE POLICY "Admins manage quiz attempts" ON public.quiz_attempts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages quiz attempts" ON public.quiz_attempts
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Staff view quiz attempts" ON public.quiz_attempts
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Students view own attempts" ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (student_id = public.get_current_student_id(auth.uid()));
CREATE POLICY "Parents view child attempts" ON public.quiz_attempts
  FOR SELECT TO authenticated USING (student_id IN (SELECT public.get_parent_student_ids(auth.uid())));

-- 11.14 announcements -----------------------------------------------------------
DROP POLICY IF EXISTS "Signed-in users read announcements" ON public.announcements;
DROP POLICY IF EXISTS "Users read visible published announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "DOS manages announcements" ON public.announcements;

CREATE POLICY "Users read visible published announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (is_published = true AND public.audience_visible(audience));
CREATE POLICY "Admins manage announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages announcements" ON public.announcements
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));

-- 11.15 stock items / movements / purchase orders -------------------------------
DROP POLICY IF EXISTS "Staff view items" ON public.stock_items;
DROP POLICY IF EXISTS "Stock managers manage items" ON public.stock_items;
DROP POLICY IF EXISTS "Select stock items" ON public.stock_items;
DROP POLICY IF EXISTS "Staff view movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Stock managers manage movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Select stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Staff view purchase orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Stock managers manage purchase orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Select purchase orders" ON public.purchase_orders;

CREATE POLICY "Select stock items" ON public.stock_items
  FOR SELECT TO authenticated USING (public.can_manage_stock(auth.uid()));
CREATE POLICY "Stock managers manage items" ON public.stock_items
  FOR ALL TO authenticated
  USING (public.can_manage_stock(auth.uid())) WITH CHECK (public.can_manage_stock(auth.uid()));
CREATE POLICY "Select stock movements" ON public.stock_movements
  FOR SELECT TO authenticated USING (public.can_manage_stock(auth.uid()));
CREATE POLICY "Stock managers manage movements" ON public.stock_movements
  FOR ALL TO authenticated
  USING (public.can_manage_stock(auth.uid())) WITH CHECK (public.can_manage_stock(auth.uid()));
CREATE POLICY "Select purchase orders" ON public.purchase_orders
  FOR SELECT TO authenticated USING (public.can_manage_stock(auth.uid()));
CREATE POLICY "Stock managers manage purchase orders" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (public.can_manage_stock(auth.uid())) WITH CHECK (public.can_manage_stock(auth.uid()));

-- 11.16 notifications -----------------------------------------------------------
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users view role notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users mark own notification read" ON public.notifications;
DROP POLICY IF EXISTS "Admins manage notifications" ON public.notifications;

CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users view role notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    role IS NOT NULL
    AND role = ANY (ARRAY(SELECT u FROM public.get_user_roles(auth.uid()) AS u))
  );
CREATE POLICY "Users mark own notification read" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins manage notifications" ON public.notifications
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 11.17 certificate_requests ----------------------------------------------------
DROP POLICY IF EXISTS "Students insert own certificate requests" ON public.certificate_requests;
DROP POLICY IF EXISTS "Students view own certificate requests" ON public.certificate_requests;
DROP POLICY IF EXISTS "Parents view child certificate requests" ON public.certificate_requests;
DROP POLICY IF EXISTS "Teachers view certificate requests of their students" ON public.certificate_requests;
DROP POLICY IF EXISTS "DOS and admins manage certificate requests" ON public.certificate_requests;
DROP POLICY IF EXISTS "DOD views certificate requests" ON public.certificate_requests;

CREATE POLICY "Students insert own certificate requests" ON public.certificate_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
  );
CREATE POLICY "Students view own certificate requests" ON public.certificate_requests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid()));
CREATE POLICY "Parents view child certificate requests" ON public.certificate_requests
  FOR SELECT TO authenticated USING (student_id IN (SELECT public.get_parent_student_ids(auth.uid())));
CREATE POLICY "Teachers view certificate requests of their students" ON public.certificate_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND public.is_teacher_of_student(auth.uid(), student_id));
CREATE POLICY "DOS and admins manage certificate requests" ON public.certificate_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_dos(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_dos(auth.uid()));
CREATE POLICY "DOD views certificate requests" ON public.certificate_requests
  FOR SELECT TO authenticated USING (public.is_dod(auth.uid()));

-- 11.18 audit_logs --------------------------------------------------------------
DROP POLICY IF EXISTS "Admins view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "DOS views audit logs" ON public.audit_logs;
CREATE POLICY "Admins view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS views audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_dos(auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

-- 11.19 subjects (no teacher-owned column -> staff writes removed) --------------
DROP POLICY IF EXISTS "Teachers can add subjects" ON public.subjects;
DROP POLICY IF EXISTS "Teachers can update subjects" ON public.subjects;
DROP POLICY IF EXISTS "Teachers can delete subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins manage subjects" ON public.subjects;
DROP POLICY IF EXISTS "DOS manages subjects" ON public.subjects;

CREATE POLICY "Admins manage subjects" ON public.subjects
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages subjects" ON public.subjects
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));

-- 11.20 courses / lessons -------------------------------------------------------
DROP POLICY IF EXISTS "View published courses" ON public.courses;
DROP POLICY IF EXISTS "Staff manage courses" ON public.courses;
DROP POLICY IF EXISTS "Admins manage courses" ON public.courses;
DROP POLICY IF EXISTS "DOS manages courses" ON public.courses;
DROP POLICY IF EXISTS "Teachers manage own courses" ON public.courses;

CREATE POLICY "View published courses" ON public.courses
  FOR SELECT TO authenticated
  USING (
    is_published
    OR public.is_academic_staff(auth.uid())
    OR public.is_dos(auth.uid())
    OR (class_id IS NOT NULL AND class_id IN (SELECT public.get_current_user_class_ids()))
  );
CREATE POLICY "Admins manage courses" ON public.courses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages courses" ON public.courses
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Teachers manage own courses" ON public.courses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND teacher_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'teacher') AND teacher_id = auth.uid());

DROP POLICY IF EXISTS "Staff manage lessons" ON public.lessons;
DROP POLICY IF EXISTS "Admins manage lessons" ON public.lessons;
DROP POLICY IF EXISTS "DOS manages lessons" ON public.lessons;
DROP POLICY IF EXISTS "Teachers manage own lessons" ON public.lessons;

CREATE POLICY "Admins manage lessons" ON public.lessons
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages lessons" ON public.lessons
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Teachers manage own lessons" ON public.lessons
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    AND EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid())
  );

-- 11.21 materials ---------------------------------------------------------------
DROP POLICY IF EXISTS "Staff manage materials" ON public.materials;
DROP POLICY IF EXISTS "Admins manage materials" ON public.materials;
DROP POLICY IF EXISTS "DOS manages materials" ON public.materials;
DROP POLICY IF EXISTS "Teachers manage own materials" ON public.materials;

CREATE POLICY "Admins manage materials" ON public.materials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages materials" ON public.materials
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Teachers manage own materials" ON public.materials
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND (
      uploaded_by = auth.uid()
      OR (course_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid()
      ))
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    AND (
      uploaded_by = auth.uid()
      OR (course_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid()
      ))
    )
  );
-- D2 read policy "Staff and families view relevant materials" is intentionally kept.

-- 11.22 assignments -------------------------------------------------------------
DROP POLICY IF EXISTS "View published assignments" ON public.assignments;
DROP POLICY IF EXISTS "Staff manage assignments" ON public.assignments;
DROP POLICY IF EXISTS "Admins manage assignments" ON public.assignments;
DROP POLICY IF EXISTS "DOS manages assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers manage own assignments" ON public.assignments;

CREATE POLICY "View published assignments" ON public.assignments
  FOR SELECT TO authenticated
  USING (
    is_published
    OR public.is_academic_staff(auth.uid())
    OR public.is_dos(auth.uid())
    OR (class_id IS NOT NULL AND class_id IN (SELECT public.get_current_user_class_ids()))
  );
CREATE POLICY "Admins manage assignments" ON public.assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages assignments" ON public.assignments
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Teachers manage own assignments" ON public.assignments
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND (
      created_by = auth.uid()
      OR (course_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid()
      ))
      OR (class_id IS NOT NULL AND public.is_teacher_of_class(auth.uid(), class_id))
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    AND (
      created_by = auth.uid()
      OR (course_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid()
      ))
      OR (class_id IS NOT NULL AND public.is_teacher_of_class(auth.uid(), class_id))
    )
  );

-- 11.23 quizzes -----------------------------------------------------------------
DROP POLICY IF EXISTS "View published quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Staff manage quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Admins manage quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "DOS manages quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Teachers manage own quizzes" ON public.quizzes;

CREATE POLICY "View published quizzes" ON public.quizzes
  FOR SELECT TO authenticated
  USING (
    is_published
    OR public.is_academic_staff(auth.uid())
    OR public.is_dos(auth.uid())
    OR (class_id IS NOT NULL AND class_id IN (SELECT public.get_current_user_class_ids()))
  );
CREATE POLICY "Admins manage quizzes" ON public.quizzes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages quizzes" ON public.quizzes
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Teachers manage own quizzes" ON public.quizzes
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND (
      created_by = auth.uid()
      OR (course_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid()
      ))
      OR (class_id IS NOT NULL AND public.is_teacher_of_class(auth.uid(), class_id))
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    AND (
      created_by = auth.uid()
      OR (course_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid()
      ))
      OR (class_id IS NOT NULL AND public.is_teacher_of_class(auth.uid(), class_id))
    )
  );

-- 11.24 quiz_questions write policy (staff still manage the base table) --------
DROP POLICY IF EXISTS "Staff manage quiz questions" ON public.quiz_questions;
DROP POLICY IF EXISTS "Admins manage quiz questions" ON public.quiz_questions;
DROP POLICY IF EXISTS "DOS manages quiz questions" ON public.quiz_questions;
DROP POLICY IF EXISTS "Teachers manage own quiz questions" ON public.quiz_questions;

CREATE POLICY "Admins manage quiz questions" ON public.quiz_questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "DOS manages quiz questions" ON public.quiz_questions
  FOR ALL TO authenticated USING (public.is_dos(auth.uid())) WITH CHECK (public.is_dos(auth.uid()));
CREATE POLICY "Teachers manage own quiz questions" ON public.quiz_questions
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = quiz_id AND (q.created_by = auth.uid() OR public.is_teacher_of_class(auth.uid(), q.class_id))
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    AND EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = quiz_id AND (q.created_by = auth.uid() OR public.is_teacher_of_class(auth.uid(), q.class_id))
    )
  );

-- 11.25 student_cumulative_scores (security_invoker view) ----------------------
DROP VIEW IF EXISTS public.student_cumulative_scores;
CREATE VIEW public.student_cumulative_scores WITH (security_invoker = true) AS
SELECT
  s.id AS student_id,
  COALESCE(SUM(bs.score), 0)::integer AS cumulative_score,
  GREATEST(0, LEAST(100, 100 + COALESCE(SUM(bs.score), 0)))::integer AS remaining_marks,
  COUNT(bs.id)::integer AS entries_count,
  MAX(bs.score_date) AS last_score_date
FROM public.students s
LEFT JOIN public.behavior_scores bs ON bs.student_id = s.id
GROUP BY s.id;
GRANT SELECT ON public.student_cumulative_scores TO authenticated;

-- =============================================================================
-- 12. NOT VALID FOREIGN KEYS TO auth.users (guarded, never validated)
-- =============================================================================
DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marks_teacher_id_auth_fkey' AND conrelid = 'public.marks'::regclass) THEN
    ALTER TABLE public.marks ADD CONSTRAINT marks_teacher_id_auth_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_recorded_by_auth_fkey' AND conrelid = 'public.attendance'::regclass) THEN
    ALTER TABLE public.attendance ADD CONSTRAINT attendance_recorded_by_auth_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'behavior_scores_teacher_id_auth_fkey' AND conrelid = 'public.behavior_scores'::regclass) THEN
    ALTER TABLE public.behavior_scores ADD CONSTRAINT behavior_scores_teacher_id_auth_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_subjects_teacher_id_auth_fkey' AND conrelid = 'public.class_subjects'::regclass) THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_teacher_id_auth_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courses_teacher_id_auth_fkey' AND conrelid = 'public.courses'::regclass) THEN
    ALTER TABLE public.courses ADD CONSTRAINT courses_teacher_id_auth_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materials_uploaded_by_auth_fkey' AND conrelid = 'public.materials'::regclass) THEN
    ALTER TABLE public.materials ADD CONSTRAINT materials_uploaded_by_auth_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_created_by_auth_fkey' AND conrelid = 'public.assignments'::regclass) THEN
    ALTER TABLE public.assignments ADD CONSTRAINT assignments_created_by_auth_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quizzes_created_by_auth_fkey' AND conrelid = 'public.quizzes'::regclass) THEN
    ALTER TABLE public.quizzes ADD CONSTRAINT quizzes_created_by_auth_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'announcements_created_by_auth_fkey' AND conrelid = 'public.announcements'::regclass) THEN
    ALTER TABLE public.announcements ADD CONSTRAINT announcements_created_by_auth_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discipline_rules_created_by_auth_fkey' AND conrelid = 'public.discipline_rules'::regclass) THEN
    ALTER TABLE public.discipline_rules ADD CONSTRAINT discipline_rules_created_by_auth_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discipline_incidents_reported_by_auth_fkey' AND conrelid = 'public.discipline_incidents'::regclass) THEN
    ALTER TABLE public.discipline_incidents ADD CONSTRAINT discipline_incidents_reported_by_auth_fkey FOREIGN KEY (reported_by) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_enrolled_by_auth_fkey' AND conrelid = 'public.enrollments'::regclass) THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_enrolled_by_auth_fkey FOREIGN KEY (enrolled_by) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_items_created_by_auth_fkey' AND conrelid = 'public.stock_items'::regclass) THEN
    ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_created_by_auth_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_recorded_by_auth_fkey' AND conrelid = 'public.stock_movements'::regclass) THEN
    ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_recorded_by_auth_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_created_by_auth_fkey' AND conrelid = 'public.purchase_orders'::regclass) THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_created_by_auth_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'certificate_requests_requested_by_auth_fkey' AND conrelid = 'public.certificate_requests'::regclass) THEN
    ALTER TABLE public.certificate_requests ADD CONSTRAINT certificate_requests_requested_by_auth_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'certificate_requests_reviewed_by_auth_fkey' AND conrelid = 'public.certificate_requests'::regclass) THEN
    ALTER TABLE public.certificate_requests ADD CONSTRAINT certificate_requests_reviewed_by_auth_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_user_id_auth_fkey' AND conrelid = 'public.students'::regclass) THEN
    ALTER TABLE public.students ADD CONSTRAINT students_user_id_auth_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) NOT VALID;
  END IF;
END
$fk$;

-- End of migration.
