import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentScoresTable } from '@/components/dashboard/RecentScoresTable';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Announcement, BehaviorScoreWithDetails, DisciplineIncident } from '@/types/database';
import {
  GraduationCap, Users, ClipboardList, TrendingUp, AlertTriangle,
  CheckCircle, BookOpen, Gavel, Boxes, Pencil, UserPlus,
} from '@/lib/icons';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PieChart, Pie, Cell, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const PIE_COLORS = ['#16A34A', '#DC2626', '#F59E0B', '#0EA5E9'];

export default function Dashboard() {
  const { role, profile, user } = useAuth();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [attendanceStats, setAttendanceStats] = useState({ present: 0, absent: 0, late: 0, excused: 0 });
  const [recentScores, setRecentScores] = useState<BehaviorScoreWithDetails[]>([]);
  const [recentIncidents, setRecentIncidents] = useState<DisciplineIncident[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [role, user?.id]);

  const fetchDashboardData = async () => {
    if (!role) return;
    setLoading(true);
    try {
      const count = async (table: any, eq?: [string, string]) => {
        let q = supabase.from(table).select('*', { count: 'exact', head: true });
        if (eq) q = q.eq(eq[0], eq[1]);
        const { count: c } = await q;
        return c || 0;
      };

      const next: Record<string, number> = {};

      if (role === 'admin' || role === 'teacher' || role === 'viewer' || role === 'dos') {
        next.totalStudents = await count('students');
        next.totalClasses = await count('classes');
      }
      if (role === 'admin' || role === 'teacher' || role === 'dos' || role === 'dod') {
        next.totalScores = await count('behavior_scores');
      }
      if (role === 'teacher') {
        next.myClasses = await count('classes', ['teacher_id', user?.id || '']);
        next.myPendingIncidents = await count('discipline_incidents', ['reported_by', user?.id || '']);
      }
      if (role === 'dos') {
        next.totalSubjects = await count('subjects');
        next.activeEnrollments = await count('enrollments', ['status', 'active']);
        next.marksRecorded = await count('marks');
      }
      if (role === 'dod') {
        next.pendingIncidents = await count('discipline_incidents', ['status', 'pending']);
        next.reviewedIncidents = await count('discipline_incidents', ['status', 'reviewed']);
      }
      if (role === 'stock_manager' || role === 'admin') {
        next.stockItems = await count('stock_items');
      }
      if (role === 'parent') {
        next.myChildren = await count('students');
      }

      // Attendance statistics (real data: current academic year)
      const yearStart = `${new Date().getFullYear()}-01-01`;
      const { data: attRows } = await supabase
        .from('attendance')
        .select('status')
        .gte('attendance_date', yearStart);
      const att = { present: 0, absent: 0, late: 0, excused: 0 };
      (attRows || []).forEach((r: any) => {
        if (r.status in att) att[r.status]++;
      });
      setAttendanceStats(att);

      // Academic performance (real data: average marks & pass rate for current academic year)
      const year = `${new Date().getFullYear()}`;
      const { data: markRows } = await supabase
        .from('marks')
        .select('cat_score, exam_score')
        .eq('academic_year', year);
      const totals = (markRows || []).map((m: any) => Number(m.cat_score || 0) + Number(m.exam_score || 0));
      const avgMarks = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
      const passRate = totals.length ? (totals.filter((t) => t >= 50).length / totals.length) * 100 : 0;
      next.avgMarks = Math.round(avgMarks * 10) / 10;
      next.passRate = Math.round(passRate);

      // Recent behavior scores
      const scoresRes = await supabase
        .from('behavior_scores')
        .select('*, student:students(*, class:classes(*)), teacher:profiles!behavior_scores_teacher_id_fkey(*)')
        .order('created_at', { ascending: false })
        .limit(10);
      setRecentScores((scoresRes.data as unknown as BehaviorScoreWithDetails[]) || []);

      // Recent incidents for DOD
      if (role === 'dod' || role === 'admin') {
        const incRes = await supabase
          .from('discipline_incidents')
          .select('*, student:students(*, class:classes(*)), rule:discipline_rules(*)')
          .order('created_at', { ascending: false })
          .limit(5);
        setRecentIncidents((incRes.data as DisciplineIncident[]) || []);
      }

      // Announcements for everyone
      const annRes = await supabase
        .from('announcements')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(5);
      setAnnouncements((annRes.data as Announcement[]) || []);

      setStats(next);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const roleCopy: Record<string, string> = {
    admin: 'Administrator',
    teacher: 'Teacher',
    parent: 'Parent',
    student: 'Student',
    stock_manager: 'Stock Manager',
    dos: 'Director of Studies',
    dod: 'Director of Discipline',
    viewer: 'Viewer',
  };

  const attendanceData = useMemo(() => [
    { name: 'Present', value: attendanceStats.present },
    { name: 'Absent', value: attendanceStats.absent },
    { name: 'Late', value: attendanceStats.late },
    { name: 'Excused', value: attendanceStats.excused },
  ].filter((d) => d.value > 0 || true), [attendanceStats]);

  const totalAttendance = attendanceStats.present + attendanceStats.absent + attendanceStats.late + attendanceStats.excused;

  const renderStats = () => {
    switch (role) {
      case 'admin':
      case 'teacher':
      case 'viewer':
        return (
          <div className="bd-grid-2">
            <StatCard title="Total Students" value={stats.totalStudents || 0} icon={GraduationCap} variant="secondary" />
            <StatCard title="Total Classes" value={stats.totalClasses || 0} icon={Users} variant="tertiary" />
            {role !== 'viewer' && (
              <StatCard title="Behavior Scores" value={stats.totalScores || 0} subtitle="All time" icon={ClipboardList} />
            )}
            {role === 'admin' && (
              <StatCard title="Stock Items" value={stats.stockItems || 0} subtitle="Inventory" icon={Boxes} variant="secondary" />
            )}
            {role === 'teacher' && (
              <>
                <StatCard title="My Classes" value={stats.myClasses || 0} icon={BookOpen} variant="secondary" />
                <StatCard title="My Reports" value={stats.myPendingIncidents || 0} subtitle="Incidents reported" icon={Gavel} variant="danger" />
              </>
            )}
          </div>
        );
      case 'dos':
        return (
          <div className="bd-grid-2">
            <StatCard title="Total Students" value={stats.totalStudents || 0} icon={GraduationCap} variant="secondary" />
            <StatCard title="Classes" value={stats.totalClasses || 0} icon={Users} variant="tertiary" />
            <StatCard title="Subjects" value={stats.totalSubjects || 0} icon={BookOpen} variant="secondary" />
            <StatCard title="Active Enrollments" value={stats.activeEnrollments || 0} icon={UserPlus} />
          </div>
        );
      case 'dod':
        return (
          <div className="bd-grid-2">
            <StatCard title="Pending Reviews" value={stats.pendingIncidents || 0} icon={AlertTriangle} variant="warning" />
            <StatCard title="Reviewed Incidents" value={stats.reviewedIncidents || 0} icon={CheckCircle} variant="secondary" />
            <StatCard title="Total Behavior Records" value={stats.totalScores || 0} icon={ClipboardList} variant="tertiary" />
            <StatCard title="Recent Incidents" value={recentIncidents.length} subtitle="Last 5" icon={Gavel} variant="danger" />
          </div>
        );
      case 'stock_manager':
        return (
          <div className="bd-grid-2">
            <StatCard title="Stock Items" value={stats.stockItems || 0} icon={Boxes} />
          </div>
        );
      case 'parent':
        return (
          <div className="bd-grid-2">
            <StatCard title="Linked Child" value={stats.myChildren || 0} icon={GraduationCap} />
          </div>
        );
      case 'student':
        return (
          <div className="bd-grid-2">
            <StatCard title="Behavior Records" value={stats.totalScores || 0} icon={ClipboardList} />
          </div>
        );
      default:
        return null;
    }
  };

  const renderQuickActions = () => {
    const actions: {
      to: string;
      icon: typeof ClipboardList;
      title: string;
      desc: string;
      tone?: 'emerald' | 'slate' | 'golden';
      count?: number;
      countUnit?: string;
    }[] = [];
    if (role === 'admin' || role === 'teacher') {
      actions.push(
        { to: '/scores?action=new', icon: ClipboardList, title: 'Record Score', desc: 'Add a new behavior score for a student', count: stats.totalScores ?? 0, countUnit: 'records' },
        { to: '/students?action=new', icon: GraduationCap, title: 'Add Student', desc: 'Register a new student in the system', count: stats.totalStudents ?? 0, countUnit: 'students', tone: 'slate' },
        { to: '/reports', icon: TrendingUp, title: 'View Reports', desc: 'Generate and view behavior reports' },
      );
    }
    if (role === 'teacher' || role === 'dos' || role === 'admin') {
      actions.push({ to: '/enrollment', icon: UserPlus, title: 'Enroll Students', desc: 'Enroll students in your classes', count: stats.activeEnrollments ?? 0, countUnit: 'active' });
    }
    if (role === 'dod') {
      actions.push(
        { to: '/discipline', icon: Gavel, title: 'Review Incidents', desc: 'Review pending discipline incidents', count: stats.pendingIncidents ?? 0, countUnit: 'pending', tone: 'golden' },
        { to: '/scores?action=new', icon: ClipboardList, title: 'Deduct Marks', desc: 'Assign conduct mark deductions', count: stats.pendingIncidents ?? 0, countUnit: 'pending' },
      );
    }
    if (role === 'dos') {
      actions.push(
        { to: '/classes', icon: BookOpen, title: 'Manage Classes', desc: 'Classes and teacher assignments', count: stats.totalClasses ?? 0, countUnit: 'classes', tone: 'slate' },
        { to: '/subjects', icon: Pencil, title: 'Manage Subjects', desc: 'Subjects offered at the school', count: stats.totalSubjects ?? 0, countUnit: 'subjects' },
      );
    }
    if (role === 'stock_manager') {
      actions.push(
        { to: '/stock-dashboard', icon: Boxes, title: 'Stock Dashboard', desc: 'Inventory levels and reorder alerts', count: stats.stockItems ?? 0, countUnit: 'items' },
        { to: '/stock', icon: ClipboardList, title: 'Manage Stock', desc: 'Record stock in and out' },
      );
    }
    if (actions.length === 0) return null;
    return (
      <div className="bd-grid-2">
        {actions.map((a) => {
          const circleClass = a.tone === 'slate'
            ? 'bd-icon-circle-muted'
            : a.tone === 'golden'
              ? 'bd-icon-circle-warning'
              : 'bd-icon-circle-primary';
          const countColor = a.tone === 'slate' ? 'text-muted' : a.tone === 'golden' ? 'text-warning' : 'text-success';
          return (
            <Link key={a.to} to={a.to} className="h-100">
              <div className="bd-card h-100 d-flex flex-column gap-3 p-4">
                <div className={cn('bd-icon-circle', circleClass)}>
                  <a.icon />
                </div>
                <div>
                  <h3 className="fw-semibold text-main mb-0">{a.title}</h3>
                  {a.desc && <p className="text-muted mt-1 bd-fs-sm mb-0">{a.desc}</p>}
                  {a.count !== undefined && (
                    <p className="mt-2 d-flex align-items-center gap-2">
                      <span className={cn('fw-bold bd-fs-lg', countColor)}>{a.count}</span>
                      <span className="text-muted bd-fs-sm">{a.countUnit}</span>
                    </p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        {/* Header */}
        <div>
          <p className="bd-eyebrow mb-0">Dashboard</p>
          <h1 className="bd-page-title mb-0">
            {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="mt-2 text-muted bd-fs-md max-w-3xl">
            {roleCopy[role || ''] ? `${roleCopy[role || '']} dashboard — ` : ''}
            Your school at a glance — students, conduct records, academics and e-learning activity.
          </p>
        </div>

        {renderStats()}

        {/* Attendance statistics (real data) */}
        <div className="card">
          <div className="card-header d-flex align-items-center justify-content-between py-3">
            <h5 className="mb-0 fw-semibold">
              Attendance Statistics {totalAttendance > 0 ? `· ${totalAttendance} days this year` : ''}
            </h5>
          </div>
          <div className="card-body d-flex flex-column gap-4">
            <div className="bd-grid-2">
              {[
                { label: 'Present', value: attendanceStats.present, cls: 'text-success' },
                { label: 'Absent', value: attendanceStats.absent, cls: 'text-danger' },
                { label: 'Late', value: attendanceStats.late, cls: 'text-warning' },
                { label: 'Excused', value: attendanceStats.excused, cls: 'text-info' },
              ].map((s) => (
                <div key={s.label} className="d-flex flex-column gap-1 rounded-3 border border-secondary-subtle p-4">
                  <p className="fw-medium text-muted bd-fs-sm">{s.label}</p>
                  <p className={cn('bd-stat-value', s.cls, 'mb-0')}>{s.value}</p>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={attendanceData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
                  {attendanceData.map((d, i) => (
                    <Cell key={d.name} fill={PIE_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#64748b' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Discipline statistics (real data) */}
        {role === 'dod' || role === 'admin' ? (
          <div className="card">
            <div className="card-header py-3"><h5 className="mb-0 fw-semibold">Discipline Statistics</h5></div>
            <div className="card-body d-flex flex-column gap-4">
              <div className="d-flex flex-wrap gap-3">
                <div className="d-flex flex-column gap-1 rounded-3 border border-secondary-subtle p-4 flex-grow-1">
                  <p className="text-muted fw-medium bd-fs-sm">Pending reviews</p>
                  <p className="fw-bold text-warning bd-stat-value mb-0">{stats.pendingIncidents || 0}</p>
                </div>
                <div className="d-flex flex-column gap-1 rounded-3 border border-secondary-subtle p-4 flex-grow-1">
                  <p className="text-muted fw-medium bd-fs-sm">Reviewed incidents</p>
                  <p className="fw-bold text-success bd-stat-value mb-0">{stats.reviewedIncidents || 0}</p>
                </div>
              </div>
              {recentIncidents.length > 0 && (
                <div className="d-flex flex-column gap-2">
                  {recentIncidents.map((i) => (
                    <div key={i.id} className="d-flex align-items-center justify-content-between gap-3 rounded-3 border border-secondary-subtle p-3">
                      <p className="text-truncate fw-medium text-main mb-0">
                        {i.student ? `${i.student.first_name} ${i.student.last_name}` : 'Student'}
                        {i.rule?.title ? ` · ${i.rule.title}` : ''}
                      </p>
                      <span className={cn('badge', i.status === 'pending' ? 'text-bg-warning' : i.status === 'reviewed' ? 'text-bg-success' : 'text-bg-danger')}>
                        {i.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Academic performance (real data: avg marks + pass rate) */}
        <div className="card">
          <div className="card-header d-flex align-items-center justify-content-between py-3">
            <h5 className="mb-0 fw-semibold">Academic Performance — {new Date().getFullYear()}</h5>
          </div>
          <div className="card-body d-flex flex-column gap-4">
            <div className="row g-3">
              <div className="col-sm-6 col-md-3">
                <p className="text-muted fw-medium bd-fs-sm">Average Marks (/100)</p>
                <p className="fw-bold text-success bd-stat-value mb-0">{stats.avgMarks ?? 0}</p>
                <p className="mt-1 text-muted bd-fs-sm mb-0">Average CAT + Exam total this year</p>
              </div>
              <div className="col-sm-6 col-md-3">
                <p className="text-muted fw-medium bd-fs-sm">Pass Rate</p>
                <p className="fw-bold text-success bd-stat-value mb-0">{stats.passRate ?? 0}%</p>
                <p className="mt-1 text-muted bd-fs-sm mb-0">Students with total ≥ 50 this year</p>
              </div>
            </div>
            <div className="rounded-3 border border-secondary-subtle p-2">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[
                  { label: 'CAT (40)', pct: Math.round(stats.avgMarks ? (stats.avgMarks / 100) * 40 : 0) },
                  { label: 'Exam (60)', pct: Math.round(stats.avgMarks ? (stats.avgMarks / 100) * 60 : 0) },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" stroke="#475569" fontSize={12} />
                  <YAxis stroke="#475569" fontSize={12} domain={[0, 40]} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                  <Bar dataKey="pct" fill="#16A34A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Announcements */}
        {announcements.length > 0 && (
          <div className="card">
            <div className="card-header py-3"><h5 className="mb-0 fw-semibold">Announcements</h5></div>
            <div className="card-body d-flex flex-column gap-3">
              {announcements.map((a) => (
                <div key={a.id} className="rounded-3 border border-secondary-subtle p-3">
                  <p className="fw-semibold text-main mb-0">{a.title}</p>
                  <p className="text-muted mt-1 bd-fs-sm mb-0">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent behavior scores */}
        {role !== 'dod' && (
          <div className="card">
            <div className="card-header d-flex align-items-center justify-content-between py-3">
              <h5 className="mb-0 fw-semibold">Recent Behavior Scores</h5>
              <Link to="/scores" className="btn btn-outline-primary btn-sm">View all</Link>
            </div>
            <div className="card-body">
              <RecentScoresTable scores={recentScores} loading={loading} />
            </div>
          </div>
        )}

        {/* Quick actions */}
        {renderQuickActions()}
      </div>
    </DashboardLayout>
  );
}
