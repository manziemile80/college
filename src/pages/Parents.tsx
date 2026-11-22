import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Parent, StudentParent, Student } from '@/types/database';
import { Plus, Search, UserCheck, Loader2, Phone, Mail, Pencil } from '@/lib/icons';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ParentWithChildren extends Parent {
  children?: {
    student: Student;
    relationship: string;
    is_primary_contact: boolean;
  }[];
}

export default function Parents() {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'teacher';
  const [parents, setParents] = useState<ParentWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingParent, setEditingParent] = useState<ParentWithChildren | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: parentsData } = await supabase
        .from('parents')
        .select('*')
        .order('full_name');

      if (parentsData) {
        const parentsWithChildren: ParentWithChildren[] = [];
        for (const parent of parentsData) {
          const { data: links } = await supabase
            .from('student_parents')
            .select('*, student:students(*)')
            .eq('parent_id', parent.id);

          parentsWithChildren.push({
            ...(parent as Parent),
            children: links?.map((l: any) => ({
              student: l.student,
              relationship: l.relationship,
              is_primary_contact: l.is_primary_contact,
            })) || [],
          });
        }
        setParents(parentsWithChildren);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load parents');
    } finally {
      setLoading(false);
    }
  };

  const handleAddParent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const { error } = await supabase.from('parents').insert({
        full_name: fullName,
        email,
        phone,
        address: address || null,
      });

      if (error) throw error;

      toast.success('Parent added successfully');
      setIsAddDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error('Failed to add parent', { description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setPhone('');
    setAddress('');
  };

  const handleOpenEditDialog = (parent: ParentWithChildren) => {
    setEditingParent(parent);
    setFullName(parent.full_name);
    setEmail(parent.email);
    setPhone(parent.phone);
    setAddress(parent.address || '');
    setIsEditDialogOpen(true);
  };

  const handleEditParent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParent) return;
    setFormLoading(true);

    try {
      const { error } = await supabase
        .from('parents')
        .update({
          full_name: fullName,
          email,
          phone,
          address: address || null,
        })
        .eq('id', editingParent.id);

      if (error) throw error;

      toast.success('Parent updated successfully');
      setIsEditDialogOpen(false);
      setEditingParent(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error('Failed to update parent', { description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const filteredParents = parents.filter((parent) =>
    parent.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    parent.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    parent.phone.includes(searchQuery)
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="School"
          title="Parents"
          description="Manage parent contacts, linked students and contact details."
          actions={canManage ? (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="g-2"><Plus className="h-4 w-4" />Add Parent</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto w-[calc(100%-1rem)]">
                <DialogHeader><DialogTitle>Add New Parent</DialogTitle></DialogHeader>
                <form onSubmit={handleAddParent} className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254 7XX XXX XXX" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Address (Optional)</Label>
                    <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                  <div className="d-flex justify-content-end g-3 pt-2">
                    <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={formLoading}>
                      {formLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Adding...</> : 'Add Parent'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          ) : undefined}
        />

        <div className="position-relative w-100 sm:max-w-xs">
          <Search className="position-absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search parents..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>

        {loading ? (
          <div className="d-flex align-items-center justify-content-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
        ) : filteredParents.length === 0 ? (
          <Card><CardContent className="d-flex d-flex flex-column align-items-center justify-content-center py-12">
            <UserCheck className="h-12 w-12 text-slate-400 mb-4" />
            <h3 className="fs-18 fw-semibold text-slate-900">No parents found</h3>
            <p className="fs-13 text-slate-500">{searchQuery ? 'Try adjusting your search' : 'Add your first parent to get started'}</p>
          </CardContent></Card>
        ) : (
          <Card>
            <div class="table-responsive"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parent</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Children</TableHead>
                  <TableHead>Address</TableHead>
                  {canManage && <TableHead className="text-end">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParents.map((parent) => (
                  <TableRow key={parent.id}>
                    <TableCell>
                      <div className="d-flex align-items-center g-3">
                        <div className="d-flex h-9 w-9 align-items-center justify-content-center rounded-circle bg-blue-100 fs-13 fw-semibold text-blue-700">
                          {parent.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p className="fw-medium text-slate-900">{parent.full_name}</p>
                          <p className="fs-12.5 text-slate-500">{parent.children?.length || 0} student{parent.children?.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="space-y-1 fs-13 text-slate-500">
                      <span className="d-flex align-items-center g-2"><Phone className="h-4 w-4 text-emerald-600" />{parent.phone}</span>
                      <span className="d-flex align-items-center g-2"><Mail className="h-4 w-4 text-emerald-600" />{parent.email}</span>
                    </TableCell>
                    <TableCell>
                      {parent.children && parent.children.length > 0 ? (
                        <div className="space-y-1">
                          {parent.children.map((child, idx) => (
                            <div key={idx} className="fs-13 text-slate-600">
                              {child.student.first_name} {child.student.last_name}
                              {child.is_primary_contact && (
                                <span className="ml-2 rounded-circle bg-emerald-100 px-2 py-0.5 fs-11 fw-medium text-emerald-700">Primary</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : 'â€”'}
                    </TableCell>
                    <TableCell className="fs-13 text-slate-500">{parent.address || 'â€”'}</TableCell>
                    {canManage && (
                      <TableCell className="text-end">
                        <Button variant="edit" size="sm" onClick={() => handleOpenEditDialog(parent)} className="g-1.5">
                          <Pencil className="h-4 w-4" />Edit
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
          </Card>
        )}

        <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) { setEditingParent(null); resetForm(); }
        }}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto w-[calc(100%-1rem)]">
            <DialogHeader><DialogTitle>Edit Parent</DialogTitle></DialogHeader>
            <form onSubmit={handleEditParent} className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editFullName">Full Name</Label>
                <Input id="editFullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editEmail">Email</Label>
                <Input id="editEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editPhone">Phone Number</Label>
                <Input id="editPhone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editAddress">Address (Optional)</Label>
                <Input id="editAddress" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="d-flex justify-content-end g-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={formLoading}>
                  {formLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : 'Save Changes'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}





