import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Eye, EyeOff, Loader2, GraduationCap, Mail, Lock, CheckCircle2, ArrowRight, ArrowUpRight, BookOpen, CalendarCheck } from '@/lib/icons';
import { toast } from 'sonner';
import schoolLogo from '@/assets/college-rebero-logo.png';
import schoolImage from '@/assets/landing-school.jpg';

interface PromoStats { students: number; classes: number; attendanceRate: number; }

export default function Login() {
  const { user, loading: authLoading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [promoStats, setPromoStats] = useState<PromoStats | null>(null);

  // Verified real statistics from the database, shown as promotional stats.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const yearStart = `${new Date().getFullYear()}-01-01`;
        const [studentsRes, classesRes, attRes] = await Promise.all([
          supabase.from('students').select('*', { count: 'exact', head: true }),
          supabase.from('classes').select('*', { count: 'exact', head: true }),
          supabase.from('attendance').select('status').gte('attendance_date', yearStart),
        ]);
        const attRows = (attRes.data as { status: string }[]) || [];
        const present = attRows.filter((r) => r.status === 'present').length;
        if (!cancelled) {
          setPromoStats({
            students: studentsRes.count ?? 0,
            classes: classesRes.count ?? 0,
            attendanceRate: attRows.length ? Math.round((present / attRows.length) * 100) : 0,
          });
        }
      } catch (error) {
        console.error('Login promo stats error:', error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (authLoading) {
    return (
      <div className="d-flex min-vh-100 align-items-center justify-content-center bg-body">
        <span className="spinner-border spinner-border-lg text-success" role="status" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast.error('Login failed', { description: error.message });
    } else {
      toast.success('Welcome back!');
    }

    setLoading(false);
  };

  return (
    <div className="min-vh-100 bg-body overflow-hidden">
      <div className="row g-0">
        {/* Left section — login form (first on mobile) */}
        <div className="col-12 col-lg-6 d-flex align-items-center justify-content-center px-4 py-10">
          <div className="w-100 max-w-lg">
            {/* Institution header */}
            <div className="mb-5 d-flex align-items-center gap-3">
              <img src={schoolLogo} alt="College De Rebero" className="bd-h-16 bd-w-16 object-contain" />
              <div>
                <h1 className="fw-bold text-main mb-0">College De Rebero</h1>
                <p className="bd-fs-md text-muted mb-0">Behavior Management System</p>
              </div>
            </div>

            <div className="card bg-white rounded-4 shadow-lg p-5 p-sm-6">
              <div>
                <h2 className="fw-bold text-main mb-2">Welcome back</h2>
                <p className="mt-2 bd-fs-md text-muted">Sign in to your account to continue.</p>
              </div>

              <form onSubmit={handleSubmit} className="d-flex flex-column gap-4 mt-6">
                {/* Email */}
                <div className="input-group">
                  <span className="input-group-text bg-white border-secondary-subtle"><Mail className="text-secondary" /></span>
                  <input
                    id="email"
                    type="email"
                    className="form-control bd-h-12"
                    placeholder="you@school.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                {/* Password with visibility toggle */}
                <div className="input-group">
                  <span className="input-group-text bg-white border-secondary-subtle"><Lock className="text-secondary" /></span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-control bd-h-12"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="input-group-text btn bd-h-12"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="text-secondary" /> : <Eye className="text-secondary" />}
                  </button>
                </div>

                {/* Sign In button */}
                <button type="submit" className="btn btn-success btn-lg w-100 d-inline-flex align-items-center justify-content-center gap-2" disabled={loading}>
                  {loading ? (
                    <><span className="spinner-border spinner-border-sm" /> Signing in...</>
                  ) : (
                    <><GraduationCap /> Sign In</>
                  )}
                </button>
              </form>

              <div className="text-center mt-4">
                <Link to="/signup" className="d-inline-flex align-items-center gap-2 bd-fs-md fw-medium text-success text-decoration-none">
                  Sign Up
                </Link>
              </div>

              {/* Student marks checking information panel */}
              <div className="d-flex gap-3 rounded-3 border border-secondary-subtle bg-secondary-subtle p-4 mt-5">
                <CheckCircle2 className="flex-shrink-0 fs-5 text-success" />
                <div className="min-w-0">
                  <p className="fw-semibold text-main mb-0">Student Marks Checking</p>
                  <p className="mt-1 bd-fs-sm text-secondary leading-relaxed">
                    View your behavior records, attendance and academic progress from anywhere.
                  </p>
                  <Link to="/check-marks" className="mt-2 d-inline-flex align-items-center gap-1 bd-fs-sm fw-medium text-success text-decoration-none">
                    Check your marks
                    <ArrowRight className="fs-6" />
                  </Link>
                </div>
              </div>
            </div>

            <div className="mt-5 d-flex flex-wrap justify-content-center align-items-center gap-2 bd-fs-sm text-secondary">
              College De Rebero · Excellence · Discipline · Integrity
              <a
                href="https://college-mis-beta.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="d-inline-flex align-items-center gap-1 text-success text-decoration-none"
              >
                Live site
                <ArrowUpRight className="fs-6" />
              </a>
            </div>

            {/* Mobile/tablet promo — simplified, no unverified statistics */}
            <div className="d-lg-none mt-5">
              <div className="card">
                <div className="card-body text-center">
                  <div className="d-inline-flex align-items-center justify-content-center rounded-circle bg-success text-white bd-h-9 bd-w-9"><GraduationCap className="fs-5" /></div>
                  <p className="mt-2 fw-semibold text-success">Track behavior • Attendance • Reports</p>
                  <p className="mt-1 bd-fs-sm text-success">Better Learning. Brighter Future.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right section — promo (large school image + dark green overlay) */}
        <div className="col-12 col-lg-6 d-none d-lg-flex align-items-center justify-content-center overflow-hidden position-relative bd-dark-panel">
          <img src={schoolImage} alt="School building at College De Rebero" className="h-100 w-100 object-cover opacity-30" />
          <div className="position-absolute inset-0 bg-dark opacity-25" />

          <div className="position-relative max-w-xl px-8 text-white text-center">
            <h2 className="fw-bold text-white mb-0">
              Empowering Schools to Build Better Students
            </h2>
            <p className="mt-5 bd-fs-md opacity-90">
              Track student behavior, engage parents with instant notifications, and foster a positive learning environment with our comprehensive management system.
            </p>

            {promoStats && (
              <div className="row g-3 mt-8">
                {[
                  { icon: GraduationCap, label: 'Students', value: promoStats.students },
                  { icon: BookOpen, label: 'Classes', value: promoStats.classes },
                  { icon: CalendarCheck, label: 'Attendance Rate', value: `${promoStats.attendanceRate}%` },
                ].map((s) => (
                  <div key={s.label} className="col-4">
                    <div className="d-flex flex-column align-items-center gap-2 rounded-3 border border-white-20 bg-white-10 p-4">
                      <div className="d-inline-flex align-items-center justify-content-center rounded-circle bg-white-20 bd-h-10 bd-w-10"><s.icon className="fs-5 text-golden" /></div>
                      <p className="fw-bold text-white mb-0 bd-fs-lg">{s.value}</p>
                      <p className="bd-fs-sm text-white opacity-80">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Link to="/signup" className="d-inline-flex align-items-center justify-content-center gap-2 mt-6 btn btn-light">
              <GraduationCap /> Create Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
