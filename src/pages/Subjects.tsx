import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, Loader2, Plus, Pencil, Trash2 } from '@/lib/icons';
import { toast } from 'sonner';

interface Subject { id: string; name: string; code: string; description: string | null; }

export default function Subjects() {
  const { role } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', description: '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  const canManage = role === 'admin' || role === 'teacher';

  useEffect(() => { fetchSubjects(); }, []);

  const fetchSubjects = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('subjects').select('*').order('name');
    if (error) toast.error(error.message);
    else setSubjects(data || []);
    setLoading(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', code: '', description: '' });
    setOpen(true);
  };

  const openEdit = (s: Subject) => {
    setEditingId(s.id);
    setForm({ name: s.name, code: s.code, description: s.description || '' });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) return toast.error('Name and code required');
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || null,
    };
    const { error } = editingId
      ? await supabase.from('subjects').update(payload).eq('id', editingId)
      : await supabase.from('subjects').insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editingId ? 'Subject updated' : 'Subject created');
    setOpen(false);
    setEditingId(null);
    setForm({ name: '', code: '', description: '' });
    fetchSubjects();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this subject?')) return;
    const { error } = await supabase.from('subjects').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Deleted');
    fetchSubjects();
  };

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="School"
          title="Subjects"
          description="Manage academic subjects offered at the school with codes and descriptions."
          actions={canManage ? (
            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-1" onClick={openCreate}>
              <Plus /> Add Subject
            </button>
          ) : undefined}
        />

        <div className="card">
          <div className="card-header d-flex align-items-center justify-content-between py-3">
            <h5 className="mb-0 fw-semibold text-main d-flex align-items-center gap-2">
              <BookOpen className="text-success" /> All Subjects
            </h5>
            <span className="badge text-bg-secondary bd-fs-sm">{subjects.length} subjects</span>
          </div>
          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex justify-content-center py-8">
                <span className="spinner-border spinner-border-lg text-success" role="status" />
              </div>
            ) : subjects.length === 0 ? (
              <div className="empty-state">
                <BookOpen className="empty-state-icon text-secondary" />
                <h3 className="fw-semibold text-main mb-1">No subjects yet</h3>
                <p className="text-muted bd-fs-sm mb-0">Create the first subject for your school</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr className="border-bottom border-secondary-subtle">
                      <th scope="col">Name</th>
                      <th scope="col">Code</th>
                      <th scope="col">Description</th>
                      {canManage && <th scope="col" className="text-end">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((s) => (
                      <tr key={s.id} className="border-bottom border-secondary-subtle">
                        <td className="fw-medium text-main">{s.name}</td>
                        <td>
                          <span className="badge bg-secondary-subtle">{s.code}</span>
                        </td>
                        <td className="text-muted bd-fs-sm">{s.description || '-'}</td>
                        {canManage && (
                          <td className="text-end">
                            <div className="d-flex justify-content-end gap-1">
                              <button type="button" className="btn btn-outline-primary btn-sm d-inline-flex align-items-center" aria-label="Edit subject" onClick={() => openEdit(s)}><Pencil /></button>
                              <button type="button" className="btn btn-outline-danger btn-sm d-inline-flex align-items-center" aria-label="Delete subject" onClick={() => handleDelete(s.id)}><Trash2 /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Subject form modal ── */}
        {open && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">{editingId ? 'Edit Subject' : 'New Subject'}</h5>
                    <button type="button" className="btn-close" onClick={() => setOpen(false)} aria-label="Close" />
                  </div>
                  <form className="modal-body d-flex flex-column gap-3" onSubmit={handleSubmit}>
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Subject Name</label>
                      <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mathematics" required />
                    </div>
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Code</label>
                      <input className="form-control" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MATH" required />
                    </div>
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Description (optional)</label>
                      <input className="form-control" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </div>
                    <div className="modal-footer d-flex justify-content-end gap-2">
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setOpen(false)}>Cancel</button>
                      <button type="submit" className="btn btn-success d-inline-flex align-items-center gap-1" disabled={saving}>
                        {saving ? <><span className="spinner-border spinner-border-sm" /> Saving...</> : (editingId ? 'Update' : 'Create')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
