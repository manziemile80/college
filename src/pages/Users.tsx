import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { LinkParentsDialog } from '@/components/students/LinkParentsDialog';
import { LinkStudentAccountDialog } from '@/components/students/LinkStudentAccountDialog';
import { AppRole, AuditLog, Class, Parent, Profile, Student } from '@/types/database';
import {
  Users as UsersIcon, Loader2, ShieldCheck, Shield, ShieldAlert, Trash2, Pencil,
  Plus, Search, Lock, RefreshCw, ClipboardList, Check, Link2, X, UserCog,
} from '@/lib/icons';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

/**
 * Generated database types predate the latest migration (new RPCs and tables),
 * so calls to those new endpoints go through a loosely typed client alias.
 * All writes still go through database functions / the admin edge function —
 * never through direct user_roles writes.
 */
const db = supabase as any;

const ALL_ROLES: AppRole[] = [
  'admin', 'teacher', 'parent', 'student', 'stock_manager', 'storekeeper', 'dos', 'dod', 'viewer',
];

interface UserWithRoles extends Profile {
  roles: AppRole[];
  /** null/unknown means the auth admin endpoint was unavailable. */
  active?: boolean | null;
}

interface PermissionRow {
  key: string;
  module: string;
  description: string | null;
}

interface ClassSubjectRow {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
}

interface SubjectRow {
  id: string;
  name: string;
}

const roleMeta: Record<AppRole, { label: string; icon: React.ComponentType<any>; badge: string }> = {
  admin: { label: 'Administrator', icon: ShieldAlert, badge: 'badge text-bg-danger' },
  teacher: { label: 'Teacher', icon: ShieldCheck, badge: 'badge text-bg-success' },
  parent: { label: 'Parent', icon: Shield, badge: 'badge text-bg-info' },
  student: { label: 'Student', icon: Shield, badge: 'badge text-bg-warning' },
  stock_manager: { label: 'Stock Manager', icon: Shield, badge: 'badge text-bg-secondary' },
  storekeeper: { label: 'Storekeeper', icon: Shield, badge: 'badge text-bg-secondary' },
  dos: { label: 'Director of Studies', icon: ShieldCheck, badge: 'badge text-bg-primary' },
  dod: { label: 'Director of Discipline', icon: ShieldAlert, badge: 'badge text-bg-danger' },
  viewer: { label: 'Viewer (read-only)', icon: Shield, badge: 'badge text-bg-secondary' },
};

/** Invoke the admin-only edge function and surface the backend error message. */
async function invokeAdmin<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-user-management', { body });
  if (error) {
    let message = error.message;
    try {
      const context = (error as any).context;
      if (context && typeof context.json === 'function') {
        const payload = await context.json();
        if (payload?.error) message = String(payload.error);
      }
    } catch {
      // Keep the original transport error if the body is unreadable.
    }
    throw new Error(message);
  }
  return data as T;
}

export default function UsersPage() {
  const { user: currentUser, roles: myRoles, refreshProfile } = useAuth();
  const isAdmin = myRoles.includes('admin');

  const [tab, setTab] = useState<'users' | 'permissions'>('users');
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Linking helpers (all fetched from DB — no fabricated rows).
  const [studentAccounts, setStudentAccounts] = useState<Student[]>([]);
  const [parentAccounts, setParentAccounts] = useState<Parent[]>([]);
  const [parentLinks, setParentLinks] = useState<{ parent_id: string; student_id: string }[]>([]);
  const [linkParentsFor, setLinkParentsFor] = useState<Student | null>(null);
  const [linkAccountFor, setLinkAccountFor] = useState<Student | null>(null);

  // Compact recent activity panel.
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Edit / create / roles / password / delete.
  const [editUser, setEditUser] = useState<UserWithRoles | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRoles, setNewRoles] = useState<AppRole[]>(['viewer']);
  const [creating, setCreating] = useState(false);
  const [rolesUser, setRolesUser] = useState<UserWithRoles | null>(null);
  const [roleSelection, setRoleSelection] = useState<AppRole[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);
  const [resetUser, setResetUser] = useState<UserWithRoles | null>(null);
  const [resetLink, setResetLink] = useState('');
  const [resetting, setResetting] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // Teacher assignment.
  const [teacherUser, setTeacherUser] = useState<UserWithRoles | null>(null);
  const [classRows, setClassRows] = useState<Class[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubjectRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [teacherLoading, setTeacherLoading] = useState(false);
  const [savingTeacher, setSavingTeacher] = useState(false);

  // Permissions matrix.
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionRow[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<AppRole, string[]>>(
    {} as Record<AppRole, string[]>,
  );
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [savingPermissionRole, setSavingPermissionRole] = useState<AppRole | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: profiles, error }, { data: studentRows }, { data: parentRows }, { data: links }] =
        await Promise.all([
          supabase.from('profiles').select('*').order('created_at', { ascending: false }),
          supabase.from('students').select('id, first_name, last_name, student_id, user_id'),
          supabase.from('parents').select('id, user_id, full_name'),
          supabase.from('student_parents').select('parent_id, student_id'),
        ]);
      if (error) throw error;

      // Roles come from the audited database function, never a direct write.
      const rolesByUser = new Map<string, AppRole[]>();
      await Promise.all(
        (profiles || []).map(async (profile: Profile) => {
          const { data: roleData, error: roleError } = await db.rpc('get_user_roles', {
            _user_id: profile.user_id,
          });
          if (roleError) {
            // Read-only fallback if the RPC is not deployed yet.
            const { data: legacy } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', profile.user_id);
            rolesByUser.set(
              profile.user_id,
              ((legacy || []) as { role: AppRole }[]).map((r) => r.role),
            );
            return;
          }
          rolesByUser.set(profile.user_id, ((roleData || []) as AppRole[]));
        }),
      );

      // Active/banned status lives in auth.users, only reachable via the edge function.
      const activeByUser = new Map<string, boolean>();
      try {
        const listed = await invokeAdmin<{ users?: { id: string; active: boolean }[] }>({
          action: 'list_users',
          page: 1,
          perPage: 100,
        });
        (listed?.users || []).forEach((u) => activeByUser.set(u.id, !!u.active));
      } catch {
        // Optional enrichment: the rest of the page still works.
      }

      setUsers(
        (profiles || []).map((profile: Profile) => ({
          ...profile,
          roles: rolesByUser.get(profile.user_id) || [],
          active: activeByUser.has(profile.user_id) ? activeByUser.get(profile.user_id)! : null,
        })),
      );
      setStudentAccounts((studentRows || []) as Student[]);
      setParentAccounts((parentRows || []) as Parent[]);
      setParentLinks(
        (links || []) as { parent_id: string; student_id: string }[],
      );
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users', { description: error?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8);
    setAuditLogs((data as AuditLog[]) || []);
  }, []);

  const fetchPermissions = useCallback(async () => {
    setPermissionsLoading(true);
    try {
      const { data: catalogData, error: catalogError } = await db.rpc('get_all_permissions');
      if (catalogError) throw catalogError;
      const results = await Promise.all(
        ALL_ROLES.map((role) => db.rpc('get_role_permissions', { _role: role })),
      );
      const next = {} as Record<AppRole, string[]>;
      ALL_ROLES.forEach((role, index) => {
        next[role] = (results[index].data as string[]) || [];
      });
      setPermissionCatalog((catalogData as PermissionRow[]) || []);
      setRolePermissions(next);
    } catch (error: any) {
      toast.error('Failed to load permissions', { description: error?.message });
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void fetchUsers();
    void fetchAuditLogs();
  }, [isAdmin, fetchUsers, fetchAuditLogs]);

  useEffect(() => {
    if (!isAdmin || tab !== 'permissions') return;
    if (permissionCatalog.length === 0) void fetchPermissions();
  }, [isAdmin, tab, permissionCatalog.length, fetchPermissions]);

  const refreshAll = useCallback(async () => {
    await fetchUsers();
    // Keep the auth context in sync when an admin edits their own account/roles.
    await refreshProfile();
  }, [fetchUsers, refreshProfile]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.roles.some((r) => roleMeta[r]?.label.toLowerCase().includes(q)),
    );
  }, [users, searchQuery]);

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, PermissionRow[]>();
    permissionCatalog.forEach((permission) => {
      const list = groups.get(permission.module) || [];
      list.push(permission);
      groups.set(permission.module, list);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissionCatalog]);

  const studentByUser = useMemo(() => {
    const map = new Map<string, Student>();
    studentAccounts.forEach((s) => {
      if (s.user_id) map.set(s.user_id, s);
    });
    return map;
  }, [studentAccounts]);

  const studentById = useMemo(() => {
    const map = new Map<string, Student>();
    studentAccounts.forEach((s) => map.set(s.id, s));
    return map;
  }, [studentAccounts]);

  const parentByUser = useMemo(() => {
    const map = new Map<string, Parent>();
    parentAccounts.forEach((p) => {
      if (p.user_id) map.set(p.user_id, p);
    });
    return map;
  }, [parentAccounts]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    parentLinks.forEach((link) => {
      const list = map.get(link.parent_id) || [];
      if (!list.includes(link.student_id)) list.push(link.student_id);
      map.set(link.parent_id, list);
    });
    return map;
  }, [parentLinks]);

  const toggleInList = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const openEdit = (u: UserWithRoles) => {
    setEditUser(u);
    setEditName(u.full_name || '');
    setEditPhone(u.phone || '');
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    if (!editName.trim()) return toast.error('Full name is required');
    setSavingEdit(true);
    try {
      await invokeAdmin({
        action: 'update_user',
        user_id: editUser.user_id,
        full_name: editName.trim(),
        phone: editPhone.trim() || null,
      });
      toast.success('User updated');
      setEditUser(null);
      await refreshAll();
    } catch (error: any) {
      toast.error('Failed to update user', { description: error?.message });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newEmail.trim() || !newFullName.trim()) {
      return toast.error('Email and full name are required');
    }
    if (newPassword && newPassword.length < 8) {
      return toast.error('Password must be at least 8 characters');
    }
    setCreating(true);
    try {
      await invokeAdmin({
        action: 'create_user',
        email: newEmail.trim(),
        password: newPassword || undefined,
        full_name: newFullName.trim(),
        roles: newRoles,
      });
      toast.success('User created');
      setCreateOpen(false);
      setNewEmail('');
      setNewPassword('');
      setNewFullName('');
      setNewRoles(['viewer']);
      await fetchUsers();
    } catch (error: any) {
      toast.error('Failed to create user', { description: error?.message });
    } finally {
      setCreating(false);
    }
  };

  const openRoleEditor = (u: UserWithRoles) => {
    setRolesUser(u);
    setRoleSelection([...u.roles]);
  };

  const handleSaveRoles = async () => {
    if (!rolesUser) return;
    setSavingRoles(true);
    try {
      const { error } = await db.rpc('set_user_roles', {
        _user_id: rolesUser.user_id,
        _roles: roleSelection,
      });
      if (error) throw error;
      toast.success('Roles updated');
      setRolesUser(null);
      await refreshAll();
    } catch (error: any) {
      // Includes the DB guard that prevents an admin from removing their own admin role.
      toast.error('Failed to update roles', { description: error?.message });
    } finally {
      setSavingRoles(false);
    }
  };

  const handleToggleActive = async (u: UserWithRoles) => {
    if (u.user_id === currentUser?.id) return toast.error('You cannot change your own account status');
    const nextActive = u.active === false;
    setBusyUserId(u.user_id);
    try {
      await invokeAdmin({
        action: 'update_user',
        user_id: u.user_id,
        active: nextActive,
      });
      toast.success(nextActive ? 'Account activated' : 'Account deactivated');
      await fetchUsers();
    } catch (error: any) {
      toast.error('Failed to change account status', { description: error?.message });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleResetPassword = async (u: UserWithRoles) => {
    setResetting(true);
    try {
      const result = await invokeAdmin<{ action_link?: string }>({
        action: 'reset_password',
        user_id: u.user_id,
      });
      if (!result?.action_link) throw new Error('No reset link was returned');
      setResetUser(u);
      setResetLink(result.action_link);
      toast.success('Password reset link generated');
    } catch (error: any) {
      toast.error('Failed to generate reset link', { description: error?.message });
    } finally {
      setResetting(false);
    }
  };

  const copyResetLink = async () => {
    try {
      await navigator.clipboard.writeText(resetLink);
      toast.success('Reset link copied to clipboard');
    } catch {
      toast.error('Could not copy automatically — select and copy the link manually');
    }
  };

  const handleDeleteUser = async (u: UserWithRoles) => {
    if (u.user_id === currentUser?.id) return toast.error('You cannot delete your own account');
    if (!confirm(`Delete user "${u.full_name || u.email}"? This permanently removes their account.`)) return;
    setBusyUserId(u.user_id);
    try {
      await invokeAdmin({ action: 'delete_user', user_id: u.user_id });
      toast.success('User deleted');
      await fetchUsers();
    } catch (error: any) {
      toast.error('Failed to delete user', { description: error?.message });
    } finally {
      setBusyUserId(null);
    }
  };

  const openTeacherEditor = async (u: UserWithRoles) => {
    setTeacherUser(u);
    setTeacherLoading(true);
    setSelectedClassId('');
    setSelectedSubjectId('');
    try {
      const [classesRes, csRes, subjectsRes] = await Promise.all([
        supabase.from('classes').select('id, name, teacher_id').order('name'),
        supabase.from('class_subjects').select('id, class_id, subject_id, teacher_id'),
        supabase.from('subjects').select('id, name').order('name'),
      ]);
      setClassRows((classesRes.data as Class[]) || []);
      setClassSubjects((csRes.data as ClassSubjectRow[]) || []);
      setSubjects((subjectsRes.data as SubjectRow[]) || []);
    } catch (error: any) {
      toast.error('Failed to load teaching assignments', { description: error?.message });
    } finally {
      setTeacherLoading(false);
    }
  };

  const assignedClasses = useMemo(
    () => classRows.filter((c) => c.teacher_id === teacherUser?.user_id),
    [classRows, teacherUser],
  );
  const assignedSubjects = useMemo(
    () => classSubjects.filter((cs) => cs.teacher_id === teacherUser?.user_id),
    [classSubjects, teacherUser],
  );

  const updateClassTeacher = async (classId: string, teacherId: string | null) => {
    if (!teacherUser) return;
    setSavingTeacher(true);
    try {
      const { error } = await supabase
        .from('classes')
        .update({ teacher_id: teacherId })
        .eq('id', classId);
      if (error) throw error;
      toast.success(teacherId ? 'Class assigned' : 'Class unassigned');
      await fetchUsers();
      await openTeacherEditor(teacherUser);
    } catch (error: any) {
      toast.error('Failed to update class assignment', { description: error?.message });
    } finally {
      setSavingTeacher(false);
    }
  };

  const updateSubjectTeacher = async (rowId: string, teacherId: string | null) => {
    if (!teacherUser) return;
    setSavingTeacher(true);
    try {
      const { error } = await supabase
        .from('class_subjects')
        .update({ teacher_id: teacherId })
        .eq('id', rowId);
      if (error) throw error;
      toast.success(teacherId ? 'Subject assigned' : 'Subject unassigned');
      await fetchUsers();
      await openTeacherEditor(teacherUser);
    } catch (error: any) {
      toast.error('Failed to update subject assignment', { description: error?.message });
    } finally {
      setSavingTeacher(false);
    }
  };

  const handleAssignSubject = async () => {
    if (!selectedClassId || !selectedSubjectId) return toast.error('Select a class and a subject');
    const row = classSubjects.find(
      (cs) => cs.class_id === selectedClassId && cs.subject_id === selectedSubjectId,
    );
    if (!row) {
      return toast.info('This subject is not configured for that class. Add it on the Classes page first.');
    }
    await updateSubjectTeacher(row.id, teacherUser?.user_id || null);
  };

  const handleSaveRolePermissions = async (role: AppRole) => {
    setSavingPermissionRole(role);
    try {
      const { error } = await db.rpc('set_role_permissions', {
        _role: role,
        _permissions: rolePermissions[role] || [],
      });
      if (error) throw error;
      toast.success(`Permissions saved for ${roleMeta[role].label}`);
      await fetchPermissions();
      if (myRoles.includes(role)) await refreshProfile();
    } catch (error: any) {
      toast.error('Failed to save permissions', { description: error?.message });
    } finally {
      setSavingPermissionRole(null);
    }
  };

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="d-flex flex-column gap-4">
          <PageHeader
            eyebrow="Administration"
            title="User Management"
            description="Manage user accounts, role assignments and permissions."
          />
          <div className="card">
            <div className="card-body d-flex flex-column align-items-center justify-content-center py-10 text-center gap-2">
              <ShieldAlert className="fs-2 text-danger" />
              <h3 className="fw-semibold text-main mb-0">403 — Administrator access required</h3>
              <p className="text-secondary bd-fs-sm mb-0">
                Only administrators can manage users, roles and permissions.
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Administration"
          title="User Management"
          description="Create accounts, assign roles, configure teacher subjects and control role permissions."
          actions={
            <button
              type="button"
              className="btn btn-success d-inline-flex align-items-center gap-1"
              onClick={() => setCreateOpen(true)}
            >
              <Plus /> Create user
            </button>
          }
        />

        <ul className="nav nav-tabs">
          <li className="nav-item">
            <button
              type="button"
              className={cn('nav-link', tab === 'users' && 'active')}
              onClick={() => setTab('users')}
            >
              <UsersIcon className="me-1" /> Users
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={cn('nav-link', tab === 'permissions' && 'active')}
              onClick={() => setTab('permissions')}
            >
              <ClipboardList className="me-1" /> Role permissions
            </button>
          </li>
        </ul>

        {tab === 'users' ? (
          <>
            <div className="input-group w-100 w-md-auto flex-grow-1">
              <span className="input-group-text bg-white border-secondary-subtle">
                <Search className="text-secondary" />
              </span>
              <input
                type="search"
                className="form-control border-secondary-subtle"
                placeholder="Search users by name, email or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search users"
              />
            </div>

            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-8">
                <Loader2 className="fs-3 text-success" />
                <span className="visually-hidden">Loading users…</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="card">
                <div className="card-body d-flex flex-column align-items-center justify-content-center py-10 text-center">
                  <UsersIcon className="fs-3 mb-4 text-secondary" />
                  <h3 className="fw-semibold text-main mb-2">No users found</h3>
                  <p className="text-secondary bd-fs-sm mb-0">
                    {searchQuery ? 'Try a different search term.' : 'Users will appear here when they sign up.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr className="border-bottom border-secondary-subtle">
                        <th scope="col">User</th>
                        <th scope="col">Email</th>
                        <th scope="col">Roles</th>
                        <th scope="col">Status</th>
                        <th scope="col">Joined</th>
                        <th scope="col" className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => {
                        const ownStudent = studentByUser.get(u.user_id);
                        const ownParent = parentByUser.get(u.user_id);
                        const children = ownParent
                          ? (childrenByParent.get(ownParent.id) || [])
                              .map((id) => studentById.get(id))
                              .filter(Boolean) as Student[]
                          : [];
                        const isTeacher = u.roles.includes('teacher');
                        const busy = busyUserId === u.user_id;

                        return (
                          <tr key={u.id} className="border-bottom border-secondary-subtle">
                            <td>
                              <div className="d-flex align-items-center gap-3">
                                <span className="bd-avatar bd-user-avatar d-inline-flex align-items-center justify-content-center">
                                  {u.full_name?.charAt(0) || '?'}
                                </span>
                                <div className="min-w-0">
                                  <p className="fw-medium text-main mb-0">{u.full_name || 'Unnamed user'}</p>
                                  <p className="text-muted bd-fs-sm mb-0">{u.roles.length || 'No'} role(s)</p>
                                </div>
                              </div>
                            </td>
                            <td className="text-muted bd-fs-sm">{u.email}</td>
                            <td>
                              <div className="d-flex flex-wrap gap-1">
                                {u.roles.length === 0 && (
                                  <span className="badge text-bg-secondary bd-fs-sm">No role</span>
                                )}
                                {u.roles.map((role) => {
                                  const meta = roleMeta[role];
                                  const Icon = meta?.icon || Shield;
                                  return (
                                    <span key={role} className={cn(meta?.badge || 'badge text-bg-secondary', 'd-inline-flex align-items-center gap-1 bd-fs-sm')}>
                                      <Icon className="fs-6" />
                                      {meta?.label || role}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td>
                              <span className={cn('badge', u.active === false ? 'text-bg-secondary' : 'text-bg-success')}>
                                {u.active === null ? 'Unknown' : u.active ? 'Active' : 'Deactivated'}
                              </span>
                            </td>
                            <td className="text-muted bd-fs-sm text-nowrap">
                              {u.created_at ? format(new Date(u.created_at), 'MMM d, yyyy') : '—'}
                            </td>
                            <td className="text-end">
                              <div className="d-flex justify-content-end flex-wrap gap-1">
                                <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => openEdit(u)}>
                                  <Pencil /> Edit
                                </button>
                                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => openRoleEditor(u)}>
                                  <ShieldCheck /> Roles
                                </button>
                                {isTeacher && (
                                  <button type="button" className="btn btn-outline-info btn-sm" onClick={() => openTeacherEditor(u)}>
                                    <UserCog /> Teach
                                  </button>
                                )}
                                {ownStudent && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-outline-secondary btn-sm"
                                      title="Link parents to this student"
                                      onClick={() => setLinkParentsFor(ownStudent)}
                                    >
                                      <Link2 /> Parents
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-outline-secondary btn-sm"
                                      title="Link this student record to a login account"
                                      onClick={() => setLinkAccountFor(ownStudent)}
                                    >
                                      <Link2 /> Account
                                    </button>
                                  </>
                                )}
                                {children.map((child) => (
                                  <button
                                    key={child.id}
                                    type="button"
                                    className="btn btn-outline-secondary btn-sm"
                                    title={`Manage parent links for ${child.first_name} ${child.last_name}`}
                                    onClick={() => setLinkParentsFor(child)}
                                  >
                                    <Link2 /> {child.first_name}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  className="btn btn-outline-warning btn-sm"
                                  disabled={resetting && resetUser?.user_id === u.user_id}
                                  onClick={() => handleResetPassword(u)}
                                >
                                  <Lock /> Reset
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary btn-sm"
                                  disabled={busy || u.user_id === currentUser?.id}
                                  onClick={() => handleToggleActive(u)}
                                >
                                  <RefreshCw /> {u.active === false ? 'Activate' : 'Deactivate'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-danger btn-sm"
                                  disabled={busy || u.user_id === currentUser?.id}
                                  onClick={() => handleDeleteUser(u)}
                                >
                                  <Trash2 /> Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-header d-flex align-items-center gap-2 py-3">
                <ClipboardList className="text-warning" />
                <h5 className="fw-semibold text-main mb-0">Recent admin activity</h5>
              </div>
              <div className="card-body p-0">
                {auditLogs.length === 0 ? (
                  <p className="text-muted bd-fs-sm p-4 mb-0">No activity recorded yet.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table align-middle mb-0">
                      <tbody>
                        {auditLogs.map((log) => (
                          <tr key={log.id} className="border-bottom border-secondary-subtle">
                            <td className="text-muted bd-fs-sm text-nowrap">
                              {format(new Date(log.created_at), 'MMM d, HH:mm')}
                            </td>
                            <td className="fw-medium text-main bd-fs-sm text-capitalize">
                              {log.action.replace(/_/g, ' ')}
                            </td>
                            <td className="text-muted bd-fs-sm">{log.entity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="card">
            <div className="card-header d-flex align-items-center justify-content-between gap-3 py-3">
              <div>
                <h5 className="fw-semibold text-main mb-0">Role permission matrix</h5>
                <p className="text-muted bd-fs-sm mb-0">
                  Changes are saved to role_permissions by the database; users receive them on their next refresh.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1"
                disabled={permissionsLoading}
                onClick={fetchPermissions}
              >
                <RefreshCw /> Refresh
              </button>
            </div>
            <div className="card-body p-0">
              {permissionsLoading ? (
                <div className="d-flex align-items-center justify-content-center py-8">
                  <Loader2 className="fs-3 text-success" />
                  <span className="visually-hidden">Loading permissions…</span>
                </div>
              ) : permissionCatalog.length === 0 ? (
                <p className="text-muted bd-fs-sm p-4 mb-0">
                  No permissions found. Apply the database migration that seeds the permission catalogue.
                </p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr className="border-bottom border-secondary-subtle">
                        <th scope="col" className="text-nowrap">Module / permission</th>
                        {ALL_ROLES.map((role) => (
                          <th key={role} scope="col" className="text-center text-nowrap">
                            <div className="d-flex flex-column align-items-center gap-1">
                              <span className="bd-fs-sm">{roleMeta[role].label}</span>
                              <button
                                type="button"
                                className="btn btn-success btn-sm"
                                disabled={savingPermissionRole === role}
                                onClick={() => handleSaveRolePermissions(role)}
                              >
                                {savingPermissionRole === role ? (
                                  <><span className="spinner-border spinner-border-sm" /> Saving</>
                                ) : (
                                  <><Check /> Save</>
                                )}
                              </button>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupedPermissions.map(([module, rows]) => (
                        <Fragment key={module}>
                          <tr className="table-light">
                            <td colSpan={ALL_ROLES.length + 1} className="fw-semibold text-main text-capitalize bd-fs-sm">
                              {module}
                            </td>
                          </tr>
                          {rows.map((permission) => (
                            <tr key={permission.key} className="border-bottom border-secondary-subtle">
                              <td>
                                <div className="d-flex flex-column">
                                  <span className="fw-medium text-main bd-fs-sm">{permission.key}</span>
                                  <span className="text-muted bd-fs-sm">{permission.description || '—'}</span>
                                </div>
                              </td>
                              {ALL_ROLES.map((role) => (
                                <td key={role} className="text-center">
                                  <input
                                    type="checkbox"
                                    className="form-check-input"
                                    aria-label={`${permission.key} for ${role}`}
                                    checked={(rolePermissions[role] || []).includes(permission.key)}
                                    onChange={() =>
                                      setRolePermissions((prev) => ({
                                        ...prev,
                                        [role]: toggleInList(prev[role] || [], permission.key),
                                      }))
                                    }
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Edit user ── */}
      {editUser && (
        <>
          <div className="bd-modal-backdrop" />
          <div className="bd-modal show">
            <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                  <h5 className="modal-title fw-semibold text-main mb-0">Edit user</h5>
                  <button type="button" className="btn-close" onClick={() => setEditUser(null)} aria-label="Close" />
                </div>
                <div className="modal-body d-flex flex-column gap-3">
                  <div>
                    <label className="form-label">Full name</label>
                    <input className="form-control" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Phone</label>
                    <input className="form-control" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                  </div>
                  <p className="text-muted bd-fs-sm mb-0">
                    To change roles, use the <span className="fw-semibold">Roles</span> action in the user list.
                  </p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setEditUser(null)}>Cancel</button>
                  <button type="button" className="btn btn-success" disabled={savingEdit} onClick={handleSaveEdit}>
                    {savingEdit ? <><span className="spinner-border spinner-border-sm" /> Saving…</> : 'Save changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Create user ── */}
      {createOpen && (
        <>
          <div className="bd-modal-backdrop" />
          <div className="bd-modal show">
            <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                  <h5 className="modal-title fw-semibold text-main mb-0">Create user</h5>
                  <button type="button" className="btn-close" onClick={() => setCreateOpen(false)} aria-label="Close" />
                </div>
                <div className="modal-body d-flex flex-column gap-3">
                  <div>
                    <label className="form-label">Full name</label>
                    <input className="form-control" value={newFullName} onChange={(e) => setNewFullName(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Email</label>
                    <input type="email" className="form-control" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Password <span className="text-muted bd-fs-sm">(optional — leave blank to use a reset link)</span></label>
                    <input type="password" className="form-control" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Roles</label>
                    <div className="d-flex flex-wrap gap-3">
                      {ALL_ROLES.map((role) => (
                        <div className="form-check" key={role}>
                          <input
                            id={`create-role-${role}`}
                            type="checkbox"
                            className="form-check-input"
                            checked={newRoles.includes(role)}
                            onChange={() => setNewRoles((prev) => toggleInList(prev, role))}
                          />
                          <label className="form-check-label bd-fs-sm" htmlFor={`create-role-${role}`}>
                            {roleMeta[role].label}
                          </label>
                        </div>
                      ))}
                    </div>
                    <p className="text-muted bd-fs-sm mt-2 mb-0">
                      New accounts always receive the viewer role from the signup trigger unless other roles are selected.
                    </p>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
                  <button type="button" className="btn btn-success" disabled={creating} onClick={handleCreateUser}>
                    {creating ? <><span className="spinner-border spinner-border-sm" /> Creating…</> : 'Create user'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Multi-role assignment ── */}
      {rolesUser && (
        <>
          <div className="bd-modal-backdrop" />
          <div className="bd-modal show">
            <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                  <h5 className="modal-title fw-semibold text-main mb-0">Roles — {rolesUser.full_name || rolesUser.email}</h5>
                  <button type="button" className="btn-close" onClick={() => setRolesUser(null)} aria-label="Close" />
                </div>
                <div className="modal-body d-flex flex-column gap-2">
                  <p className="text-muted bd-fs-sm mb-2">
                    Select all roles this user should hold. Changes are audited and cannot remove your own admin role.
                  </p>
                  {ALL_ROLES.map((role) => {
                    const meta = roleMeta[role];
                    const Icon = meta.icon;
                    return (
                      <div className="form-check d-flex align-items-center gap-2" key={role}>
                        <input
                          id={`role-${role}`}
                          type="checkbox"
                          className="form-check-input mt-0"
                          checked={roleSelection.includes(role)}
                          onChange={() => setRoleSelection((prev) => toggleInList(prev, role))}
                        />
                        <label className="form-check-label d-inline-flex align-items-center gap-2" htmlFor={`role-${role}`}>
                          <Icon className="text-secondary" />
                          <span className="fw-medium text-main bd-fs-sm">{meta.label}</span>
                          <span className="text-muted bd-fs-sm">{role}</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setRolesUser(null)}>Cancel</button>
                  <button type="button" className="btn btn-success" disabled={savingRoles} onClick={handleSaveRoles}>
                    {savingRoles ? <><span className="spinner-border spinner-border-sm" /> Saving…</> : 'Save roles'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Password reset link ── */}
      {resetUser && (
        <>
          <div className="bd-modal-backdrop" />
          <div className="bd-modal show">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                  <h5 className="modal-title fw-semibold text-main mb-0">Reset link — {resetUser.full_name || resetUser.email}</h5>
                  <button type="button" className="btn-close" onClick={() => { setResetUser(null); setResetLink(''); }} aria-label="Close" />
                </div>
                <div className="modal-body d-flex flex-column gap-3">
                  <p className="text-muted bd-fs-sm mb-0">
                    Send this one-time link to the user. It expires according to your auth settings.
                  </p>
                  <div className="input-group">
                    <input className="form-control bd-fs-sm" readOnly value={resetLink} onFocus={(e) => e.target.select()} />
                    <button type="button" className="btn btn-outline-primary" onClick={copyResetLink}>
                      <Check /> Copy
                    </button>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => { setResetUser(null); setResetLink(''); }}>
                    <X /> Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Teacher assignments ── */}
      {teacherUser && (
        <>
          <div className="bd-modal-backdrop" />
          <div className="bd-modal show">
            <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered modal-lg">
              <div className="modal-content">
                <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                  <h5 className="modal-title fw-semibold text-main mb-0">Teaching assignments — {teacherUser.full_name || teacherUser.email}</h5>
                  <button type="button" className="btn-close" onClick={() => setTeacherUser(null)} aria-label="Close" />
                </div>
                <div className="modal-body d-flex flex-column gap-4">
                  {teacherLoading ? (
                    <div className="d-flex justify-content-center py-8"><Loader2 className="fs-3 text-success" /></div>
                  ) : (
                    <>
                      <section className="modal-section">
                        <h6 className="fw-semibold text-main mb-3">Assigned classes ({assignedClasses.length})</h6>
                        {assignedClasses.length === 0 ? (
                          <p className="text-muted bd-fs-sm mb-0">No classes assigned to this teacher yet.</p>
                        ) : (
                          <div className="d-flex flex-column gap-2">
                            {assignedClasses.map((c) => (
                              <div key={c.id} className="d-flex align-items-center justify-content-between gap-2 rounded-3 border border-secondary-subtle p-2">
                                <span className="fw-medium text-main bd-fs-sm">{c.name}</span>
                                <button
                                  type="button"
                                  className="btn btn-outline-danger btn-sm"
                                  disabled={savingTeacher}
                                  onClick={() => updateClassTeacher(c.id, null)}
                                >
                                  Unassign
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>

                      <section className="modal-section">
                        <h6 className="fw-semibold text-main mb-3">Assigned class subjects ({assignedSubjects.length})</h6>
                        {assignedSubjects.length === 0 ? (
                          <p className="text-muted bd-fs-sm mb-0">No class subjects assigned to this teacher yet.</p>
                        ) : (
                          <div className="d-flex flex-column gap-2">
                            {assignedSubjects.map((cs) => {
                              const cls = classRows.find((c) => c.id === cs.class_id);
                              const subject = subjects.find((s) => s.id === cs.subject_id);
                              return (
                                <div key={cs.id} className="d-flex align-items-center justify-content-between gap-2 rounded-3 border border-secondary-subtle p-2">
                                  <span className="text-main bd-fs-sm">
                                    <span className="fw-medium">{cls?.name || 'Class'}</span>
                                    <span className="text-muted"> — {subject?.name || 'Subject'}</span>
                                  </span>
                                  <button
                                    type="button"
                                    className="btn btn-outline-danger btn-sm"
                                    disabled={savingTeacher}
                                    onClick={() => updateSubjectTeacher(cs.id, null)}
                                  >
                                    Unassign
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>

                      <section className="modal-section">
                        <h6 className="fw-semibold text-main mb-3">Assign a class and subject</h6>
                        <div className="row g-3">
                          <div className="col-12 col-sm-6">
                            <label className="form-label">Class</label>
                            <select className="form-select" value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
                              <option value="">Select a class</option>
                              {classRows.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-12 col-sm-6">
                            <label className="form-label">Subject</label>
                            <select className="form-select" value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)}>
                              <option value="">Select a subject</option>
                              {subjects.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="d-flex flex-wrap justify-content-end gap-2 mt-3">
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm"
                            disabled={savingTeacher || !selectedClassId}
                            onClick={() => updateClassTeacher(selectedClassId, teacherUser.user_id)}
                          >
                            Assign class
                          </button>
                          <button
                            type="button"
                            className="btn btn-success btn-sm"
                            disabled={savingTeacher || !selectedClassId || !selectedSubjectId}
                            onClick={handleAssignSubject}
                          >
                            Assign subject to class
                          </button>
                        </div>
                      </section>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {linkParentsFor && (
        <LinkParentsDialog
          studentId={linkParentsFor.id}
          studentName={`${linkParentsFor.first_name} ${linkParentsFor.last_name}`}
          open
          onOpenChange={(open) => { if (!open) setLinkParentsFor(null); }}
          onUpdate={() => void fetchUsers()}
        />
      )}
      {linkAccountFor && (
        <LinkStudentAccountDialog
          studentId={linkAccountFor.id}
          studentName={`${linkAccountFor.first_name} ${linkAccountFor.last_name}`}
          currentUserId={linkAccountFor.user_id || null}
          open
          onOpenChange={(open) => { if (!open) setLinkAccountFor(null); }}
          onLinked={() => void fetchUsers()}
        />
      )}
    </DashboardLayout>
  );
}
