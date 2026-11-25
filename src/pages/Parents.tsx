import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { Parent, StudentParent, Student } from '@/types/database';
import { Plus, Search, UserCheck, Loader2, Phone, Mail, Pencil } from '@/lib/icons';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

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

  const parentForm = (
    <div className="d-flex flex-column gap-4">
      <div className="d-flex flex-column gap-2">
        <label className="form-label">Full Name</label>
        <input className="form-control" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div className="d-flex flex-column gap-2">
        <label className="form-label">Email</label>
        <input className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="d-flex flex-column gap-2">
        <label className="form-label">Phone Number</label>
        <input className="form-control" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254 7XX XXX XXX" required />
      </div>
      <div className="d-flex flex-column gap-2">
        <label className="form-label">Address (Optional)</label>
        <input className="form-control" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="d-flex justify-content-end gap-2 pt-2">
        <button type="submit" className="btn btn-success d-inline-flex align-items-center gap-1" disabled={formLoading}>
          {formLoading ? <><span className="spinner-border spinner-border-sm" /> {isEditDialogOpen ? 'Saving...' : 'Adding...'}</> : (isEditDialogOpen ? 'Save Changes' : 'Add Parent')}
        </button>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="School"
          title="Parents"
          description="Manage parent contacts, linked students and contact details."
          actions={canManage ? (
            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-1" onClick={() => setIsAddDialogOpen(true)}>
              <Plus /> Add Parent
            </button>
          ) : undefined}
        />

        <div className="input-group w-100 w-md-auto flex-grow-1">
          <span className="input-group-text bg-white border-secondary-subtle"><Search className="text-secondary" /></span>
          <input
            type="search"
            className="form-control border-secondary-subtle"
            placeholder="Search parents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search parents"
          />
        </div>

        {loading ? (
          <div className="d-flex align-items-center justify-content-center py-8">
            <span className="spinner-border spinner-border-lg text-success" role="status" />
          </div>
        ) : filteredParents.length === 0 ? (
          <div className="card">
            <div className="card-body d-flex flex-column align-items-center justify-content-center py-10 text-center">
              <UserCheck className="fs-3 mb-4 text-secondary" />
              <h3 className="fw-semibold text-main mb-2">No parents found</h3>
              <p className="text-secondary bd-fs-sm mb-0">{searchQuery ? 'Try adjusting your search' : 'Add your first parent to get started'}</p>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr className="border-bottom border-secondary-subtle">
                    <th scope="col">Parent</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Children</th>
                    <th scope="col">Address</th>
                    {canManage && <th scope="col" className="text-end">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredParents.map((parent) => (
                    <tr key={parent.id} className="border-bottom border-secondary-subtle">
                      <td>
                        <div className="d-flex align-items-center gap-3">
                          <span className="bd-avatar bd-user-avatar d-inline-flex align-items-center justify-content-center">
                            {parent.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                          </span>
                          <div>
                            <p className="fw-medium text-main mb-0">{parent.full_name}</p>
                            <p className="text-muted bd-fs-sm mb-0">{parent.children?.length || 0} student{parent.children?.length !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="d-flex flex-column gap-1 text-muted bd-fs-sm">
                        <span className="d-flex align-items-center gap-2"><Phone className="text-success" /> {parent.phone}</span>
                        <span className="d-flex align-items-center gap-2"><Mail className="text-success" /> {parent.email}</span>
                      </td>
                      <td>
                        {parent.children && parent.children.length > 0 ? (
                          <div className="d-flex flex-column gap-1">
                            {parent.children.map((child, idx) => (
                              <div key={idx} className="text-secondary bd-fs-sm">
                                {child.student.first_name} {child.student.last_name}
                                {child.is_primary_contact && (
                                  <span className="badge text-bg-success bg-success-subtle text-success-subtle">Primary</span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="text-muted bd-fs-sm">{parent.address || '—'}</td>
                      {canManage && (
                        <td className="text-end">
                          <button type="button" className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1" onClick={() => handleOpenEditDialog(parent)}>
                            <Pencil /> Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Add Parent modal ── */}
        {isAddDialogOpen && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">Add New Parent</h5>
                    <button type="button" className="btn-close" onClick={() => setIsAddDialogOpen(false)} aria-label="Close" />
                  </div>
                  <form className="modal-body" onSubmit={handleAddParent}>{parentForm}</form>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Edit Parent modal ── */}
        {editingParent && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">Edit Parent</h5>
                    <button type="button" className="btn-close" onClick={() => { setIsEditDialogOpen(false); setEditingParent(null); resetForm(); }} aria-label="Close" />
                  </div>
                  <form className="modal-body" onSubmit={handleEditParent}>{parentForm}</form>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
