/**
 * Role-specific dashboards.
 *
 * Every figure on this page comes from a live Supabase query. Nothing is
 * hard-coded, and each dashboard only asks for the rows its role is allowed
 * to see — RLS remains the authoritative boundary.
 */
import { type DependencyList, type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentScoresTable } from '@/components/dashboard/RecentScoresTable';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { buildScope } from '@/lib/scope';
import { cn } from '@/lib/utils';
import {
  calculateTermResults,
  formatMark,
  markTotal,
  nullableNumber,
  type MarkRecord,
} from '@/lib/annualMarks';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Boxes,
  CheckCircle,
  ClipboardList,
  Coins,
  FileText,
  Gavel,
  GraduationCap,
  Library,
  ListChecks,
  Loader2,
  Package,
  Pencil,
  ScrollText,
  Shield,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from '@/lib/icons';
import type {
  Announcement,
  AppRole,
  BehaviorScoreWithDetails,
  DisciplineIncident,
} from '@/types/database';

/* -------------------------------------------------------------------------- */
/* Shared labels / helpers                                                     */
/* -------------------------------------------------------------------------- */

/** Labels kept from the original dashboard header. */
export const roleCopy: Record<AppRole, string> = {
  admin: 'Administrator',
  teacher: 'Teacher',
  parent: 'Parent',
  student: 'Student',
  stock_manager: 'Stock Manager',
  dos: 'Director of Studies',
  dod: 'Director of Discipline',
  viewer: 'Viewer',
};

export function roleCopyFor(role: AppRole | null | undefined): string {
  return role ? roleCopy[role] : 'User';
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const CURRENT_YEAR = `${new Date().getFullYear()}`;
const TERM_LABEL: Record<string, string> = { term1: 'Term 1', term2: 'Term 2', term3: 'Term 3' };

/** School terms: Sep–Dec = 1, Jan–Apr = 2, May–Aug = 3. */
function currentTerm(): 'term1' | 'term2' | 'term3' {
  const month = new Date().getMonth();
  if (month >= 8) return 'term1';
  if (month <= 3) return 'term2';
  return 'term3';
}

type Filters = {
  eq?: Array<[string, unknown]>;
  in?: Array<[string, readonly unknown[]]>;
  order?: string;
  ascending?: boolean;
  limit?: number;
};

/**
 * An empty `in()` filter must return no rows — never "everything". PostgREST
 * behaviour for `in ()` differs across versions, so we short-circuit here.
 */
function hasEmptyIn(filters?: Filters): boolean {
  return !!filters?.in?.some(([, values]) => !values || values.length === 0);
}

async function queryRows<T>(table: string, columns = '*', filters?: Filters): Promise<T[]> {
  if (hasEmptyIn(filters)) return [];
  let query: any = (supabase as any).from(table).select(columns);
  filters?.eq?.forEach(([column, value]) => { query = query.eq(column, value); });
  filters?.in?.forEach(([column, values]) => { query = query.in(column, [...values]); });
  if (filters?.order) query = query.order(filters.order, { ascending: filters.ascending ?? false });
  if (filters?.limit) query = query.limit(filters.limit);
  const { data } = await query;
  return ((data as unknown as T[]) || []) as T[];
}

async function countRows(table: string, filters?: Pick<Filters, 'eq' | 'in'>): Promise<number> {
  if (hasEmptyIn(filters)) return 0;
  let query: any = (supabase as any).from(table).select('*', { count: 'exact', head: true });
  filters?.eq?.forEach(([column, value]) => { query = query.eq(column, value); });
  filters?.in?.forEach(([column, values]) => { query = query.in(column, [...values]); });
  const { count } = await query;
  return count ?? 0;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function displayMark(value: number | string | null | undefined): string {
  return formatMark(nullableNumber(value)) || '—';
}

interface AnnualRowLike {
  annual_available: boolean | null;
  annual_total: number | string | null;
  annual_percentage?: number | string | null;
  term3_count?: number | string | null;
}

/** Annual marks are valid only when the backend says so AND Term 3 exists. */
function annualIsAvailable(row: AnnualRowLike | null | undefined): boolean {
  if (!row || row.annual_available !== true || nullableNumber(row.annual_total) === null) return false;
  return nullableNumber(row.term3_count) !== null && Number(row.term3_count) > 0;
}

async function studentAnnual(studentId: string): Promise<AnnualRowLike | null> {
  const { data } = await supabase.rpc('get_student_annual_result', {
    _student_id: studentId,
    _academic_year: CURRENT_YEAR,
  });
  const rows = Array.isArray(data) ? data as unknown as AnnualRowLike[] : [];
  return rows[0] ?? null;
}

function studentName(student?: { first_name?: string; last_name?: string } | null): string {
  if (!student) return 'Student';
  return `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim() || 'Student';
}

/* -------------------------------------------------------------------------- */
/* Generic UI pieces                                                           */
/* -------------------------------------------------------------------------- */

function LoadingState({ label = 'Loading dashboard data…' }: { label?: string }) {
  return (
    <div className="d-flex flex-column align-items-center justify-content-center gap-3 py-8 text-muted">
      <Loader2 className="animate-spin text-success" size={28} />
      <span className="bd-fs-sm">{label}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-4 text-center text-muted bd-fs-sm mb-0">{text}</p>;
}

function RoleScreen({
  role,
  description,
  loading,
  children,
}: {
  role: AppRole;
  description: string;
  loading: boolean;
  children: ReactNode;
}) {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow={`${roleCopyFor(role)} Dashboard`}
          title={`${greeting()}, ${firstName}`}
          description={description}
        />
        {loading ? <LoadingState /> : children}
      </div>
    </DashboardLayout>
  );
}

function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card h-100">
      <div className="card-header d-flex align-items-center justify-content-between py-3">
        <h5 className="mb-0 fw-semibold text-main">{title}</h5>
        {action}
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

function ViewAll({ to }: { to: string }) {
  return (
    <Link to={to} className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1">
      View all <ArrowRight size={14} />
    </Link>
  );
}

interface ReportRow {
  label: string;
  value: string | number;
  hint?: string;
}

function ReportPanel({
  title,
  description,
  rows,
  action,
}: {
  title: string;
  description?: string;
  rows: ReportRow[];
  action?: ReactNode;
}) {
  return (
    <Panel title={title} action={action}>
      {description && <p className="text-muted bd-fs-sm mb-3">{description}</p>}
      <div className="row g-3">
        {(rows.length ? rows : [{ label: 'No data', value: '—' }]).map((row) => (
          <div className="col-6 col-md-4 col-xl-3" key={row.label}>
            <div className="rounded-3 border border-secondary-subtle p-3 h-100">
              <p className="text-muted fw-medium bd-fs-sm mb-1">{row.label}</p>
              <p className="fw-bold text-main bd-fs-lg mb-0">{row.value}</p>
              {row.hint && <p className="text-muted bd-fs-sm mt-1 mb-0">{row.hint}</p>}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

interface RecordItem {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  tone?: 'success' | 'warning' | 'danger' | 'secondary';
  trailing?: string;
}

function RecordPanel({
  title,
  items,
  emptyText,
  action,
}: {
  title: string;
  items: RecordItem[];
  emptyText: string;
  action?: ReactNode;
}) {
  return (
    <Panel title={title} action={action}>
      {items.length === 0 ? (
        <EmptyState text={emptyText} />
      ) : (
        <div className="d-flex flex-column gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="d-flex flex-wrap align-items-center justify-content-between gap-2 rounded-3 border border-secondary-subtle p-3"
            >
              <div className="min-w-0">
                <p className="fw-medium text-main mb-0 text-truncate">{item.title}</p>
                {item.subtitle && <p className="text-muted bd-fs-sm mt-1 mb-0">{item.subtitle}</p>}
              </div>
              <div className="d-flex align-items-center gap-2 flex-shrink-0">
                {item.trailing && <span className="text-muted bd-fs-sm">{item.trailing}</span>}
                {item.badge && (
                  <span className={cn('badge bd-fs-sm', `text-bg-${item.tone ?? 'secondary'}`)}>
                    {item.badge}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

interface QuickAction {
  to: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  permission?: string;
  count?: number | string;
  countUnit?: string;
  tone?: 'primary' | 'muted' | 'warning';
}

function QuickActions({ actions }: { actions: QuickAction[] }) {
  const { can } = useAuth();
  const permitted = actions.filter((action) => !action.permission || can(action.permission));
  if (permitted.length === 0) return null;
  return (
    <div className="bd-grid-2">
      {permitted.map((action) => {
        const circle = action.tone === 'muted'
          ? 'bd-icon-circle-muted'
          : action.tone === 'warning'
            ? 'bd-icon-circle-warning'
            : 'bd-icon-circle-primary';
        return (
          <Link key={action.to} to={action.to} className="h-100 text-decoration-none">
            <div className="bd-card h-100 d-flex flex-column gap-3 p-4">
              <div className={cn('bd-icon-circle', circle)}><action.icon /></div>
              <div>
                <h3 className="fw-semibold text-main mb-0">{action.title}</h3>
                <p className="text-muted mt-1 bd-fs-sm mb-0">{action.desc}</p>
                {action.count !== undefined && (
                  <p className="mt-2 d-flex align-items-center gap-2 mb-0">
                    <span className="fw-bold bd-fs-lg text-success">{action.count}</span>
                    <span className="text-muted bd-fs-sm">{action.countUnit}</span>
                  </p>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  kind?: string | null;
  is_read?: boolean;
  created_at: string;
}

function useDashboardFeed() {
  const { user, roles } = useAuth();
  const rolesKey = roles.join('|');
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const requests: any[] = [];
      if (user?.id) {
        requests.push(
          (supabase as any).from('notifications').select('*')
            .eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
        );
      }
      if (rolesKey) {
        requests.push(
          (supabase as any).from('notifications').select('*')
            .in('role', rolesKey.split('|')).order('created_at', { ascending: false }).limit(8),
        );
      }
      requests.push(
        supabase.from('announcements').select('*')
          .eq('is_published', true).order('created_at', { ascending: false }).limit(5),
      );
      const results = await Promise.all(requests);
      const seen = new Set<string>();
      const notes: NotificationRow[] = [];
      results.slice(0, results.length - 1).forEach((result) => {
        ((result.data as NotificationRow[]) || []).forEach((note) => {
          if (note?.id && !seen.has(note.id)) { seen.add(note.id); notes.push(note); }
        });
      });
      notes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (alive) {
        setNotifications(notes.slice(0, 8));
        setAnnouncements(((results[results.length - 1].data as Announcement[]) || []));
      }
    })()
      .catch((error) => console.error('Error loading dashboard feed:', error))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // rolesKey captures the role list without re-running on array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, rolesKey]);

  return { notifications, announcements, loading };
}

function ActivityPanels({
  notifications,
  announcements,
}: {
  notifications: NotificationRow[];
  announcements: Announcement[];
}) {
  const unread = notifications.filter((note) => !note.is_read).length;
  return (
    <div className="row g-3">
      <div className="col-12 col-lg-6">
        <Panel
          title={unread ? `Notifications · ${unread} unread` : 'Notifications'}
          action={<ViewAll to="/notifications" />}
        >
          {notifications.length === 0 ? (
            <EmptyState text="You have no notifications yet." />
          ) : (
            <div className="d-flex flex-column gap-2">
              {notifications.map((note) => (
                <div
                  key={note.id}
                  className={cn(
                    'rounded-3 border p-3',
                    note.is_read ? 'border-secondary-subtle' : 'border-success-subtle bg-success-subtle',
                  )}
                >
                  <p className="fw-semibold text-main mb-0">{note.title}</p>
                  <p className="text-muted bd-fs-sm mt-1 mb-0">{note.body}</p>
                  <p className="text-muted bd-fs-sm mt-1 mb-0">
                    {new Date(note.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
      <div className="col-12 col-lg-6">
        <Panel title="Announcements">
          {announcements.length === 0 ? (
            <EmptyState text="No published announcements." />
          ) : (
            <div className="d-flex flex-column gap-2">
              {announcements.map((announcement) => (
                <div key={announcement.id} className="rounded-3 border border-secondary-subtle p-3">
                  <p className="fw-semibold text-main mb-0">{announcement.title}</p>
                  <p className="text-muted bd-fs-sm mt-1 mb-0">{announcement.body}</p>
                  <p className="text-muted bd-fs-sm mt-1 mb-0">
                    {new Date(announcement.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function useDashboardData<T>(loader: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loader()
      .then((result) => { if (alive) setData(result); })
      .catch((error) => { console.error('Error loading dashboard:', error); if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // The loader is intentionally captured by the explicit dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading };
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                       */
/* -------------------------------------------------------------------------- */

interface AdminData {
  students: number;
  classes: number;
  users: number;
  stockItems: number;
  incidents: number;
  auditTotal: number;
  auditLogs: Array<{ id: string; action: string; entity: string; created_at: string }>;
}

export function AdminDashboard() {
  const { user } = useAuth();
  const feed = useDashboardFeed();
  const { data, loading } = useDashboardData<AdminData>(async () => {
    if (!user?.id) return { students: 0, classes: 0, users: 0, stockItems: 0, incidents: 0, auditTotal: 0, auditLogs: [] };
    const [students, classes, users, stockItems, incidents, auditTotal, auditLogs] = await Promise.all([
      countRows('students'),
      countRows('classes'),
      countRows('profiles'),
      countRows('stock_items'),
      countRows('discipline_incidents'),
      countRows('audit_logs'),
      queryRows<AdminData['auditLogs'][number]>('audit_logs', 'id, action, entity, created_at', {
        order: 'created_at', limit: 6,
      }),
    ]);
    return { students, classes, users, stockItems, incidents, auditTotal, auditLogs };
  }, [user?.id]);

  const values: AdminData = data ?? {
    students: 0, classes: 0, users: 0, stockItems: 0, incidents: 0, auditTotal: 0, auditLogs: [],
  };

  return (
    <RoleScreen
      role="admin"
      description="School-wide overview — people, classes, inventory and recent system activity."
      loading={loading || feed.loading}
    >
      <div className="bd-grid-2">
        <StatCard title="Students" value={values.students} icon={GraduationCap} variant="secondary" />
        <StatCard title="Classes" value={values.classes} icon={Users} variant="tertiary" />
        <StatCard title="Staff & users" value={values.users} icon={UserCheck} />
        <StatCard title="Stock items" value={values.stockItems} icon={Boxes} variant="secondary" />
        <StatCard title="Discipline incidents" value={values.incidents} icon={Gavel} variant="danger" />
      </div>

      <ReportPanel
        title="System overview"
        description="Live totals across the school database."
        rows={[
          { label: 'Students', value: values.students },
          { label: 'Classes', value: values.classes },
          { label: 'Users', value: values.users },
          { label: 'Stock items', value: values.stockItems },
          { label: 'Incidents', value: values.incidents },
          { label: 'Audit events', value: values.auditTotal },
        ]}
      />

      <RecordPanel
        title="Recent audit log"
        emptyText="No audit activity recorded yet."
        action={<ViewAll to="/users" />}
        items={values.auditLogs.map((log) => ({
          id: log.id,
          title: `${log.action} · ${log.entity}`,
          subtitle: new Date(log.created_at).toLocaleString(),
          badge: log.entity,
          tone: 'secondary' as const,
        }))}
      />

      <ActivityPanels notifications={feed.notifications} announcements={feed.announcements} />

      <QuickActions
        actions={[
          { to: '/users', icon: Users, title: 'Manage users', desc: 'Accounts and role assignments', permission: 'users.view' },
          { to: '/students', icon: GraduationCap, title: 'Students', desc: 'Student registry', permission: 'students.view_all', count: values.students, countUnit: 'students' },
          { to: '/classes', icon: BookOpen, title: 'Classes', desc: 'Classes and teacher assignments', permission: 'classes.view', count: values.classes, countUnit: 'classes', tone: 'muted' },
          { to: '/stock-dashboard', icon: Boxes, title: 'Stock dashboard', desc: 'Inventory and reorder alerts', permission: 'stock.view', count: values.stockItems, countUnit: 'items' },
          { to: '/reports', icon: BarChart3, title: 'Reports', desc: 'Behaviour and academic reports', permission: 'reports.behavior.view' },
        ]}
      />
    </RoleScreen>
  );
}

/* -------------------------------------------------------------------------- */
/* Teacher                                                                     */
/* -------------------------------------------------------------------------- */

interface TeacherData {
  classCount: number;
  studentCount: number;
  marksCount: number;
  pendingCount: number;
  incidentCount: number;
  pendingList: Array<{ className: string; subjectName: string; missing: number }>;
  recentMarks: Array<{ id: string; student: string; subject: string; term: string; total: string }>;
  recentIncidents: RecordItem[];
}

export function TeacherDashboard() {
  const { user } = useAuth();
  const feed = useDashboardFeed();
  const { data, loading } = useDashboardData<TeacherData>(async () => {
    const empty: TeacherData = {
      classCount: 0, studentCount: 0, marksCount: 0, pendingCount: 0, incidentCount: 0,
      pendingList: [], recentMarks: [], recentIncidents: [],
    };
    if (!user?.id) return empty;

    const term = currentTerm();
    const [classRows, taughtSubjects, allMarks, incidentRows, subjectRows] = await Promise.all([
      queryRows<any>('classes', 'id, name', { eq: [['teacher_id', user.id]] }),
      queryRows<any>('class_subjects', 'id, class_id, subject_id', {
        eq: [['teacher_id', user.id], ['academic_year', CURRENT_YEAR]],
      }),
      queryRows<any>('marks', 'id, student_id, subject_id, term, cat_score, exam_score, created_at', {
        eq: [['teacher_id', user.id], ['academic_year', CURRENT_YEAR]], order: 'created_at', limit: 8,
      }),
      queryRows<any>('discipline_incidents', 'id, description, incident_date, status, student_id', {
        eq: [['reported_by', user.id]], order: 'created_at', limit: 5,
      }),
      queryRows<any>('subjects', 'id, name'),
    ]);

    const classIds = unique([...classRows.map((c: any) => c.id), ...taughtSubjects.map((s: any) => s.class_id)]);
    const marksCount = await countRows('marks', {
      eq: [['teacher_id', user.id], ['academic_year', CURRENT_YEAR]],
    });
    const [studentRows, enrollments] = classIds.length
      ? await Promise.all([
        queryRows<any>('students', 'id, first_name, last_name, class_id', { in: [['class_id', classIds]] }),
        queryRows<any>('enrollments', 'student_id, class_id', {
          eq: [['status', 'active']], in: [['class_id', classIds]],
        }),
      ])
      : [[], []] as [any[], any[]];
    const studentIds = unique([
      ...studentRows.map((s: any) => s.id),
      ...enrollments.map((e: any) => e.student_id),
    ]);
    const namesById = new Map<string, string>(
      studentRows.map((s: any) => [s.id as string, studentName(s)]),
    );
    const classNames = new Map<string, string>(classRows.map((c: any) => [c.id as string, c.name as string]));
    const subjectNames = new Map<string, string>(subjectRows.map((s: any) => [s.id as string, s.name as string]));

    const termMarks = studentIds.length
      ? await queryRows<any>('marks', 'student_id, subject_id', {
        in: [['student_id', studentIds]], eq: [['term', term], ['academic_year', CURRENT_YEAR]],
      })
      : [];
    const marked = new Set(termMarks.map((m: any) => `${m.student_id}:${m.subject_id}`));
    const classStudentIds = new Map<string, string[]>();
    studentRows.forEach((s: any) => {
      if (s.class_id) classStudentIds.set(s.class_id, [...(classStudentIds.get(s.class_id) || []), s.id]);
    });
    enrollments.forEach((e: any) => {
      if (e.class_id) classStudentIds.set(e.class_id, unique([...(classStudentIds.get(e.class_id) || []), e.student_id]));
    });

    const pendingList = taughtSubjects.map((cs: any) => {
      const ids = classStudentIds.get(cs.class_id) || [];
      const missing = ids.filter((id) => !marked.has(`${id}:${cs.subject_id}`)).length;
      return {
        className: classNames.get(cs.class_id) || 'Class',
        subjectName: subjectNames.get(cs.subject_id) || 'Subject',
        missing,
      };
    }).filter((entry) => entry.missing > 0);

    if (studentIds.length) {
      const extraNames = await queryRows<any>('students', 'id, first_name, last_name', {
        in: [['id', studentIds.filter((id) => !namesById.has(id))]],
      });
      extraNames.forEach((s: any) => namesById.set(s.id, studentName(s)));
    }

    return {
      classCount: classIds.length,
      studentCount: studentIds.length,
      marksCount,
      pendingCount: pendingList.reduce((sum, entry) => sum + entry.missing, 0),
      incidentCount: await countRows('discipline_incidents', { eq: [['reported_by', user.id]] }),
      pendingList: pendingList.slice(0, 6),
      recentMarks: allMarks.map((m: any) => ({
        id: m.id,
        student: namesById.get(m.student_id) || 'Student',
        subject: subjectNames.get(m.subject_id) || 'Subject',
        term: TERM_LABEL[m.term] || m.term,
        total: displayMark(markTotal(m as MarkRecord)),
      })),
      recentIncidents: incidentRows.map((i: any) => ({
        id: i.id,
        title: i.description,
        subtitle: `${TERM_LABEL[i.term] || ''} ${new Date(i.incident_date).toLocaleDateString()}`.trim(),
        badge: i.status,
        tone: (i.status === 'pending' ? 'warning' : i.status === 'reviewed' ? 'success' : 'secondary') as any,
      })),
    };
  }, [user?.id]);

  const values = data ?? {
    classCount: 0, studentCount: 0, marksCount: 0, pendingCount: 0, incidentCount: 0,
    pendingList: [], recentMarks: [], recentIncidents: [],
  };

  return (
    <RoleScreen
      role="teacher"
      description="Your classes, students and assessment progress for the current academic year."
      loading={loading || feed.loading}
    >
      <div className="bd-grid-2">
        <StatCard title="My classes" value={values.classCount} icon={BookOpen} variant="secondary" />
        <StatCard title="Students" value={values.studentCount} icon={GraduationCap} variant="tertiary" />
        <StatCard title="Marks entered" value={values.marksCount} subtitle={CURRENT_YEAR} icon={Pencil} />
        <StatCard title="Pending marks" value={values.pendingCount} subtitle={`${TERM_LABEL[currentTerm()]} assessments`} icon={AlertTriangle} variant="warning" />
        <StatCard title="Incidents reported" value={values.incidentCount} icon={Gavel} variant="danger" />
      </div>

      <ReportPanel
        title="Assessment report"
        description={`Assigned classes and missing ${TERM_LABEL[currentTerm()]} marks (${CURRENT_YEAR}).`}
        rows={[
          { label: 'Classes', value: values.classCount },
          { label: 'Students', value: values.studentCount },
          { label: 'Marks entered', value: values.marksCount },
          { label: 'Missing marks', value: values.pendingCount },
          { label: 'Reports filed', value: values.incidentCount },
        ]}
      />

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <RecordPanel
            title={`Pending assessments · ${TERM_LABEL[currentTerm()]}`}
            emptyText="All assigned subjects have marks for the current term."
            items={values.pendingList.map((entry, index) => ({
              id: `${entry.className}-${entry.subjectName}-${index}`,
              title: `${entry.className} · ${entry.subjectName}`,
              subtitle: 'Students without a mark this term',
              trailing: `${entry.missing} missing`,
              badge: 'Pending',
              tone: 'warning' as const,
            }))}
          />
        </div>
        <div className="col-12 col-lg-6">
          <RecordPanel
            title="Recent marks entered"
            emptyText="No marks entered this academic year."
            action={<ViewAll to="/marks" />}
            items={values.recentMarks.map((mark) => ({
              id: mark.id,
              title: `${mark.student} · ${mark.subject}`,
              subtitle: mark.term,
              trailing: mark.total,
            }))}
          />
        </div>
      </div>

      <RecordPanel
        title="Incidents I reported"
        emptyText="You have not reported any discipline incidents."
        action={<ViewAll to="/discipline" />}
        items={values.recentIncidents}
      />

      <ActivityPanels notifications={feed.notifications} announcements={feed.announcements} />

      <QuickActions
        actions={[
          { to: '/marks', icon: Pencil, title: 'Enter marks', desc: 'CAT and exam scores per term', permission: 'marks.enter' },
          { to: '/attendance', icon: UserCheck, title: 'Attendance', desc: 'Record daily attendance', permission: 'attendance.manage' },
          { to: '/students', icon: GraduationCap, title: 'My students', desc: 'Students in assigned classes', permission: 'students.view', count: values.studentCount, countUnit: 'students', tone: 'muted' },
          { to: '/discipline', icon: Gavel, title: 'Discipline', desc: 'Report and review incidents', permission: 'discipline.view', count: values.incidentCount, countUnit: 'reported', tone: 'warning' },
          { to: '/academic-reports', icon: FileText, title: 'Academic reports', desc: 'Term and annual reports', permission: 'reports.academic.view' },
        ]}
      />
    </RoleScreen>
  );
}

/* -------------------------------------------------------------------------- */
/* Student                                                                     */
/* -------------------------------------------------------------------------- */

interface StudentData {
  own: { id: string; first_name: string; last_name: string; student_id: string } | null;
  marks: Array<MarkRecord & { id: string; subject: string }>;
  annual: AnnualRowLike | null;
  attendance: { present: number; absent: number; late: number; excused: number };
  assignments: Array<{ id: string; title: string; due_date: string | null }>;
  quizzes: Array<{ id: string; title: string }>;
}

export function StudentDashboard() {
  const { user, roles } = useAuth();
  const feed = useDashboardFeed();
  const rolesKey = roles.join('|');
  const { data, loading } = useDashboardData<StudentData>(async () => {
    const empty: StudentData = {
      own: null, marks: [], annual: null,
      attendance: { present: 0, absent: 0, late: 0, excused: 0 }, assignments: [], quizzes: [],
    };
    if (!user?.id) return empty;
    const scope = await buildScope(supabase, user.id, roles);
    const studentId = scope.ownStudentId;
    if (!studentId) return empty;

    const classIds = scope.classIds ?? [];
    const [ownRows, marks, annual, attRows, assignments, quizzes, subjectRows] = await Promise.all([
      queryRows<any>('students', 'id, first_name, last_name, student_id', {
        eq: [['user_id', user.id]], limit: 1,
      }),
      queryRows<any>('marks', 'id, subject_id, term, cat_score, exam_score, academic_year', {
        eq: [['student_id', studentId], ['academic_year', CURRENT_YEAR]], order: 'created_at', limit: 8,
      }),
      studentAnnual(studentId),
      queryRows<any>('attendance', 'status', {
        eq: [['student_id', studentId], ['academic_year', CURRENT_YEAR]],
      }),
      queryRows<any>('assignments', 'id, title, due_date', {
        eq: [['is_published', true]], in: [['class_id', classIds]], order: 'due_date', limit: 6,
      }),
      queryRows<any>('quizzes', 'id, title', {
        eq: [['is_published', true]], in: [['class_id', classIds]], order: 'created_at', limit: 6,
      }),
      queryRows<any>('subjects', 'id, name'),
    ]);

    const subjectNames = new Map<string, string>(subjectRows.map((s: any) => [s.id as string, s.name as string]));
    const attendance = { present: 0, absent: 0, late: 0, excused: 0 };
    attRows.forEach((row: any) => { if (row.status in attendance) attendance[row.status as keyof typeof attendance] += 1; });

    return {
      own: ownRows[0] ?? null,
      marks: marks.map((m: any) => ({ ...m, subject: subjectNames.get(m.subject_id) || 'Subject' })),
      annual,
      attendance,
      assignments,
      quizzes,
    };
  }, [user?.id, rolesKey]);

  const values = data ?? {
    own: null, marks: [], annual: null,
    attendance: { present: 0, absent: 0, late: 0, excused: 0 }, assignments: [], quizzes: [],
  };
  const termResults = calculateTermResults(values.marks);
  const terms = (['term1', 'term2', 'term3'] as const).map((term) => ({
    label: TERM_LABEL[term],
    value: displayMark(termResults[term].total),
    hint: `${termResults[term].count} recorded`,
  }));
  const annualReady = annualIsAvailable(values.annual);

  return (
    <RoleScreen
      role="student"
      description={`Your own results, attendance and class e-learning activity for ${CURRENT_YEAR}.`}
      loading={loading || feed.loading}
    >
      {!values.own && (
        <div className="alert alert-info mb-0">
          No student record is linked to your account. Contact an administrator to link your profile.
        </div>
      )}

      <div className="bd-grid-2">
        <StatCard title="Marks recorded" value={values.marks.length} subtitle={CURRENT_YEAR} icon={ClipboardList} />
        <StatCard title="Attendance days" value={Object.values(values.attendance).reduce((a, b) => a + b, 0)} icon={UserCheck} variant="secondary" />
        <StatCard title="Assignments" value={values.assignments.length} subtitle="Published for your class" icon={ListChecks} variant="tertiary" />
        <StatCard title="Quizzes" value={values.quizzes.length} subtitle="Published for your class" icon={BookOpen} />
      </div>

      <ReportPanel
        title="My academic report"
        description="Only your own marks are shown. Annual results appear once all three terms are recorded."
        rows={[
          ...terms,
          {
            label: 'Annual result',
            value: annualReady ? displayMark(values.annual?.annual_total) : '—',
            hint: annualReady ? `${displayMark(values.annual?.annual_percentage)}%` : 'Pending all three terms',
          },
          { label: 'Present', value: values.attendance.present },
          { label: 'Absent', value: values.attendance.absent },
        ]}
      />

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <RecordPanel
            title="Recent marks"
            emptyText="No marks recorded for you this year."
            action={<ViewAll to="/academic-reports" />}
            items={values.marks.map((mark) => ({
              id: mark.id,
              title: mark.subject,
              subtitle: TERM_LABEL[mark.term] || mark.term,
              trailing: displayMark(markTotal(mark)),
            }))}
          />
        </div>
        <div className="col-12 col-lg-6">
          <RecordPanel
            title="Upcoming assignments & quizzes"
            emptyText="No published assignments or quizzes for your class."
            action={<ViewAll to="/assignments" />}
            items={[
              ...values.assignments.map((a) => ({
                id: `assignment-${a.id}`, title: a.title, subtitle: 'Assignment',
                trailing: a.due_date ? `Due ${new Date(a.due_date).toLocaleDateString()}` : undefined,
              })),
              ...values.quizzes.map((q) => ({
                id: `quiz-${q.id}`, title: q.title, subtitle: 'Quiz',
              })),
            ]}
          />
        </div>
      </div>

      <ActivityPanels notifications={feed.notifications} announcements={feed.announcements} />

      <QuickActions
        actions={[
          { to: '/academic-reports', icon: FileText, title: 'My report', desc: 'Term and annual results', permission: 'reports.academic.view' },
          { to: '/attendance', icon: UserCheck, title: 'Attendance', desc: 'Your attendance record', permission: 'attendance.view' },
          { to: '/assignments', icon: ListChecks, title: 'Assignments', desc: 'Published class assignments', permission: 'assignments.view' },
          { to: '/quizzes', icon: BookOpen, title: 'Quizzes', desc: 'Published class quizzes', permission: 'quizzes.view' },
          { to: '/certificates', icon: ScrollText, title: 'Certificates', desc: 'Request and view certificates', permission: 'certificates.request' },
        ]}
      />
    </RoleScreen>
  );
}

/* -------------------------------------------------------------------------- */
/* Parent                                                                      */
/* -------------------------------------------------------------------------- */

interface ChildSummary {
  child: { id: string; first_name: string; last_name: string; student_id: string };
  marksCount: number;
  annual: AnnualRowLike | null;
  attendance: number;
  incidents: DisciplineIncident[];
}

interface ParentData {
  children: ChildSummary[];
  assignments: Array<{ id: string; title: string; due_date: string | null }>;
  recentIncidents: RecordItem[];
}

export function ParentDashboard() {
  const { user, roles } = useAuth();
  const feed = useDashboardFeed();
  const rolesKey = roles.join('|');
  const { data, loading } = useDashboardData<ParentData>(async () => {
    const empty: ParentData = { children: [], assignments: [], recentIncidents: [] };
    if (!user?.id) return empty;
    const scope = await buildScope(supabase, user.id, roles);
    const childIds = scope.studentIds ?? [];
    if (!childIds.length) return empty;

    const childrenRows = childIds.length
      ? await queryRows<any>('students', 'id, first_name, last_name, student_id', { in: [['id', childIds]] })
      : [];
    const [ruleRows, assignmentRows] = await Promise.all([
      queryRows<any>('discipline_rules', 'id, title'),
      queryRows<any>('assignments', 'id, title, due_date', {
        eq: [['is_published', true]], in: [['class_id', scope.classIds ?? []]], order: 'due_date', limit: 6,
      }),
    ]);
    const ruleNames = new Map<string, string>(ruleRows.map((r: any) => [r.id as string, r.title as string]));

    const children: ChildSummary[] = await Promise.all(childrenRows.map(async (child: any) => {
      const [marks, annual, attendance, incidents] = await Promise.all([
        queryRows<any>('marks', 'id', { eq: [['student_id', child.id], ['academic_year', CURRENT_YEAR]] }),
        studentAnnual(child.id),
        queryRows<any>('attendance', 'id', { eq: [['student_id', child.id], ['academic_year', CURRENT_YEAR]] }),
        queryRows<DisciplineIncident>('discipline_incidents', '*', {
          eq: [['student_id', child.id]], order: 'created_at', limit: 4,
        }),
      ]);
      return {
        child,
        marksCount: marks.length,
        annual,
        attendance: attendance.length,
        incidents,
      };
    }));

    const recentIncidents = children
      .flatMap((entry) => entry.incidents.map((incident) => ({
        id: incident.id,
        title: studentName(entry.child as any),
        subtitle: `${ruleNames.get(incident.rule_id || '') || incident.description}`,
        badge: incident.status,
        tone: (incident.status === 'pending' ? 'warning' : incident.status === 'reviewed' ? 'success' : 'secondary') as any,
        trailing: new Date(incident.created_at).toLocaleDateString(),
      })))
      .sort((a, b) => b.trailing!.localeCompare(a.trailing!))
      .slice(0, 6);

    return { children, assignments: assignmentRows, recentIncidents };
  }, [user?.id, rolesKey]);

  const values = data ?? { children: [], assignments: [], recentIncidents: [] };
  const annualReady = values.children.filter((entry) => annualIsAvailable(entry.annual)).length;

  return (
    <RoleScreen
      role="parent"
      description="Academic and well-being updates for your linked children only."
      loading={loading || feed.loading}
    >
      {values.children.length === 0 && (
        <div className="alert alert-info mb-0">
          No children are linked to your account. Ask an administrator to link your profile.
        </div>
      )}

      <div className="bd-grid-2">
        <StatCard title="Linked children" value={values.children.length} icon={GraduationCap} variant="secondary" />
        <StatCard title="Annual results ready" value={annualReady} subtitle={`of ${values.children.length} children`} icon={FileText} variant="tertiary" />
        <StatCard title="Assignments" value={values.assignments.length} subtitle="Published for your children" icon={ListChecks} />
      </div>

      <ReportPanel
        title="Children at a glance"
        description="Each child's figures come only from their own records. Annual marks stay hidden until all three terms exist."
        rows={values.children.map((entry) => ({
          label: studentName(entry.child as any),
          value: `${entry.marksCount} marks`,
          hint: `${entry.attendance} attendance days · Annual ${annualIsAvailable(entry.annual) ? displayMark(entry.annual?.annual_total) : 'pending'}`,
        }))}
      />

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <RecordPanel
            title="Recent discipline records"
            emptyText="No incidents recorded for your children."
            action={<ViewAll to="/discipline" />}
            items={values.recentIncidents}
          />
        </div>
        <div className="col-12 col-lg-6">
          <RecordPanel
            title="Published assignments"
            emptyText="No published assignments for your children's classes."
            action={<ViewAll to="/assignments" />}
            items={values.assignments.map((a) => ({
              id: a.id,
              title: a.title,
              subtitle: 'Assignment',
              trailing: a.due_date ? `Due ${new Date(a.due_date).toLocaleDateString()}` : undefined,
            }))}
          />
        </div>
      </div>

      <ActivityPanels notifications={feed.notifications} announcements={feed.announcements} />

      <QuickActions
        actions={[
          { to: '/students', icon: GraduationCap, title: 'My children', desc: 'Linked student profiles', permission: 'students.view' },
          { to: '/academic-reports', icon: FileText, title: 'Academic reports', desc: 'Term and annual results', permission: 'reports.academic.view' },
          { to: '/attendance', icon: UserCheck, title: 'Attendance', desc: 'Children attendance records', permission: 'attendance.view' },
          { to: '/discipline', icon: Gavel, title: 'Discipline', desc: 'Incidents for linked children', permission: 'discipline.view' },
          { to: '/certificates', icon: ScrollText, title: 'Certificates', desc: 'View children certificates', permission: 'certificates.view', tone: 'muted' },
        ]}
      />
    </RoleScreen>
  );
}

/* -------------------------------------------------------------------------- */
/* Stock manager                                                               */
/* -------------------------------------------------------------------------- */

interface StockData {
  items: Array<{ id: string; name: string; unit: string; quantity: number; min_quantity: number }>;
  movements: Array<{ id: string; item_id: string; movement_type: string; quantity: number; movement_date: string; reason: string | null }>;
  orders: Array<{ id: string; item_id: string; supplier: string | null; quantity: number; unit_price: number; status: string; expected_date: string | null }>;
}

export function StockManagerDashboard() {
  const { user } = useAuth();
  const feed = useDashboardFeed();
  const { data, loading } = useDashboardData<StockData>(async () => {
    if (!user?.id) return { items: [], movements: [], orders: [] };
    const [items, movements, orders] = await Promise.all([
      queryRows<any>('stock_items', 'id, name, unit, quantity, min_quantity', { order: 'name' }),
      queryRows<any>('stock_movements', 'id, item_id, movement_type, quantity, movement_date, reason', {
        order: 'created_at', limit: 6,
      }),
      queryRows<any>('purchase_orders', 'id, item_id, supplier, quantity, unit_price, status, expected_date', {
        order: 'created_at', limit: 12,
      }),
    ]);
    return { items, movements, orders };
  }, [user?.id]);

  const values = data ?? { items: [], movements: [], orders: [] };
  const lowStock = values.items.filter((item) => Number(item.quantity) <= Number(item.min_quantity));
  const outOfStock = values.items.filter((item) => Number(item.quantity) <= 0);
  const openOrders = values.orders.filter((order) => order.status === 'pending' || order.status === 'ordered');
  const openValue = openOrders.reduce(
    (sum, order) => sum + Number(order.quantity) * Number(order.unit_price), 0,
  );
  const itemNames = new Map(values.items.map((item) => [item.id, item.name]));

  return (
    <RoleScreen
      role="stock_manager"
      description="Inventory levels, movement history and open purchase orders. No academic data."
      loading={loading || feed.loading}
    >
      <div className="bd-grid-2">
        <StatCard title="Stock items" value={values.items.length} icon={Boxes} />
        <StatCard title="Low stock" value={lowStock.length} subtitle="At or below minimum" icon={AlertTriangle} variant="warning" />
        <StatCard title="Out of stock" value={outOfStock.length} icon={AlertTriangle} variant="danger" />
        <StatCard title="Open orders" value={openOrders.length} icon={ClipboardList} variant="tertiary" />
        <StatCard title="Open order value" value={`${openValue.toLocaleString()} RWF`} icon={Coins} variant="secondary" />
      </div>

      <ReportPanel
        title="Inventory report"
        description="Reorder alerts are derived from live stock quantities and minimum levels."
        rows={[
          { label: 'Items tracked', value: values.items.length },
          { label: 'Need reordering', value: lowStock.length },
          { label: 'Out of stock', value: outOfStock.length },
          { label: 'Open orders', value: openOrders.length },
          { label: 'Open value', value: `${openValue.toLocaleString()} RWF` },
          { label: 'Movements shown', value: values.movements.length },
        ]}
      />

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <RecordPanel
            title="Recent stock movements"
            emptyText="No stock movements recorded yet."
            action={<ViewAll to="/stock" />}
            items={values.movements.map((movement) => ({
              id: movement.id,
              title: `${movement.movement_type === 'in' ? 'Stock in' : 'Stock out'} · ${itemNames.get(movement.item_id) || 'Item'}`,
              subtitle: movement.reason || 'No reason recorded',
              trailing: `${movement.quantity} · ${new Date(movement.movement_date).toLocaleDateString()}`,
              badge: movement.movement_type,
              tone: movement.movement_type === 'in' ? 'success' : 'warning',
            }))}
          />
        </div>
        <div className="col-12 col-lg-6">
          <RecordPanel
            title="Open purchase orders"
            emptyText="No open purchase orders."
            action={<ViewAll to="/stock-dashboard" />}
            items={openOrders.map((order) => ({
              id: order.id,
              title: itemNames.get(order.item_id) || 'Item',
              subtitle: order.supplier || 'Supplier not recorded',
              trailing: `${order.quantity} · ${Number(order.unit_price).toLocaleString()} RWF`,
              badge: order.status,
              tone: order.status === 'pending' ? 'warning' : 'success',
            }))}
          />
        </div>
      </div>

      <ActivityPanels notifications={feed.notifications} announcements={feed.announcements} />

      <QuickActions
        actions={[
          { to: '/stock-dashboard', icon: Boxes, title: 'Stock dashboard', desc: 'Levels and reorder alerts', permission: 'stock.view', count: values.items.length, countUnit: 'items' },
          { to: '/stock', icon: Package, title: 'Manage stock', desc: 'Record stock in and out', permission: 'stock.manage', tone: 'warning' },
        ]}
      />
    </RoleScreen>
  );
}

/* -------------------------------------------------------------------------- */
/* Director of Studies                                                         */
/* -------------------------------------------------------------------------- */

interface DosData {
  students: number;
  classes: number;
  subjects: number;
  missingMarks: number;
  missingList: Array<{ className: string; subjectName: string; count: number }>;
  annualAvailable: number;
  annualPending: number;
  certificatesPending: number;
  recentMarks: Array<{ id: string; teacher: string; student: string; subject: string; total: string }>;
  recentCertificates: RecordItem[];
}

export function DosDashboard() {
  const { user } = useAuth();
  const feed = useDashboardFeed();
  const { data, loading } = useDashboardData<DosData>(async () => {
    if (!user?.id) {
      return {
        students: 0, classes: 0, subjects: 0, missingMarks: 0, missingList: [],
        annualAvailable: 0, annualPending: 0, certificatesPending: 0,
        recentMarks: [], recentCertificates: [],
      };
    }
    const term = currentTerm();
    const [students, classes, subjects, enrollments, classSubjects, recentMarks, profileRows, studentRows, subjectRows, annualRows, certRows, certificatesPending] = await Promise.all([
      countRows('students'),
      countRows('classes'),
      countRows('subjects'),
      queryRows<any>('enrollments', 'student_id, class_id', {
        eq: [['academic_year', CURRENT_YEAR], ['status', 'active']],
      }),
      queryRows<any>('class_subjects', 'class_id, subject_id', { eq: [['academic_year', CURRENT_YEAR]] }),
      queryRows<any>('marks', 'id, teacher_id, student_id, subject_id, term, cat_score, exam_score, created_at', {
        order: 'created_at', limit: 6,
      }),
      queryRows<any>('profiles', 'user_id, full_name'),
      queryRows<any>('students', 'id, first_name, last_name'),
      queryRows<any>('subjects', 'id, name'),
      queryRows<any>('student_annual_results', 'student_id, academic_year, annual_available, annual_total, term3_count'),
      queryRows<any>('certificate_requests', 'id, student_id, request_type, status, created_at', {
        eq: [['status', 'pending']], order: 'created_at', limit: 5,
      }),
      countRows('certificate_requests', { eq: [['status', 'pending']] }),
    ]);

    const studentIds = unique(enrollments.map((e: any) => e.student_id));
    const termMarks = studentIds.length
      ? await queryRows<any>('marks', 'student_id, subject_id', {
        in: [['student_id', studentIds]], eq: [['term', term], ['academic_year', CURRENT_YEAR]],
      })
      : [];
    const marked = new Set(termMarks.map((m: any) => `${m.student_id}:${m.subject_id}`));
    const subjectsByClass = new Map<string, string[]>();
    classSubjects.forEach((cs: any) => {
      subjectsByClass.set(cs.class_id, [...(subjectsByClass.get(cs.class_id) || []), cs.subject_id]);
    });

    const missingByPair = new Map<string, { className: string; subjectName: string; count: number }>();
    const classNames = new Map<string, string>();
    const classRows = await queryRows<any>('classes', 'id, name');
    classRows.forEach((c: any) => classNames.set(c.id, c.name));
    const subjectNames = new Map<string, string>(subjectRows.map((s: any) => [s.id as string, s.name as string]));
    const studentNames = new Map<string, string>(studentRows.map((s: any) => [s.id as string, studentName(s)]));
    const teacherNames = new Map<string, string>(profileRows.map((p: any) => [p.user_id as string, p.full_name as string]));

    enrollments.forEach((enrollment: any) => {
      (subjectsByClass.get(enrollment.class_id) || []).forEach((subjectId: string) => {
        if (marked.has(`${enrollment.student_id}:${subjectId}`)) return;
        const key = `${enrollment.class_id}:${subjectId}`;
        const entry = missingByPair.get(key) || {
          className: classNames.get(enrollment.class_id) || 'Class',
          subjectName: subjectNames.get(subjectId) || 'Subject',
          count: 0,
        };
        entry.count += 1;
        missingByPair.set(key, entry);
      });
    });
    const missingList = [...missingByPair.values()].sort((a, b) => b.count - a.count);

    const yearAnnual = annualRows.filter((row: any) => row.academic_year === CURRENT_YEAR);
    const annualAvailable = yearAnnual.filter((row: any) => annualIsAvailable(row as AnnualRowLike)).length;

    return {
      students,
      classes,
      subjects,
      missingMarks: missingList.reduce((sum, entry) => sum + entry.count, 0),
      missingList: missingList.slice(0, 6),
      annualAvailable,
      annualPending: yearAnnual.length - annualAvailable,
      certificatesPending,
      recentMarks: recentMarks.map((m: any) => ({
        id: m.id,
        teacher: teacherNames.get(m.teacher_id) || 'Teacher',
        student: studentNames.get(m.student_id) || 'Student',
        subject: subjectNames.get(m.subject_id) || 'Subject',
        total: displayMark(markTotal(m as MarkRecord)),
      })),
      recentCertificates: certRows.map((request: any) => ({
        id: request.id,
        title: `${studentNames.get(request.student_id) || 'Student'} · ${request.request_type}`,
        subtitle: new Date(request.created_at).toLocaleDateString(),
        badge: request.status,
        tone: 'warning' as const,
      })),
    };
  }, [user?.id]);

  const values = data ?? {
    students: 0, classes: 0, subjects: 0, missingMarks: 0, missingList: [],
    annualAvailable: 0, annualPending: 0, certificatesPending: 0,
    recentMarks: [], recentCertificates: [],
  };

  return (
    <RoleScreen
      role="dos"
      description="Academic oversight — missing marks, teacher activity and annual results."
      loading={loading || feed.loading}
    >
      <div className="bd-grid-2">
        <StatCard title="Students" value={values.students} icon={GraduationCap} variant="secondary" />
        <StatCard title="Classes" value={values.classes} icon={Users} variant="tertiary" />
        <StatCard title="Subjects" value={values.subjects} icon={Library} />
        <StatCard title="Missing marks" value={values.missingMarks} subtitle={TERM_LABEL[currentTerm()]} icon={AlertTriangle} variant="warning" />
        <StatCard title="Annual results" value={values.annualAvailable} subtitle={`${values.annualPending} pending`} icon={FileText} variant="secondary" />
        <StatCard title="Certificates pending" value={values.certificatesPending} icon={ScrollText} variant="danger" />
      </div>

      <ReportPanel
        title="Academic oversight report"
        description={`Missing marks are students without a ${TERM_LABEL[currentTerm()]} mark for a subject taught to their class in ${CURRENT_YEAR}.`}
        rows={[
          { label: 'Students', value: values.students },
          { label: 'Classes', value: values.classes },
          { label: 'Subjects', value: values.subjects },
          { label: 'Missing marks', value: values.missingMarks },
          { label: 'Annual available', value: values.annualAvailable },
          { label: 'Annual pending', value: values.annualPending },
        ]}
      />

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <RecordPanel
            title="Missing marks monitor"
            emptyText="No missing marks found for the current term."
            items={values.missingList.map((entry, index) => ({
              id: `${entry.className}-${entry.subjectName}-${index}`,
              title: `${entry.className} · ${entry.subjectName}`,
              subtitle: 'Students without a mark this term',
              trailing: `${entry.count} missing`,
              badge: 'Review',
              tone: 'warning' as const,
            }))}
          />
        </div>
        <div className="col-12 col-lg-6">
          <RecordPanel
            title="Recent teacher activity"
            emptyText="No marks have been entered recently."
            action={<ViewAll to="/marks" />}
            items={values.recentMarks.map((mark) => ({
              id: mark.id,
              title: `${mark.teacher} · ${mark.student}`,
              subtitle: `${mark.subject} · ${TERM_LABEL[mark.term] || mark.term}`,
              trailing: mark.total,
            }))}
          />
        </div>
      </div>

      <RecordPanel
        title="Pending certificate requests"
        emptyText="No certificate requests are pending."
        action={<ViewAll to="/certificates" />}
        items={values.recentCertificates}
      />

      <ActivityPanels notifications={feed.notifications} announcements={feed.announcements} />

      <QuickActions
        actions={[
          { to: '/marks', icon: Pencil, title: 'Review marks', desc: 'Check and publish marks', permission: 'marks.review', count: values.missingMarks, countUnit: 'missing', tone: 'warning' },
          { to: '/classes', icon: BookOpen, title: 'Classes', desc: 'Classes and assignments', permission: 'classes.view', count: values.classes, countUnit: 'classes', tone: 'muted' },
          { to: '/subjects', icon: Library, title: 'Subjects', desc: 'Subject catalogue', permission: 'subjects.view', count: values.subjects, countUnit: 'subjects' },
          { to: '/enrollment', icon: UserPlus, title: 'Enrollment', desc: 'Class enrollments', permission: 'enrollment.view' },
          { to: '/certificates', icon: ScrollText, title: 'Certificates', desc: 'Approve pending requests', permission: 'certificates.approve', count: values.certificatesPending, countUnit: 'pending' },
          { to: '/academic-reports', icon: FileText, title: 'Academic reports', desc: 'Term and annual reports', permission: 'reports.academic.view' },
        ]}
      />
    </RoleScreen>
  );
}

/* -------------------------------------------------------------------------- */
/* Director of Discipline                                                      */
/* -------------------------------------------------------------------------- */

interface DodData {
  pending: number;
  reviewed: number;
  dismissed: number;
  incidentTotal: number;
  scoreCount: number;
  marksDeducted: number;
  recentIncidents: DisciplineIncident[];
  scores: BehaviorScoreWithDetails[];
  students: Array<{ id: string; first_name: string; last_name: string; student_id: string }>;
}

export function DodDashboard() {
  const { user } = useAuth();
  const feed = useDashboardFeed();
  const { data, loading } = useDashboardData<DodData>(async () => {
    const empty: DodData = {
      pending: 0, reviewed: 0, dismissed: 0, incidentTotal: 0, scoreCount: 0, marksDeducted: 0,
      recentIncidents: [], scores: [], students: [],
    };
    if (!user?.id) return empty;
    const [pending, reviewed, dismissed, scoreCount, recentIncidents, scores, allIncidents, students] = await Promise.all([
      countRows('discipline_incidents', { eq: [['status', 'pending']] }),
      countRows('discipline_incidents', { eq: [['status', 'reviewed']] }),
      countRows('discipline_incidents', { eq: [['status', 'dismissed']] }),
      countRows('behavior_scores'),
      queryRows<DisciplineIncident>('discipline_incidents',
        '*, student:students(first_name, last_name, student_id), rule:discipline_rules(title)',
        { order: 'created_at', limit: 6 }),
      queryRows<BehaviorScoreWithDetails>('behavior_scores',
        '*, student:students(*, class:classes(*))',
        { order: 'created_at', limit: 5 }),
      queryRows<any>('discipline_incidents', 'marks_deducted'),
      queryRows<any>('students', 'id, first_name, last_name, student_id', { order: 'last_name', limit: 10 }),
    ]);
    return {
      pending, reviewed, dismissed,
      incidentTotal: pending + reviewed + dismissed,
      scoreCount,
      marksDeducted: allIncidents.reduce((sum, row) => sum + Number(row.marks_deducted || 0), 0),
      recentIncidents,
      scores,
      students,
    };
  }, [user?.id]);

  const values = data ?? {
    pending: 0, reviewed: 0, dismissed: 0, incidentTotal: 0, scoreCount: 0, marksDeducted: 0,
    recentIncidents: [], scores: [], students: [],
  };

  return (
    <RoleScreen
      role="dod"
      description="Discipline incidents, behaviour scores and student names — no academic marks."
      loading={loading || feed.loading}
    >
      <div className="bd-grid-2">
        <StatCard title="Pending reviews" value={values.pending} icon={AlertTriangle} variant="warning" />
        <StatCard title="Reviewed incidents" value={values.reviewed} icon={CheckCircle} variant="secondary" />
        <StatCard title="Dismissed" value={values.dismissed} icon={Shield} />
        <StatCard title="Behaviour records" value={values.scoreCount} icon={ClipboardList} variant="tertiary" />
        <StatCard title="Marks deducted" value={values.marksDeducted} icon={TrendingUp} variant="danger" />
      </div>

      <ReportPanel
        title="Discipline report"
        description="Counts are live from discipline incidents and behaviour scores."
        rows={[
          { label: 'Total incidents', value: values.incidentTotal },
          { label: 'Pending', value: values.pending },
          { label: 'Reviewed', value: values.reviewed },
          { label: 'Dismissed', value: values.dismissed },
          { label: 'Behaviour records', value: values.scoreCount },
          { label: 'Marks deducted', value: values.marksDeducted },
        ]}
      />

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <RecordPanel
            title="Recent incidents"
            emptyText="No discipline incidents recorded."
            action={<ViewAll to="/discipline" />}
            items={values.recentIncidents.map((incident) => ({
              id: incident.id,
              title: `${studentName(incident.student)}${incident.rule?.title ? ` · ${incident.rule.title}` : ''}`,
              subtitle: incident.description,
              trailing: new Date(incident.incident_date).toLocaleDateString(),
              badge: incident.status,
              tone: (incident.status === 'pending' ? 'warning' : incident.status === 'reviewed' ? 'success' : 'secondary') as any,
            }))}
          />
        </div>
        <div className="col-12 col-lg-6">
          <Panel title="Students (names only)" action={<ViewAll to="/students" />}>
            {values.students.length === 0 ? (
              <EmptyState text="No students found." />
            ) : (
              <div className="d-flex flex-wrap gap-2">
                {values.students.map((student) => (
                  <span key={student.id} className="badge text-bg-light border">
                    {studentName(student)} · {student.student_id}
                  </span>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Recent behaviour score activity" action={<ViewAll to="/scores" />}>
        <RecentScoresTable scores={values.scores} loading={false} />
      </Panel>

      <ActivityPanels notifications={feed.notifications} announcements={feed.announcements} />

      <QuickActions
        actions={[
          { to: '/discipline', icon: Gavel, title: 'Review incidents', desc: 'Pending discipline cases', permission: 'discipline.review', count: values.pending, countUnit: 'pending', tone: 'warning' },
          { to: '/scores', icon: ClipboardList, title: 'Behaviour scores', desc: 'Recent conduct records', permission: 'scores.behavior.view', count: values.scoreCount, countUnit: 'records' },
          { to: '/certificates', icon: ScrollText, title: 'Certificates', desc: 'View certificate requests', permission: 'certificates.view', tone: 'muted' },
          { to: '/students', icon: Users, title: 'Students', desc: 'Student names', permission: 'students.view' },
        ]}
      />
    </RoleScreen>
  );
}

/* -------------------------------------------------------------------------- */
/* Viewer (read-only)                                                          */
/* -------------------------------------------------------------------------- */

interface ViewerData {
  students: number;
  classes: number;
  subjects: number;
}

export function ViewerDashboard() {
  const { user } = useAuth();
  const feed = useDashboardFeed();
  const { data, loading } = useDashboardData<ViewerData>(async () => {
    if (!user?.id) return { students: 0, classes: 0, subjects: 0 };
    const [students, classes, subjects] = await Promise.all([
      countRows('students'),
      countRows('classes'),
      countRows('subjects'),
    ]);
    return { students, classes, subjects };
  }, [user?.id]);

  const values = data ?? { students: 0, classes: 0, subjects: 0 };

  return (
    <RoleScreen
      role="viewer"
      description="Read-only snapshot of the school. No write actions are available in this dashboard."
      loading={loading || feed.loading}
    >
      <div className="bd-grid-2">
        <StatCard title="Students" value={values.students} icon={GraduationCap} variant="secondary" />
        <StatCard title="Classes" value={values.classes} icon={Users} variant="tertiary" />
        <StatCard title="Subjects" value={values.subjects} icon={Library} />
      </div>

      <ReportPanel
        title="Read-only school snapshot"
        description="Totals are queried live. Viewer access cannot modify any records."
        rows={[
          { label: 'Students', value: values.students },
          { label: 'Classes', value: values.classes },
          { label: 'Subjects', value: values.subjects },
        ]}
      />

      <Panel title="Published announcements">
        {feed.announcements.length === 0 ? (
          <EmptyState text="No published announcements." />
        ) : (
          <div className="d-flex flex-column gap-2">
            {feed.announcements.map((announcement) => (
              <div key={announcement.id} className="rounded-3 border border-secondary-subtle p-3">
                <p className="fw-semibold text-main mb-0">{announcement.title}</p>
                <p className="text-muted bd-fs-sm mt-1 mb-0">{announcement.body}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Notifications" action={<ViewAll to="/notifications" />}>
        {feed.notifications.length === 0 ? (
          <EmptyState text="You have no notifications yet." />
        ) : (
          <div className="d-flex flex-column gap-2">
            {feed.notifications.map((note) => (
              <div key={note.id} className="rounded-3 border border-secondary-subtle p-3">
                <p className="fw-semibold text-main mb-0">{note.title}</p>
                <p className="text-muted bd-fs-sm mt-1 mb-0">{note.body}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <QuickActions
        actions={[
          { to: '/students', icon: GraduationCap, title: 'Students', desc: 'View student directory', permission: 'students.view', count: values.students, countUnit: 'students', tone: 'muted' },
          { to: '/classes', icon: BookOpen, title: 'Classes', desc: 'View classes', permission: 'classes.view', count: values.classes, countUnit: 'classes', tone: 'muted' },
          { to: '/subjects', icon: Library, title: 'Subjects', desc: 'View subjects', permission: 'subjects.view', count: values.subjects, countUnit: 'subjects', tone: 'muted' },
          { to: '/reports', icon: BarChart3, title: 'Reports', desc: 'Read behaviour reports', permission: 'reports.behavior.view', tone: 'muted' },
          { to: '/academic-reports', icon: FileText, title: 'Academic reports', desc: 'Read academic reports', permission: 'reports.academic.view', tone: 'muted' },
        ]}
      />
    </RoleScreen>
  );
}
