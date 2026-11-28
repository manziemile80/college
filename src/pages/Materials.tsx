import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { buildScope, scopedById, type Scope } from '@/lib/scope';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, FolderOpen, Download, Search, Loader2, Pencil } from '@/lib/icons';

interface Material {
  id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  subject_id: string | null;
  class_id: string | null;
  created_at: string;
}

const emptyForm = { title: '', description: '', file_url: '', subject_id: '', class_id: '' };

export default function Materials() {
  const { user, roles, can } = useAuth();
  const [scope, setScope] = useState<Scope | null>(null);
  const { toast } = useToast();
  const isStaff = roles.includes('admin') || roles.includes('dos') || roles.includes('teacher');
  const canManage = can('materials.manage') && isStaff;

  const [materials, setMaterials] = useState<Material[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    let cancelled = false;
    buildScope(supabase, user?.id, roles).then((s) => { if (!cancelled) setScope(s); });
    return () => { cancelled = true; };
  }, [user?.id, roles]);

  useEffect(() => {
    if (scope) void fetchAll();
  }, [scope]);

  const fetchAll = async () => {
    if (!scope) return;
    setLoading(true);
    const [m, s, c] = await Promise.all([
      supabase.from('materials').select('*').order('created_at', { ascending: false }),
      supabase.from('subjects').select('id, name').order('name'),
      supabase.from('classes').select('id, name').order('name'),
    ]);
    setMaterials(
      ((m.data as Material[]) || []).filter((x) =>
        (scope.classIds === null || (x.class_id && scope.classIds.includes(x.class_id)) || x.class_id === null)
        && (scope.subjectIds === null || (x.subject_id && scope.subjectIds.includes(x.subject_id)) || x.subject_id === null),
      ),
    );
    setSubjects(scopedById(s.data || [], scope.subjectIds));
    setClasses(scopedById(c.data || [], scope.classIds));
    setLoading(false);
  };

  const save = async () => {
    if (!canManage || !scope) return;
    if (scope.classIds !== null && form.class_id && !scope.classIds.includes(form.class_id)) {
      toast({ title: 'You are not assigned to this class', variant: 'destructive' }); return;
    }
    if (scope.subjectIds !== null && form.subject_id && !scope.subjectIds.includes(form.subject_id)) {
      toast({ title: 'You are not assigned to this subject', variant: 'destructive' }); return;
    }
    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    const payload = {
      title: form.title.trim().slice(0, 150),
      description: form.description.trim().slice(0, 1000) || null,
      file_url: form.file_url.trim().slice(0, 500) || null,
      subject_id: form.subject_id || null,
      class_id: form.class_id || null,
      uploaded_by: user!.id,
    };
    const { error } = editingId
      ? await supabase.from('materials').update(payload).eq('id', editingId)
      : await supabase.from('materials').insert(payload);
    if (error) {
      toast({ title: 'Could not save material', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: editingId ? 'Material updated' : 'Material added' });
    setOpen(false);
    setForm(emptyForm);
    setEditingId(null);
    fetchAll();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('materials').delete().eq('id', id);
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
      return;
    }
    fetchAll();
  };

  const filtered = materials.filter((m) =>
    `${m.title} ${m.description || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const label = (list: { id: string; name: string }[], id: string | null) =>
    list.find((x) => x.id === id)?.name;

  const materialCard = (m: Material) => (
    <div className="card h-100 d-flex flex-column">
      <div className="card-body d-flex flex-column gap-3 p-4">
        <div className="d-flex align-items-center justify-content-between gap-2">
          <span className="d-inline-flex align-items-center justify-content-center rounded-3 bg-success-subtle text-success p-2"><FolderOpen className="fs-5" /></span>
          <span className="badge text-bg-secondary bg-secondary-subtle bd-fs-xs">PDF</span>
        </div>
        <div>
          <h3 className="fw-semibold text-main mb-1 text-truncate">{m.title}</h3>
          <p className="mt-1 text-muted bd-fs-sm mb-0 line-clamp-2">{m.description || 'No description'}</p>
        </div>
        <div className="d-flex flex-wrap gap-1.5">
          {label(subjects, m.subject_id) && (
            <span className="badge text-bg-secondary bg-secondary-subtle bd-fs-xs">{label(subjects, m.subject_id)}</span>
          )}
          {label(classes, m.class_id) && (
            <span className="badge text-bg-secondary bg-secondary-subtle bd-fs-xs">{label(classes, m.class_id)}</span>
          )}
        </div>
        <div className="d-flex align-items-center gap-2 mt-auto">
          {m.file_url && (
            <a href={m.file_url} target="_blank" rel="noreferrer" className="d-inline-flex align-items-center gap-1">
              <button type="button" className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1"><Download /> Open</button>
            </a>
          )}
          {canManage && (
            <>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center"
                aria-label="Edit material"
                onClick={() => {
                  setEditingId(m.id);
                  setForm({
                    title: m.title,
                    description: m.description || '',
                    file_url: m.file_url || '',
                    subject_id: m.subject_id || '',
                    class_id: m.class_id || '',
                  });
                  setOpen(true);
                }}
              >
                <Pencil />
              </button>
              <button type="button" className="btn btn-outline-danger btn-sm d-inline-flex align-items-center" aria-label="Delete material" onClick={() => remove(m.id)}><Trash2 /></button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="E-Learning"
          title="Learning Materials"
          description="Notes, PDFs and resources shared with students for each subject and class."
          actions={canManage ? (
            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-1" onClick={() => { setEditingId(null); setForm(emptyForm); setOpen(true); }}>
              <Plus /> Add Material
            </button>
          ) : undefined}
        />

        <div className="input-group w-100 w-md-auto flex-grow-1">
          <span className="input-group-text bg-white border-secondary-subtle"><Search className="text-secondary" /></span>
          <input
            type="search"
            className="form-control border-secondary-subtle"
            placeholder="Search materials..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search materials"
          />
        </div>

        {loading ? (
          <div className="d-flex justify-content-center py-8">
            <span className="spinner-border spinner-border-lg text-success" role="status" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <div className="card-body d-flex flex-column align-items-center py-12 text-center">
              <FolderOpen className="fs-3 mb-3 text-secondary" />
              <p className="fw-semibold text-main mb-2">No materials found</p>
            </div>
          </div>
        ) : (
          <div className="row g-3 row-cols-1 row-cols-md-2 row-cols-lg-3">
            {filtered.map((m) => <div key={m.id} className="col">{materialCard(m)}</div>)}
          </div>
        )}

        {/* ── Add / Edit material modal ── */}
        {open && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">{editingId ? 'Edit Material' : 'Add Material'}</h5>
                    <button type="button" className="btn-close" onClick={() => setOpen(false)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-3">
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Title</label>
                      <input className="form-control" value={form.title} maxLength={150} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                    </div>
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Description</label>
                      <textarea className="form-control" value={form.description} maxLength={1000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </div>
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">File / resource link</label>
                      <input className="form-control" value={form.file_url} maxLength={500} placeholder="https://..." onChange={(e) => setForm({ ...form, file_url: e.target.value })} />
                    </div>
                    <div className="row g-3">
                      <div className="col-6 col-md-6">
                        <label className="form-label">Subject</label>
                        <select className="form-select" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>
                          <option value="">Select subject</option>
                          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div className="col-6 col-md-6">
                        <label className="form-label">Class</label>
                        <select className="form-select" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
                          <option value="">Select class</option>
                          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer d-flex justify-content-end gap-2">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setOpen(false)}>Cancel</button>
                    <button type="button" className="btn btn-success" onClick={save}>{editingId ? 'Save Changes' : 'Add Material'}</button>
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
