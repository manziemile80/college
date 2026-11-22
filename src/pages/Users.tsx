import { PageHeader } from '@/components/layout/PageHeader';
import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Profile, AppRole } from '@/types/database';
import { Users, Loader2, ShieldCheck, Shield, ShieldAlert, Trash2, Pencil } from '@/lib/icons';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface UserWithRole extends Profile {
  role?: AppRole | null;
}

const roleIcons: Record<AppRole, typeof ShieldCheck> = {
  admin: ShieldAlert,
  teacher: ShieldCheck,
  parent: Shield,
  student: Shield,
  stock_manager: Shield,
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

  const getRoleBadge = (role?: AppRole | null) => {
    if (!role) return <Badge variant="secondary">No role</Badge>;
    return (
      <Badge variant="secondary" className="d-flex align-items-center gap-1.5">
        <span className="fs-13 fw-semibold text-slate-700 text-uppercase">{role}</span>
      </Badge>
    );
  };

  const roleMeta: Record<AppRole, { label: string; icon: typeof ShieldCheck; badge: string }> = {
    admin: { label: 'Administrator', icon: ShieldAlert, badge: 'bg-red-100 text-red-800' },
    teacher: { label: 'Teacher', icon: ShieldCheck, badge: 'bg-emerald-100 text-emerald-700' },
    parent: { label: 'Parent', icon: Shield, badge: 'bg-blue-100 text-blue-700' },
    student: { label: 'Student', icon: Shield, badge: 'bg-amber-100 text-amber-800' },
    stock_manager: { label: 'Stock Manager', icon: Shield, badge: 'bg-slate-100 text-slate-700' },
    dos: { label: 'Director of Studies', icon: ShieldCheck, badge: 'bg-emerald-100 text-emerald-700' },
    dod: { label: 'Director of Discipline', icon: ShieldAlert, badge: 'bg-red-100 text-red-800' },
    viewer: { label: 'Viewer (read-only)', icon: Shield, badge: 'bg-slate-100 text-slate-700' },
  };

  const filteredUsers = users.filter((u) =>
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="Administration"
          title="User Management"
          description="Manage user accounts and role assignments across the school system."
        />

        <div className="position-relative w-100 sm:max-w-xs">
          <span className="position-absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
            <Users className="h-4 w-4" />
          </span>
          <Input placeholder="Search users by name or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>

        {loading ? (
          <div className="d-flex align-items-center justify-content-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
        ) : filteredUsers.length === 0 ? (
          <Card><CardContent className="d-flex d-flex flex-column align-items-center justify-content-center py-12">
            <Users className="h-12 w-12 text-slate-400 mb-4" />
            <h3 className="fs-18 fw-semibold text-slate-900">No users found</h3>
            <p className="fs-13 text-slate-500">Users will appear here when they sign up</p>
          </CardContent></Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const meta = user.role ? roleMeta[user.role] : null;
                  const Icon = meta?.icon || Shield;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="d-flex align-items-center gap-3">
                          <div className="d-flex h-9 w-9 align-items-center justify-content-center rounded-circle bg-emerald-100 text-emerald-700 fw-medium">
                            {user.full_name?.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="fw-medium text-slate-900">{user.full_name}</p>
                            <p className="fs-12.5 text-slate-500">{user.role ? meta?.label : 'No role'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="fs-13 text-slate-500">{user.email}</TableCell>
                      <TableCell>
                        {user.role ? (
                          <Badge className={meta?.badge}>
                            <Icon className="h-3.5 w-3.5 mr-1" />
                            {meta?.label}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">No Role</Badge>
                        )}
                      </TableCell>
                      <TableCell className="fs-13 text-slate-500">
                        {format(new Date(user.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-end">
                        {isAdmin ? (
                          <div className="d-flex justify-content-end gap-1.5">
                            <Dialog
                              open={isAssignDialogOpen && selectedUser?.id === user.id}
                              onOpenChange={(open) => {
                                setIsAssignDialogOpen(open);
                                if (!open) setSelectedUser(null);
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button variant="edit" size="sm" onClick={() => {
                                  setSelectedUser(user);
                                  setNewRole(user.role || 'teacher');
                                  setEditName(user.full_name);
                                }}>
                                  <Pencil className="h-4 w-4" />Edit
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-sm">
                                <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
                                <div className="space-y-4 mt-2">
                                  <div className="space-y-2">
                                    <Label>Full Name</Label>
                                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Role</Label>
                                    <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="admin">Administrator</SelectItem>
                                        <SelectItem value="teacher">Teacher</SelectItem>
                                        <SelectItem value="parent">Parent</SelectItem>
                                        <SelectItem value="student">Student</SelectItem>
                                        <SelectItem value="stock_manager">Stock Manager</SelectItem>
                                        <SelectItem value="dos">Director of Studies</SelectItem>
                                        <SelectItem value="dod">Director of Discipline</SelectItem>
                                        <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="d-flex justify-content-end gap-3">
                                    <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>Cancel</Button>
                                    <Button onClick={handleAssignRole} disabled={formLoading}>
                                      {formLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : 'Save'}
                                    </Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                            <Button variant="destructive" size="icon" onClick={() => handleDeleteUser(user)} aria-label="Delete user"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        ) : (
                          <span className="fs-13 text-slate-500">View only</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}



