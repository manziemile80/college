import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, Loader2, Pencil, Plus, Trash2, UserCheck } from '@/lib/icons';
import { toast } from 'sonner';

interface Subject { id: string; name: string; code: string; description: string | null; }
interface ClassRow { id: string; name: string; grade_level: string; }
interface Teacher { id: string; name: string; email: string; }
interface Assignment { id: string; class_id: string; subject_id: string; teacher_id: string | null; academic_year: string; }

const thisYear = () => {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
};

export default function Subjects() {
  const { role } = useAuth();
  const isDos = role === 'dos';
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', description: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState({ class_id: '', subject_id: '', teacher_id: '', academic_year: thisYear() });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [s, c, roles, cs] = await Promise.all([
      supabase.from('subjects').select('*').order('name'),
      supabase.from('classes').select('id, name, grade_level').order('name'),
      supabase.from('user_roles').select('user_id').eq('role', 'teacher'),
      supabase.from('class_subjects').select('*').order('created_at', { ascending: false }),
    ]);
    if (s.error) toast.error(s.error.message);
    setSubjects((s.data as Subject[]) || []);
    setClasses((c.data as ClassRow[]) || []);
    setAssignments((cs.data as Assignment[]) || []);

    const teacherIds = ((roles.data || []) as { user_id: string }[]).map((r) => r.user_id);
    if (teacherIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name, email').in('user_id', teacherIds);
      setTeachers(((profiles || []) as { user_id: string; full_name: string; email: string }[])
        .map((p) => ({ id: p.user_id, name: p.full_name || p.email, email: p.email })));
    } else {
      setTeachers([]);
    }
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
    if (!isDos) return toast.error('Only the Director of Studies can manage subjects');
    if (!form.name.trim() || !form.code.trim()) return toast.error('Name and code required');
    setSaving(true);
    const payload = {
      name: form.name.trim().slice(0, 120),
      code: form.code.trim().toUpperCase().slice(0, 30),
      description: form.description.trim().slice(0, 500) || null,
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
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!isDos) return toast.error('Only the Director of Studies can delete subjects');
    if (!confirm('Delete this subject?')) return;
    const { error } = await supabase.from('subjects').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Subject deleted');
    fetchAll();
  };

  const assignTeacher = async () => {
    if (!isDos) return toast.error('Only the Director of Studies can assign teachers');
    const { class_id, subject_id, teacher_id, academic_year } = assignForm;
    if (!class_id || !subject_id || !teacher_id) return toast.error('Choose a class, subject and teacher');
    setSaving(true);
    const { error } = await supabase.from('class_subjects').upsert(
      { class_id, subject_id, teacher_id, academic_year },
      { onConflict: 'class_id,subject_id,academic_year' },
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Teacher assigned to this class subject');
    setAssignForm({ ...assignForm, teacher_id: '' });
    fetchAll();
  };

  const unassignTeacher = async (id: string) => {
    if (!isDos) return toast.error('Only the Director of Studies can change assignments');
    const { error } = await supabase.from('class_subjects').update({ teacher_id: null }).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Teacher unassigned');
    fetchAll();
  };

  const label = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name || '—';

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="School"
          title="Subjects"
          description={isDos
            ? 'Create subjects and assign teachers to each class subject. Teachers then enroll students in their assigned classes.'
            : 'View the subjects offered by the school. Subject changes are made by the Director of Studies.'}
          actions={isDos ? (
            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-1" onClick={openCreate}>
              <Plus /> Add Subject
            </button>
          ) : undefined}
        />

        {isDos && (
          <div className="card">
            <div className="card-header py-3">
              <h5 className="mb-0 fw-semibold text-main d-flex align-items-center gap-2"><UserCheck className="text-success" /> Assign Teachers to Class Subjects</h5>
            </div>
            <div className="card-body d-flex flex-column gap-3">
              <div className="row g-3">
                <div className="col-md-3"><label className="form-label">Class</label>
                  <select className="form-select" value={assignForm.class_id} onChange={(e) => setAssignForm({ ...assignForm, class_id: e.target.value })}>
                    <option value="">Select class</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.grade_level})</option>)}
                  </select>
                </div>
                <div className="col-md-3"><label className="form-label">Subject</label>
                  <select className="form-select" value={assignForm.subject_id} onChange={(e) => setAssignForm({ ...assignForm, subject_id: e.target.value })}>
                    <option value="">Select subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="col-md-3"><label className="form-label">Teacher</label>
                  <select className="form-select" value={assignForm.teacher_id} onChange={(e) => setAssignForm({ ...assignForm, teacher_id: e.target.value })}>
                    <option value="">Select teacher</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="col-md-2"><label className="form-label">Academic year</label>
                  <input className="form-control" value={assignForm.academic_year} onChange={(e) => setAssignForm({ ...assignForm, academic_year: e.target.value })} />
                </div>
                <div className="col-md-1 d-flex align-items-end">
                  <button type="button" className="btn btn-success w-100" disabled={saving} onClick={assignTeacher}><Plus /></button>
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead><tr className="border-bottom border-secondary-subtle"><th>Class</th><th>Subject</th><th>Teacher</th><th>Year</th><th className="text-end">Action</th></tr></thead>
                  <tbody>
                    {assignments.length === 0 ? <tr><td colSpan={5} className="text-muted bd-fs-sm py-3">No teachers assigned yet.</td></tr>
                      : assignments.map((a) => (
                        <tr key={a.id} className="border-bottom border-secondary-subtle">
                          <td>{label(classes, a.class_id)}</td>
                          <td>{label(subjects, a.subject_id)}</td>
                          <td className="fw-medium text-main">{a.teacher_id ? label(teachers, a.teacher_id) : 'Not assigned'}</td>
                          <td className="bd-fs-sm text-muted">{a.academic_year}</td>
                          <td className="text-end">{a.teacher_id && <button type="button" className="btn btn-outline-danger btn-sm d-inline-flex align-items-center" aria-label="Unassign teacher" onClick={() => unassignTeacher(a.id)}><Trash2 /></button>}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header d-flex align-items-center justify-content-between py-3">
            <h5 className="mb-0 fw-semibold text-main d-flex align-items-center gap-2">
              <BookOpen className="text-success" /> All Subjects
            </h5>
            <span className="badge text-bg-secondary bd-fs-sm">{subjects.length} subjects</span>
          </div>
          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex justify-content-center py-8"><span className="spinner-border spinner-border-lg text-success" role="status" /></div>
            ) : subjects.length === 0 ? (
              <div className="empty-state">
                <BookOpen className="empty-state-icon text-secondary" />
                <h3 className="fw-semibold text-main mb-1">No subjects yet</h3>
                <p className="text-muted bd-fs-sm mb-0">{isDos ? 'Create the first subject for your school.' : 'Ask the Director of Studies to create subjects.'}</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr className="border-bottom border-secondary-subtle">
                      <th scope="col">Name</th><th scope="col">Code</th><th scope="col">Description</th>
                      {isDos && <th scope="col" className="text-end">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((s) => (
                      <tr key={s.id} className="border-bottom border-secondary-subtle">
                        <td className="fw-medium text-main">{s.name}</td>
                        <td><span className="badge bg-secondary-subtle">{s.code}</span></td>
                        <td className="text-muted bd-fs-sm">{s.description || '-'}</td>
                        {isDos && (
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

        {open && isDos && (
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
                    <div className="d-flex flex-column gap-2"><label className="form-label">Subject Name</label>
                      <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mathematics" required /></div>
                    <div className="d-flex flex-column gap-2"><label className="form-label">Code</label>
                      <input className="form-control" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MATH" required /></div>
                    <div className="d-flex flex-column gap-2"><label className="form-label">Description (optional)</label>
                      <input className="form-control" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                    <div className="modal-footer d-flex justify-content-end gap-2">
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setOpen(false)}>Cancel</button>
                      <button type="submit" className="btn btn-success d-inline-flex align-items-center gap-1" disabled={saving}>
                        {saving ? <><Loader2 className="spinner-border spinner-border-sm" /> Saving...</> : (editingId ? 'Update' : 'Create')}
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
