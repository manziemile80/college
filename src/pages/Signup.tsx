import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, ShieldCheck, GraduationCap } from 'lucide-react';
import schoolLogo from '@/assets/college-rebero-logo.png';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function Signup() {
  const { user, loading: authLoading, signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountType, setAccountType] = useState<'student' | 'parent' | 'viewer'>('student');
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

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    const { error } = await signUp(email, password, fullName, accountType);

    if (error) {
      toast.error('Signup failed', { description: error.message });
    } else {
      toast.success('Account created!', {
        description:
          accountType === 'student'
            ? 'Check your email to confirm, then sign in to take quizzes and assignments.'
            : 'Check your email to confirm, then sign in.',
      });
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row overflow-hidden">
      {/* Left section — form (form first on mobile) */}
      <div className="order-2 flex flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:order-1 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3">
            <img src={schoolLogo} alt="College De Rebero" className="h-14 w-14 object-contain" />
            <div>
              <h1 className="text-[32px] font-bold text-slate-900">College De Rebero</h1>
              <p className="text-[13px] text-slate-500">Behavior Management System</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-[32px] font-bold tracking-tight text-slate-900">Create an account</h2>
              <p className="mt-2 text-[13.5px] text-slate-500">
                Get started with College De Rebero today
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Eric Kamana"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accountType">I am a</Label>
                <Select value={accountType} onValueChange={(v) => setAccountType(v as typeof accountType)}>
                  <SelectTrigger id="accountType" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="parent">Parent</SelectItem>
                    <SelectItem value="viewer">Staff / other (view only)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[12.5px] text-slate-500">
                  Students get access to quizzes and assignments after signing in.
                </p>
              </div>

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
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password"
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

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-11"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="h-12 w-full gap-2 bg-gradient-to-br from-emerald-600 to-green-600 text-white shadow-md hover:from-emerald-700 hover:to-green-500"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-5 w-5" />
                    Create Account
                  </>
                )}
              </Button>
            </form>

            <p className="text-center text-[13px] text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-emerald-600 hover:underline">
                Sign in
              </Link>
            </p>
            <p className="text-center text-[12.5px] text-slate-400">
              College De Rebero · Excellence · Discipline · Integrity
            </p>
          </div>
        </div>
      </div>

      {/* Right section — promotional (simplified on mobile) */}
      <div className="relative order-1 hidden flex-1 bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-500 lg:flex items-center justify-center overflow-hidden p-10">
        <div className="absolute -left-20 top-20 h-64 w-64 rounded-full bg-white/10" />
        <div className="absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-white/5" />

        <div className="relative max-w-lg text-white text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-[34px] font-bold tracking-tight drop-shadow-sm sm:text-[36px]">
            Join the Future of Student Management
          </h2>
          <p className="mt-6 text-[18px] opacity-90 drop-shadow-sm">
            Create an account and work with your school administrator to get set up with the appropriate access level.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4 text-center">
            {[
              { label: 'Real-time behavior tracking', icon: '✓' },
              { label: 'Instant parent notifications', icon: '✓' },
              { label: 'Comprehensive reports', icon: '✓' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 font-bold">{item.icon}</span>
                <span className="text-[14px] opacity-95">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link to="/login">
              <Button className="h-11 gap-2 bg-white text-emerald-700 hover:bg-emerald-50">
                Sign in instead
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
