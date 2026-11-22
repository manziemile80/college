import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, GraduationCap, Mail, Lock, CheckCircle2, ArrowRight, BookOpen, CalendarCheck } from '@/lib/icons';
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
      <div className="d-flex min-h-screen align-items-center justify-content-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
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
    <div className="d-flex min-h-screen overflow-hidden bg-background">
      {/* Left section â€” login form (first on mobile) */}
      <div className="d-flex flex-1 align-items-center justify-content-center px-4 py-10 sm:px-6 lg:px-10">
        <div className="w-100 max-w-lg">
          {/* Institution header */}
          <div className="mb-7 d-flex align-items-center g-3">
            <img src={schoolLogo} alt="College De Rebero" className="h-16 w-16 object-contain" />
            <div>
              <h1 className="fs-32 fw-bold text-slate-900">College De Rebero</h1>
              <p className="fs-13.5 text-slate-500">Behavior Management System</p>
            </div>
          </div>

          {/* Large white rounded login container */}
          <div className="rounded-[22px] border border-slate-200 bg-white px-6 py-8 shadow-lg sm:px-8">
            <div>
              <h2 className="fs-30 md:fs-34 fw-bold text-slate-900">Welcome back</h2>
              <p className="mt-2 fs-14 text-slate-500">
                Sign in to your account to continue.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              {/* Email input with email icon */}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="position-relative">
                  <Mail className="pointer-events-none position-absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@school.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 pl-10"
                  />
                </div>
              </div>

              {/* Password input with lock icon + visibility toggle */}
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="position-relative">
                  <Lock className="pointer-events-none position-absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 pr-11 pl-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="position-absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Large green gradient Sign In button */}
              <Button
                type="submit"
                disabled={loading}
                className="h-12 w-100 g-2 bg-gradient-to-br from-emerald-600 to-green-600 text-white shadow-md hover:from-emerald-700 hover:to-green-500"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <GraduationCap className="h-5 w-5" />
                )}
                Sign In
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link to="/signup" className="d-inline-flex align-items-center g-2 fs-14 fw-medium text-emerald-700 hover:underline">
                Sign Up
              </Link>
            </div>

            {/* Student marks checking information panel */}
            <div className="mt-5 d-flex g-3 rounded-[14px] border border-slate-200 bg-emerald-50 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="fs-14 fw-semibold text-slate-900">Student Marks Checking</p>
                <p className="mt-1 fs-13 leading-relaxed text-slate-500">
                  View your behavior records, attendance and academic progress from anywhere.
                </p>
                <Link to="/check-marks" className="mt-2 d-inline-flex align-items-center g-1 fs-13 fw-medium text-emerald-600 hover:underline">
                  Check your marks
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center fs-12.5 text-slate-400">
            College De Rebero Â· Excellence Â· Discipline Â· Integrity
          </p>

          {/* Mobile/tablet promo — simplified, no unverified statistics */}
          <div className="mt-6 d-block d-md-none p-4 rounded-[16px] border border-emerald-200 bg-emerald-50 text-center">
            <div className="d-flex justify-content-center">
              <span className="rounded-circle d-inline-flex h-9 w-9 align-items-center justify-content-center bg-emerald-600">
                <GraduationCap className="h-5 w-5 text-white" />
              </span>
            </div>
            <p className="mt-2 fw-semibold fs-14 text-emerald-700">Track behavior • Attendance • Reports</p>
            <p className="mt-1 fs-13 text-emerald-600">Better Learning. Brighter Future.</p>
          </div>
        </div>
      </div>

      {/* Right section â€” promo (large school image + dark green overlay) */}
      <div className="position-relative d-none flex-1 lg:d-flex align-items-center justify-content-center overflow-hidden bg-[#064E3B]">
        <div className="position-absolute inset-0">
          <img src={schoolImage} alt="School building at College De Rebero" className="h-100 w-100 object-cover" />
          <div className="position-absolute inset-0 bg-[#064E3B] opacity-60" />
        </div>

        {/* Decorative curved shapes */}
        <svg className="pointer-events-none position-absolute left-6 top-6 h-64 w-64" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="120" cy="120" r="115" fill="#D1FAE5" opacity="0.3" />
          <circle cx="70" cy="190" r="40" fill="#ECFDF5" opacity="0.35" />
          <ellipse cx="190" cy="90" rx="35" ry="18" fill="#F0FDF4" opacity="0.2" />
        </svg>
        <svg className="pointer-events-none position-absolute bottom-8 right-8 h-72 w-72" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="120" cy="95" r="100" fill="#ECFDF5" opacity="0.2" />
        </svg>

        <div className="position-relative max-w-xl px-8 text-white">
          <h2 className="fs-34 fw-bold tracking-tight drop-shadow-sm">
            Empowering Schools to{' '}
            <span className="rounded-circle bg-golden px-3 py-1 fw-bold text-slate-900">
              Build Better Students
            </span>
          </h2>
          <p className="mt-7 fs-18 leading-relaxed text-white/90 drop-shadow-sm">
            Track student behavior, engage parents with instant notifications, and foster a positive learning environment with our comprehensive management system.
          </p>

          {promoStats && (
            <div className="mt-10 grid grid-cols-3 g-3 sm:g-4 lg:grid-cols-3">
              <div className="d-flex flex-column g-2 rounded-[16px] border border-white/20 bg-white/10 px-4 py-5">
                <div className="rounded-circle d-inline-flex h-10 w-10 align-items-center justify-content-center bg-white/20">
                  <GraduationCap className="h-5 w-5 text-golden" />
                </div>
                <p className="mt-2 fs-28 fw-bold text-white">{promoStats.students}</p>
                <p className="fs-13 fw-medium text-white/80">Students</p>
              </div>
              <div className="d-flex flex-column g-2 rounded-[16px] border border-white/20 bg-white/10 px-4 py-5">
                <div className="rounded-circle d-inline-flex h-10 w-10 align-items-center justify-content-center bg-white/20">
                  <BookOpen className="h-5 w-5 text-golden" />
                </div>
                <p className="mt-2 fs-28 fw-bold text-white">{promoStats.classes}</p>
                <p className="fs-13 fw-medium text-white/80">Classes</p>
              </div>
              <div className="d-flex flex-column g-2 rounded-[16px] border border-white/20 bg-white/10 px-4 py-5">
                <div className="rounded-circle d-inline-flex h-10 w-10 align-items-center justify-content-center bg-white/20">
                  <CalendarCheck className="h-5 w-5 text-golden" />
                </div>
                <p className="mt-2 fs-28 fw-bold text-white">{promoStats.attendanceRate}%</p>
                <p className="fs-13 fw-medium text-white/80">Attendance Rate</p>
              </div>
            </div>
          )}
          <p className="mt-10 fs-15 fw-semibold text-white/95">
            Better Learning. Brighter Future.
          </p>
          <Link to="/signup">
            <Button className="h-11 g-2 bg-white text-emerald-700 hover:bg-slate-50">
              <GraduationCap className="h-5 w-5" /> Create Account
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}




