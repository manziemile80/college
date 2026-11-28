/**
 * Canonical RBAC permission catalogue.
 *
 * The same keys are seeded into `public.permissions` /
 * `public.role_permissions` by the database migration. The database is the
 * authority: the frontend map below is only used as a safe default while the
 * permission RPC is loading and for multi-role clients that have not yet
 * synchronised. Never treat a permission check here as a security boundary —
 * RLS and backend role checks are the real enforcement layer.
 */
import type { AppRole } from '@/types/database';

export const PERMISSIONS = [
  'dashboard.view',
  'profile.view', 'profile.update',
  'students.view', 'students.view_all', 'students.manage', 'students.link',
  'classes.view', 'classes.manage',
  'subjects.view', 'subjects.manage',
  'enrollment.view', 'enrollment.manage',
  'marks.view', 'marks.enter', 'marks.review', 'marks.publish',
  'attendance.view', 'attendance.manage',
  'reports.academic.view', 'reports.academic.generate', 'reports.class.view',
  'reports.behavior.view', 'reports.discipline.view',
  'results.annual.view',
  'discipline.view', 'discipline.manage', 'discipline.review',
  'scores.behavior.view', 'scores.behavior.manage',
  'courses.view', 'courses.manage',
  'materials.view', 'materials.manage',
  'assignments.view', 'assignments.manage', 'assignments.submit',
  'quizzes.view', 'quizzes.manage', 'quizzes.take',
  'teacher.feedback.view',
  'certificates.request', 'certificates.view', 'certificates.approve',
  'announcements.view', 'announcements.manage',
  'notifications.view',
  'academic.calendar.manage', 'exam.schedule.manage',
  'stock.view', 'stock.manage', 'stock.reports',
  'users.view', 'users.manage', 'roles.manage', 'permissions.manage',
  'audit.view', 'settings.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const all = [...PERMISSIONS] as Permission[];

const teacher: Permission[] = [
  'dashboard.view', 'profile.view', 'profile.update',
  'students.view', 'classes.view', 'subjects.view',
  'marks.view', 'marks.enter', 'marks.review',
  'attendance.view', 'attendance.manage',
  'reports.academic.view', 'reports.academic.generate',
  'reports.class.view', 'reports.behavior.view', 'results.annual.view',
  'discipline.view', 'scores.behavior.view', 'scores.behavior.manage',
  'courses.view', 'courses.manage', 'materials.view', 'materials.manage',
  'assignments.view', 'assignments.manage', 'quizzes.view', 'quizzes.manage',
  'teacher.feedback.view', 'announcements.view', 'notifications.view',
];

const student: Permission[] = [
  'dashboard.view', 'profile.view', 'profile.update',
  'students.view', 'attendance.view', 'results.annual.view',
  'reports.academic.view', 'reports.behavior.view',
  'discipline.view', 'scores.behavior.view',
  'courses.view', 'materials.view',
  'assignments.view', 'assignments.submit',
  'quizzes.view', 'quizzes.take',
  'certificates.request', 'certificates.view',
  'announcements.view', 'notifications.view',
];

const parent: Permission[] = [
  'dashboard.view', 'profile.view', 'profile.update',
  'students.view', 'attendance.view', 'results.annual.view',
  'reports.academic.view', 'reports.behavior.view', 'reports.discipline.view',
  'discipline.view', 'scores.behavior.view', 'teacher.feedback.view',
  'courses.view', 'materials.view', 'assignments.view', 'quizzes.view',
  'certificates.view', 'announcements.view', 'notifications.view',
];

const stockManager: Permission[] = [
  'dashboard.view', 'profile.view', 'profile.update',
  'stock.view', 'stock.manage', 'stock.reports',
  'announcements.view', 'notifications.view',
];

const dos: Permission[] = [
  'dashboard.view', 'profile.view', 'profile.update',
  'students.view', 'students.view_all', 'students.manage', 'students.link',
  'classes.view', 'classes.manage', 'subjects.view', 'subjects.manage',
  'enrollment.view', 'enrollment.manage',
  'marks.view', 'marks.review', 'marks.publish',
  'attendance.view', 'reports.academic.view', 'reports.academic.generate',
  'reports.class.view', 'reports.behavior.view', 'results.annual.view',
  'academic.calendar.manage', 'exam.schedule.manage',
  'courses.view', 'courses.manage', 'materials.view', 'materials.manage',
  'assignments.view', 'assignments.manage', 'quizzes.view', 'quizzes.manage',
  'certificates.approve', 'certificates.view', 'audit.view',
  'announcements.view', 'announcements.manage', 'notifications.view',
];

const dod: Permission[] = [
  'dashboard.view', 'profile.view', 'profile.update',
  'students.view', 'discipline.view', 'discipline.manage', 'discipline.review',
  'reports.discipline.view', 'scores.behavior.view', 'scores.behavior.manage',
  'certificates.view', 'announcements.view', 'notifications.view',
];

const viewer: Permission[] = [
  'dashboard.view', 'profile.view', 'profile.update',
  'students.view', 'classes.view', 'subjects.view',
  'reports.academic.view', 'reports.class.view', 'reports.behavior.view',
  'announcements.view', 'notifications.view',
];

/** Storekeepers are stock-operations staff with read/write inventory access. */
const storekeeper: Permission[] = [
  'dashboard.view', 'profile.view', 'profile.update',
  'stock.view', 'stock.manage', 'stock.reports',
  'announcements.view', 'notifications.view',
];

export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  admin: all,
  teacher,
  student,
  parent,
  stock_manager: stockManager,
  storekeeper,
  dos,
  dod,
  viewer,
};

export function permissionsForRoles(roles: readonly AppRole[]): Permission[] {
  const set = new Set<Permission>();
  roles.forEach((role) => DEFAULT_ROLE_PERMISSIONS[role]?.forEach((p) => set.add(p)));
  return [...set];
}

export function hasPermission(permissions: readonly string[], permission: Permission | string): boolean {
  return permissions.includes(permission as string) || permissions.includes('*');
}

export function hasAnyPermission(permissions: readonly string[], needed: readonly (Permission | string)[]): boolean {
  return needed.some((p) => hasPermission(permissions, p));
}

export function hasAllPermissions(permissions: readonly string[], needed: readonly (Permission | string)[]): boolean {
  return needed.every((p) => hasPermission(permissions, p));
}

export function isPrivilegedStaff(roles: readonly AppRole[]): boolean {
  return roles.some((r) => r === 'admin' || r === 'dos' || r === 'dod' || r === 'teacher');
}
