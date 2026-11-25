import { Link } from 'react-router-dom';
import { AlertCircle } from '@/lib/icons';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-slate-50">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mb-5">
        <AlertCircle className="w-8 h-8" />
      </div>
      <h1 className="text-4xl font-bold text-slate-900">404</h1>
      <p className="mt-2 text-slate-500">Page not found</p>
      <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-4 py-2 font-medium hover:bg-emerald-700">
        Go to Dashboard
      </Link>
    </div>
  );
}