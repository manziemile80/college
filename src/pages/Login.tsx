import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, GraduationCap, Mail, Lock, CheckCircle2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import schoolLogo from '@/assets/college-rebero-logo.png';
import schoolImage from '@/assets/landing-school.jpg';

export default function Login() {
  const { user, loading: authLoading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
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
    <div className="flex min-h-screen overflow-hidden bg-background">
      {/* Left section — login form (first on mobile) */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
        <div className="w-full max-w-lg">
          {/* Institution header */}
          <div className="mb-7 flex items-center gap-3">
            <img src={schoolLogo} alt="College De Rebero" className="h-16 w-16 object-contain" />
            <div>
              <h1 className="text-[32px] font-bold text-slate-900">College De Rebero</h1>
              <p className="text-[13.5px] text-slate-500">Behavior Management System</p>
            </div>
          </div>

          {/* Large white rounded login container */}
          <div className="rounded-[22px] border border-slate-200 bg-white px-6 py-8 shadow-lg sm:px-8">
            <div>
              <h2 className="text-[34px] font-bold text-slate-900">Welcome back</h2>
              <p className="mt-2 text-[14px] text-slate-500">
                Sign in to your account to continue.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              {/* Email input with email icon */}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
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
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
                className="h-12 w-full gap-2 bg-gradient-to-br from-emerald-600 to-green-600 text-white shadow-md hover:from-emerald-700 hover:to-green-500"
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
              <Link to="/signup" className="inline-flex items-center gap-2 text-[14px] font-medium text-emerald-700 hover:underline">
                Sign Up
              </Link>
            </div>

            {/* Student marks checking information panel */}
            <div className="mt-5 flex gap-3 rounded-[14px] border border-slate-200 bg-emerald-50 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-slate-900">Student Marks Checking</p>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                  View your behavior records, attendance and academic progress from anywhere.
                </p>
                <Link to="/check-marks" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-emerald-600 hover:underline">
                  Check your marks
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-[12.5px] text-slate-400">
            College De Rebero · Excellence · Discipline · Integrity
          </p>
        </div>
      </div>

      {/* Right section — promo (large school image + dark green overlay) */}
      <div className="relative hidden flex-1 lg:flex items-center justify-center overflow-hidden bg-[#064E3B]">
        <div className="absolute inset-0">
          <img src={schoolImage} alt="School building at College De Rebero" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[#064E3B] opacity-60" />
        </div>

        {/* Decorative curved shapes */}
        <svg className="pointer-events-none absolute left-6 top-6 h-64 w-64" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="120" cy="120" r="115" fill="#D1FAE5" opacity="0.3" />
          <circle cx="70" cy="190" r="40" fill="#ECFDF5" opacity="0.35" />
          <ellipse cx="190" cy="90" rx="35" ry="18" fill="#F0FDF4" opacity="0.2" />
        </svg>
        <svg className="pointer-events-none absolute bottom-8 right-8 h-72 w-72" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="120" cy="95" r="100" fill="#ECFDF5" opacity="0.2" />
        </svg>

        <div className="relative max-w-xl px-8 text-white">
          <h2 className="text-[34px] font-bold tracking-tight drop-shadow-sm">
            Empowering Schools to{' '}
            <span className="rounded-full bg-golden px-3 py-1 font-bold text-slate-900">
              Build Better Students
            </span>
          </h2>
          <p className="mt-7 text-[18px] leading-relaxed text-white/90 drop-shadow-sm">
            Track student behavior, engage parents with instant notifications, and foster a positive learning environment with our comprehensive management system.
          </p>
          <p className="mt-10 text-[15px] font-semibold text-white/95">
            Better Learning. Brighter Future.
          </p>
          <Link to="/signup">
            <Button className="h-11 gap-2 bg-white text-emerald-700 hover:bg-slate-50">
              <GraduationCap className="h-5 w-5" /> Create Account
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
