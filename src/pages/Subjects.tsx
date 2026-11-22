import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="School"
          title="Subjects"
          description="Manage academic subjects offered at the school with codes and descriptions."
          actions={canManage ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreate} className="g-2"><Plus className="h-4 w-4" />Add Subject</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingId ? 'Edit Subject' : 'New Subject'}</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                  <div className="space-y-2">
                    <Label>Subject Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mathematics" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Code</Label>
                    <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MATH" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Description (optional)</Label>
                    <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="d-flex justify-content-end g-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingId ? 'Update' : 'Create')}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          ) : undefined}
        />

        <Card>
          <CardHeader><CardTitle className="d-flex align-items-center g-2 fs-18"><BookOpen className="h-5 w-5 text-emerald-600" /> All Subjects</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="d-flex justify-content-center py-8"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
            ) : subjects.length === 0 ? (
              <div className="empty-state">
                <BookOpen className="h-12 w-12 text-slate-400 mb-4" />
                <h3 className="fs-18 fw-semibold text-slate-900">No subjects yet</h3>
                <p className="fs-13 text-slate-500">Create the first subject for your school</p>
              </div>
            ) : (
              <div class="table-responsive"><Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Description</TableHead>
                    {canManage && <TableHead className="text-end">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjects.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="fw-medium text-slate-900">{s.name}</TableCell>
                      <TableCell><span className="rounded-[8px] bg-slate-100 px-2.5 py-1 fs-12.5 font-monospace text-slate-700">{s.code}</span></TableCell>
                      <TableCell className="fs-13 text-slate-500">{s.description || '-'}</TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="d-flex justify-content-end g-1">
                            <Button variant="edit" size="icon" onClick={() => openEdit(s)} aria-label="Edit subject"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="destructive" size="icon" onClick={() => handleDelete(s.id)} aria-label="Delete subject"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}




