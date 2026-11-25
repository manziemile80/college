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
} from '@/lib/icons';
import { AppRole } from '@/types/database';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: AppRole[];
  group: 'Overview' | 'School' | 'E-Learning' | 'Records' | 'Operations' | 'Admin';
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'teacher', 'parent', 'student', 'viewer', 'stock_manager', 'dos', 'dod'], group: 'Overview' },

  { label: 'Students', href: '/students', icon: GraduationCap, roles: ['admin', 'teacher', 'viewer', 'dos', 'student'], group: 'School' },
  { label: 'Enrollment', href: '/enrollment', icon: UserPlus, roles: ['admin', 'teacher', 'dos'], group: 'School' },
  { label: 'Classes', href: '/classes', icon: BookOpen, roles: ['admin', 'teacher', 'viewer', 'dos'], group: 'School' },
  { label: 'Subjects', href: '/subjects', icon: Library, roles: ['admin', 'teacher', 'viewer', 'dos'], group: 'School' },
  { label: 'Parents', href: '/parents', icon: UserCheck, roles: ['admin'], group: 'School' },

  { label: 'Courses', href: '/courses', icon: NotebookPen, roles: ['admin', 'teacher', 'parent', 'student'], group: 'E-Learning' },
  { label: 'Materials', href: '/materials', icon: FolderOpen, roles: ['admin', 'teacher', 'parent', 'student'], group: 'E-Learning' },
  { label: 'Assignments', href: '/assignments', icon: ClipboardList, roles: ['admin', 'teacher', 'parent', 'student'], group: 'E-Learning' },
  { label: 'Quizzes', href: '/quizzes', icon: HelpCircle, roles: ['admin', 'teacher', 'parent', 'student'], group: 'E-Learning' },

  { label: 'Behavior Scores', href: '/scores', icon: ClipboardList, roles: ['admin', 'teacher', 'parent', 'student', 'dos', 'dod'], group: 'Records' },
  { label: 'Discipline', href: '/discipline', icon: Gavel, roles: ['admin', 'teacher', 'dod', 'parent', 'student'], group: 'Records' },
  { label: 'Marks Entry', href: '/marks', icon: Pencil, roles: ['admin', 'teacher', 'dos'], group: 'Records' },
  { label: 'Attendance', href: '/attendance', icon: CalendarCheck, roles: ['admin', 'teacher', 'parent', 'student', 'dos'], group: 'Records' },
  { label: 'Academic Reports', href: '/academic-reports', icon: FileText, roles: ['admin', 'teacher', 'parent', 'student', 'dos'], group: 'Records' },
  { label: 'Reports', href: '/reports', icon: BarChart3, roles: ['admin', 'teacher', 'parent', 'viewer', 'dos'], group: 'Records' },

  { label: 'Stock Management', href: '/stock', icon: Package, roles: ['stock_manager'], group: 'Operations' },
  { label: 'Stock Dashboard', href: '/stock-dashboard', icon: Boxes, roles: ['stock_manager'], group: 'Operations' },

  { label: 'Users', href: '/users', icon: Users, roles: ['admin'], group: 'Admin' },
  { label: 'Settings', href: '/settings', icon: Settings, roles: ['admin', 'teacher', 'parent', 'student', 'viewer', 'stock_manager', 'dos', 'dod'], group: 'Overview' },
];

export const roleBadges: Record<AppRole, { label: string; className: string }> = {
  admin: { label: 'Administrator', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800' },
  teacher: { label: 'Teacher', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800' },
  parent: { label: 'Parent', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800' },
  student: { label: 'Student', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800' },
  stock_manager: { label: 'Stock Manager', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800' },
  dos: { label: 'Director of Studies', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800' },
  dod: { label: 'Director of Discipline', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800' },
  viewer: { label: 'Viewer (read-only)', className: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700' },
};
