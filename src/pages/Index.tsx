import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  GraduationCap,
  Bell,
  BarChart3,
  CheckCircle,
  Loader2,
  LayoutDashboard,
  ClipboardList,
  CalendarCheck,
  FileText,
  Users,
  LogIn,
  Building2,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import landingStudents from '@/assets/landing-students.jpg';
import schoolLogo from '@/assets/college-rebero-logo.png';

interface Stat { label: string; value: string; hint: string; icon: typeof Users }

const modules = [
  {
    icon: ClipboardList,
    title: 'Behavior Scores',
    desc: 'Deduct conduct marks per category, every student starts each term at 40/40.',
    tone: 'bg-emerald-100 text-emerald-700',
  },
  {
    icon: Bell,
    title: 'Parent SMS',
    desc: 'Bilingual alerts (EN/RW) sent automatically with deducted and remaining marks.',
    tone: 'bg-blue-100 text-blue-700',
  },
  {
    icon: FileText,
    title: 'Academic Reports',
    desc: 'Per-term CAT/Exam marks, class position and printable PDF report cards.',
    tone: 'bg-amber-100 text-amber-700',
  },
  {
    icon: CheckCircle,
    title: 'Role-Based Access',
    desc: 'Admin, teacher, parent and read-only viewer permissions enforced end to end.',
    tone: 'bg-emerald-50 text-emerald-600',
  },
];

export default function Index() {
  const { user, loading } = useAuth();
  const [verifiedStats, setVerifiedStats] = useState<Stat[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    // Only display institution stats that are actually verified from the database
    const load = async () => {
      try {
        const [studentRes, classRes] = await Promise.all([
          supabase.from('students').select('*', { count: 'exact', head: true }),
          supabase.from('classes').select('*', { count: 'exact', head: true }),
        ]);
        const stats: Stat[] = [];
        if (studentRes.count != null) {
          stats.push({ label: 'Students Enrolled', value: studentRes.count.toLocaleString(), hint: 'Active record in College De Rebero', icon: GraduationCap });
        }
        if (classRes.count != null) {
          stats.push({ label: 'Classes', value: classRes.count.toLocaleString(), hint: 'Served across all grades', icon: Users });
        }
        stats.push({ label: 'System', value: 'Online', hint: 'Live and ready to serve', icon: CheckCircle });
        setVerifiedStats(stats);
      } catch {
        // Stats not available publicly — stay silent
      } finally {
        setStatsLoading(false);
      }
    };
    if (!user) load();
    else setStatsLoading(false);
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={schoolLogo} alt="College De Rebero" width={32} height={32} className="h-8 w-8 object-contain" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-slate-900">College De Rebero</p>
              <p className="truncate text-[11px] text-slate-500">Behavior Management System</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 sm:inline-flex">
              System online
            </span>
            <Link to="/login"><Button variant="outline" size="sm" className="gap-1.5"><LogIn className="h-4 w-4" />Sign In</Button></Link>
            <Link to="/signup"><Button size="sm">Create Account</Button></Link>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Static nav preview (system shell) */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50 p-3 lg:flex">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Modules</p>
          <nav className="space-y-1">
            {[
              { label: 'Dashboard', icon: LayoutDashboard },
              { label: 'Students', icon: GraduationCap },
              { label: 'Behavior Scores', icon: ClipboardList },
              { label: 'Attendance', icon: CalendarCheck },
              { label: 'Academic Reports', icon: FileText },
              { label: 'Reports', icon: BarChart3 },
              { label: 'Users', icon: Users },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-slate-600">
                <item.icon className="h-4 w-4" />
                {item.label}
              </div>
            ))}
          </nav>
          <div className="mt-auto rounded-[10px] border border-slate-200 bg-white p-3 text-[12.5px] text-slate-500">
            Sign in to unlock the modules for your role.
          </div>
        </aside>

        {/* Main workspace */}
        <main className="flex-1 min-w-0 space-y-5 p-3 sm:p-5 lg:p-8">
          {/* Hero */}
          <section className="relative overflow-hidden rounded-[14px] border border-slate-200 bg-white">
            <img
              src={landingStudents}
              alt="Students at College De Rebero"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/85 via-emerald-800/70 to-emerald-700/40" />
            <div className="relative z-10 flex flex-col justify-center gap-3 p-6 sm:p-10">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[12px] font-medium text-white">
                <Building2 className="h-3.5 w-3.5" /> College De Rebero · Kigali, Rwanda
              </p>
              <h1 className="text-[32px] font-bold tracking-tight text-white sm:text-[40px]">
                Student Behavior &amp; Academic Records
              </h1>
              <p className="max-w-2xl text-[15px] text-white/90">
                Record conduct deductions, take attendance, enter subject marks and generate ranked
                report cards — all in one internal system.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Link to="/login"><Button size="sm" className="gap-2 bg-white text-emerald-800 hover:bg-emerald-50">Open the system <ArrowRight className="h-4 w-4" /></Button></Link>
                <Link to="/signup"><Button size="sm" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/15">Request access</Button></Link>
              </div>
            </div>
          </section>

          {/* Verified stats */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {statsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-[12px] border border-slate-200 bg-white p-3.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">—</p>
                  <p className="mt-1 animate-pulse text-xl font-bold text-slate-200">—</p>
                  <p className="text-[11px] text-slate-500">Verifying…</p>
                </div>
              ))
            ) : verifiedStats.length > 0 ? (
              verifiedStats.map((s) => (
                <div key={s.label} className="rounded-[12px] border border-slate-200 bg-white p-3.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</p>
                  <p className="mt-1 text-[26px] font-bold text-slate-900">{s.value}</p>
                  <p className="text-[11px] text-slate-500">{s.hint}</p>
                </div>
              ))
            ) : (
              <div className="col-span-2 text-sm text-slate-500 lg:col-span-4">
                Institution statistics are available once verified data is loaded.
              </div>
            )}
          </section>

          {/* Modules panel */}
          <section className="rounded-[14px] border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-[18px] font-semibold text-slate-900">Available modules</h2>
              <span className="text-[12.5px] text-slate-500">Access depends on your role</span>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {modules.map((m) => (
                <div key={m.title} className="flex gap-3 rounded-[10px] border border-slate-200 bg-slate-50 p-3.5">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${m.tone}`}>
                    <m.icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="text-[14.5px] font-semibold text-slate-900">{m.title}</h3>
                    <p className="mt-1 text-[12.5px] text-slate-500">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Access row */}
          <section className="flex flex-col items-start justify-between gap-3 rounded-[14px] border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-2.5">
              <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-[14px] font-medium text-slate-900">Already registered?</p>
                <p className="text-[12.5px] text-slate-500">
                  New accounts start as read-only viewers until an administrator assigns a role.
                </p>
              </div>
            </div>
            <Link to="/login"><Button size="sm">Sign in</Button></Link>
          </section>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-[12px] text-slate-500 sm:text-left">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span>Gicumbi, Ruvune, Rebero · +250 788 000 000 · info@collegederebero.rw</span>
          <span>© {new Date().getFullYear()} College De Rebero — Excellence · Discipline · Integrity</span>
        </div>
      </footer>
    </div>
  );
}
