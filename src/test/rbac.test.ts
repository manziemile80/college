import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  permissionsForRoles,
} from '@/lib/permissions';
import { navItems } from '@/components/layout/navItems';

describe('RBAC permission catalogue', () => {
  it('gives administrators every permission', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toEqual([...PERMISSIONS]);
    expect(hasAllPermissions(permissionsForRoles(['admin']), PERMISSIONS.slice(0, 10))).toBe(true);
  });

  it('does not let teachers publish annual results or manage stock/users', () => {
    const teacher = permissionsForRoles(['teacher']);
    expect(hasPermission(teacher, 'marks.enter')).toBe(true);
    expect(hasPermission(teacher, 'marks.publish')).toBe(false);
    expect(hasPermission(teacher, 'stock.manage')).toBe(false);
    expect(hasPermission(teacher, 'users.manage')).toBe(false);
    expect(hasPermission(teacher, 'certificates.approve')).toBe(false);
  });

  it('restricts students to their own academic portal', () => {
    const student = permissionsForRoles(['student']);
    expect(hasPermission(student, 'certificates.request')).toBe(true);
    expect(hasPermission(student, 'quizzes.take')).toBe(true);
    expect(hasPermission(student, 'marks.enter')).toBe(false);
    expect(hasPermission(student, 'users.view')).toBe(false);
    expect(hasPermission(student, 'attendance.manage')).toBe(false);
    expect(hasPermission(student, 'scores.behavior.manage')).toBe(false);
  });

  it('gives parents monitoring access without academic write permissions', () => {
    const parent = permissionsForRoles(['parent']);
    expect(hasPermission(parent, 'students.view')).toBe(true);
    expect(hasPermission(parent, 'certificates.view')).toBe(true);
    expect(hasPermission(parent, 'marks.enter')).toBe(false);
    expect(hasPermission(parent, 'discipline.manage')).toBe(false);
  });

  it('keeps stock managers away from academic and student records', () => {
    const stock = permissionsForRoles(['stock_manager']);
    expect(hasPermission(stock, 'stock.manage')).toBe(true);
    expect(hasPermission(stock, 'stock.reports')).toBe(true);
    expect(hasPermission(stock, 'marks.view')).toBe(false);
    expect(hasPermission(stock, 'students.view')).toBe(false);
  });

  it('gives DOS result approval and DOD discipline authority only', () => {
    const dos = permissionsForRoles(['dos']);
    const dod = permissionsForRoles(['dod']);
    expect(hasPermission(dos, 'marks.publish')).toBe(true);
    expect(hasPermission(dos, 'certificates.approve')).toBe(true);
    expect(hasPermission(dos, 'stock.manage')).toBe(false);
    expect(hasPermission(dod, 'discipline.manage')).toBe(true);
    expect(hasPermission(dod, 'marks.enter')).toBe(false);
    expect(hasPermission(dod, 'marks.publish')).toBe(false);
  });

  it('unions permissions for multi-role users', () => {
    const both = permissionsForRoles(['teacher', 'dos']);
    expect(hasAllPermissions(both, ['marks.enter', 'marks.publish', 'classes.manage'])).toBe(true);
    expect(hasAnyPermission(both, ['users.view', 'marks.view'])).toBe(true);
    expect(hasPermission(['*'], 'anything')).toBe(true);
  });
});

describe('permission-driven navigation', () => {
  const visible = (roles: Parameters<typeof permissionsForRoles>[0]) => {
    const permissions = permissionsForRoles(roles);
    return navItems
      .filter((item) => hasAnyPermission(permissions, Array.isArray(item.permission) ? item.permission : [item.permission]))
      .map((item) => item.href);
  };

  it('only references permissions that exist in the catalogue', () => {
    navItems.forEach((item) => {
      const needed = Array.isArray(item.permission) ? item.permission : [item.permission];
      needed.forEach((p) => expect(PERMISSIONS).toContain(p));
    });
  });

  it('shows every module to administrators', () => {
    expect(visible(['admin'])).toEqual(navItems.map((item) => item.href));
  });

  it('hides admin and stock modules from teachers and students', () => {
    const teacher = visible(['teacher']);
    const student = visible(['student']);
    expect(teacher).toContain('/marks');
    expect(teacher).not.toContain('/users');
    expect(teacher).not.toContain('/stock');
    expect(student).toContain('/certificates');
    expect(student).toContain('/assignments');
    expect(student).not.toContain('/marks');
    expect(student).not.toContain('/users');
    expect(student).not.toContain('/stock');
  });

  it('gives parents monitoring links and stock managers only stock links', () => {
    const parent = visible(['parent']);
    const stock = visible(['stock_manager']);
    expect(parent).toContain('/certificates');
    expect(parent).not.toContain('/marks');
    expect(stock).toContain('/stock');
    expect(stock).toContain('/stock-dashboard');
    expect(stock).not.toContain('/students');
    expect(stock).not.toContain('/marks');
  });

  it('gives DOS reports and DOD discipline but not academic marks', () => {
    expect(visible(['dos'])).toContain('/academic-reports');
    expect(visible(['dod'])).toContain('/discipline');
    expect(visible(['dod'])).not.toContain('/academic-reports');
    expect(visible(['dod'])).not.toContain('/marks');
  });
});
