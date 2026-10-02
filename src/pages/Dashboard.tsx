import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentScoresTable } from '@/components/dashboard/RecentScoresTable';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Announcement, BehaviorScoreWithDetails, DisciplineIncident } from '@/types/database';
import {
  GraduationCap,
  Users,
  ClipboardList,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  BookOpen,
  Gavel,
  Boxes,
  Pencil,
  UserPlus,
  Megaphone,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Dashboard() {
  const { role, profile, user } = useAuth();
  const [stats, setStats] = useState<Record<string, number>>({});
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
      const count = async (table: string, eq?: [string, string]) => {
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
        next.myPendingIncidents = await count('discipline_incidents', [
          'reported_by',
          user?.id || '',
        ]);
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

      // Recent behavior scores (RLS scopes these per role)
      const scoresRes = await supabase
        .from('behavior_scores')
        .select(
          '*, student:students(*, class:classes(*)), teacher:profiles!behavior_scores_teacher_id_fkey(*)'
        )
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
        setRecentIncidents((incRes.data as unknown as DisciplineIncident[]) || []);
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

  const renderStats = () => {
    switch (role) {
      case 'admin':
      case 'teacher':
      case 'viewer':
        return (
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total Students" value={stats.totalStudents || 0} icon={GraduationCap} variant="primary" />
            <StatCard title="Total Classes" value={stats.totalClasses || 0} icon={Users} variant="secondary" />
            {role !== 'viewer' && (
              <StatCard title="Behavior Scores" value={stats.totalScores || 0} subtitle="All time" icon={ClipboardList} />
            )}
            {role === 'admin' && (
              <StatCard title="Stock Items" value={stats.stockItems || 0} subtitle="Inventory" icon={Boxes} />
            )}
            {role === 'teacher' && (
              <>
                <StatCard title="My Classes" value={stats.myClasses || 0} icon={BookOpen} />
                <StatCard title="My Reports" value={stats.myPendingIncidents || 0} subtitle="Incidents reported" icon={Gavel} />
              </>
            )}
          </div>
        );
      case 'dos':
        return (
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total Students" value={stats.totalStudents || 0} icon={GraduationCap} variant="primary" />
            <StatCard title="Classes" value={stats.totalClasses || 0} icon={Users} variant="secondary" />
            <StatCard title="Subjects" value={stats.totalSubjects || 0} icon={BookOpen} />
            <StatCard title="Active Enrollments" value={stats.activeEnrollments || 0} icon={UserPlus} variant="success" />
          </div>
        );
      case 'dod':
        return (
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Pending Reviews" value={stats.pendingIncidents || 0} icon={AlertTriangle} variant="warning" />
            <StatCard title="Reviewed Incidents" value={stats.reviewedIncidents || 0} icon={CheckCircle} variant="success" />
            <StatCard title="Total Behavior Records" value={stats.totalScores || 0} icon={ClipboardList} />
            <StatCard title="Recent Incidents" value={recentIncidents.length} subtitle="Last 5" icon={Gavel} variant="secondary" />
          </div>
        );
      case 'stock_manager':
        return (
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Stock Items" value={stats.stockItems || 0} icon={Boxes} variant="primary" />
          </div>
        );
      case 'parent':
        return (
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Linked Children" value={stats.myChildren || 0} icon={GraduationCap} variant="primary" />
          </div>
        );
      case 'student':
        return (
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Behavior Records" value={stats.totalScores || 0} icon={ClipboardList} variant="primary" />
          </div>
        );
      default:
        return null;
    }
  };

  const renderRecent = () => {
    if (role === 'dod') {
      return (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Gavel className="h-5 w-5 text-muted-foreground" />
              Recent Incidents
            </CardTitle>
            <Link to="/discipline" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentIncidents.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No incidents recorded.</p>
            ) : (
              <div className="space-y-3">
                {recentIncidents.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {i.student ? `${i.student.first_name} ${i.student.last_name}` : 'Student'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{i.description}</p>
                    </div>
                    <Badge
                      className={
                        i.status === 'pending'
                          ? 'bg-warning/15 text-warning'
                          : i.status === 'reviewed'
                            ? 'bg-success/15 text-success'
                            : 'bg-muted text-muted-foreground'
                      }
                    >
                      {i.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      );
    }
    if (role === 'stock_manager' || role === 'dod') return null;
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            Recent Behavior Scores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecentScoresTable scores={recentScores} loading={loading} />
        </CardContent>
      </Card>
    );
  };

  const renderQuickActions = () => {
    const actions: { to: string; icon: typeof ClipboardList; title: string; desc: string }[] = [];
    if (role === 'admin' || role === 'teacher') {
      actions.push(
        { to: '/scores?action=new', icon: ClipboardList, title: 'Record Score', desc: 'Add a new behavior score for a student' },
        { to: '/students?action=new', icon: GraduationCap, title: 'Add Student', desc: 'Register a new student in the system' },
        { to: '/reports', icon: TrendingUp, title: 'View Reports', desc: 'Generate and view behavior reports' }
      );
    }
    if (role === 'teacher' || role === 'dos' || role === 'admin') {
      actions.push({ to: '/enrollment', icon: UserPlus, title: 'Enroll Students', desc: 'Enroll students in your classes' });
    }
    if (role === 'dod') {
      actions.push(
        { to: '/discipline', icon: Gavel, title: 'Review Incidents', desc: 'Review pending discipline incidents' },
        { to: '/scores?action=new', icon: ClipboardList, title: 'Deduct Marks', desc: 'Assign conduct mark deductions' }
      );
    }
    if (role === 'dos') {
      actions.push(
        { to: '/classes', icon: BookOpen, title: 'Manage Classes', desc: 'Classes and teacher assignments' },
        { to: '/subjects', icon: Pencil, title: 'Manage Subjects', desc: 'Subjects offered at the school' }
      );
    }
    if (role === 'stock_manager') {
      actions.push(
        { to: '/stock-dashboard', icon: Boxes, title: 'Stock Dashboard', desc: 'Inventory levels and reorder alerts' },
        { to: '/stock', icon: ClipboardList, title: 'Manage Stock', desc: 'Record stock in and out' }
      );
    }
    if (actions.length === 0) return null;
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {actions.map((a) => (
          <Link key={a.to} to={a.to}>
            <Card className="border-dashed border-2 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer h-full">
              <CardContent className="flex flex-col items-center justify-center py-8">
                <a.icon className="h-10 w-10 text-muted-foreground mb-3" />
                <h3 className="font-semibold text-foreground">{a.title}</h3>
                <p className="text-sm text-muted-foreground text-center mt-1">{a.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-secondary">Dashboard</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {roleCopy[role || ''] ? `${roleCopy[role || '']} dashboard — ` : ''}
            Your school at a glance — students, conduct records, academics and e-learning activity.
          </p>
        </div>

        {renderStats()}

        {/* Announcements */}
        {announcements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-muted-foreground" />
                Announcements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {announcements.map((a) => (
                <div key={a.id} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium text-foreground">{a.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {renderRecent()}

        {renderQuickActions()}
      </div>
    </DashboardLayout>
  );
}
