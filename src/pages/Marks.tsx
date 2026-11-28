import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { buildScope, scopedById, type Scope } from '@/lib/scope';
import { ClipboardList, Loader2, Save, Search } from '@/lib/icons';
import { toast } from 'sonner';

interface Student { id: string; first_name: string; last_name: string; student_id: string; class_id: string | null; }
interface Subject { id: string; name: string; code: string; }
interface ClassRow { id: string; name: string; }
interface MarkRow { id?: string; student_id: string; cat_score: number; exam_score: number; remarks: string | null; teacher_id?: string; }

const TERM_LABELS: Record<string, string> = { term1: 'Term 1', term2: 'Term 2', term3: 'Term 3' };

export default function Marks() {
  const { user, roles, can } = useAuth();
  const [scope, setScope] = useState<Scope | null>(null);
  const currentYear = `${new Date().getFullYear()}`;
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classId, setClassId] = useState<string>('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [term, setTerm] = useState<'term1' | 'term2' | 'term3'>('term1');
  const [year, setYear] = useState<string>(currentYear);
  const [marks, setMarks] = useState<Record<string, MarkRow>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isPrivileged = roles.includes('admin') || roles.includes('dos');
  const canEdit = can('marks.enter') && (isPrivileged || roles.includes('teacher'));

  useEffect(() => {
    let cancelled = false;
    buildScope(supabase, user?.id, roles).then((s) => { if (!cancelled) setScope(s); });
    return () => { cancelled = true; };
  }, [user?.id, roles]);

  useEffect(() => {
    if (!scope) return;
    (async () => {
      const [c, s] = await Promise.all([
        supabase.from('classes').select('id, name').order('name'),
        supabase.from('subjects').select('id, name, code').order('name'),
      ]);
      setClasses(scopedById(c.data || [], scope.classIds));
      setSubjects(scopedById(s.data || [], scope.subjectIds));
    })();
  }, [scope]);

  useEffect(() => {
    if (scope && classId && scope.classIds !== null && !scope.classIds.includes(classId)) setClassId('');
  }, [scope, classId]);

  useEffect(() => {
    if (!classId || !scope) { setStudents([]); return; }
    (async () => {
      const { data } = await supabase.from('students').select('id, first_name, last_name, student_id, class_id').eq('class_id', classId).order('last_name');
      setStudents(scope.studentIds === null ? data || [] : (data || []).filter((s) => scope.studentIds!.includes(s.id)));
    })();
  }, [classId, scope]);

  useEffect(() => {
    if (!classId || !subjectId || !scope) return;
    fetchMarks();
  }, [classId, subjectId, term, year, scope]);

  const fetchMarks = async () => {
    if (!classId || !subjectId || !scope) return;
    setLoading(true);
    const { data: studs } = await supabase.from('students').select('id').eq('class_id', classId);
    const ids = (studs || []).filter((s) => scope.studentIds === null || scope.studentIds.includes(s.id)).map((s) => s.id);
    if (ids.length === 0) { setMarks({}); setLoading(false); return; }
    const { data } = await supabase.from('marks').select('*').in('student_id', ids).eq('subject_id', subjectId).eq('term', term).eq('academic_year', year);
    const map: Record<string, MarkRow> = {};
    (data || []).forEach((m: any) => {
      map[m.student_id] = { id: m.id, student_id: m.student_id, cat_score: Number(m.cat_score), exam_score: Number(m.exam_score), remarks: m.remarks, teacher_id: m.teacher_id };
    });
    setMarks(map);
    setLoading(false);
  };

  const updateMark = (studentId: string, field: 'cat_score' | 'exam_score' | 'remarks', value: any) => {
    setMarks((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || { student_id: studentId, cat_score: 0, exam_score: 0, remarks: '' }),
        [field]: value,
      },
    }));
  };

  const saveAll = async () => {
    if (!user || !subjectId || !canEdit || !scope) return;
    if (scope.classIds !== null && !scope.classIds.includes(classId)) return toast.error('You are not assigned to this class');
    if (scope.subjectIds !== null && !scope.subjectIds.includes(subjectId)) return toast.error('You are not assigned to this subject');
    const invalid = Object.values(marks).find(
      (m) =>
        Number(m.cat_score) < 0 ||
        Number(m.cat_score) > 40 ||
        Number(m.exam_score) < 0 ||
        Number(m.exam_score) > 60
    );
    if (invalid) {
      return toast.error('Invalid marks: CAT must be 0–40 and Exam must be 0–60');
    }
    // Never overwrite marks recorded by another teacher.
    const editable = Object.values(marks).filter((m) =>
      !m.id || !m.teacher_id || isPrivileged || m.teacher_id === user.id,
    );
    if (editable.length !== Object.values(marks).length) {
      toast.warning('Marks recorded by other teachers were left unchanged');
    }
    setSaving(true);
    const rows = editable.map((m) => ({
      ...(m.id ? { id: m.id } : {}),
      student_id: m.student_id,
      subject_id: subjectId,
      teacher_id: m.teacher_id || user.id,
      term,
      academic_year: year,
      cat_score: Math.max(0, Math.min(40, Number(m.cat_score) || 0)),
      exam_score: Math.max(0, Math.min(60, Number(m.exam_score) || 0)),
      remarks: m.remarks || null,
    }));
    if (rows.length === 0) { setSaving(false); return; }
    const { error } = await supabase.from('marks').upsert(rows, { onConflict: 'student_id,subject_id,term,academic_year' });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Saved marks for ${rows.length} student(s)`);
    fetchMarks();
  };

  const filteredStudents = useMemo(() => {
    const q = search.toLowerCase();
    return students.filter((s) => `${s.first_name} ${s.last_name} ${s.student_id}`.toLowerCase().includes(q));
  }, [students, search]);

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Records"
          title="Marks Entry"
          description="Enter CAT (out of 40) + Exam (out of 60) per student per subject per term."
        />

        {/* Filters */}
        <div className="card">
          <div className="card-header d-flex align-items-center justify-content-between py-3 border-bottom border-secondary-subtle">
            <h5 className="mb-0 fw-semibold text-main d-flex align-items-center gap-2"><ClipboardList className="text-success" /> Filters</h5>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-12 col-md-6 col-lg-3">
                <label className="form-label">Class</label>
                <select className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">Select class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="col-12 col-md-6 col-lg-3">
                <label className="form-label">Subject</label>
                <select className="form-select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="">Select subject</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
              </div>
              <div className="col-12 col-md-6 col-lg-3">
                <label className="form-label">Term</label>
                <select className="form-select" value={term} onChange={(e) => setTerm(e.target.value as any)}>
                  <option value="term1">Term 1</option>
                  <option value="term2">Term 2</option>
                  <option value="term3">Term 3</option>
                </select>
              </div>
              <div className="col-12 col-md-6 col-lg-3">
                <label className="form-label">Academic Year</label>
                <input className="form-control" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
              </div>
            </div>
          </div>
        </div>

        {classId && subjectId && (
          <div className="card">
            <div className="card-header d-flex align-items-center justify-content-between py-3 border-bottom border-secondary-subtle">
              <h5 className="mb-0 fw-semibold text-main">Students — {TERM_LABELS[term]} {year}</h5>
              <div className="d-flex gap-2 align-items-center">
                <div className="input-group">
                  <span className="input-group-text bg-white border-secondary-subtle"><Search className="text-secondary" /></span>
                  <input type="search" className="form-control border-secondary-subtle" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student..." aria-label="Search student" />
                </div>
                {canEdit && (
                  <button type="button" className="btn btn-success d-inline-flex align-items-center gap-1" onClick={saveAll} disabled={saving}>
                    {saving ? <><span className="spinner-border spinner-border-sm" /> Saving...</> : <><Save /> Save All</>}
                  </button>
                )}
              </div>
            </div>
            <div className="card-body p-0">
              {loading ? (
                <div className="d-flex justify-content-center py-8">
                  <span className="spinner-border spinner-border-lg text-success" role="status" />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="empty-state"><Loader2 className="empty-state-icon text-secondary" /><p className="text-secondary mb-0">No students in this class</p></div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr className="border-bottom border-secondary-subtle">
                        <th scope="col">Student</th>
                        <th scope="col">ID</th>
                        <th scope="col" className="text-center">CAT (/40)</th>
                        <th scope="col" className="text-center">Exam (/60)</th>
                        <th scope="col" className="text-end">Total</th>
                        <th scope="col">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((s) => {
                        const m = marks[s.id] || { student_id: s.id, cat_score: 0, exam_score: 0, remarks: '' };
                        const rowLocked = !!m.id && !!m.teacher_id && !isPrivileged && m.teacher_id !== user?.id;
                        const total = Number(m.cat_score || 0) + Number(m.exam_score || 0);
                        return (
                          <tr key={s.id} className="border-bottom border-secondary-subtle">
                            <td className="fw-medium text-main">{s.first_name} {s.last_name}</td>
                            <td className="text-muted bd-fs-sm">{s.student_id}</td>
                            <td className="text-center">
                              <input
                                type="number"
                                className="form-control w-auto mx-auto"
                                style={{ maxWidth: '6rem' }}
                                min={0} max={40} step={0.5}
                                value={m.cat_score}
                                disabled={!canEdit || rowLocked}
                                onChange={(e) => {
                                  const v = Math.max(0, Math.min(40, Number(e.target.value) || 0));
                                  updateMark(s.id, 'cat_score', v);
                                }}
                              />
                            </td>
                            <td className="text-center">
                              <input
                                type="number"
                                className="form-control w-auto mx-auto"
                                style={{ maxWidth: '6rem' }}
                                min={0} max={60} step={0.5}
                                value={m.exam_score}
                                disabled={!canEdit || rowLocked}
                                onChange={(e) => {
                                  const v = Math.max(0, Math.min(60, Number(e.target.value) || 0));
                                  updateMark(s.id, 'exam_score', v);
                                }}
                              />
                            </td>
                            <td className="text-end fw-semibold">
                              <span className={total >= 50 ? 'text-success' : total > 0 ? 'text-warning' : 'text-muted'}>{total.toFixed(1)}</span>
                            </td>
                            <td>
                              <input
                                className="form-control w-100"
                                value={m.remarks || ''}
                                disabled={!canEdit || rowLocked}
                                onChange={(e) => updateMark(s.id, 'remarks', e.target.value)}
                                placeholder="Optional"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
