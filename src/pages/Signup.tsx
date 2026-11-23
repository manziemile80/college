import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Loader2, ShieldCheck, GraduationCap } from '@/lib/icons';
import schoolLogo from '@/assets/college-rebero-logo.png';
import { toast } from 'sonner';

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
    <div className="min-vh-100 bg-body d-flex flex-column d-lg-flex flex-row overflow-hidden">
      {/* Left section — form (first on mobile) */}
      <div className="order-2 d-flex flex-1 flex-column justify-content-center px-6 px-sm-5 py-12">
        <div className="mx-auto w-100 max-w-md">
          <div className="mb-5 d-flex align-items-center gap-3">
            <img src={schoolLogo} alt="College De Rebero" className="bd-h-16 bd-w-16 object-contain" />
            <div>
              <h1 className="fw-bold text-main mb-0">College De Rebero</h1>
              <p className="bd-fs-sm text-muted mb-0">Behavior Management System</p>
            </div>
          </div>

          <div className="d-flex flex-column gap-5">
            <div>
              <h2 className="fw-bold text-main mb-1">Create an account</h2>
              <p className="mt-2 bd-fs-md text-muted">Get started with College De Rebero today</p>
            </div>

            <form onSubmit={handleSubmit} className="d-flex flex-column gap-4">
              <div className="d-flex flex-column gap-2">
                <label className="form-label">Full Name</label>
                <input
                  className="form-control bd-h-11"
                  type="text"
                  placeholder="Eric Kamana"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="d-flex flex-column gap-2">
                <label className="form-label">I am a</label>
                <select
                  className="form-select bd-h-11"
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value as typeof accountType)}
                >
                  <option value="student">Student</option>
                  <option value="parent">Parent</option>
                  <option value="viewer">Staff / other (view only)</option>
                </select>
                <p className="text-muted bd-fs-sm mb-0 mt-1">
                  Students get access to quizzes and assignments after signing in.
                </p>
              </div>

              <div className="d-flex flex-column gap-2">
                <label className="form-label">Email</label>
                <input
                  className="form-control bd-h-11"
                  type="email"
                  placeholder="you@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="d-flex flex-column gap-2">
                <label className="form-label">Password</label>
                <div className="input-group">
                  <input
                    id="password"
                    className="form-control bd-h-11"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button type="button" className="input-group-text btn bd-h-11" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility">
                    {showPassword ? <EyeOff className="text-secondary" /> : <Eye className="text-secondary" />}
                  </button>
                </div>
              </div>

              <div className="d-flex flex-column gap-2">
                <label className="form-label">Confirm Password</label>
                <input
                  className="form-control bd-h-11"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-success btn-lg w-100 d-inline-flex align-items-center justify-content-center gap-2"
                disabled={loading}
              >
                {loading ? (
                  <><span className="spinner-border spinner-border-sm" /> Creating account...</>
                ) : (
                  <><ShieldCheck /> Create Account</>
                )}
              </button>
            </form>

            <p className="text-center mb-0 bd-fs-md text-muted">
              Already have an account?{' '}
              <Link to="/login" className="fw-medium text-success text-decoration-none">Sign in</Link>
            </p>
            <p className="text-center mt-1 bd-fs-sm text-secondary">
              College De Rebero · Excellence · Discipline · Integrity
            </p>
          </div>
        </div>
      </div>

      {/* Right section — promotional */}
      <div className="position-relative order-1 d-none d-lg-flex flex-1 align-items-center justify-content-center overflow-hidden bd-dark-panel p-10">
        <div className="position-relative max-w-lg text-white text-center">
          <div className="mx-auto mb-5 d-flex align-items-center justify-content-center rounded-circle bg-white-20 bd-h-14 bd-w-14"><GraduationCap className="fs-5 text-white" /></div>
          <h2 className="fw-bold text-white mb-0">Join the Future of Student Management</h2>
          <p className="mt-5 bd-fs-md opacity-90">
            Create an account and work with your school administrator to get set up with the appropriate access level.
          </p>
          <div className="d-flex flex-column gap-3 align-items-center mt-8">
            {[
              'Real-time behavior tracking',
              'Instant parent notifications',
              'Comprehensive reports',
            ].map((label) => (
              <div key={label} className="d-flex align-items-center gap-3">
                <span className="d-inline-flex align-items-center justify-content-center rounded-circle bg-white-20 bd-h-10 bd-w-10 text-golden"><GraduationCap className="fs-6 text-white" /></span>
                <span className="bd-fs-md text-white opacity-95">{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link to="/login" className="d-inline-flex align-items-center">
              <button type="button" className="btn btn-light">Sign in instead</button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
