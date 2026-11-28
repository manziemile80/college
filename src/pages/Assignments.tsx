import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { buildScope, scopedById, type Scope } from '@/lib/scope';
import { useCurrentStudent } from '@/hooks/useCurrentStudent';
import { supabase } from '@/integrations/supabase/client';
import { canAccessClass } from '@/lib/enrollment';
import { useEnrollment } from '@/hooks/useEnrollment';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, ClipboardList, Send, GraduationCap, CalendarDays, Paperclip } from '@/lib/icons';

interface Assignment {
  id: string;
  title: string;
  instructions: string | null;
  due_date: string | null;
  max_points: number;
  subject_id: string | null;
  class_id: string | null;
}

interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  answer_text: string | null;
  file_url: string | null;
  submitted_at: string;
  points_awarded: number | null;
  feedback: string | null;
  student?: { first_name: string; last_name: string; student_id: string };
}

const emptyForm = {
  title: '',
  instructions: '',
  due_date: '',
  max_points: '20',
  subject_id: '',
  class_id: '',
};

export default function Assignments() {
  const { user, roles, can } = useAuth();
  const [scope, setScope] = useState<Scope | null>(null);
  const { toast } = useToast();
  const { studentId } = useCurrentStudent();
  const { enrolledClassIds, isEnrolled, loading: enrollmentLoading } = useEnrollment(studentId);
  const isStaff = roles.includes('admin') || roles.includes('dos') || roles.includes('teacher');
  const canManage = can('assignments.manage') && isStaff;
  const canSubmitPermission = can('assignments.submit') && !!studentId;

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [submitFor, setSubmitFor] = useState<Assignment | null>(null);
  const [answer, setAnswer] = useState({ answer_text: '', file_url: '' });

  const [gradeFor, setGradeFor] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  useEffect(() => {
    let cancelled = false;
    buildScope(supabase, user?.id, roles).then((s) => { if (!cancelled) setScope(s); });
    return () => { cancelled = true; };
  }, [user?.id, roles]);

  useEffect(() => {
    if (scope) void fetchAll();
  }, [studentId, scope]);

  const fetchAll = async () => {
    if (!scope) return;
    setLoading(true);
    const query = supabase.from('assignments').select('*').order('created_at', { ascending: false });
    const [a, s, c] = await Promise.all([
      isStaff ? query : query.eq('is_published', true),
      supabase.from('subjects').select('id, name').order('name'),
      supabase.from('classes').select('id, name').order('name'),
    ]);
    setAssignments(
      ((a.data as Assignment[]) || []).filter((x) =>
        (scope.classIds === null || (x.class_id && scope.classIds.includes(x.class_id)) || x.class_id === null)
        && (scope.subjectIds === null || (x.subject_id && scope.subjectIds.includes(x.subject_id)) || x.subject_id === null),
      ),
    );
    setSubjects(scopedById(s.data || [], scope.subjectIds));
    setClasses(scopedById(c.data || [], scope.classIds));
    if (studentId) {
      const { data } = await supabase.from('assignment_submissions').select('*').eq('student_id', studentId);
      setMySubmissions((data as Submission[]) || []);
    }
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
    const points = Math.min(Math.max(Number(form.max_points) || 0, 1), 100);
    const { error } = await supabase.from('assignments').insert({
      title: form.title.trim().slice(0, 150),
      instructions: form.instructions.trim().slice(0, 3000) || null,
      due_date: form.due_date || null,
      max_points: points,
      subject_id: form.subject_id || null,
      class_id: form.class_id || null,
      created_by: user!.id,
      is_published: true,
    });
    if (error) {
      toast({ title: 'Could not create assignment', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Assignment created' });
    setOpen(false);
    setForm(emptyForm);
    fetchAll();
  };

  const remove = async (id: string) => {
    if (!canManage) return;
    const { error } = await supabase.from('assignments').delete().eq('id', id);
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
      return;
    }
    fetchAll();
  };

  const hasEnrollmentAccess = (assignment: Assignment) => canAccessClass(enrolledClassIds, assignment.class_id);
  const canSubmit = (assignment: Assignment) => canSubmitPermission && (enrollmentLoading || hasEnrollmentAccess(assignment));

  const enrollmentMessage = (assignment: Assignment) =>
    !isEnrolled
      ? 'You must be enrolled in a class by a teacher before submitting work.'
      : 'You must be enrolled in this class before submitting work.';

  const submitWork = async () => {
    if (!submitFor || !canSubmit(submitFor)) return;
    if (!studentId) {
      toast({
        title: 'Student profile not linked',
        description: 'Ask the administration to link your account before submitting work.',
        variant: 'destructive',
      });
      setSubmitFor(null);
      return;
    }
    if (!hasEnrollmentAccess(submitFor)) {
      toast({ title: 'Not enrolled', description: enrollmentMessage(submitFor), variant: 'destructive' });
      setSubmitFor(null);
      return;
    }
    if (!answer.answer_text.trim() && !answer.file_url.trim()) {
      toast({ title: 'Add an answer or a file link', variant: 'destructive' });
      return;
    }
    const existing = mySubmissions.find((s) => s.assignment_id === submitFor.id);
    const payload = {
      assignment_id: submitFor.id,
      student_id: studentId,
      answer_text: answer.answer_text.trim().slice(0, 5000) || null,
      file_url: answer.file_url.trim().slice(0, 500) || null,
      submitted_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await supabase.from('assignment_submissions').update(payload).eq('id', existing.id)
      : await supabase.from('assignment_submissions').insert(payload);
    if (error) {
      toast({ title: 'Could not submit', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Work submitted' });
    setSubmitFor(null);
    setAnswer({ answer_text: '', file_url: '' });
    fetchAll();
  };

  const openGrading = async (assignment: Assignment) => {
    setGradeFor(assignment);
    const { data } = await supabase
      .from('assignment_submissions')
      .select('*, student:students(first_name, last_name, student_id)')
      .eq('assignment_id', assignment.id)
      .order('submitted_at', { ascending: false });
    setSubmissions((data as unknown as Submission[]) || []);
  };

  const grade = async (submission: Submission, points: string, feedback: string) => {
    if (!gradeFor || !canManage) return;
    const value = Math.min(Math.max(Number(points) || 0, 0), gradeFor.max_points);
    const { error } = await supabase
      .from('assignment_submissions')
      .update({ points_awarded: value, feedback: feedback.slice(0, 1000) || null, graded_by: user!.id })
      .eq('id', submission.id);
    if (error) {
      toast({ title: 'Could not save grade', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Grade saved' });
    openGrading(gradeFor);
  };

  const label = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name;

  const assignmentCard = (a: Assignment) => {
    const mine = mySubmissions.find((s) => s.assignment_id === a.id);
    const overdue = a.due_date && new Date(a.due_date) < new Date() && !mine;
    return (
      <div className="card h-100 d-flex flex-column">
        <div className="card-body d-flex flex-column gap-3 p-4">
          <div className="d-flex align-items-start justify-content-between gap-2">
            <span className="d-inline-flex align-items-center justify-content-center rounded-3 bg-success-subtle text-success p-2"><ClipboardList className="fs-5" /></span>
            {mine ? (
              <span className={`badge bd-fs-xs ${mine.points_awarded != null ? 'text-bg-success bg-success-subtle' : 'text-bg-secondary bg-secondary-subtle'}`}>
                {mine.points_awarded != null ? `${mine.points_awarded}/${a.max_points}` : 'Submitted'}
              </span>
            ) : overdue ? (
              <span className="badge text-bg-danger bd-fs-xs">Overdue</span>
            ) : (
              <span className="badge text-bg-secondary bd-fs-xs">{a.max_points} pts</span>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="fw-semibold text-main mb-1 text-truncate">{a.title}</h3>
            <p className="text-muted bd-fs-sm mb-0 mt-1 line-clamp-2">{a.instructions || 'No instructions provided.'}</p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            {a.due_date && (
              <span className="d-inline-flex align-items-center gap-1 bd-fs-sm text-muted"><CalendarDays className="fs-6 text-success" /> Due {new Date(a.due_date).toLocaleDateString()}</span>
            )}
            {label(subjects, a.subject_id) && (
              <span className="badge text-bg-secondary bg-secondary-subtle bd-fs-xs">{label(subjects, a.subject_id)}</span>
            )}
            {label(classes, a.class_id) && (
              <span className="badge text-bg-secondary bg-secondary-subtle bd-fs-xs">{label(classes, a.class_id)}</span>
            )}
          </div>
          {mine?.feedback && (
            <div className="rounded-3 bg-secondary-subtle p-3 bd-fs-sm text-secondary">Feedback: {mine.feedback}</div>
          )}
          <div className="d-flex align-items-center gap-2 mt-auto">
            {canManage ? (
              <>
                <button type="button" className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1" onClick={() => openGrading(a)}><GraduationCap />Submissions</button>
                <button type="button" className="btn btn-outline-danger btn-sm d-inline-flex align-items-center" aria-label="Delete assignment" onClick={() => remove(a.id)}><Trash2 /></button>
              </>
            ) : canSubmit(a) ? (
              <button
                type="button"
                className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1"
                onClick={() => {
                  setSubmitFor(a);
                  setAnswer({ answer_text: mine?.answer_text || '', file_url: mine?.file_url || '' });
                }}
              >
                <Send /> {mine ? 'Update Work' : 'Submit Work'}
              </button>
            ) : role === 'student' ? (
              <span className="text-muted bd-fs-sm">{enrollmentMessage(a)}</span>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="E-Learning"
          title="Assignments"
          description={isStaff ? 'Post assignments with due dates, then review and grade student submissions.' : 'View assignments, submit your work and see your marks and feedback.'}
          actions={canManage ? (
            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-1" onClick={() => setOpen(true)}><Plus /> New Assignment</button>
          ) : undefined}
        />

        {roles.includes('student') && !studentId && (
          <div className="alert alert-info bd-fs-sm mb-0">
            Your student account is not yet linked to a student record. Ask the administration to link it before submitting work.
          </div>
        )}

        {roles.includes('student') && studentId && !enrollmentLoading && !isEnrolled && (
          <div className="card border-dashed border-3">
            <div className="card-body p-4">
              <p className="fw-semibold text-main mb-0">Enrollment required</p>
              <p className="text-muted bd-fs-sm mb-0">Ask a teacher to enroll you in a class before submitting assignments.</p>
            </div>
          </div>
        )}


        {loading ? (
          <div className="d-flex justify-content-center py-8">
            <span className="spinner-border spinner-border-lg text-success" role="status" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="card">
            <div className="card-body d-flex flex-column align-items-center py-12 text-center">
              <ClipboardList className="fs-3 mb-3 text-secondary" />
              <p className="fw-semibold text-main mb-2">No assignments yet</p>
              {isStaff && <p className="mt-1 text-muted bd-fs-sm">Post the first assignment for your class.</p>}
            </div>
          </div>
        ) : (
          <div className="row g-3 row-cols-1 row-cols-md-2 row-cols-lg-3">
            {assignments.map((a) => <div key={a.id} className="col">{assignmentCard(a)}</div>)}
          </div>
        )}

        {/* ── New Assignment modal ── */}
        {open && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">New Assignment</h5>
                    <button type="button" className="btn-close" onClick={() => setOpen(false)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-3">
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Title</label>
                      <input className="form-control" value={form.title} maxLength={150} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                    </div>
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Instructions</label>
                      <textarea className="form-control" value={form.instructions} maxLength={3000} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
                    </div>
                    <div className="row g-3">
                      <div className="col-6 col-md-3">
                        <label className="form-label">Due date</label>
                        <input className="form-control" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                      </div>
                      <div className="col-6 col-md-3">
                        <label className="form-label">Max points</label>
                        <input className="form-control" type="number" min={1} max={100} value={form.max_points} onChange={(e) => setForm({ ...form, max_points: e.target.value })} />
                      </div>
                      <div className="col-6 col-md-3">
                        <label className="form-label">Subject</label>
                        <select className="form-select" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>
                          <option value="">Select subject</option>
                          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div className="col-6 col-md-3">
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
                    <button type="button" className="btn btn-success" onClick={save}>Create</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Student submit modal ── */}
        {submitFor && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">{submitFor.title}</h5>
                    <button type="button" className="btn-close" onClick={() => setSubmitFor(null)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-3">
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Your answer</label>
                      <textarea className="form-control" value={answer.answer_text} maxLength={5000} onChange={(e) => setAnswer({ ...answer, answer_text: e.target.value })} placeholder="Type your work here" />
                    </div>
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">File link (optional)</label>
                      <div className="input-group">
                        <input
                          type="url"
                          className="form-control"
                          value={answer.file_url}
                          maxLength={500}
                          placeholder="https://..."
                          onChange={(e) => setAnswer({ ...answer, file_url: e.target.value })}
                        />
                        <span className="input-group-text"><Paperclip className="text-secondary" /></span>
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer d-flex justify-content-end gap-2">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setSubmitFor(null)}>Cancel</button>
                    <button type="button" className="btn btn-success d-inline-flex align-items-center gap-1" onClick={submitWork}><Send /> Submit</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Grading modal ── */}
        {gradeFor && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">{gradeFor.title} — Submissions</h5>
                    <button type="button" className="btn-close" onClick={() => setGradeFor(null)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-3">
                    {submissions.length === 0 ? (
                      <p className="text-muted bd-fs-sm mb-0">No submissions yet.</p>
                    ) : (
                      <div className="d-flex flex-column gap-3">
                        {submissions.map((s) => (
                          <GradeRow key={s.id} submission={s} maxPoints={gradeFor.max_points || 20} onGrade={grade} />
                        ))}
                      </div>
                    )}
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

function GradeRow({
  submission,
  maxPoints,
  onGrade,
}: {
  submission: Submission;
  maxPoints: number;
  onGrade: (s: Submission, points: string, feedback: string) => void;
}) {
  const [points, setPoints] = useState(submission.points_awarded?.toString() || '');
  const [feedback, setFeedback] = useState(submission.feedback || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onGrade(submission, points, feedback);
    setSaving(false);
  };

  return (
    <div className="card d-flex flex-column gap-2 p-3">
      <p className="fw-semibold text-main mb-0">
        {submission.student ? `${submission.student.first_name} ${submission.student.last_name}` : 'Student'}
        <span className="ms-2 bd-fs-sm fw-normal text-secondary">
          {submission.student?.student_id} · {new Date(submission.submitted_at).toLocaleString()}
        </span>
      </p>
      {submission.answer_text && (
        <p className="text-wrap rounded-3 bg-secondary-subtle p-3 bd-fs-sm text-secondary mb-0">
          {submission.answer_text}
        </p>
      )}
      {submission.file_url && (
        <a href={submission.file_url} target="_blank" rel="noreferrer" className="d-inline-flex align-items-center gap-1 bd-fs-sm text-success text-decoration-none">
          <Paperclip className="fs-6" />Open submitted file
        </a>
      )}
      <div className="d-flex flex-wrap align-items-center gap-2">
        <input
          type="number"
          className="form-control w-auto"
          style={{ maxWidth: '6rem' }}
          min={0}
          max={maxPoints}
          placeholder={`0-${maxPoints}`}
          value={points}
          onChange={(e) => setPoints(e.target.value)}
        />
        <input
          placeholder="Feedback"
          maxLength={1000}
          className="form-control"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
        <button type="button" className="btn btn-success btn-sm d-inline-flex align-items-center gap-1" onClick={handleSave} disabled={saving}>
          {saving ? <><span className="spinner-border spinner-border-sm" /> Saving...</> : 'Save Grade'}
        </button>
      </div>
    </div>
  );
}
