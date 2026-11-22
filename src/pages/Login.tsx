import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, GraduationCap, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import schoolLogo from '@/assets/college-rebero-logo.png';

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
    <div className="flex min-h-screen overflow-hidden">
      {/* Left section — form */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          {/* Logo */}
          <div className="mb-8 flex items-center gap-3">
            <img src={schoolLogo} alt="College De Rebero" className="h-14 w-14 object-contain" />
            <div>
              <h1 className="text-[26px] font-bold text-slate-900">College De Rebero</h1>
              <p className="text-[13px] text-slate-500">Behavior Management System</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-[28px] font-bold tracking-tight text-slate-900">Welcome back</h2>
              <p className="mt-2 text-[13.5px] text-slate-500">
                Sign in to your account to continue
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link to="/check-marks" className="text-[12.5px] font-medium text-emerald-600 hover:underline">
                    Student? Check your marks
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 pr-10"
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

              <Button type="submit" className="w-full h-11 gap-2" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <GraduationCap className="h-5 w-5" />
                    Sign In
                  </>
                )}
              </Button>
            </form>

            <p className="text-center text-[13px] text-slate-500">
              Don't have an account?{' '}
              <Link to="/signup" className="font-medium text-emerald-600 hover:underline">
                Sign up
              </Link>
            </p>
            <p className="text-center text-[13px] text-slate-500">
              Need your registration number?{' '}
              <Link to="/check-marks" className="font-medium text-emerald-600 hover:underline">
                Check your marks here
              </Link>
            </p>
            <p className="text-center text-[12.5px] text-slate-400">
              College De Rebero · Excellence · Discipline · Integrity
            </p>
          </div>
        </div>
      </div>

      {/* Right section — promo */}
      <div className="relative hidden flex-1 bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-500 lg:flex items-center justify-center overflow-hidden p-10">
        {/* Decorative geometric shapes */}
        <div className="absolute -left-20 top-20 h-64 w-64 rounded-full bg-white/10" />
        <div className="absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-white/5" />

        <div className="relative max-w-lg text-white text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-[34px] font-bold tracking-tight drop-shadow-sm sm:text-[36px]">
            Empowering Schools to Build Better Students
          </h2>
          <p className="mt-6 text-[18px] opacity-90 drop-shadow-sm">
            Track student behavior, engage parents with instant notifications, and foster a positive
            learning environment with our comprehensive management system.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-[30px] font-bold">500+</p>
              <p className="mt-1 text-[13px] opacity-80">Schools</p>
            </div>
            <div>
              <p className="text-[30px] font-bold">50K+</p>
              <p className="mt-1 text-[13px] opacity-80">Students</p>
            </div>
            <div>
              <p className="text-[30px] font-bold">98%</p>
              <p className="mt-1 text-[13px] opacity-80">Satisfaction</p>
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to="/signup">
              <Button className="h-11 gap-2 bg-white text-emerald-700 hover:bg-emerald-50">
                <GraduationCap className="h-5 w-5" />Create Account
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
