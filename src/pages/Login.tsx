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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
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
    <div className="min-h-screen bg-slate-50 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen">
        {/* Left section — login form */}
        <div className="flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-lg">
            <div className="mb-6 flex items-center gap-3">
              <img src={schoolLogo} alt="College De Rebero" className="h-16 w-16 object-contain" />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">College De Rebero</h1>
                <p className="text-sm text-slate-500">Behavior Management System</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
                <p className="mt-2 text-sm text-slate-500">Sign in to your account to continue.</p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-6">
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:ring-2 focus-within:ring-emerald-500">
                  <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    id="email"
                    type="email"
                    className="w-full border-0 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none bg-transparent"
                    placeholder="you@school.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:ring-2 focus-within:ring-emerald-500">
                  <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="w-full border-0 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none bg-transparent"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-600"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <button type="submit" className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 disabled:opacity-50" disabled={loading}>
                  {loading ? (
                    <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Signing in...</>
                  ) : (
                    <><GraduationCap className="w-5 h-5" /> Sign In</>
                  )}
                </button>
              </form>

              <div className="text-center mt-4">
                <Link to="/signup" className="text-sm font-medium text-emerald-600 hover:underline">
                  Sign Up
                </Link>
              </div>

              <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 mt-5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">Student Marks Checking</p>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    View your behavior records, attendance and academic progress from anywhere.
                  </p>
                  <Link to="/check-marks" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline">
                    Check your marks
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-center items-center gap-2 text-xs text-slate-500">
              College De Rebero · Excellence · Discipline · Integrity
              <a href="https://college-mis-beta.vercel.app/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-600 hover:underline">
                Live site
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>

            <div className="lg:hidden mt-6">
              <div className="bg-white rounded-xl shadow p-4 text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600 text-white"><GraduationCap className="w-5 h-5" /></div>
                <p className="mt-2 font-semibold text-emerald-600">Track behavior • Attendance • Reports</p>
                <p className="mt-1 text-xs text-emerald-600">Better Learning. Brighter Future.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right section — promo */}
        <div className="hidden lg:flex items-center justify-center overflow-hidden relative bg-emerald-900">
          <img src={schoolImage} alt="School building at College De Rebero" className="absolute inset-0 w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-black/25" />
          <div className="relative max-w-xl px-8 text-white text-center">
            <h2 className="text-3xl font-bold text-white">Empowering Schools to Build Better Students</h2>
            <p className="mt-5 text-sm opacity-90">
              Track student behavior, engage parents with instant notifications, and foster a positive learning environment with our comprehensive management system.
            </p>
            {promoStats && (
              <div className="grid grid-cols-3 gap-3 mt-8">
                {[
                  { icon: GraduationCap, label: 'Students', value: promoStats.students },
                  { icon: BookOpen, label: 'Classes', value: promoStats.classes },
                  { icon: CalendarCheck, label: 'Attendance Rate', value: `${promoStats.attendanceRate}%` },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-2 rounded-lg border border-white/20 bg-white/10 p-4">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/20"><s.icon className="w-5 h-5 text-amber-300" /></div>
                    <p className="font-bold text-white text-lg">{s.value}</p>
                    <p className="text-xs text-white/80">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 mt-6 rounded-lg bg-white text-emerald-800 font-semibold px-4 py-2 hover:bg-slate-100">
              <GraduationCap className="w-5 h-5" /> Create Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}