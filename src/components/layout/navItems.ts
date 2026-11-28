import {
  LayoutDashboard,
  Users,
  GraduationCap,
  UserCheck,
  HelpCircle,
  ClipboardList,
  BarChart3,
  Settings,
  BookOpen,
  FileText,
  CalendarCheck,
  Pencil,
  Library,
  FolderOpen,
  NotebookPen,
  ListChecks,
  Package,
  Boxes,
  UserPlus,
  Gavel,
  Bell,
  ScrollText,
  ArrowDownCircle,
  ArrowUpCircle,
  AlertTriangle,
  History,
  Coins,
} from '@/lib/icons';
import type { AppRole } from '@/types/database';
import type { Permission } from '@/lib/permissions';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  /** Kept for display / migration compatibility; permissions are authoritative. */
  roles: AppRole[];
  /** One of these permissions is required to see and open the module. */
  permission: Permission | Permission[];
  group: 'Overview' | 'School' | 'E-Learning' | 'Records' | 'Operations' | 'Admin';
}

const stockRoles: AppRole[] = ['admin', 'stock_manager', 'storekeeper', 'viewer'];
const stockWriteRoles: AppRole[] = ['admin', 'stock_manager', 'storekeeper'];

export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'teacher', 'parent', 'student', 'viewer', 'stock_manager', 'storekeeper', 'dos', 'dod'], permission: 'dashboard.view', group: 'Overview' },

  { label: 'Students', href: '/students', icon: GraduationCap, roles: ['admin', 'teacher', 'viewer', 'dos', 'student', 'parent'], permission: 'students.view', group: 'School' },
  { label: 'Enrollment', href: '/enrollment', icon: UserPlus, roles: ['admin', 'teacher', 'dos'], permission: 'enrollment.view', group: 'School' },
  { label: 'Classes', href: '/classes', icon: BookOpen, roles: ['admin', 'teacher', 'viewer', 'dos'], permission: 'classes.view', group: 'School' },
  { label: 'Subjects', href: '/subjects', icon: Library, roles: ['admin', 'teacher', 'viewer', 'dos'], permission: 'subjects.view', group: 'School' },
  { label: 'Parents', href: '/parents', icon: UserCheck, roles: ['admin', 'dos'], permission: 'students.manage', group: 'School' },

  { label: 'Courses', href: '/courses', icon: NotebookPen, roles: ['admin', 'teacher', 'parent', 'student'], permission: 'courses.view', group: 'E-Learning' },
  { label: 'Materials', href: '/materials', icon: FolderOpen, roles: ['admin', 'teacher', 'parent', 'student'], permission: 'materials.view', group: 'E-Learning' },
  { label: 'Assignments', href: '/assignments', icon: ClipboardList, roles: ['admin', 'teacher', 'parent', 'student'], permission: 'assignments.view', group: 'E-Learning' },
  { label: 'Quizzes', href: '/quizzes', icon: HelpCircle, roles: ['admin', 'teacher', 'parent', 'student'], permission: 'quizzes.view', group: 'E-Learning' },

  { label: 'Behavior Scores', href: '/scores', icon: ClipboardList, roles: ['admin', 'teacher', 'parent', 'student', 'dos', 'dod'], permission: 'scores.behavior.view', group: 'Records' },
  { label: 'Discipline', href: '/discipline', icon: Gavel, roles: ['admin', 'teacher', 'dod', 'parent', 'student', 'dos'], permission: 'discipline.view', group: 'Records' },
  { label: 'Marks Entry', href: '/marks', icon: Pencil, roles: ['admin', 'teacher', 'dos'], permission: ['marks.enter', 'marks.review'], group: 'Records' },
  { label: 'Attendance', href: '/attendance', icon: CalendarCheck, roles: ['admin', 'teacher', 'parent', 'student', 'dos'], permission: 'attendance.view', group: 'Records' },
  { label: 'Academic Reports', href: '/academic-reports', icon: FileText, roles: ['admin', 'teacher', 'parent', 'student', 'dos'], permission: 'reports.academic.view', group: 'Records' },
  { label: 'Reports', href: '/reports', icon: BarChart3, roles: ['admin', 'teacher', 'parent', 'viewer', 'dos'], permission: 'reports.behavior.view', group: 'Records' },
  { label: 'Certificates', href: '/certificates', icon: ScrollText, roles: ['admin', 'teacher', 'parent', 'student', 'dos', 'dod'], permission: ['certificates.request', 'certificates.view', 'certificates.approve'], group: 'Records' },

  { label: 'Product Inventory', href: '/stock', icon: Package, roles: stockWriteRoles, permission: 'stock.manage', group: 'Operations' },
  { label: 'Stock Dashboard', href: '/stock-dashboard', icon: Boxes, roles: stockRoles, permission: 'stock.view', group: 'Operations' },
  { label: 'Stock In', href: '/stock/in', icon: ArrowDownCircle, roles: stockWriteRoles, permission: 'stock.manage', group: 'Operations' },
  { label: 'Stock Out', href: '/stock/out', icon: ArrowUpCircle, roles: stockWriteRoles, permission: 'stock.manage', group: 'Operations' },
  { label: 'Stock Batches', href: '/stock/batches', icon: Boxes, roles: stockRoles, permission: 'stock.view', group: 'Operations' },
  { label: 'Expiry Management', href: '/stock/expiry', icon: CalendarCheck, roles: stockRoles, permission: 'stock.view', group: 'Operations' },
  { label: 'Low Stock Alerts', href: '/stock/alerts', icon: AlertTriangle, roles: stockRoles, permission: 'stock.view', group: 'Operations' },
  { label: 'Stock Movements', href: '/stock/movements', icon: History, roles: stockRoles, permission: 'stock.view', group: 'Operations' },
  { label: 'Stock Reports', href: '/stock/reports', icon: BarChart3, roles: stockRoles, permission: 'stock.reports', group: 'Operations' },
  { label: 'Inventory Valuation', href: '/stock/valuation', icon: Coins, roles: stockRoles, permission: 'stock.reports', group: 'Operations' },

  { label: 'Users', href: '/users', icon: Users, roles: ['admin'], permission: 'users.view', group: 'Admin' },
  { label: 'Settings', href: '/settings', icon: Settings, roles: ['admin', 'teacher', 'parent', 'student', 'viewer', 'stock_manager', 'storekeeper', 'dos', 'dod'], permission: 'profile.view', group: 'Overview' },
  { label: 'Notifications', href: '/notifications', icon: Bell, roles: ['admin', 'teacher', 'parent', 'student', 'viewer', 'stock_manager', 'storekeeper', 'dos', 'dod'], permission: 'notifications.view', group: 'Overview' },
];

export const roleBadges: Record<AppRole, { label: string; className: string }> = {
  admin: { label: 'Administrator', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800' },
  teacher: { label: 'Teacher', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800' },
  parent: { label: 'Parent', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800' },
  student: { label: 'Student', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800' },
  stock_manager: { label: 'Stock Manager', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800' },
  storekeeper: { label: 'Storekeeper', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800' },
  dos: { label: 'Director of Studies', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800' },
  dod: { label: 'Director of Discipline', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800' },
  viewer: { label: 'Viewer (read-only)', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700' },
};
