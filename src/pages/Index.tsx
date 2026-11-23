import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
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
} from '@/lib/icons';
import landingStudents from '@/assets/landing-students.jpg';
import schoolLogo from '@/assets/college-rebero-logo.png';

interface Stat { label: string; value: string; hint: string; icon: React.ComponentType<any> }

const modules = [
  {
    icon: ClipboardList,
    title: 'Behavior Scores',
    desc: 'Deduct conduct marks per category, every student starts each term at 40/40.',
    tone: 'bg-success-subtle text-success',
  },
  {
    icon: Bell,
    title: 'Parent SMS',
    desc: 'Bilingual alerts (EN/RW) sent automatically with deducted and remaining marks.',
    tone: 'bg-info-subtle text-info',
  },
  {
    icon: FileText,
    title: 'Academic Reports',
    desc: 'Per-term CAT/Exam marks, class position and printable PDF report cards.',
    tone: 'bg-warning-subtle text-warning',
  },
  {
    icon: CheckCircle,
    title: 'Role-Based Access',
    desc: 'Admin, teacher, parent and read-only viewer permissions enforced end to end.',
    tone: 'bg-success-subtle text-success',
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
      <div className="min-vh-100 bg-body d-flex align-items-center justify-content-center">
        <span className="spinner-border spinner-border-lg text-success" role="status" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-vh-100 bg-body d-flex flex-column">
      {/* Top bar */}
      <header className="position-sticky top-0 z-30 border-bottom border-secondary-subtle bg-white">
        <div className="d-flex bd-h-16 align-items-center justify-content-between gap-3 px-3 px-sm-5">
          <div className="d-flex align-items-center gap-3 min-w-0">
            <img src={schoolLogo} alt="College De Rebero" width={32} height={32} className="object-contain" />
            <div className="min-w-0">
              <p className="text-truncate fw-semibold text-main">College De Rebero</p>
              <p className="text-truncate bd-fs-sm text-muted">Behavior Management System</p>
            </div>
          </div>
          <div className="d-flex align-items-center gap-2 flex-shrink-0">
            <span className="d-inline-flex align-items-center gap-1.5 rounded-pill border border-secondary-subtle bg-secondary-subtle px-3 py-1 bd-fs-sm text-secondary">
              System online
            </span>
            <Link to="/login" className="d-inline-flex">
              <button type="button" className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1"><LogIn /> Sign In</button>
            </Link>
            <Link to="/signup" className="d-inline-flex">
              <button type="button" className="btn btn-success btn-sm">Create Account</button>
            </Link>
          </div>
        </div>
      </header>

      <div className="d-flex flex-grow-1 w-100">
        {/* Static nav preview (system shell) */}
        <aside className="d-none d-lg-block bd-w-sidebar border-end border-secondary-subtle bg-secondary-subtle p-3">
          <p className="px-2 pb-2 bd-fs-sm fw-semibold text-uppercase tracking-wider text-secondary">Modules</p>
          <nav className="d-flex flex-column gap-1">
            {[
              { label: 'Dashboard', icon: LayoutDashboard },
              { label: 'Students', icon: GraduationCap },
              { label: 'Behavior Scores', icon: ClipboardList },
              { label: 'Attendance', icon: CalendarCheck },
              { label: 'Academic Reports', icon: FileText },
              { label: 'Reports', icon: BarChart3 },
              { label: 'Users', icon: Users },
            ].map((item) => (
              <div key={item.label} className="d-flex align-items-center gap-2.5 rounded-3 px-3 py-2 bd-fs-md text-secondary">
                <item.icon className="fs-5" />
                {item.label}
              </div>
            ))}
          </nav>
          <div className="mt-auto rounded-3 border border-secondary-subtle bg-white p-3 bd-fs-sm text-secondary">
            Sign in to unlock the modules for your role.
          </div>
        </aside>

        {/* Main workspace */}
        <main className="flex-grow-1 min-w-0 d-flex flex-column gap-5 p-3 p-sm-5 p-lg-5">
          {/* Hero */}
          <section className="card position-relative overflow-hidden p-6 p-sm-5">
            <img
              src={landingStudents}
              alt="Students at College De Rebero"
              className="position-absolute inset-0 h-100 w-100 object-cover opacity-20"
            />
            <div className="position-absolute inset-0 bg-dark" />
            <div className="position-relative z-3 d-flex flex-column justify-content-center gap-3">
              <p className="d-inline-flex align-items-center gap-2 rounded-pill border border-light bg-light px-3 py-1 bd-fs-sm text-dark text-light fw-medium">
                <Building2 className="fs-6" /> College De Rebero · Kigali, Rwanda
              </p>
              <h1 className="bd-fs-5 fw-bold text-white mb-0">Student Behavior &amp; Academic Records</h1>
              <p className="bd-fs-md text-white opacity-90 max-w-2xl">
                Record conduct deductions, take attendance, enter subject marks and generate ranked
                report cards — all in one internal system.
              </p>
              <div className="d-flex flex-wrap gap-2 pt-2">
                <Link to="/login">
                  <button type="button" className="btn btn-success btn-lg d-inline-flex align-items-center gap-2">
                    Open the system <ArrowRight />
                  </button>
                </Link>
                <Link to="/signup">
                  <button type="button" className="btn btn-outline-light">Request access</button>
                </Link>
              </div>
            </div>
          </section>

          {/* Verified stats */}
          <section className="row g-3">
            {statsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="col-12 col-sm-6 col-md-4">
                  <div className="card border-secondary-subtle bg-secondary-subtle">
                    <div className="card-body p-4">
                      <p className="bd-fs-sm fw-semibold text-uppercase tracking-wide text-secondary">—</p>
                      <p className="placeholder-glow fs-4 fw-bold text-secondary mb-2">—</p>
                      <p className="bd-fs-sm text-secondary mb-0">Verifying…</p>
                    </div>
                  </div>
                </div>
              ))
            ) : verifiedStats.length > 0 ? (
              verifiedStats.map((s) => (
                <div key={s.label} className="col-12 col-sm-6 col-md-4">
                  <div className="card h-100 d-flex flex-column justify-content-between p-4">
                    <div>
                      <p className="bd-fs-sm fw-semibold text-uppercase tracking-wide text-secondary">{s.label}</p>
                      <p className="fs-4 fw-bold text-main mb-0">{s.value}</p>
                      <p className="bd-fs-sm text-secondary mb-0 mt-1">{s.hint}</p>
                    </div>
                    <div className={`d-inline-flex align-items-center justify-content-center rounded-3 p-2 ${s.icon === CheckCircle ? 'bg-success-subtle text-success' : s.icon === Users ? 'bg-secondary-subtle text-secondary' : 'bg-secondary-subtle text-secondary'}`}>
                      <s.icon className="fs-5" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-12 text-muted bd-fs-sm">
                Institution statistics are available once verified data is loaded.
              </div>
            )}
          </section>

          {/* Modules panel */}
          <section className="card">
            <div className="card-header d-flex align-items-center justify-content-between py-3 border-bottom border-secondary-subtle">
              <h2 className="mb-0 fw-semibold text-main">Available modules</h2>
              <span className="bd-fs-sm text-muted">Access depends on your role</span>
            </div>
            <div className="card-body row g-3 p-4">
              {modules.map((m) => (
                <div key={m.title} className="col-12 col-sm-6">
                  <div className="d-flex gap-3 rounded-3 border border-secondary-subtle bg-secondary-subtle p-3.5 h-100">
                    <div className={`d-inline-flex h-9 w-9 shrink-0 align-items-center justify-content-center rounded-3 ${m.tone}`}>
                      <m.icon className="fs-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="fw-semibold text-main mb-1">{m.title}</h3>
                      <p className="text-muted bd-fs-sm mb-0">{m.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Access row */}
          <section className="card">
            <div className="card-body d-flex flex-column gap-3 justify-content-between p-4">
              <div className="d-flex align-items-start gap-2.5">
                <CheckCircle className="mt-0.5 fs-5 text-success" />
                <div>
                  <p className="fw-semibold text-main mb-0">Already registered?</p>
                  <p className="bd-fs-sm text-muted mt-1">
                    New accounts start as read-only viewers until an administrator assigns a role.
                  </p>
                </div>
              </div>
              <Link to="/login" className="d-inline-flex align-items-center">
                <button type="button" className="btn btn-success">Sign in</button>
              </Link>
            </div>
          </section>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-top border-secondary-subtle bg-white px-4 py-4">
        <div className="d-flex flex-column gap-1 d-sm-flex align-items-center justify-content-between">
          <span className="bd-fs-sm text-muted">
            Gicumbi, Ruvune, Rebero · +250 788 000 000 · info@collegederebero.rw
          </span>
          <span className="bd-fs-sm text-muted mt-1">
            © {new Date().getFullYear()} College De Rebero — Excellence · Discipline · Integrity
          </span>
        </div>
      </footer>
    </div>
  );
}
