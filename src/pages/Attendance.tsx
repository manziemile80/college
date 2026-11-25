import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentStudent } from '@/hooks/useCurrentStudent';
import { useEnrollment } from '@/hooks/useEnrollment';
import { CalendarCheck, Save, Search } from '@/lib/icons';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Student { id: string; first_name: string; last_name: string; student_id: string; }
interface ClassRow { id: string; name: string; }
type Status = 'present' | 'absent' | 'late' | 'excused';

const statusBadge = (status: Status) => {
  switch (status) {
    case 'present': return <span className="badge text-bg-success">Present</span>;
    case 'absent': return <span className="badge text-bg-danger">Absent</span>;
    case 'late': return <span className="badge text-bg-warning">Late</span>;
    case 'excused': return <span className="badge text-bg-info">Excused</span>;
    default: return <span className="badge text-bg-secondary">{status}</span>;
  }
};

const statusLabel = (s: Status) => s[0].toUpperCase() + s.slice(1);

export default function Attendance() {
  const { user, role } = useAuth();
  const { studentId, loading: studentLoading } = useCurrentStudent();
  const { enrolledClassIds, loading: enrollmentLoading, isEnrolled } = useEnrollment(studentId);
  const blockedStudent = role === 'student' && !studentLoading && !enrollmentLoading && !isEnrolled;
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classId, setClassId] = useState<string>('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canEdit = role === 'admin' || role === 'teacher';

  useEffect(() => {
    supabase.from('classes').select('id, name').order('name').then(({ data }) => setClasses(data || []));
  }, []);

  // Only students with an active enrollment in the selected class appear in roll call.
  useEffect(() => {
    if (!classId || blockedStudent) { setStudents([]); return; }
    (async () => {
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('student_id')
        .eq('class_id', classId)
        .eq('status', 'active');
      const ids = (enrollments || []).map((e) => e.student_id);
      if (ids.length === 0) { setStudents([]); return; }
      const { data } = await supabase
        .from('students')
        .select('id, first_name, last_name, student_id')
        .in('id', ids)
        .order('last_name');
      setStudents((data as Student[]) || []);
    })();
  }, [classId, blockedStudent]);

  useEffect(() => {
    if (!classId || !date || blockedStudent) return;
    fetchAttendance();
  }, [classId, date, students, blockedStudent]);

  const fetchAttendance = async () => {
    setLoading(true);
    const ids = students.map((s) => s.id);
    if (ids.length === 0) { setStatuses({}); setLoading(false); return; }
    const { data } = await supabase.from('attendance').select('student_id, status').in('student_id', ids).eq('attendance_date', date);
    const map: Record<string, Status> = {};
    ids.forEach((id) => { map[id] = 'present'; });
    (data || []).forEach((r) => { map[r.student_id] = r.status as Status; });
    setStatuses(map);
    setLoading(false);
  };

  const setStatus = (id: string, s: Status) => setStatuses((p) => ({ ...p, [id]: s }));

  const saveAll = async () => {
    if (!user) return;
    setSaving(true);
    const enrolledIds = new Set(students.map((s) => s.id));
    const rows = Object.entries(statuses)
      .filter(([student_id]) => enrolledIds.has(student_id))
      .map(([student_id, status]) => ({
        student_id, class_id: classId, attendance_date: date, status, recorded_by: user.id,
      }));
    const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'student_id,attendance_date' });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Attendance saved for ${rows.length} student(s)`);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return students.filter((s) => `${s.first_name} ${s.last_name} ${s.student_id}`.toLowerCase().includes(q));
  }, [students, search]);

  const summary = useMemo(() => {
    const counts: Record<Status, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    Object.values(statuses).forEach((s) => counts[s]++);
    return counts;
  }, [statuses]);

  const total = summary.present + summary.absent + summary.late + summary.excused;

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Records"
          title="Attendance"
          description={canEdit ? 'Record daily attendance for your class.' : 'View attendance records for your class.'}
        />

        {blockedStudent && (
          <div className="card border-dashed border-3">
            <div className="card-body p-4">
              <p className="fw-semibold text-main mb-0">Enrollment required</p>
              <p className="text-muted bd-fs-sm mb-0">Ask a teacher to enroll you in a class before viewing attendance.</p>
            </div>
          </div>
        )}

        {!blockedStudent && (
          <>
            {/* Filters */}
            <div className="row g-3 col-md-6 col-xl-3">
              <div className="d-flex flex-column gap-2">
                <label className="form-label">Class</label>
                <select className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">Select class</option>
                  {(role === 'student' ? classes.filter((c) => enrolledClassIds.has(c.id)) : classes)
                    .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="d-flex flex-column gap-2">
                <label className="form-label">Date</label>
                <input className="form-control" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            {classId && (
              <div className="card">
                <div className="card-header d-flex flex-column gap-3 border-bottom border-secondary-subtle py-3">
                  <div className="d-flex flex-column gap-2">
                    <h5 className="mb-0 fw-semibold text-main d-flex align-items-center gap-2">
                      <CalendarCheck className="text-success" /> Roll Call
                    </h5>
                    <p className="text-muted bd-fs-sm mb-0">
                      Attendance taken on <span className="fw-semibold text-main">{format(new Date(date), 'EEEE, MMMM d, yyyy')}</span>
                    </p>
                  </div>
                  <div className="d-flex flex-wrap align-items-center gap-3">
                    <div className="d-flex flex-wrap gap-2 bd-fs-sm text-secondary">
                      <span>Present: <strong className="text-success">{summary.present}</strong></span>
                      <span>Absent: <strong className="text-danger">{summary.absent}</strong></span>
                      <span>Late: <strong className="text-warning">{summary.late}</strong></span>
                      <span>Excused: <strong className="text-info">{summary.excused}</strong></span>
                      <span>Total: <strong className="text-main">{total}</strong></span>
                    </div>
                    <div className="input-group w-100 flex-grow-1">
                      <span className="input-group-text bg-white border-secondary-subtle"><Search className="text-secondary" /></span>
                      <input
                        type="search"
                        className="form-control border-secondary-subtle"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search student..."
                        aria-label="Search student"
                      />
                    </div>
                    {canEdit && (
                      <button type="button" className="btn btn-success d-inline-flex align-items-center gap-1" onClick={saveAll} disabled={saving}>
                        {saving ? <><span className="spinner-border spinner-border-sm" /> Saving...</> : <><Save /> Save</>}
                      </button>
                    )}
                  </div>
                </div>
                <div className="card-body p-0">
                  {loading ? (
                    <div className="d-flex justify-content-center py-8"><span className="spinner-border spinner-border-lg text-success" role="status" /></div>
                  ) : filtered.length === 0 ? (
                    <div className="empty-state">
                      <CalendarCheck className="empty-state-icon text-secondary" />
                      <p className="text-secondary mb-0">No enrolled students in this class</p>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead>
                          <tr className="border-bottom border-secondary-subtle">
                            <th scope="col">Student</th>
                            <th scope="col">ID</th>
                            <th scope="col" className="text-end">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((s) => (
                            <tr key={s.id} className="border-bottom border-secondary-subtle">
                              <td className="fw-medium text-main">{s.first_name} {s.last_name}</td>
                              <td className="text-muted bd-fs-sm">{s.student_id}</td>
                              <td className="text-end">
                                {canEdit ? (
                                  <select
                                    className="form-select form-select-sm w-auto"
                                    value={statuses[s.id] || 'present'}
                                    onChange={(e) => setStatus(s.id, e.target.value as Status)}
                                  >
                                    <option value="present">Present</option>
                                    <option value="absent">Absent</option>
                                    <option value="late">Late</option>
                                    <option value="excused">Excused</option>
                                  </select>
                                ) : (
                                  statusBadge(statuses[s.id] || 'present')
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
            )}

            {/* Status legend */}
            <div className="d-flex flex-wrap align-items-center gap-3 bd-fs-sm text-secondary">
              {(['present', 'absent', 'late', 'excused'] as const).map((s) => (
                <span key={s} className="d-inline-flex align-items-center gap-1.5">
                  <span className={cn(statusDot(s))} /> {statusLabel(s)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

const statusDot = (s: Status) =>
  cn('h-2.5 w-2.5 rounded-circle', {
    'bg-success': s === 'present',
    'bg-danger': s === 'absent',
    'bg-warning': s === 'late',
    'bg-info': s === 'excused',
    'bg-secondary': true,
  });
