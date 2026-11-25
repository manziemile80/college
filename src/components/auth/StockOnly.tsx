import { Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { canViewStock } from '@/lib/stockRoles';

export function StockOnly({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (!canViewStock(role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
