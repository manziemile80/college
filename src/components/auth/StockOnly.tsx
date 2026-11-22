import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function StockOnly({ children }: { children: JSX.Element }) {
  const { role, loading } = useAuth() as { role: string | null; loading?: boolean };
  if (loading) return null;
  if (role !== 'stock_manager') return <Navigate to="/dashboard" replace />;
  return children;
}
