import { PageHeader } from '@/components/layout/PageHeader';
import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Profile, AppRole } from '@/types/database';
import { Users, Loader2, ShieldCheck, Shield, ShieldAlert, Trash2, Pencil } from '@/lib/icons';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface UserWithRole extends Profile {
  role?: AppRole | null;
}

const roleIcons: Record<AppRole, React.ComponentType<any>> = {
  admin: ShieldAlert,
  teacher: ShieldCheck,
  parent: Shield,
  student: Shield,
  stock_manager: Shield,
  storekeeper: Shield,
  dos: ShieldCheck,
  dod: ShieldAlert,
  viewer: Shield,
};

export default function UsersPage() {
  const { role: currentRole, user: currentUser } = useAuth();
  const isAdmin = currentRole === 'admin';
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [newRole, setNewRole] = useState<AppRole>('teacher');
  const [editName, setEditName] = useState('');
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profiles) {
        const usersWithRoles: UserWithRole[] = [];
        for (const profile of profiles) {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.user_id)
            .single();

          usersWithRoles.push({
            ...(profile as Profile),
            role: roleData?.role as AppRole | null,
          });
        }
        setUsers(usersWithRoles);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRole = async () => {
    if (!selectedUser) return;
    setFormLoading(true);

    try {
      if (editName && editName !== selectedUser.full_name) {
        const { error: pErr } = await supabase
          .from('profiles')
          .update({ full_name: editName })
          .eq('user_id', selectedUser.user_id);
        if (pErr) throw pErr;
      }
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', selectedUser.user_id)
        .single();

      if (existingRole) {
        const { error } = await supabase
          .from('user_roles')
          .update({ role: newRole })
          .eq('user_id', selectedUser.user_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: selectedUser.user_id, role: newRole });
        if (error) throw error;
      }

      toast.success('User updated successfully');
      setIsAssignDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error: any) {
      toast.error('Failed to update user', { description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteUser = async (u: UserWithRole) => {
    if (u.user_id === currentUser?.id) return toast.error('You cannot delete your own account');
    if (!confirm(`Delete user "${u.full_name}"? This removes their profile and role assignments.`)) return;
    try {
      await supabase.from('user_roles').delete().eq('user_id', u.user_id);
      const { error } = await supabase.from('profiles').delete().eq('user_id', u.user_id);
      if (error) throw error;
      toast.success('User removed');
      fetchUsers();
    } catch (e: any) {
      toast.error('Failed to delete user', { description: e.message });
    }
  };

  const roleMeta: Record<AppRole, { label: string; icon: React.ComponentType<any>; badge: string }> = {
    admin: { label: 'Administrator', icon: ShieldAlert, badge: 'badge text-bg-danger' },
    teacher: { label: 'Teacher', icon: ShieldCheck, badge: 'badge text-bg-success' },
    parent: { label: 'Parent', icon: Shield, badge: 'badge text-bg-info' },
    student: { label: 'Student', icon: Shield, badge: 'badge text-bg-warning' },
    stock_manager: { label: 'Stock Manager', icon: Shield, badge: 'badge text-bg-secondary' },
    storekeeper: { label: 'Storekeeper', icon: Shield, badge: 'badge text-bg-secondary' },
    dos: { label: 'Director of Studies', icon: ShieldCheck, badge: 'badge text-bg-success' },
    dod: { label: 'Director of Discipline', icon: ShieldAlert, badge: 'badge text-bg-danger' },
    viewer: { label: 'Viewer (read-only)', icon: Shield, badge: 'badge text-bg-secondary' },
  };

  const filteredUsers = users.filter((u) =>
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleBadge = (user: UserWithRole) => {
    if (!user.role) return <span className="badge text-bg-secondary bd-fs-sm">No Role</span>;
    const meta = roleMeta[user.role];
    const Icon = meta.icon;
    return (
      <span className={cn(meta.badge, 'd-inline-flex align-items-center gap-1 bd-fs-sm')}>
        <Icon className="fs-6" />
        {meta.label}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Administration"
          title="User Management"
          description="Manage user accounts and role assignments across the school system."
        />

        <div className="input-group w-100 w-md-auto flex-grow-1">
          <span className="input-group-text bg-white border-secondary-subtle"><Users className="text-secondary" /></span>
          <input
            type="search"
            className="form-control border-secondary-subtle"
            placeholder="Search users by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search users"
          />
        </div>

        {loading ? (
          <div className="d-flex align-items-center justify-content-center py-8">
            <span className="spinner-border spinner-border-lg text-success" role="status" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="card">
            <div className="card-body d-flex flex-column align-items-center justify-content-center py-10 text-center">
              <Users className="fs-3 mb-4 text-secondary" />
              <h3 className="fw-semibold text-main mb-2">No users found</h3>
              <p className="text-secondary bd-fs-sm mb-0">Users will appear here when they sign up</p>
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
                    <th scope="col">Role</th>
                    <th scope="col">Joined</th>
                    <th scope="col" className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-bottom border-secondary-subtle">
                      <td>
                        <div className="d-flex align-items-center gap-3">
                          <span className="bd-avatar bd-user-avatar d-inline-flex align-items-center justify-content-center">
                            {user.full_name?.charAt(0)}
                          </span>
                          <div className="min-w-0">
                            <p className="fw-medium text-main mb-0">{user.full_name}</p>
                            <p className="text-muted bd-fs-sm mb-0">{user.role ? roleMeta[user.role].label : 'No role'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-muted bd-fs-sm">{user.email}</td>
                      <td>{getRoleBadge(user)}</td>
                      <td className="text-muted bd-fs-sm">{format(new Date(user.created_at), 'MMM d, yyyy')}</td>
                      <td className="text-end">
                        {isAdmin ? (
                          <div className="d-flex justify-content-end gap-1">
                            <button
                              type="button"
                              className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1"
                              onClick={() => {
                                setSelectedUser(user);
                                setNewRole(user.role || 'teacher');
                                setEditName(user.full_name);
                                setIsAssignDialogOpen(true);
                              }}
                            >
                              <Pencil /> Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm d-inline-flex align-items-center gap-1"
                              onClick={() => handleDeleteUser(user)}
                            >
                              <Trash2 /> Delete
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted bd-fs-sm">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Edit user modal ── */}
        {isAssignDialogOpen && selectedUser && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">Edit User</h5>
                    <button type="button" className="btn-close" onClick={() => setIsAssignDialogOpen(false)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-4">
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Full Name</label>
                      <input className="form-control" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </div>
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Role</label>
                      <select className="form-select" value={newRole} onChange={(e) => setNewRole(e.target.value as AppRole)}>
                        <option value="admin">Administrator</option>
                        <option value="teacher">Teacher</option>
                        <option value="parent">Parent</option>
                        <option value="student">Student</option>
                        <option value="stock_manager">Stock Manager</option>
                        <option value="storekeeper">Storekeeper</option>
                        <option value="dos">Director of Studies</option>
                        <option value="dod">Director of Discipline</option>
                        <option value="viewer">Viewer (read-only)</option>
                      </select>
                    </div>
                    <div className="d-flex justify-content-end gap-2 pt-2">
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setIsAssignDialogOpen(false)}>Cancel</button>
                      <button type="button" className="btn btn-success" onClick={handleAssignRole} disabled={formLoading}>
                        {formLoading ? <><span className="spinner-border spinner-border-sm" /> Saving...</> : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
