import { AppRole } from '@/types/database';

export const canViewStock = (role: AppRole | null | undefined): boolean =>
  role === 'admin' || role === 'teacher' || role === 'viewer' ||
  role === 'stock_manager' || role === 'storekeeper';

export const canRecordStock = (role: AppRole | null | undefined): boolean =>
  role === 'admin' || role === 'stock_manager' || role === 'storekeeper';

export const canManageStockSettings = (role: AppRole | null | undefined): boolean =>
  role === 'admin' || role === 'stock_manager';
