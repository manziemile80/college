import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Enrollment, EnrollmentHistory, StudentWithClass, Class } from '@/types/database';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { History, Loader2, Search, UserPlus, UserMinus, ArrowLeftRight, CheckCircle } from '@/lib/icons';

const currentYear = () => {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
};

const statusBadge = (status: string) => {
  switch (status) {
    case 'active': return <span className="badge text-bg-success bd-fs-sm">Active</span>;
    case 'transferred': return <span className="badge text-bg-warning bd-fs-sm">Transferred</span>;
    case 'removed': return <span className="badge text-bg-danger bd-fs-sm">Removed</span>;
    default: return <span className="badge text-bg-secondary bd-fs-sm">{status}</span>;
  }
};

export default function EnrollmentPage() {
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const isDOS = role === 'dos';
  const isTeacher = role === 'teacher';
  const canManage = isAdmin || isDOS || isTeacher;

  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<Class[]>([]);
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>([]);
  const [classId, setClassId] = useState('');
  const [academicYear, setAcademicYear] = useState(currentYear());
  const [search, setSearch] = useState('');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [allStudents, setAllStudents] = useState<StudentWithClass[]>([]);

  const [historyFor, setHistoryFor] = useState<Enrollment | null>(null);
  const [history, setHistory] = useState<EnrollmentHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [transferFor, setTransferFor] = useState<Enrollment | null>(null);
  const [transferClass, setTransferClass] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchClasses = useCallback(async () => {
    const [classesRes, csRes] = await Promise.all([
      supabase.from('classes').select('*').order('name'),
      isTeacher
        ? supabase.from('class_subjects').select('class_id').eq('teacher_id', user?.id || '')
        : Promise.resolve({ data: null }),
    ]);
    const classList = (classesRes.data as Class[]) || [];
    setClasses(classList);
    const assigned = csRes.data ? [...new Set((csRes.data as { class_id: string }[]).map((r) => r.class_id))] : [];
    setAssignedClassIds(assigned);
    const available = isTeacher ? classList.filter((c) => assigned.includes(c.id)) : classList;
    if (available.length > 0) setClassId((prev) => prev || available[0].id);
  }, [isTeacher, user?.id]);

  const fetchEnrollments = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('enrollments')
        .select('*, student:students(*, class:classes(*))')
        .eq('class_id', classId)
        .eq('academic_year', academicYear)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEnrollments((data as unknown as Enrollment[]) || []);
    } catch (e: any) {
      toast.error('Failed to load enrollments', { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [classId, academicYear]);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);
  useEffect(() => { fetchEnrollments(); }, [fetchEnrollments]);

  useEffect(() => {
    if (!canManage) return;
    supabase
      .from('students')
      .select('*, class:classes(*)')
      .order('last_name')
      .then(({ data }) => setAllStudents((data as StudentWithClass[]) || []));
  }, [canManage]);

  const enrolledStudentIds = useMemo(
    () => new Set(enrollments.map((e) => e.student_id)),
    [enrollments]
  );

  const availableStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allStudents
      .filter((s) => !enrolledStudentIds.has(s.id))
      .filter((s) => {
        if (!q) return true;
        return (
          `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
          s.student_id.toLowerCase().includes(q)
        );
      })
      .slice(0, 30);
  }, [allStudents, enrolledStudentIds, search]);

  const availableClasses = useMemo(
    () => (isTeacher ? classes.filter((c) => assignedClassIds.includes(c.id)) : classes),
    [classes, isTeacher, assignedClassIds]
  );

  const handleEnroll = async (student: StudentWithClass) => {
    if (!user || !classId) return;
    setSaving(true);
    try {
      const existing = await supabase
        .from('enrollments')
        .select('id, status')
        .eq('student_id', student.id)
        .eq('class_id', classId)
        .eq('academic_year', academicYear)
        .maybeSingle();

      if (existing.data) {
        const { error } = await supabase
          .from('enrollments')
          .update({ status: 'active' })
          .eq('id', existing.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('enrollments').insert({
          student_id: student.id,
          class_id: classId,
          academic_year: academicYear,
          enrolled_by: user.id,
          status: 'active',
        });
        if (error) throw error;
      }
      await supabase.rpc('log_audit', {
        _action: 'enroll_student',
        _entity: 'enrollments',
        _details: { student_id: student.id, class_id: classId, academic_year: academicYear },
      });
      toast.success(`${student.first_name} ${student.last_name} enrolled`);
      fetchEnrollments();
    } catch (e: any) {
      toast.error('Failed to enroll student', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (enrollment: Enrollment) => {
    const studentName = enrollment.student
      ? `${enrollment.student.first_name} ${enrollment.student.last_name}`
      : 'this student';
    if (!confirm(`Remove ${studentName} from this class? Their enrollment history is kept.`)) return;
    try {
      const { error } = await supabase
        .from('enrollments')
        .update({ status: 'removed' })
        .eq('id', enrollment.id);
      if (error) throw error;
      await supabase.rpc('log_audit', { _action: 'remove_enrollment', _entity: 'enrollments', _entity_id: enrollment.id });
      toast.success('Enrollment removed');
      fetchEnrollments();
    } catch (e: any) {
      toast.error('Failed to remove enrollment', { description: e.message });
    }
  };

  const handleTransfer = async () => {
    if (!transferFor || !transferClass) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('enrollments')
        .update({ status: 'transferred', class_id: transferClass })
        .eq('id', transferFor.id);
      if (error) throw error;
      await supabase.rpc('log_audit', {
        _action: 'transfer_enrollment',
        _entity: 'enrollments',
        _entity_id: transferFor.id,
        _details: { to_class_id: transferClass },
      });
      toast.success('Student transferred');
      setTransferFor(null);
      fetchEnrollments();
    } catch (e: any) {
      toast.error('Failed to transfer student', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (enrollment: Enrollment) => {
    setHistoryFor(enrollment);
    setHistoryLoading(true);
    const { data } = await supabase
      .from('enrollment_history')
      .select('*')
      .eq('enrollment_id', enrollment.id)
      .order('created_at', { ascending: false });
    setHistory((data as EnrollmentHistory[]) || []);
    setHistoryLoading(false);
  };

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="School"
          title="Student Enrollment"
          description="Enroll students in classes, transfer between classes, and view enrollment history."
        />

        <div className="d-flex flex-wrap align-items-end gap-3">
          <div className="d-flex flex-column gap-2 w-100">
            <label className="form-label mb-0">Class</label>
            <select className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Select class</option>
              {availableClasses.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.grade_level})</option>
              ))}
            </select>
          </div>
          <div className="d-flex flex-column gap-2 w-100">
            <label className="form-label mb-0">Academic year</label>
            <input className="form-control" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} />
          </div>
        </div>

        {canManage && classId && (
          <div className="card">
            <div className="card-header d-flex align-items-center justify-content-between py-3">
              <h5 className="mb-0 fw-semibold text-main d-flex align-items-center gap-2">
                <UserPlus className="text-success" /> Enroll a student
              </h5>
            </div>
            <div className="card-body d-flex flex-column gap-3">
              <div className="input-group w-100 flex-grow-1">
                <span className="input-group-text bg-white border-secondary-subtle"><Search className="text-secondary" /></span>
                <input
                  type="search"
                  className="form-control border-secondary-subtle"
                  placeholder="Search by name, student ID or registration number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {availableStudents.length === 0 ? (
                <p className="text-muted bd-fs-sm mb-0">No matching students to enroll in this class for {academicYear}.</p>
              ) : (
                <div className="row g-2">
                  {availableStudents.map((s) => (
                    <div key={s.id} className="col-12 col-sm-6 col-lg-4">
                      <div className="card h-100 d-flex align-items-center justify-content-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="text-truncate fw-medium text-main mb-0">{s.first_name} {s.last_name}</p>
                          <p className="text-muted bd-fs-sm mb-0">{s.student_id}</p>
                        </div>
                        <button type="button" className="btn btn-success btn-sm d-inline-flex align-items-center gap-1 flex-shrink-0" onClick={() => handleEnroll(s)} disabled={saving}>
                          <UserPlus /> Enroll
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header py-3">
            <h5 className="mb-0 fw-semibold">
              Enrollments — {classes.find((c) => c.id === classId)?.name || 'Select a class'} · {academicYear}
            </h5>
          </div>
          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-8">
                <span className="spinner-border spinner-border-lg text-success" role="status" />
              </div>
            ) : enrollments.length === 0 ? (
              <div className="empty-state">
                <CheckCircle className="empty-state-icon fs-3 text-secondary" />
                <h3 className="fw-semibold text-main mb-1">No enrollments for this class and year yet.</h3>
                <p className="text-muted bd-fs-sm mb-0">Enroll students above to get started.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr className="border-bottom border-secondary-subtle">
                      <th scope="col">Student</th>
                      <th scope="col">Student ID</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="d-none d-sm-table-cell">Enrolled</th>
                      <th scope="col" className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((e) => (
                      <tr key={e.id} className="border-bottom border-secondary-subtle">
                        <td className="fw-medium text-main">
                          {e.student ? `${e.student.first_name} ${e.student.last_name}` : e.student_id}
                        </td>
                        <td className="text-muted bd-fs-sm">{e.student?.student_id || '—'}</td>
                        <td>{statusBadge(e.status)}</td>
                        <td className="d-none text-muted bd-fs-sm d-sm-table-cell">
                          {format(new Date(e.created_at), 'MMM d, yyyy')}
                        </td>
                        <td className="text-end">
                          {canManage && (
                            <div className="d-flex justify-content-end gap-1">
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center"
                                onClick={() => openHistory(e)}
                                title="Enrollment history"
                                aria-label="Enrollment history"
                              >
                                <History />
                              </button>
                              {e.status === 'active' && (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-outline-primary btn-sm d-inline-flex align-items-center"
                                    onClick={() => { setTransferFor(e); setTransferClass(''); }}
                                    title="Transfer to another class"
                                    aria-label="Transfer to another class"
                                  >
                                    <ArrowLeftRight />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-outline-danger btn-sm d-inline-flex align-items-center"
                                    onClick={() => handleRemove(e)}
                                    title="Remove enrollment"
                                    aria-label="Remove enrollment"
                                  >
                                    <UserMinus />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Enrollment history modal ── */}
      {historyFor && (
        <>
          <div className="bd-modal-backdrop" />
          <div className="bd-modal show">
            <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                  <h5 className="modal-title fw-semibold text-main mb-0">Enrollment History</h5>
                  <button type="button" className="btn-close" onClick={() => setHistoryFor(null)} aria-label="Close" />
                </div>
                <div className="modal-body">
                  {historyLoading ? (
                    <div className="d-flex justify-content-center py-6">
                      <span className="spinner-border spinner-border-lg text-success" role="status" />
                    </div>
                  ) : history.length === 0 ? (
                    <p className="text-muted bd-fs-sm py-6 text-center">No history recorded.</p>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {history.map((h) => (
                        <div key={h.id} className="d-flex align-items-start justify-content-between gap-3 border-bottom border-secondary-subtle pb-2">
                          <div>
                            <p className="text-capitalize fw-semibold text-main mb-0">{h.action}</p>
                            <p className="text-muted bd-fs-sm mb-0">{h.details}</p>
                          </div>
                          <p className="text-nowrap text-muted bd-fs-sm mb-0">
                            {format(new Date(h.created_at), 'MMM d, yyyy HH:mm')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Transfer student modal ── */}
      {transferFor && (
        <>
          <div className="bd-modal-backdrop" />
          <div className="bd-modal show">
            <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                  <h5 className="modal-title fw-semibold text-main mb-0">Transfer Student</h5>
                  <button type="button" className="btn-close" onClick={() => setTransferFor(null)} aria-label="Close" />
                </div>
                <div className="modal-body d-flex flex-column gap-4">
                  <div className="d-flex flex-column gap-2">
                    <label className="form-label">Move to class</label>
                    <select className="form-select" value={transferClass} onChange={(e) => setTransferClass(e.target.value)}>
                      <option value="">Select target class</option>
                      {classes
                        .filter((c) => c.id !== transferFor.class_id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>{c.name} ({c.grade_level})</option>
                        ))}
                    </select>
                  </div>
                  <p className="text-muted bd-fs-sm mb-0">
                    The change is recorded in the enrollment history. Confirm before transferring.
                  </p>
                  <div className="d-flex justify-content-end gap-2 pt-2">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setTransferFor(null)}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={handleTransfer} disabled={saving || !transferClass}>
                      {saving ? <><span className="spinner-border spinner-border-sm" /> Confirming...</> : 'Confirm Transfer'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
